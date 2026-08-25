/**
 * ML Fiyat Modeli — Cloudflare Workers AI ONNX Inference
 *
 * XGBoost modeli ONNX formatında Workers AI'ya yüklendikten sonra
 * bu modül inference yapar ve heuristic motorla triangulation sağlar.
 *
 * Model deploy:
 *   wrangler ai models upload cadastrum-fiyat-v1 data/cadastrum-fiyat-v1.onnx
 *
 * wrangler.toml'a eklenecek:
 *   [ai]
 *   binding = "AI"
 *
 * Feature vektörü sırası (ml-veri-hazirla.mjs ile senkron):
 *   0: log_alan_m2
 *   1: imar_sinifi      (0=arsa,1=tarla,2=konut,3=bahce,4=diger)
 *   2: il_kod           (1-81, TUIK sıralaması)
 *   3: ilce_kod         (hash mod 1000)
 *   4: nufus_yogunluk   (kişi/km²)
 *   5: deprem_pga       (0.10-0.50)
 *   6: sahil_var        (0/1)
 *   7: yil              (2022-2026)
 *   8: ay               (1-12)
 */

// Workers AI binding tip tanımı (wrangler types'ta mevcut değilse)
interface AiBinding {
  run(model: string, inputs: { input: number[] }): Promise<{ output: number[] }>;
}

export interface MLFeatures {
  alan_m2: number;
  kategori: string;
  il_norm: string;
  ilce_norm: string;
}

export interface MLSonuc {
  beklenenPerM2: number;
  guven: number;
  kaynak: "ml-model";
}

// ── İl kodu tablosu (TUIK sıralaması) ────────────────────────────────────────

const IL_KOD: Record<string, number> = {
  adana:1, adiyaman:2, afyonkarahisar:3, agri:4, amasya:5,
  ankara:6, antalya:7, artvin:8, aydin:9, balikesir:10,
  bilecik:11, bingol:12, bitlis:13, bolu:14, burdur:15,
  bursa:16, canakkale:17, cankiri:18, corum:19, denizli:20,
  diyarbakir:21, edirne:22, elazig:23, erzincan:24, erzurum:25,
  eskisehir:26, gaziantep:27, giresun:28, gumushane:29, hakkari:30,
  hatay:31, isparta:32, mersin:33, istanbul:34, izmir:35,
  kars:36, kastamonu:37, kayseri:38, kirklareli:39, kirsehir:40,
  kocaeli:41, konya:42, kutahya:43, malatya:44, manisa:45,
  kahramanmaras:46, mardin:47, mugla:48, mus:49, nevsehir:50,
  nigde:51, ordu:52, rize:53, sakarya:54, samsun:55,
  siirt:56, sinop:57, sivas:58, tekirdag:59, tokat:60,
  trabzon:61, tunceli:62, sanliurfa:63, usak:64, van:65,
  yozgat:66, zonguldak:67, aksaray:68, bayburt:69, karaman:70,
  kirikkale:71, batman:72, sirnak:73, bartin:74, ardahan:75,
  igdir:76, yalova:77, karabuk:78, kilis:79, osmaniye:80, duzce:81,
};

const IL_NUFUS: Record<string, number> = {
  istanbul:2988, kocaeli:548, izmir:375, bursa:303, ankara:118,
  yalova:271, hatay:172, sakarya:171, kayseri:84, antalya:119,
  adana:115, gaziantep:177, diyarbakir:97, sanliurfa:129, mersin:87,
  eskisehir:72, denizli:90, manisa:67, konya:47, balikesir:61,
  tekirdag:195, kirklareli:54, edirne:50, canakkale:46, bolu:37,
  duzce:116, zonguldak:115, karabuk:59, bartin:63, kastamonu:24,
};

const IL_PGA: Record<string, number> = {
  adana:0.35, adiyaman:0.40, afyonkarahisar:0.25, agri:0.30,
  ankara:0.15, antalya:0.25, aydin:0.35, balikesir:0.30,
  bolu:0.40, bursa:0.30, canakkale:0.35, denizli:0.35,
  duzce:0.45, elazig:0.40, erzincan:0.50, erzurum:0.35,
  gaziantep:0.35, hatay:0.40, istanbul:0.35, izmir:0.40,
  kahramanmaras:0.45, kocaeli:0.40, konya:0.15, malatya:0.40,
  sakarya:0.40, van:0.40, yalova:0.40,
};

const SAHIL_ILLER = new Set([
  "istanbul", "izmir", "antalya", "mugla", "mersin", "hatay", "adana",
  "canakkale", "balikesir", "bursa", "kocaeli", "sakarya", "zonguldak",
  "bartin", "kastamonu", "sinop", "samsun", "ordu", "giresun", "trabzon",
  "rize", "artvin", "yalova", "tekirdag", "edirne", "kirklareli",
]);

// ── İlçe hash ─────────────────────────────────────────────────────────────────

function ilceKodHesapla(ilNorm: string, ilceNorm: string): number {
  const s = `${ilNorm}:${ilceNorm}`;
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) + s.charCodeAt(i);
    hash = hash & 0x7FFFFFFF;
  }
  return hash % 1000;
}

function imarSinifi(kategori: string): number {
  switch (kategori) {
    case "arsa":  return 0;
    case "tarla": return 1;
    case "konut": return 2;
    case "bahce": return 3;
    default:      return 4;
  }
}

// ── Feature vektörü ───────────────────────────────────────────────────────────

export function featureVektoru(f: MLFeatures): number[] {
  const simdi = new Date();
  const logAlan = Math.log(Math.max(f.alan_m2, 1));
  const sinif = imarSinifi(f.kategori);
  const ilKod = IL_KOD[f.il_norm] ?? 0;
  const ilceKod = ilceKodHesapla(f.il_norm, f.ilce_norm);
  const nufus = IL_NUFUS[f.il_norm] ?? 50;
  const pga = IL_PGA[f.il_norm] ?? 0.25;
  const sahil = SAHIL_ILLER.has(f.il_norm) ? 1 : 0;
  const yil = simdi.getFullYear();
  const ay = simdi.getMonth() + 1;

  return [logAlan, sinif, ilKod, ilceKod, nufus, pga, sahil, yil, ay];
}

// ── Ana inference fonksiyonu ──────────────────────────────────────────────────

/**
 * ML model inference — Workers AI ONNX binding gerektirir.
 *
 * env.AI yoksa (binding tanımlı değil) veya model yüklü değilse null döner.
 * Çağıran kod (fiyat.ts) null durumunda heuristic fallback kullanır.
 */
export async function mlTahmin(
  ai: AiBinding | null | undefined,
  features: MLFeatures,
): Promise<MLSonuc | null> {
  if (!ai) return null;  // Workers AI binding yok

  try {
    const input = featureVektoru(features);

    const result = await ai.run("@cf/cadastrum/fiyat-v1", {
      input,
    });

    const logFiyat = result.output?.[0];
    if (logFiyat == null || !Number.isFinite(logFiyat)) return null;

    // log → gerçek fiyat (exp transform)
    const beklenenPerM2 = Math.round(Math.exp(logFiyat));

    // Temel validasyon
    if (beklenenPerM2 < 100 || beklenenPerM2 > 10_000_000) return null;

    return {
      beklenenPerM2,
      guven: 85,
      kaynak: "ml-model",
    };
  } catch {
    // Model yüklü değil veya inference hatası — sessizce null dön
    return null;
  }
}

/**
 * ML + Heuristic triangulation
 *
 * ML modeli varsa: %60 ML + %40 heuristic
 * ML yoksa: %100 heuristic (mevcut davranış korunur)
 */
export function mlTriangulation(
  mlSonuc: MLSonuc | null,
  heuristicPerM2: number,
): { beklenenPerM2: number; kaynak: "ml-triangulation" | "heuristic" } {
  if (!mlSonuc) {
    return { beklenenPerM2: heuristicPerM2, kaynak: "heuristic" };
  }

  // Sapma kontrolü: %50'den fazla sapma → ML güvenilmez, heuristic kullan
  const sapma = Math.abs(mlSonuc.beklenenPerM2 - heuristicPerM2) / heuristicPerM2;
  if (sapma > 0.50) {
    return { beklenenPerM2: heuristicPerM2, kaynak: "heuristic" };
  }

  const birlesik = Math.round(0.60 * mlSonuc.beklenenPerM2 + 0.40 * heuristicPerM2);
  return { beklenenPerM2: birlesik, kaynak: "ml-triangulation" };
}
