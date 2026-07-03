import type { Parsel } from "../types/tkgm";
import { ePlanParselKeyFromParsel, type EPlanImarVerisi, EPLAN_URL, EPLAN_STORAGE_KEY } from "./eplan";

const EPLAN_API_BASE = "https://e-plan.gov.tr/api";
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 gün cache

// Background SW proxy for DNR rules (CORS & Referer override)
async function eplanFetch(url: string, options?: RequestInit): Promise<{ ok: boolean; status: number; text: string; error?: string }> {
  if (typeof chrome === "undefined" || !chrome?.runtime?.sendMessage) {
    const r = await fetch(url, options);
    return { ok: r.ok, status: r.status, text: await r.text() };
  }
  return await chrome.runtime.sendMessage({ tip: "eplan-fetch", url, options });
}

/**
 * Parsel poligonunu WKT (Well-Known Text) formatına çevirir.
 */
function parselToWkt(parsel: Parsel): string | null {
  if (!parsel.koordinatlar || parsel.koordinatlar.length === 0) return null;
  const coords = parsel.koordinatlar.map(c => `${c.lng} ${c.lat}`).join(", ");
  return `POLYGON((${coords}))`;
}

/**
 * E-Plan sunucularından parselin imar durumunu otomatik çeker (Geometri tabanlı).
 */
export async function otomatikEPlanSorgula(parsel: Parsel): Promise<EPlanImarVerisi | null> {
  const cacheKey = ePlanParselKeyFromParsel(parsel);

  // 1. Önce Cache'i kontrol et
  try {
    const data = await chrome.storage.local.get(EPLAN_STORAGE_KEY);
    const cached = data[EPLAN_STORAGE_KEY] as EPlanImarVerisi | undefined;
    if (cached && cached.parselKey === cacheKey && (Date.now() - cached.yakalandiAt) < CACHE_TTL) {
      return cached;
    }
  } catch (e) {
    console.warn("[eplan-api] Cache okunurken hata:", e);
  }

  // 2. Geometri (WKT) oluştur
  const wkt = parselToWkt(parsel);
  if (!wkt) {
    console.warn("[eplan-api] Parsel geometrisi yok, e-Plan sorgusu yapılamıyor.");
    return null;
  }

  try {
    // 3. E-Plan Spatial Query (fObjectData/query)
    // Bu aşamada e-Plan veritabanında parselle kesişen planları arıyoruz.
    const queryUrl = `${EPLAN_API_BASE}/fObjectData/query`;
    const queryPayload = {
      fObjectID: "1159bc1d-75cd-438d-958c-8716cc973f6c", // Uygulama İmar Planı GUID
      wkt: wkt,
      intersection: true
    };

    const queryRes = await eplanFetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(queryPayload)
    });

    if (!queryRes.ok) {
      throw new Error(`e-Plan Query API Hatası: HTTP ${queryRes.status}`);
    }

    const queryData = JSON.parse(queryRes.text);
    // E-Plan bazen boş dizi, bazen de { success: true, data: [...] } döner.
    const planList = Array.isArray(queryData) ? queryData : (queryData.data || []);
    
    if (planList.length === 0) {
      console.log("[eplan-api] Bu parsel için aktif e-Plan bulunamadı.");
      return null;
    }

    const planID = planList[0].id || planList[0].planRecID || planList[0].guid;
    if (!planID) {
      console.warn("[eplan-api] Plan bulundu ama ID'si alınamadı.", planList[0]);
      return null;
    }

    // 4. Detayları Çek (getGmlData)
    const gmlUrl = `${EPLAN_API_BASE}/planGML/getGmlData?planRecID=${planID}`;
    const gmlRes = await eplanFetch(gmlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wkt: wkt })
    });

    if (!gmlRes.ok) {
      throw new Error(`e-Plan GML API Hatası: HTTP ${gmlRes.status}`);
    }

    const gmlData = JSON.parse(gmlRes.text);
    const details = Array.isArray(gmlData) ? gmlData[0] : (gmlData.data?.[0] || gmlData);

    if (!details) {
      console.log("[eplan-api] GML verisi boş döndü.");
      return null;
    }

    // 5. Veriyi EPlanImarVerisi formatına dönüştür
    const kullanimKarari = details._tableName || details.fonksiyon || details.kullanim || null;
    const emsalRaw = details.emsal_kaks || details.emsal || details.kaks;
    const taksRaw = details.taks;
    const maksKatRaw = details.yapi_yuksekligi || details.gabari || details.maks_kat;
    const yapiNizami = details.nizam_durumu || details.yapi_nizami || null;

    const parseNum = (val: any) => {
      if (!val) return null;
      const num = Number(String(val).replace(",", "."));
      return isNaN(num) ? null : num;
    };

    const emsal = parseNum(emsalRaw);
    const taks = parseNum(taksRaw);
    const maksKat = parseNum(maksKatRaw);

    const guvenSkoru = Math.min(
      95,
      25 +
        (kullanimKarari ? 20 : 0) +
        (yapiNizami ? 10 : 0) +
        (emsal != null ? 10 : 0) +
        (taks != null ? 10 : 0) +
        (maksKat != null ? 10 : 0)
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
      pin: details.pin || null,
      kullanimKarari: String(kullanimKarari),
      planKarari: "Uygulama İmar Planı (Otomatik)",
      planNotu: "API üzerinden otomatik çekildi.",
      yapiNizami: yapiNizami ? String(yapiNizami) : null,
      emsal,
      taks,
      maksKat,
      hamMetin: ["Otomatik API Sorgusu"],
      guvenSkoru,
    };

    // Cache'e yaz
    await chrome.storage.local.set({ [EPLAN_STORAGE_KEY]: sonuc });
    console.log("[eplan-api] Otomatik e-Plan verisi başarıyla çekildi:", sonuc);

    return sonuc;
  } catch (error) {
    // Beklenen degradasyonlar (alarm verme, nazik warn):
    //   - Network/HTTP 0: e-plan.gov.tr erişilemez.
    //   - HTTP 404/403: CSB e-Plan API'sini taşıdı/kaldırdı (2026 göçü). Yeni endpoint
    //     bulunana kadar imar için manuel giriş + TÜCBS ÇDP fallback'leri devrede.
    const mesaj = error instanceof Error ? error.message : String(error);
    if (/HTTP 0|Failed to fetch|NetworkError/i.test(mesaj)) {
      console.warn("[eplan-api] e-plan ulaşılamıyor, content-script/manuel fallback'e geçiliyor");
    } else if (/HTTP 40[0-9]/i.test(mesaj)) {
      console.warn("[eplan-api] e-Plan otomatik sorgu API'si yanıt vermiyor (endpoint değişmiş olabilir) — manuel imar/TÜCBS fallback devrede");
    } else {
      console.error("[eplan-api] E-Plan otomatik sorgu başarısız:", error);
    }
    // Hata durumunda null dönüyoruz ki sistem mevcut Content-Script fallback'ine geçebilsin.
    return null;
  }
}
