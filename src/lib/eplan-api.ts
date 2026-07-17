import type { Parsel } from "../types/tkgm";
import { ePlanParselKeyFromParsel, type EPlanImarVerisi, EPLAN_URL, EPLAN_STORAGE_KEY } from "./eplan";

/** CSB e-Plan (2025+): e-plan.gov.tr → eplan.csb.gov.tr, /api öneki kaldırıldı */
export const EPLAN_BASE = "https://eplan.csb.gov.tr";
const EPLAN_REFERER = `${EPLAN_BASE}/e-plan/html/imarDurumu.html`;
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 gün cache
const RATE_LIMIT_KEY = "ePlanRateLimitUntil";

/** imarDurumu.js / ePlanUtils.param ile aynı GUID'ler */
const EPLAN_PARAM = {
  publicPlanObjectRecID: "1159bc1d-75cd-438d-958c-8716cc973f6c",
  publicPlanGeometryPropertyRecID: "3d758202-040e-481a-abd6-fb1c20312d63",
  publicPlanPinIDPropertyRecID: "319c08f6-0971-45c9-aef6-4ed53c108d45",
  publicPlanIsActivePropertyRecID: "4e0d4291-130b-410a-8fee-f78309bac985",
  publicPlanFeaturePropertyRecID: "3c0a8fa7-d8f2-4006-b4d4-50be35484887",
} as const;

type EplanFetchResult = {
  ok: boolean;
  status: number;
  text: string;
  error?: string;
};

const EPLAN_HEADERS = {
  Accept: "application/json",
  Origin: EPLAN_BASE,
  Referer: EPLAN_REFERER,
} as const;

function gunSonuMs(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

async function eplanRateLimitedMi(): Promise<boolean> {
  try {
    const data = await chrome.storage.local.get(RATE_LIMIT_KEY);
    const until = data[RATE_LIMIT_KEY] as number | undefined;
    return until != null && Date.now() < until;
  } catch {
    return false;
  }
}

async function eplanRateLimitIsaretle(): Promise<void> {
  try {
    await chrome.storage.local.set({ [RATE_LIMIT_KEY]: gunSonuMs() });
  } catch {
    // yoksay
  }
}

async function eplanFetch(url: string, options?: RequestInit): Promise<EplanFetchResult> {
  const merged: RequestInit = {
    ...options,
    headers: { ...EPLAN_HEADERS, ...(options?.headers as Record<string, string> | undefined) },
  };
  if (typeof chrome === "undefined" || !chrome?.runtime?.sendMessage) {
    const r = await fetch(url, { ...merged, credentials: "include" });
    return { ok: r.ok, status: r.status, text: await r.text() };
  }
  return await chrome.runtime.sendMessage({ tip: "eplan-fetch", url, options: merged });
}

async function eplanApi(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<EplanFetchResult> {
  if (await eplanRateLimitedMi()) {
    return { ok: false, status: 429, text: "e-Plan misafir sorgu limiti" };
  }

  const sep = path.includes("?") ? "&" : "?";
  const url = `${EPLAN_BASE}/${path}${sep}preventCache=${Date.now()}`;
  const options: RequestInit = {
    method,
    headers:
      method === "POST"
        ? { ...EPLAN_HEADERS, "Content-Type": "application/json" }
        : EPLAN_HEADERS,
    body: body != null ? JSON.stringify(body) : undefined,
  };

  let res = await eplanFetch(url, options);
  if (res.status === 401 && chrome?.runtime?.sendMessage) {
    await chrome.runtime.sendMessage({ tip: "eplan-reset-guest" });
    res = await eplanFetch(url, options);
  }
  if (res.status === 429) {
    await eplanRateLimitIsaretle();
  }
  return res;
}

function lngLatTo3857(lng: number, lat: number): [number, number] {
  const x = (lng * 20_037_508.34) / 180;
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180) * 20_037_508.34) / 180;
  return [x, y];
}

/** WGS84 POLYGON WKT → Web Mercator (e-Plan sorguları EPSG:3857 bekler) */
export function wkt4326To3857(wkt: string): string {
  const m = wkt.match(/POLYGON\s*\(\(([^)]+)\)\)/i);
  if (!m?.[1]) return wkt;
  const coords = m[1].split(",").map((pair) => {
    const parts = pair.trim().split(/\s+/).map(Number);
    const lng = parts[0] ?? 0;
    const lat = parts[1] ?? 0;
    return lngLatTo3857(lng, lat).join(" ");
  });
  return `POLYGON((${coords.join(", ")}))`;
}

function parselToWkt3857(parsel: Parsel): string | null {
  if (!parsel.koordinatlar || parsel.koordinatlar.length === 0) return null;
  const ilk = parsel.koordinatlar[0];
  if (!ilk) return null;
  const ring = parsel.koordinatlar
    .map((c) => lngLatTo3857(c.lng, c.lat).join(" "))
    .concat([lngLatTo3857(ilk.lng, ilk.lat).join(" ")]);
  return `POLYGON((${ring.join(", ")}))`;
}

function buildPlanQuery(wkt3857: string) {
  return {
    columnFilters: [
      {
        name: EPLAN_PARAM.publicPlanGeometryPropertyRecID,
        operator: "INTERSECTS",
        value: wkt3857,
      },
      {
        name: EPLAN_PARAM.publicPlanPinIDPropertyRecID,
        operator: "!''",
        value: "-",
      },
      {
        name: EPLAN_PARAM.publicPlanIsActivePropertyRecID,
        operator: "=",
        value: "1",
      },
    ],
    resultColumns: [
      { fObjectPropertyRecID: "00000000-0000-0000-0000-000000000000", aggregateFunction: 0 },
      { fObjectPropertyRecID: EPLAN_PARAM.publicPlanPinIDPropertyRecID, aggregateFunction: 0 },
      { fObjectPropertyRecID: EPLAN_PARAM.publicPlanGeometryPropertyRecID, aggregateFunction: 0 },
      { fObjectPropertyRecID: EPLAN_PARAM.publicPlanFeaturePropertyRecID, aggregateFunction: 0 },
    ],
    relations: {
      "e5478ae0-d4f2-4555-ae12-401d68612cf0":
        "b90687b3-4e6c-43ef-927e-690108b9ddad,6d859700-d053-4564-8015-d218c636958b",
      "5301b42b-4818-45a7-acd9-d25621db5197":
        "4c67ad4d-ab88-41ac-8e69-ef6882294825,666e2498-ea7f-18e5-e053-1d2d11ac578d,21780348-75d6-4cb2-80f1-ff7c5dddab23",
    },
    orders: [{ name: "24da024e-bcba-425e-991a-5480164990ba", direction: "desc" }],
  };
}

interface KadastroParselKaydi {
  durum?: number;
  geometry?: string;
}

async function kadastroParselWkt(
  mahalleKodu: number,
  adaNo: number,
  parselNo: number,
): Promise<string | null> {
  const res = await eplanApi(
    `ePlanIntegration/kadastroParsel?mahalleID=${mahalleKodu}&adaNo=${adaNo}&parselNo=${parselNo}`,
  );
  if (res.status === 429) return null;
  if (!res.ok) return null;
  const liste = JSON.parse(res.text) as KadastroParselKaydi[];
  if (!Array.isArray(liste) || liste.length === 0) return null;
  const kayit = liste.find((item) => item.durum === 3) ?? liste[0];
  if (!kayit?.geometry) return null;
  return wkt4326To3857(kayit.geometry);
}

function pickBestGmlRow(rows: Record<string, unknown>[]): Record<string, unknown> | null {
  if (!rows.length) return null;
  const skip = (name: string) => {
    const lower = name.toLowerCase();
    return (
      lower.includes("plan_siniri") ||
      lower === "uip_ada_kenari" ||
      lower === "uip_yapi_yaklasma_siniri" ||
      lower === "uip_plan_degisiklik_siniri" ||
      lower === "uip_yapilasma_sembol"
    );
  };

  const sorted = [...rows].sort((a, b) => {
    const fA = parseFloat(String(a.intersectionArea ?? "0"));
    const fB = parseFloat(String(b.intersectionArea ?? "0"));
    return (Number.isFinite(fB) ? fB : 0) - (Number.isFinite(fA) ? fA : 0);
  });

  return (
    sorted.find((row) => {
      const table = String(row._tableName ?? "");
      return table && !skip(table);
    }) ??
    sorted[0] ??
    null
  );
}

function parseNum(val: unknown): number | null {
  if (val == null || val === "") return null;
  const num = Number(String(val).replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

/**
 * E-Plan sunucularından parselin imar durumunu otomatik çeker.
 * eplan.csb.gov.tr misafir oturumu + resmi imarDurumu.js akışı.
 */
export async function otomatikEPlanSorgula(parsel: Parsel): Promise<EPlanImarVerisi | null> {
  const cacheKey = ePlanParselKeyFromParsel(parsel);

  if (await eplanRateLimitedMi()) {
    console.warn(
      "[eplan-api] e-Plan günlük misafir limiti doldu (~10 sorgu). Yarın tekrar deneyin veya eplan.csb.gov.tr'de manuel sorgu yapın.",
    );
    return null;
  }

  try {
    const data = await chrome.storage.local.get(EPLAN_STORAGE_KEY);
    const cached = data[EPLAN_STORAGE_KEY] as EPlanImarVerisi | undefined;
    if (cached && cached.parselKey === cacheKey && Date.now() - cached.yakalandiAt < CACHE_TTL) {
      return cached;
    }
  } catch (e) {
    console.warn("[eplan-api] Cache okunurken hata:", e);
  }

  // Önce TKGM koordinatları (ek API çağrısı yok — misafir limitini korur)
  let wkt3857: string | null = parselToWkt3857(parsel);
  if (
    !wkt3857 &&
    parsel.mahalleKodu &&
    parsel.adaNo &&
    parsel.parselNo &&
    !(await eplanRateLimitedMi())
  ) {
    wkt3857 = await kadastroParselWkt(parsel.mahalleKodu, parsel.adaNo, parsel.parselNo);
  }
  if (!wkt3857) {
    console.warn("[eplan-api] Parsel geometrisi yok, e-Plan sorgusu yapılamıyor.");
    return null;
  }

  try {
    const queryRes = await eplanApi(
      `fObjectData/query?fObjectID=${EPLAN_PARAM.publicPlanObjectRecID}`,
      "POST",
      buildPlanQuery(wkt3857),
    );

    if (!queryRes.ok) {
      throw new Error(`e-Plan plan sorgusu: HTTP ${queryRes.status}`);
    }

    const planList = JSON.parse(queryRes.text) as Record<string, unknown>[];
    if (!Array.isArray(planList) || planList.length === 0) {
      return null;
    }

    const ilkPlan = planList[0];
    if (!ilkPlan) return null;

    const planID = ilkPlan.recID as string | undefined;
    const pin = ilkPlan[EPLAN_PARAM.publicPlanPinIDPropertyRecID] as string | undefined;
    if (!planID) {
      console.warn("[eplan-api] Plan bulundu ama recID alınamadı.", ilkPlan);
      return null;
    }

    const gmlRes = await eplanApi(`planGML/getGmlData?planRecID=${planID}`, "POST", wkt3857);
    if (!gmlRes.ok) {
      throw new Error(`e-Plan GML sorgusu: HTTP ${gmlRes.status}`);
    }

    const gmlRows = JSON.parse(gmlRes.text) as Record<string, unknown>[];
    const details = pickBestGmlRow(Array.isArray(gmlRows) ? gmlRows : []);
    if (!details) {
      return null;
    }

    const kullanimKarari =
      details._tableName || details.fonksiyon || details.kullanim || null;
    const emsal = parseNum(details.emsal_kaks ?? details.emsal ?? details.kaks);
    const taks = parseNum(details.taks);
    const maksKat = parseNum(
      details.yapi_yuksekligi ?? details.gabari ?? details.maks_kat,
    );
    const yapiNizami = details.nizam_durumu ?? details.yapi_nizami ?? null;

    const guvenSkoru = Math.min(
      95,
      25 +
        (kullanimKarari ? 20 : 0) +
        (yapiNizami ? 10 : 0) +
        (emsal != null ? 10 : 0) +
        (taks != null ? 10 : 0) +
        (maksKat != null ? 10 : 0),
    );

    const sonuc: EPlanImarVerisi = {
      parselKey: cacheKey,
      kaynakUrl: EPLAN_URL,
      yakalandiAt: Date.now(),
      ilAd: parsel.ilAd,
      ilceAd: parsel.ilceAd,
      mahalleAd: parsel.mahalleAd,
      adaNo: parsel.adaNo,
      parselNo: parsel.parselNo,
      pin: pin ? String(pin) : null,
      kullanimKarari: kullanimKarari ? String(kullanimKarari) : null,
      planKarari: "Uygulama İmar Planı (Otomatik)",
      planNotu: "eplan.csb.gov.tr API üzerinden otomatik çekildi.",
      yapiNizami: yapiNizami ? String(yapiNizami) : null,
      emsal,
      taks,
      maksKat,
      hamMetin: ["Otomatik API Sorgusu"],
      guvenSkoru,
    };

    await chrome.storage.local.set({ [EPLAN_STORAGE_KEY]: sonuc });
    return sonuc;
  } catch (error) {
    const mesaj = error instanceof Error ? error.message : String(error);
    if (/HTTP 0|Failed to fetch|NetworkError/i.test(mesaj)) {
      console.warn("[eplan-api] e-plan ulaşılamıyor, content-script/manuel fallback'e geçiliyor");
    } else if (/HTTP 429/i.test(mesaj)) {
      console.warn(
        "[eplan-api] e-Plan misafir sorgu limiti doldu (günlük ~10) — eplan.csb.gov.tr'de manuel sorgu veya TÜCBS fallback kullanın",
      );
    } else if (/HTTP 40[0-9]/i.test(mesaj)) {
      console.warn(
        "[eplan-api] e-Plan otomatik sorgu yetkilendirme/endpoint hatası — manuel imar/TÜCBS fallback devrede",
      );
    } else {
      console.error("[eplan-api] E-Plan otomatik sorgu başarısız:", error);
    }
    return null;
  }
}
