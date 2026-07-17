/**
 * Harita endpoint'leri — TKGM analiz verisi D1'den okunur.
 *
 * Veri tek seferlik scripts/tkgm-analiz-seed.mjs ile seed edilir.
 * Site buradan okur; TKGM'ye doğrudan hiç istek atmaz.
 *
 * GET /v1/harita/analiz?ilceKodu=XXX&analizTip=1&yil=2024
 *   → Tek ilçe, tek tip, tek yıl noktaları
 *
 * GET /v1/harita/analiz/birlesik?ilceKodu=XXX&analizTip=1
 *   → Tek ilçe, tek tip, tüm yıllar birleşik (parsel bazında sum)
 *
 * GET /v1/harita/ozet?analizTip=1&yil=2024
 *   → Tüm ilçelerin özet sayıları (harita renklendirme için)
 *
 * GET /v1/harita/likidite?kategori=arsa
 *   → İl bazlı likidite skoru + yıllık satış hacmi (harita choropleth için)
 *
 * GET /v1/harita/trend?kategori=arsa
 *   → İl bazlı son 6 ay fiyat değişim yüzdesi (sıcaklık haritası için)
 *
 * GET /v1/harita/seed-status
 *   → Kaç ilçe/tip/yıl seed edilmiş (admin/debug için)
 */

import { Hono } from "hono";
import type { Env } from "../index.js";

// ── İl likidite statik verisi (TÜİK 2025) ────────────────────────────────────
// D1'e gerek yok — statik tablo, yıllık güncellenir.
const IL_LIKIDITE: Record<string, { yillikSatis: number; ipotekliOran: number; nufusM: number }> = {
  "istanbul":{ yillikSatis:280262,ipotekliOran:0.18,nufusM:16.0 },
  "ankara":{ yillikSatis:152534,ipotekliOran:0.22,nufusM:5.8 },
  "izmir":{ yillikSatis:96998,ipotekliOran:0.20,nufusM:4.4 },
  "antalya":{ yillikSatis:78000,ipotekliOran:0.15,nufusM:2.7 },
  "bursa":{ yillikSatis:65000,ipotekliOran:0.21,nufusM:3.2 },
  "adana":{ yillikSatis:38000,ipotekliOran:0.17,nufusM:2.3 },
  "konya":{ yillikSatis:36000,ipotekliOran:0.18,nufusM:2.3 },
  "gaziantep":{ yillikSatis:32000,ipotekliOran:0.16,nufusM:2.1 },
  "kocaeli":{ yillikSatis:30000,ipotekliOran:0.20,nufusM:2.1 },
  "mersin":{ yillikSatis:28000,ipotekliOran:0.16,nufusM:1.9 },
  "kayseri":{ yillikSatis:22000,ipotekliOran:0.19,nufusM:1.4 },
  "samsun":{ yillikSatis:19000,ipotekliOran:0.17,nufusM:1.4 },
  "sanliurfa":{ yillikSatis:17000,ipotekliOran:0.13,nufusM:2.2 },
  "diyarbakir":{ yillikSatis:16000,ipotekliOran:0.14,nufusM:1.8 },
  "hatay":{ yillikSatis:15500,ipotekliOran:0.15,nufusM:1.7 },
  "manisa":{ yillikSatis:18000,ipotekliOran:0.18,nufusM:1.5 },
  "kahramanmaras":{ yillikSatis:12000,ipotekliOran:0.14,nufusM:1.2 },
  "balikesir":{ yillikSatis:22000,ipotekliOran:0.18,nufusM:1.2 },
  "aydin":{ yillikSatis:25000,ipotekliOran:0.17,nufusM:1.1 },
  "tekirdag":{ yillikSatis:21000,ipotekliOran:0.21,nufusM:1.1 },
  "sakarya":{ yillikSatis:18000,ipotekliOran:0.20,nufusM:1.0 },
  "mugla":{ yillikSatis:32000,ipotekliOran:0.14,nufusM:1.1 },
  "denizli":{ yillikSatis:16000,ipotekliOran:0.18,nufusM:1.1 },
  "eskisehir":{ yillikSatis:17000,ipotekliOran:0.21,nufusM:0.9 },
  "trabzon":{ yillikSatis:14000,ipotekliOran:0.16,nufusM:0.8 },
  "ordu":{ yillikSatis:11000,ipotekliOran:0.16,nufusM:0.8 },
  "malatya":{ yillikSatis:10500,ipotekliOran:0.15,nufusM:0.8 },
  "erzurum":{ yillikSatis:9500,ipotekliOran:0.15,nufusM:0.8 },
  "van":{ yillikSatis:8500,ipotekliOran:0.13,nufusM:1.1 },
  "elazig":{ yillikSatis:9000,ipotekliOran:0.15,nufusM:0.6 },
  "afyonkarahisar":{ yillikSatis:8500,ipotekliOran:0.16,nufusM:0.75 },
  "yalova":{ yillikSatis:12000,ipotekliOran:0.20,nufusM:0.30 },
  "canakkale":{ yillikSatis:11000,ipotekliOran:0.17,nufusM:0.55 },
  "edirne":{ yillikSatis:9500,ipotekliOran:0.18,nufusM:0.43 },
  "kirklareli":{ yillikSatis:7500,ipotekliOran:0.18,nufusM:0.36 },
  "tokat":{ yillikSatis:7000,ipotekliOran:0.15,nufusM:0.6 },
  "sivas":{ yillikSatis:8500,ipotekliOran:0.15,nufusM:0.65 },
  "yozgat":{ yillikSatis:5500,ipotekliOran:0.14,nufusM:0.42 },
  "amasya":{ yillikSatis:5000,ipotekliOran:0.16,nufusM:0.34 },
  "corum":{ yillikSatis:6500,ipotekliOran:0.15,nufusM:0.52 },
  "kastamonu":{ yillikSatis:5500,ipotekliOran:0.16,nufusM:0.39 },
  "sinop":{ yillikSatis:4500,ipotekliOran:0.16,nufusM:0.22 },
  "zonguldak":{ yillikSatis:7500,ipotekliOran:0.17,nufusM:0.59 },
  "karabuk":{ yillikSatis:5500,ipotekliOran:0.17,nufusM:0.25 },
  "bartin":{ yillikSatis:3500,ipotekliOran:0.16,nufusM:0.21 },
  "duzce":{ yillikSatis:7500,ipotekliOran:0.18,nufusM:0.40 },
  "bolu":{ yillikSatis:6500,ipotekliOran:0.18,nufusM:0.31 },
  "bilecik":{ yillikSatis:4000,ipotekliOran:0.17,nufusM:0.23 },
  "rize":{ yillikSatis:6500,ipotekliOran:0.16,nufusM:0.34 },
  "giresun":{ yillikSatis:5500,ipotekliOran:0.16,nufusM:0.45 },
  "artvin":{ yillikSatis:2500,ipotekliOran:0.15,nufusM:0.17 },
  "gumushane":{ yillikSatis:1800,ipotekliOran:0.14,nufusM:0.14 },
  "bayburt":{ yillikSatis:1251,ipotekliOran:0.13,nufusM:0.085 },
  "erzincan":{ yillikSatis:4000,ipotekliOran:0.15,nufusM:0.24 },
  "tunceli":{ yillikSatis:1300,ipotekliOran:0.12,nufusM:0.085 },
  "bingol":{ yillikSatis:3500,ipotekliOran:0.13,nufusM:0.28 },
  "mus":{ yillikSatis:3500,ipotekliOran:0.12,nufusM:0.40 },
  "bitlis":{ yillikSatis:3000,ipotekliOran:0.12,nufusM:0.35 },
  "hakkari":{ yillikSatis:1559,ipotekliOran:0.10,nufusM:0.27 },
  "siirt":{ yillikSatis:3500,ipotekliOran:0.12,nufusM:0.33 },
  "sirnak":{ yillikSatis:3500,ipotekliOran:0.11,nufusM:0.55 },
  "batman":{ yillikSatis:5500,ipotekliOran:0.12,nufusM:0.61 },
  "mardin":{ yillikSatis:6000,ipotekliOran:0.13,nufusM:0.86 },
  "adiyaman":{ yillikSatis:5000,ipotekliOran:0.13,nufusM:0.64 },
  "agri":{ yillikSatis:3000,ipotekliOran:0.12,nufusM:0.51 },
  "aksaray":{ yillikSatis:4500,ipotekliOran:0.16,nufusM:0.42 },
  "ardahan":{ yillikSatis:727,ipotekliOran:0.13,nufusM:0.097 },
  "burdur":{ yillikSatis:4500,ipotekliOran:0.16,nufusM:0.27 },
  "cankiri":{ yillikSatis:3000,ipotekliOran:0.16,nufusM:0.20 },
  "igdir":{ yillikSatis:2200,ipotekliOran:0.13,nufusM:0.20 },
  "isparta":{ yillikSatis:7500,ipotekliOran:0.16,nufusM:0.45 },
  "karaman":{ yillikSatis:3500,ipotekliOran:0.16,nufusM:0.26 },
  "kars":{ yillikSatis:2500,ipotekliOran:0.13,nufusM:0.28 },
  "kilis":{ yillikSatis:2200,ipotekliOran:0.13,nufusM:0.15 },
  "kirikkale":{ yillikSatis:4500,ipotekliOran:0.18,nufusM:0.28 },
  "kirsehir":{ yillikSatis:3500,ipotekliOran:0.16,nufusM:0.24 },
  "kutahya":{ yillikSatis:6500,ipotekliOran:0.16,nufusM:0.58 },
  "nevsehir":{ yillikSatis:4500,ipotekliOran:0.16,nufusM:0.30 },
  "nigde":{ yillikSatis:4000,ipotekliOran:0.15,nufusM:0.36 },
  "osmaniye":{ yillikSatis:5500,ipotekliOran:0.14,nufusM:0.55 },
  "usak":{ yillikSatis:4000,ipotekliOran:0.16,nufusM:0.38 },
};

function ilLikiditeSkoru(ilNorm: string): number {
  const il = IL_LIKIDITE[ilNorm];
  if (!il) return 0.5;
  const oran = il.yillikSatis / (il.nufusM * 1_000_000);
  if (oran > 0.025) return 1.0;
  if (oran > 0.018) return 0.85;
  if (oran > 0.013) return 0.70;
  if (oran > 0.008) return 0.50;
  return 0.30;
}

export const haritaRoutes = new Hono<{ Bindings: Env }>();

const VALID_TIP = new Set([1, 2, 3, 4, 5]);
const YIL_MIN = 2003;
const YIL_MAX = new Date().getFullYear();

// ── Tek ilçe / tek yıl noktaları ──────────────────────────────────────────────

haritaRoutes.get("/analiz", async (c) => {
  const ilceKodu  = Number(c.req.query("ilceKodu"));
  const analizTip = Number(c.req.query("analizTip"));
  const yil       = Number(c.req.query("yil"));

  if (!ilceKodu || !VALID_TIP.has(analizTip)) {
    return c.json({ error: "ilceKodu ve analizTip (1–5) zorunlu" }, 400);
  }
  if (yil && (yil < YIL_MIN || yil > YIL_MAX)) {
    return c.json({ error: `yil ${YIL_MIN}–${YIL_MAX} arasında olmalı` }, 400);
  }

  const hedefYil = yil || (YIL_MAX - 1);

  const rows = await c.env.DB.prepare(
    `SELECT parsel_id, enlem, boylam, sayi
     FROM tkgm_analiz_noktalari
     WHERE ilce_kodu = ? AND analiz_tip = ? AND yil = ?
     LIMIT 5000`
  ).bind(ilceKodu, analizTip, hedefYil).all<{
    parsel_id: number; enlem: number; boylam: number; sayi: number;
  }>();

  return c.json(
    { ilceKodu, analizTip, yil: hedefYil, noktalar: rows.results ?? [] },
    200,
    { "Cache-Control": "public, max-age=604800" }, // 7 gün
  );
});

// ── Tek ilçe / tüm yıllar birleşik (parsel bazında sum) ───────────────────────

haritaRoutes.get("/analiz/birlesik", async (c) => {
  const ilceKodu  = Number(c.req.query("ilceKodu"));
  const analizTip = Number(c.req.query("analizTip"));

  if (!ilceKodu || !VALID_TIP.has(analizTip)) {
    return c.json({ error: "ilceKodu ve analizTip (1–5) zorunlu" }, 400);
  }

  // Tüm yılları parsel bazında topla — D1 bunu single query ile halleder
  const rows = await c.env.DB.prepare(
    `SELECT parsel_id, enlem, boylam, SUM(sayi) AS sayi
     FROM tkgm_analiz_noktalari
     WHERE ilce_kodu = ? AND analiz_tip = ?
     GROUP BY parsel_id
     LIMIT 5000`
  ).bind(ilceKodu, analizTip).all<{
    parsel_id: number; enlem: number; boylam: number; sayi: number;
  }>();

  return c.json(
    { ilceKodu, analizTip, mod: "birlesik", noktalar: rows.results ?? [] },
    200,
    { "Cache-Control": "public, max-age=604800" },
  );
});

// ── Tüm ilçelerin özet sayıları ────────────────────────────────────────────────

haritaRoutes.get("/ozet", async (c) => {
  const analizTip = Number(c.req.query("analizTip") ?? "1");
  const yilRaw    = c.req.query("yil");
  const birlesik  = c.req.query("birlesik") === "1";

  if (!VALID_TIP.has(analizTip)) {
    return c.json({ error: "analizTip 1–5 olmalı" }, 400);
  }

  let rows;
  if (birlesik) {
    // Tüm yıllar toplamı
    rows = await c.env.DB.prepare(
      `SELECT ilce_kodu, SUM(nokta_sayisi) AS nokta_sayisi, SUM(toplam_islem) AS toplam_islem
       FROM tkgm_analiz_ozet
       WHERE analiz_tip = ?
       GROUP BY ilce_kodu`
    ).bind(analizTip).all<{
      ilce_kodu: number; nokta_sayisi: number; toplam_islem: number;
    }>();
  } else {
    const yil = yilRaw ? Number(yilRaw) : (YIL_MAX - 1);
    rows = await c.env.DB.prepare(
      `SELECT ilce_kodu, nokta_sayisi, toplam_islem
       FROM tkgm_analiz_ozet
       WHERE analiz_tip = ? AND yil = ?`
    ).bind(analizTip, yil).all<{
      ilce_kodu: number; nokta_sayisi: number; toplam_islem: number;
    }>();
  }

  return c.json(
    { analizTip, birlesik, ozet: rows.results ?? [] },
    200,
    { "Cache-Control": "public, max-age=3600" }, // 1 saat
  );
});

// ── POI noktaları (OSB, havalimanı, liman) ───────────────────────────────────
// GET /v1/harita/poi?kategori=osb
// GET /v1/harita/poi?kategori=havalimanı
// GET /v1/harita/poi (tümü)

const VALID_POI_KATEGORI = new Set(["osb", "havalimanı", "liman", "lojistik"]);

haritaRoutes.get("/poi", async (c) => {
  const kategori = c.req.query("kategori");

  if (kategori && !VALID_POI_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori. osb | havalimanı | liman | lojistik" }, 400);
  }

  let rows;
  if (kategori) {
    rows = await c.env.DB.prepare(
      `SELECT id, kategori, alt_tip, ad, il, lat, lng, meta
       FROM poi_noktalari
       WHERE kategori = ?
       ORDER BY il, ad`
    ).bind(kategori).all<{
      id: string; kategori: string; alt_tip: string | null;
      ad: string; il: string; lat: number; lng: number; meta: string | null;
    }>();
  } else {
    rows = await c.env.DB.prepare(
      `SELECT id, kategori, alt_tip, ad, il, lat, lng, meta
       FROM poi_noktalari
       ORDER BY kategori, il, ad`
    ).all<{
      id: string; kategori: string; alt_tip: string | null;
      ad: string; il: string; lat: number; lng: number; meta: string | null;
    }>();
  }

  const noktalar = (rows.results ?? []).map((r) => ({
    ...r,
    meta: r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : null,
  }));

  return c.json(
    { kategori: kategori ?? "tumu", noktalar },
    200,
    { "Cache-Control": "public, max-age=2592000, stale-while-revalidate=86400" }, // 30 gün
  );
});

// ── İl bazlı likidite skoru (harita choropleth) ───────────────────────────────
// GET /v1/harita/likidite?kategori=arsa
// Statik TÜİK verisinden üretilir — D1 sorgusu gerekmez.

haritaRoutes.get("/likidite", (c) => {
  const kategori = c.req.query("kategori") ?? "arsa";
  const VALID_KAT = new Set(["arsa", "tarla", "konut"]);
  if (!VALID_KAT.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }

  const iller = Object.entries(IL_LIKIDITE).map(([ilNorm, veri]) => {
    const skor = ilLikiditeSkoru(ilNorm);
    // Tarla kategorisinde kırsal iller biraz daha likit — tarla alım-satımı kentsel değil
    const kategoriDuzeltme = kategori === "tarla" && veri.nufusM < 0.5 ? 0.1 : 0;
    const nihai = Math.min(1.0, Math.round((skor + kategoriDuzeltme) * 100) / 100);
    return {
      il_norm: ilNorm,
      skor: nihai,
      yillik_satis: veri.yillikSatis,
      ipotekli_oran: veri.ipotekliOran,
      nufus_m: veri.nufusM,
      etiket: nihai >= 0.85 ? "Çok Aktif" : nihai >= 0.70 ? "Aktif" : nihai >= 0.50 ? "Normal" : "Düşük",
    };
  });

  return c.json(
    { kategori, guncelleme: "2025-12", iller },
    200,
    { "Cache-Control": "public, max-age=2592000, stale-while-revalidate=86400" }, // 30 gün
  );
});

// ── İl bazlı fiyat trendi / sıcaklık haritası ────────────────────────────────
// GET /v1/harita/trend?kategori=arsa
// D1'deki mahalle_zaman_serisi tablosundan son 3 ay vs önceki 3 ay karşılaştırması.

haritaRoutes.get("/trend", async (c) => {
  const kategori = c.req.query("kategori") ?? "arsa";
  const VALID_KAT = new Set(["arsa", "tarla", "konut", "bahce"]);
  if (!VALID_KAT.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }

  const simdi = new Date();
  const suAy = simdi.getMonth() + 1;
  const suYil = simdi.getFullYear();

  function ayGeri(yil: number, ay: number, n: number): { yil: number; ay: number } {
    let y = yil; let m = ay - n;
    while (m <= 0) { m += 12; y--; }
    return { yil: y, ay: m };
  }

  const son3Baslangic = ayGeri(suYil, suAy, 3);
  const son6Baslangic = ayGeri(suYil, suAy, 6);

  // Son 6 aylık il/ay bazlı medyan ortalamasını D1'den tek sorguda çek
  const rows = await c.env.DB.prepare(`
    SELECT
      il_norm,
      yil,
      ay,
      AVG(medyan) AS medyan_ort,
      SUM(ilan_adet) AS toplam_ilan
    FROM mahalle_zaman_serisi
    WHERE kategori = ?
      AND (
        (yil = ? AND ay >= ?) OR
        (yil > ? AND yil < ?) OR
        (yil = ? AND ay <= ?)
      )
    GROUP BY il_norm, yil, ay
    HAVING toplam_ilan >= 3
  `).bind(
    kategori,
    son6Baslangic.yil, son6Baslangic.ay,
    son6Baslangic.yil, suYil,
    suYil, suAy,
  ).all<{ il_norm: string; yil: number; ay: number; medyan_ort: number; toplam_ilan: number }>();

  // Her il için son 3 ay ve önceki 3 ay ayrı ayrı ortala
  const ilMap = new Map<string, { son3: number[]; once3: number[] }>();
  const sinirAy = son3Baslangic.yil * 12 + son3Baslangic.ay;

  for (const row of rows.results ?? []) {
    if (!ilMap.has(row.il_norm)) ilMap.set(row.il_norm, { son3: [], once3: [] });
    const entry = ilMap.get(row.il_norm)!;
    const rowAy = row.yil * 12 + row.ay;
    if (rowAy >= sinirAy) {
      entry.son3.push(row.medyan_ort);
    } else {
      entry.once3.push(row.medyan_ort);
    }
  }

  const iller = Array.from(ilMap.entries()).map(([ilNorm, d]) => {
    const ortSon3 = d.son3.length ? d.son3.reduce((s, v) => s + v, 0) / d.son3.length : null;
    const ortOnce3 = d.once3.length ? d.once3.reduce((s, v) => s + v, 0) / d.once3.length : null;
    let degisimYuzde = 0;
    if (ortSon3 !== null && ortOnce3 !== null && ortOnce3 > 0) {
      degisimYuzde = Math.round(((ortSon3 - ortOnce3) / ortOnce3) * 1000) / 10;
    }
    return {
      il_norm: ilNorm,
      degisim_yuzde: degisimYuzde,
      son3_ort: ortSon3 !== null ? Math.round(ortSon3) : null,
      once3_ort: ortOnce3 !== null ? Math.round(ortOnce3) : null,
      veri_var: ortSon3 !== null && ortOnce3 !== null,
      etiket: degisimYuzde > 15 ? "Çok Isınıyor"
        : degisimYuzde > 5 ? "Isınıyor"
        : degisimYuzde < -5 ? "Soğuyor"
        : "Stabil",
    };
  });

  return c.json(
    { kategori, donem: `${son6Baslangic.yil}-${String(son6Baslangic.ay).padStart(2,"0")} → ${suYil}-${String(suAy).padStart(2,"0")}`, iller },
    200,
    { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600" }, // 1 saat
  );
});

// ── Seed durumu (debug/admin) ──────────────────────────────────────────────────

haritaRoutes.get("/seed-status", async (c) => {
  const [ilceCount, tipYilCount, sonSeed] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(DISTINCT ilce_kodu) AS n FROM tkgm_analiz_ozet`
    ).first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM tkgm_analiz_ozet`
    ).first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT MAX(seed_at) AS t FROM tkgm_analiz_ozet`
    ).first<{ t: number | null }>(),
  ]);

  return c.json({
    ilceSayisi: ilceCount?.n ?? 0,
    tipYilKombinasyon: tipYilCount?.n ?? 0,
    sonSeedAt: sonSeed?.t ? new Date(sonSeed.t).toISOString() : null,
  });
});
