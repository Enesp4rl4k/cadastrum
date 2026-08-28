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
 * GET /v1/harita/ilceler
 *   → Bilinen tüm ilçe kodları + yaklaşık merkez koordinatı (D1'den — TKGM'ye
 *     hiç istek atmadan). Site harita sayfasının viewport-bazlı ilçe keşfi
 *     için (bkz. site/src/scripts/harita-init.ts) — daha önce bu iş canlı
 *     TKGM idariYapi proxy'si üzerinden yapılıyordu, yasal/ToS riski
 *     nedeniyle kaldırıldı.
 *
 * GET /v1/harita/seed-status
 *   → Kaç ilçe/tip/yıl seed edilmiş (admin/debug için)
 */

import { Hono } from "hono";
import type { Env } from "../index.js";
import { IL_LIKIDITE, ilLikiditeSkoru, IL_ALTYAPI_PUAN } from "../data/harita-data.js";

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

// ── İlçe kodu + yaklaşık merkez (TKGM'ye hiç istek atmadan, D1'den) ──────────

haritaRoutes.get("/ilceler", async (c) => {
  // Sabit bir yıl/tipe filtrelemiyoruz — amaç sadece "hangi ilçe kodları var
  // + yaklaşık merkezi" bulmak, hangi yılın seed edildiği zamanla değişebilir
  // (bkz. /ozet'in YIL_MAX-1 varsayımı: seed verisi 2024'te kalmışken bugünün
  // yılı ilerledikçe sessizce boş sonuç dönerdi). Tablo ~250k satır — filtresiz
  // GROUP BY bu boyutta ucuz, 30 günlük cache zaten tekrar sorgulanmasını önlüyor.
  const rows = await c.env.DB.prepare(
    `SELECT ilce_kodu, AVG(enlem) AS lat, AVG(boylam) AS lng
     FROM tkgm_analiz_noktalari
     GROUP BY ilce_kodu`
  ).all<{ ilce_kodu: number; lat: number; lng: number }>();

  return c.json(
    { ilceler: rows.results ?? [] },
    200,
    { "Cache-Control": "public, max-age=2592000" }, // 30 gün — idari yapı pratikte hiç değişmez
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

  // Tüm 81 il için veri üret — IL_LIKIDITE'de olmayanlar için fallback skor.
  // harita-init.ts'deki IL_CENTROID ile eşleşmesi için tüm iller dahil edilmeli.
  const TUM_ILLER_NORM = [
    "adana","adiyaman","afyonkarahisar","agri","amasya","ankara","antalya","artvin",
    "aydin","balikesir","bilecik","bingol","bitlis","bolu","burdur","bursa",
    "canakkale","cankiri","corum","denizli","diyarbakir","edirne","elazig","erzincan",
    "erzurum","eskisehir","gaziantep","giresun","gumushane","hakkari","hatay","isparta",
    "mersin","istanbul","izmir","kars","kastamonu","kayseri","kirklareli","kirsehir",
    "kocaeli","konya","kutahya","malatya","manisa","kahramanmaras","mardin","mugla",
    "mus","nevsehir","nigde","ordu","rize","sakarya","samsun","siirt","sinop","sivas",
    "tekirdag","tokat","trabzon","tunceli","sanliurfa","usak","van","yozgat","zonguldak",
    "aksaray","bayburt","karaman","kirikkale","batman","sirnak","bartin","ardahan",
    "igdir","yalova","karabuk","kilis","osmaniye","duzce",
  ];

  const iller = TUM_ILLER_NORM.map((ilNorm) => {
    const veri = IL_LIKIDITE[ilNorm];
    const skor = ilLikiditeSkoru(ilNorm); // fallback 0.5 eğer yoksa
    // Tarla kategorisinde kırsal iller biraz daha likit
    const kategoriDuzeltme = kategori === "tarla" && (veri?.nufusM ?? 0.5) < 0.5 ? 0.1 : 0;
    const nihai = Math.min(1.0, Math.round((skor + kategoriDuzeltme) * 100) / 100);
    return {
      il_norm: ilNorm,
      skor: nihai,
      yillik_satis: veri?.yillikSatis ?? 0,
      ipotekli_oran: veri?.ipotekliOran ?? 0.15,
      nufus_m: veri?.nufusM ?? 0.3,
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

// ── Gelişen Bölgeler — Bölge Gelişim Skoru (statik + D1 fiyat momentum) ────────
/**
 * GET /v1/harita/gelisen-bolgeler
 *
 * İl bazlı bölge gelişim skoru — site harita katmanı için choropleth verisi.
 * 3 boyut: likidite trendi + fiyat momentum + altyapı yakınlığı.
 *
 * Statik tablolar: IL_LIKIDITE (harita.ts) + IL_ALTYAPI (bu endpoint)
 * D1'den: son 6 ay vs önceki 6 ay fiyat değişimi (zaten /harita/trend'de var)
 *
 * Cache: 24 saat (günlük yeterli)
 */



haritaRoutes.get("/gelisen-bolgeler", async (c) => {
  // D1'den son 12 ay fiyat trendini çek (birleşik il bazlı)
  const simdi = Date.now();
  const son12AyTs = simdi - 365 * 86_400_000;

  const fiyatRows = await c.env.DB.prepare(
    `SELECT il_norm,
            AVG(CASE WHEN ay_ts >= ? THEN medyan ELSE NULL END) AS son6_ort,
            AVG(CASE WHEN ay_ts < ? AND ay_ts >= ? THEN medyan ELSE NULL END) AS once6_ort,
            COUNT(*) AS kayit_sayi
     FROM (
       SELECT mz.il_norm,
              (julianday(mz.yil||'-'||printf('%02d',mz.ay)||'-01') - 2440587.5) * 86400000 AS ay_ts,
              mz.medyan
       FROM mahalle_zaman_serisi mz
       WHERE mz.kategori = 'arsa' AND mz.yil >= ?
       GROUP BY mz.il_norm, mz.yil, mz.ay
       ORDER BY mz.yil DESC, mz.ay DESC
     )
     GROUP BY il_norm`,
  ).bind(
    simdi - 180 * 86_400_000,  // son 6 ay başlangıcı
    simdi - 180 * 86_400_000,  // önceki 6 ay sonu
    simdi - 365 * 86_400_000,  // önceki 6 ay başlangıcı
    new Date().getFullYear() - 2,
  ).all<{ il_norm: string; son6_ort: number | null; once6_ort: number | null; kayit_sayi: number }>();

  type FiyatRow = { il_norm: string; son6_ort: number | null; once6_ort: number | null; kayit_sayi: number };
  const fiyatMap = new Map<string, FiyatRow>(
    (fiyatRows.results ?? [] as FiyatRow[]).map((r) => [r.il_norm, r] as [string, FiyatRow])
  );

  // Her il için 3 boyutlu skor hesapla
  const sonuclar: Array<{
    il_norm: string;
    skor: number;
    sinif: "yuksek" | "orta" | "izle";
    fiyat_momentum: number;
    likidite_skoru: number;
    altyapi_skoru: number;
    etiket: string;
  }> = [];

  for (const [ilNorm, likidite] of Object.entries(IL_LIKIDITE as Record<string, { yillikSatis: number; ipotekliOran: number; nufusM: number }>)) {
    const fiyat = fiyatMap.get(ilNorm);
    const altyapi = IL_ALTYAPI_PUAN[ilNorm] ?? 30;

    // Boyut 1: Fiyat momentum (0–40) — son 6 ay vs önceki 6 ay
    let fiyatMomentum = 20; // neutral fallback
    if (fiyat?.son6_ort && fiyat?.once6_ort && fiyat.once6_ort > 0) {
      const degisim = (fiyat.son6_ort - fiyat.once6_ort) / fiyat.once6_ort;
      // -50% ile +100% arasını 0-40'a normalize
      fiyatMomentum = Math.max(0, Math.min(40, Math.round((degisim + 0.5) / 1.5 * 40)));
    }

    // Boyut 2: Likidite skoru (0–35) — yıllık satış hacmi log normalize
    const logSatis = Math.log10(Math.max(likidite.yillikSatis, 100));
    const likiditeSkor = Math.round(Math.min(35, (logSatis / 5.5) * 35));

    // Boyut 3: Altyapı skoru (0–25) — statik tablo
    const altyapiSkor = Math.round((altyapi / 100) * 25);

    const toplamSkor = fiyatMomentum + likiditeSkor + altyapiSkor;

    const sinif: "yuksek" | "orta" | "izle" =
      toplamSkor >= 70 ? "yuksek"
      : toplamSkor >= 50 ? "orta"
      : "izle";

    const etiket =
      sinif === "yuksek" ? "🔥 Yüksek Potansiyel"
      : sinif === "orta" ? "📈 Orta Potansiyel"
      : "👀 İzle";

    sonuclar.push({
      il_norm: ilNorm,
      skor: toplamSkor,
      sinif,
      fiyat_momentum: fiyatMomentum,
      likidite_skoru: likiditeSkor,
      altyapi_skoru: altyapiSkor,
      etiket,
    });
  }

  sonuclar.sort((a, b) => b.skor - a.skor);

  return c.json(
    { iller: sonuclar, guncelleme: new Date().toISOString() },
    200,
    { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" },
  );
});

// ── Seed durumu (debug/admin) ──────────────────────────────────────────────────

haritaRoutes.get("/seed-status", async (c) => {
  const secret = c.req.query("secret") || c.req.header("X-Admin-Secret") || c.req.header("Authorization")?.replace("Bearer ", "");
  if (c.env.ENVIRONMENT !== "development" && (!secret || secret !== c.env.SEED_SECRET && secret !== c.env.STATS_SECRET)) {
    return c.json({ error: "Yetkisiz erişim" }, 401);
  }

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
