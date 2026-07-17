/**
 * TCMB EVDS Konut Fiyat Endeksi (KFE) entegrasyonu.
 *
 * Endpoints:
 *   GET /v1/tcmb/kfe/:il         → İl için son endeks değeri (12 ay trend)
 *   GET /v1/tcmb/kfe/:il/carpan  → Baseline yılına göre çarpan (fiyat motorunda kullanılır)
 *   POST /v1/tcmb/refresh        → Cron: tüm 26 il için son veriyi çek (admin/cron)
 *
 * Veri kaynağı: https://evds2.tcmb.gov.tr/service/evds/series=...&type=json&key=XYZ
 *
 * Seri kodları (TP.HKFE01-26): 26 büyük il + Türkiye geneli
 *   01=Türkiye, 02=İstanbul, 03=Ankara, 04=İzmir, vs.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";

const tcmb = new Hono<{ Bindings: Env }>();

// 26 il + Türkiye geneli — TCMB seri kodu eşleme
// Resmi TCMB EVDS dokümantasyonuna göre TP.HKFE01-26
const IL_SERI_KODU: Record<string, string> = {
  "turkiye": "TP.HKFE01",
  "istanbul": "TP.HKFE02",
  "ankara": "TP.HKFE03",
  "izmir": "TP.HKFE04",
  "bursa": "TP.HKFE05",
  "antalya": "TP.HKFE06",
  "adana": "TP.HKFE07",
  "konya": "TP.HKFE08",
  "gaziantep": "TP.HKFE09",
  "mersin": "TP.HKFE10",
  "kayseri": "TP.HKFE11",
  "samsun": "TP.HKFE12",
  "eskisehir": "TP.HKFE13",
  "denizli": "TP.HKFE14",
  "trabzon": "TP.HKFE15",
  "manisa": "TP.HKFE16",
  "kahramanmaras": "TP.HKFE17",
  "balikesir": "TP.HKFE18",
  "sakarya": "TP.HKFE19",
  "kocaeli": "TP.HKFE20",
  "tekirdag": "TP.HKFE21",
  "diyarbakir": "TP.HKFE22",
  "sanliurfa": "TP.HKFE23",
  "hatay": "TP.HKFE24",
  "aydin": "TP.HKFE25",
  "mugla": "TP.HKFE26",
};

interface EvdsSatir {
  Tarih: string;        // "01-2026" (ay-yıl)
  [key: string]: string;
}

interface EvdsYanit {
  totalCount: number;
  items: EvdsSatir[];
}

/** EVDS API'den veri çek */
async function evdsGetir(env: Env, seriKodu: string, baslangicTarih?: string): Promise<EvdsSatir[]> {
  const key = (env as any).TCMB_EVDS_KEY as string | undefined;
  if (!key) throw new Error("TCMB_EVDS_KEY tanımlı değil");

  const baslangic = baslangicTarih ?? defaultBaslangic();
  // PDF: "01-01-2999 gibi çok uzak bir tarih yazınız" → her zaman güncel veri
  const bitis = "01-01-2999";
  // TCMB EVDS3 — yeni endpoint (eski evds2 deprecated). Key HEADER'da.
  const url = `https://evds3.tcmb.gov.tr/igmevdsms-dis/series=${seriKodu}&startDate=${baslangic}&endDate=${bitis}&type=json&aggregationTypes=avg&formulas=0&frequency=5`;

  const res = await fetch(url, {
    headers: {
      "key": key,
      "Accept": "application/json",
    },
  });

  const ct = res.headers.get("content-type") ?? "";
  const txt = await res.text();

  if (!res.ok) {
    throw new Error(`TCMB EVDS HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }

  // HTML mi geldi? → key yanlış / endpoint yanlış / login sayfası
  if (ct.includes("html") || txt.trimStart().startsWith("<")) {
    throw new Error(
      `TCMB EVDS HTML döndürdü (key yanlış veya endpoint hatalı). ` +
      `Status: ${res.status}, Content-Type: ${ct}, Body başlangıcı: ${txt.slice(0, 200)}`
    );
  }

  let data: EvdsYanit;
  try {
    data = JSON.parse(txt) as EvdsYanit;
  } catch (e) {
    throw new Error(`TCMB EVDS JSON parse hatası. Body: ${txt.slice(0, 300)}`);
  }
  return data.items ?? [];
}

function defaultBaslangic(): string {
  // 24 ay öncesi
  const d = new Date();
  d.setMonth(d.getMonth() - 24);
  return tarihFormat(d);
}

function bugunFormat(): string {
  return tarihFormat(new Date());
}

function tarihFormat(d: Date): string {
  // "DD-MM-YYYY" formatı
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/** ── İl için son endeks + trend ──────────────────────────── */
tcmb.get("/kfe/:il", async (c) => {
  const il = c.req.param("il").toLowerCase();
  const seri = IL_SERI_KODU[il] ?? IL_SERI_KODU["turkiye"];

  // Önce cache'den dene (D1 — 24h)
  const cache = await c.env.DB.prepare(
    `SELECT veri, son_guncelleme FROM tcmb_kfe_cache WHERE il_norm = ? ORDER BY son_guncelleme DESC LIMIT 1`
  ).bind(il).first<{ veri: string; son_guncelleme: number }>().catch(() => null);

  const TTL = 24 * 3600 * 1000;
  if (cache && (Date.now() - cache.son_guncelleme) < TTL) {
    c.header("Cache-Control", "public, s-maxage=3600");
    c.header("X-Cache", "HIT");
    return c.json(JSON.parse(cache.veri));
  }

  try {
    const items = await evdsGetir(c.env, seri!);
    if (items.length === 0) return c.json({ hata: "Veri bulunamadı" }, 404);

    const sonItem = items[items.length - 1]!;
    const sonDeger = parseFloat(sonItem[seri!]!.replace(",", ".") || "0");

    // 12 ay trend
    const trend = items.slice(-12).map(it => ({
      tarih: it.Tarih,
      endeks: parseFloat(it[seri!]!.replace(",", ".") || "0"),
    }));

    const sonuc = {
      il,
      seri,
      sonEndeks: sonDeger,
      sonTarih: sonItem.Tarih,
      trend,
      kaynak: "TCMB EVDS",
    };

    // Cache'e yaz
    await c.env.DB.prepare(
      `INSERT INTO tcmb_kfe_cache (il_norm, veri, son_guncelleme) VALUES (?, ?, ?)
       ON CONFLICT(il_norm) DO UPDATE SET veri = excluded.veri, son_guncelleme = excluded.son_guncelleme`
    ).bind(il, JSON.stringify(sonuc), Date.now()).run().catch(() => {});

    c.header("Cache-Control", "public, s-maxage=3600");
    c.header("X-Cache", "MISS");
    return c.json(sonuc);
  } catch (e) {
    console.error("[TCMB]", e);
    return c.json({ hata: e instanceof Error ? e.message : "Hata" }, 500);
  }
});

/**
 * Baseline tarihindeki endekse göre çarpan döndürür.
 * Örnek: baseline 2024-01 endeks=850, son endeks=1100 → çarpan=1.294 (%29.4 enflasyon)
 *
 * Query: ?baseline=2024-01 (YYYY-MM)
 */
tcmb.get("/kfe/:il/carpan", async (c) => {
  const il = c.req.param("il").toLowerCase();
  const baseline = c.req.query("baseline") ?? "2024-01";  // varsayılan
  const seri = IL_SERI_KODU[il] ?? IL_SERI_KODU["turkiye"];

  try {
    const items = await evdsGetir(c.env, seri!);
    if (items.length === 0) return c.json({ hata: "Veri bulunamadı" }, 404);

    const sonItem = items[items.length - 1]!;
    const sonEndeks = parseFloat(sonItem[seri!]!.replace(",", ".") || "0");

    // Baseline tarihi (YYYY-MM → MM-YYYY format'a)
    const [yil, ay] = baseline.split("-");
    const baselineFormat = `${ay}-${yil}`;
    const baselineItem = items.find(it => it.Tarih === baselineFormat);

    if (!baselineItem) {
      return c.json({
        hata: `Baseline tarihi (${baseline}) için veri yok. Mevcut aralık: ${items[0]?.Tarih} - ${sonItem.Tarih}`,
      }, 404);
    }

    const baselineEndeks = parseFloat(baselineItem[seri!]!.replace(",", ".") || "0");
    const carpan = baselineEndeks > 0 ? sonEndeks / baselineEndeks : 1.0;

    return c.json({
      il,
      seri,
      baseline,
      baselineEndeks,
      sonEndeks,
      sonTarih: sonItem.Tarih,
      carpan: Math.round(carpan * 1000) / 1000,
      enflasyonYuzde: Math.round((carpan - 1) * 100 * 10) / 10,
      kaynak: "TCMB EVDS KFE",
    });
  } catch (e) {
    return c.json({ hata: e instanceof Error ? e.message : "Hata" }, 500);
  }
});

/** Garantili çalışan seri (USD/TL) ile temel test — auth + endpoint doğru mu? */
tcmb.get("/test-usd", async (c) => {
  const key = (c.env as any).TCMB_EVDS_KEY as string | undefined;
  if (!key) return c.json({ hata: "TCMB_EVDS_KEY tanımlı değil" });

  const url = `https://evds3.tcmb.gov.tr/igmevdsms-dis/series=TP.DK.USD.A&startDate=01-01-2025&endDate=01-01-2999&type=json&frequency=5`;

  try {
    const res = await fetch(url, {
      headers: { "key": key, "Accept": "application/json" },
    });
    const ct = res.headers.get("content-type") ?? "";
    const txt = await res.text();
    return c.json({
      status: res.status,
      contentType: ct,
      bodyLen: txt.length,
      bodyBaslangic: txt.slice(0, 500),
      headersAlinmis: Object.fromEntries(res.headers.entries()),
    });
  } catch (e) {
    return c.json({ hata: e instanceof Error ? e.message : "?" }, 500);
  }
});

/** Debug: birden fazla olası endpoint'i dene */
tcmb.get("/debug/:il", async (c) => {
  const il = c.req.param("il").toLowerCase();
  const seri = IL_SERI_KODU[il] ?? "TP.HKFE01";
  const key = (c.env as any).TCMB_EVDS_KEY as string | undefined;
  if (!key) return c.json({ hata: "TCMB_EVDS_KEY tanımlı değil" });

  const baslangic = defaultBaslangic();
  const bitis = bugunFormat();
  const qs = `series=${seri}&startDate=${baslangic}&endDate=${bitis}&type=json&aggregationTypes=avg&formulas=0&frequency=5`;

  // 6 olası endpoint kombinasyonu — hangisi JSON döndürüyor?
  // PDF'teki doğru endpoint: evds3.tcmb.gov.tr/igmevdsms-dis/series=...
  const adaylar = [
    // PDF'in örneğindeki doğru format (key HEADER'da)
    `https://evds3.tcmb.gov.tr/igmevdsms-dis/series=${seri}&startDate=${baslangic}&endDate=01-01-2999&type=json&aggregationTypes=avg&formulas=0&frequency=5`,
    // ? ile başlayan QS varyantı
    `https://evds3.tcmb.gov.tr/igmevdsms-dis/?series=${seri}&startDate=${baslangic}&endDate=01-01-2999&type=json&aggregationTypes=avg&formulas=0&frequency=5`,
    // Path-based seri
    `https://evds3.tcmb.gov.tr/igmevdsms-dis/series/${seri}?startDate=${baslangic}&endDate=01-01-2999&type=json`,
    // Eski sistem
    `https://evds2.tcmb.gov.tr/service/evds/series=${seri}&startDate=${baslangic}&endDate=01-01-2999&type=json&key=${encodeURIComponent(key)}`,
    // Olası: igmevdsms-dis altında /service/
    `https://evds3.tcmb.gov.tr/service/igmevdsms-dis/series=${seri}&startDate=${baslangic}&endDate=01-01-2999&type=json`,
  ];

  const sonuclar = await Promise.all(adaylar.map(async (url) => {
    try {
      const res = await fetch(url, {
        headers: {
          "key": key,
          "Authorization": `Bearer ${key}`,
          "X-API-KEY": key,
          "Accept": "application/json",
        },
      });
      const ct = res.headers.get("content-type") ?? "";
      const txt = await res.text();
      const isJson = ct.includes("json") && !txt.trimStart().startsWith("<");
      return {
        url: url.replace(key, "***"),
        status: res.status,
        contentType: ct.slice(0, 60),
        bodyBaslangic: txt.slice(0, 200),
        isJson,
      };
    } catch (e) {
      return { url: url.replace(key, "***"), hata: e instanceof Error ? e.message : "?" };
    }
  }));

  return c.json({ keyLen: key.length, adaylar: sonuclar });
});

/** Admin/cron: tüm illerin verisini yenile */
tcmb.post("/refresh", async (c) => {
  // S3: timing-safe compare
  const { bearerYetkilendir } = await import("../lib/security.js");
  const yetki = await bearerYetkilendir(c.req.header("Authorization"), c.env.SCRAPER_API_SECRET);
  if (!yetki) {
    return c.json({ hata: "Yetkisiz" }, 401);
  }

  const sonuclar: Record<string, any> = {};
  for (const [il, seri] of Object.entries(IL_SERI_KODU)) {
    try {
      const items = await evdsGetir(c.env, seri);
      const sonItem = items[items.length - 1];
      if (sonItem) {
        const sonEndeks = parseFloat(sonItem[seri]!.replace(",", ".") || "0");
        const trend = items.slice(-12).map(it => ({
          tarih: it.Tarih,
          endeks: parseFloat(it[seri]!.replace(",", ".") || "0"),
        }));
        const veri = { il, seri, sonEndeks, sonTarih: sonItem.Tarih, trend, kaynak: "TCMB EVDS" };
        await c.env.DB.prepare(
          `INSERT INTO tcmb_kfe_cache (il_norm, veri, son_guncelleme) VALUES (?, ?, ?)
           ON CONFLICT(il_norm) DO UPDATE SET veri = excluded.veri, son_guncelleme = excluded.son_guncelleme`
        ).bind(il, JSON.stringify(veri), Date.now()).run();
        sonuclar[il] = { sonEndeks, sonTarih: sonItem.Tarih };
      }
    } catch (e) {
      sonuclar[il] = { hata: e instanceof Error ? e.message : "?" };
    }
    // Rate limit: TCMB API rate limit yok ama nezaket
    await new Promise(r => setTimeout(r, 100));
  }
  return c.json({ basarili: true, sonuclar });
});

export { tcmb as tcmbRoutes };
