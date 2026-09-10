/**
 * GET /v1/fiyat/mahalle/:il/:ilce/:mahalle?kategori=arsa
 * GET /v1/fiyat/ilce/:il/:ilce?kategori=arsa
 * GET /v1/fiyat/il/:il?kategori=arsa
 *
 * Cache-Control: public, s-maxage=3600 (CDN'de 1 saat tutulur)
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { normalizeYerAdi } from "../lib/normalize.js";
import { d1WithTimeout, isD1Timeout } from "../lib/db-timeout.js";

export const fiyatRoutes = new Hono<{ Bindings: Env }>();

const VALID_KATEGORI = new Set(["arsa", "tarla", "konut", "bahce", "bag", "zeytinlik"]);

// D1 timeout'ta sunucu tarafında "son bilinen iyi yanıt" yok (cache-read path'i yok);
// pratik "degraded" cevap 503 + Retry-After — s-maxage CDN cache'i trafiğin çoğunu
// zaten karşılıyor (bkz. plan: yeni bir fallback cache CDN cache'ini tekrarlar).
function d1TimeoutYaniti(c: import("hono").Context) {
  c.header("Retry-After", "5");
  return c.json({ error: "Sunucu şu an yoğun, birkaç saniye sonra tekrar deneyin" }, 503);
}

// Mahalle bazlı sorgu
fiyatRoutes.get("/mahalle/:il/:ilce/:mahalle", async (c) => {
  const il = normalizeYerAdi(c.req.param("il"));
  const ilce = normalizeYerAdi(c.req.param("ilce"));
  const mahalle = normalizeYerAdi(c.req.param("mahalle"));
  const kategori = c.req.query("kategori") ?? "arsa";

  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }

  // Gerçek istatistik + trend paralel. AI fallback BURADA DEĞİL.
  //
  // Eskiden AI baseline sorgusu da bu Promise.all içindeydi ve HER istekte
  // koşuyordu — gerçek istatistik varken bile sonucu atılıyordu. Kullanıcısı
  // olmayan bir sistemde bile bu, günlük 5M okuma limitinin (ücretsiz katman)
  // boşa harcanan bir dilimi. Maliyet: yalnızca fallback yolunda bir ekstra
  // round-trip; kazanç: isabet yolunda hiç.
  const sonuc = await d1WithTimeout(Promise.all([
    c.env.DB.prepare(
      `SELECT medyan, q1, q3, ortalama, ilan_adet, son_guncelleme
       FROM mahalle_istatistik
       WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? AND kategori = ?`,
    ).bind(il, ilce, mahalle, kategori)
      .first<{ medyan: number; q1: number; q3: number; ortalama: number; ilan_adet: number; son_guncelleme: number }>(),
    c.env.DB.prepare(
      `SELECT yil, ay, medyan, ilan_adet
       FROM mahalle_zaman_serisi
       WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? AND kategori = ?
       ORDER BY yil DESC, ay DESC LIMIT 6`,
    ).bind(il, ilce, mahalle, kategori).all(),
  ]), 4_000);
  if (isD1Timeout(sonuc)) return d1TimeoutYaniti(c);
  const [istatistik, trend] = sonuc;

  if (istatistik && istatistik.ilan_adet > 0) {
    c.header("Cache-Control", "public, s-maxage=3600");
    return c.json({
      kaynak: "ilan-istatistik",
      ...istatistik,
      trend: trend.results ?? [],
    });
  }

  // Fallback: AI baseline — yalnızca gerçek ölçüm yokken sorgulanır.
  const aiBaseline = await c.env.DB.prepare(
    `SELECT tlm2 as medyan, guven, kaynak, yakalandi as son_guncelleme
     FROM mahalle_baseline_ai
     WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? AND kategori = ?`,
  ).bind(il, ilce, mahalle, kategori).first();

  if (aiBaseline) {
    c.header("Cache-Control", "public, s-maxage=86400"); // AI baseline 1 gün cache
    return c.json({
      ...aiBaseline,
      ilan_adet: 0,
      baseline_satir_sayisi: 1,
      trend: [],
    });
  }

  return c.json({ error: "Veri bulunamadı" }, 404);
});

// İlçe bazlı sorgu — gerçek ilan istatistiği yoksa AI baseline'dan hesapla
fiyatRoutes.get("/ilce/:il/:ilce", async (c) => {
  const il = normalizeYerAdi(c.req.param("il"));
  const ilce = normalizeYerAdi(c.req.param("ilce"));
  const kategori = c.req.query("kategori") ?? "arsa";

  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }

  // Paralel — sequential await yerine
  const ilceSonuc = await d1WithTimeout(Promise.all([
    c.env.DB.prepare(
      `SELECT medyan, q1, q3, ilan_adet, son_guncelleme, 'ilan-istatistik' AS kaynak
       FROM ilce_istatistik
       WHERE il_norm = ? AND ilce_norm = ? AND kategori = ?`,
    ).bind(il, ilce, kategori)
      .first<{ medyan: number; q1: number; q3: number; ilan_adet: number; son_guncelleme: number; kaynak: string; baseline_satir_sayisi?: number }>(),
    c.env.DB.prepare(
      `SELECT mahalle_norm, medyan, ilan_adet
       FROM mahalle_istatistik
       WHERE il_norm = ? AND ilce_norm = ? AND kategori = ?
       ORDER BY ilan_adet DESC LIMIT 50`,
    ).bind(il, ilce, kategori)
      .all<{ mahalle_norm: string; medyan: number; ilan_adet: number }>(),
  ]), 4_000);
  if (isD1Timeout(ilceSonuc)) return d1TimeoutYaniti(c);
  let [ilceIstatistik, mahalleler] = ilceSonuc;

  // Fallback: AI baseline tablosundan ilçe ortalaması + mahalle listesi
  if (!ilceIstatistik || (mahalleler.results?.length ?? 0) === 0) {
    const aiMahalleler = await c.env.DB.prepare(
      `SELECT mahalle_norm, tlm2 AS medyan
       FROM mahalle_baseline_ai
       WHERE il_norm = ? AND ilce_norm = ? AND kategori = ?
       ORDER BY tlm2 DESC LIMIT 50`,
    )
      .bind(il, ilce, kategori)
      .all<{ mahalle_norm: string; medyan: number }>();

    const aiList = aiMahalleler.results ?? [];
    if (aiList.length > 0) {
      const fiyatlar = aiList.map(m => m.medyan).sort((a, b) => a - b);
      const medyan = fiyatlar[Math.floor(fiyatlar.length / 2)] ?? 0;
      const q1 = fiyatlar[Math.floor(fiyatlar.length * 0.25)] ?? 0;
      const q3 = fiyatlar[Math.floor(fiyatlar.length * 0.75)] ?? 0;
      ilceIstatistik = {
        medyan,
        q1,
        q3,
        ilan_adet: 0,
        baseline_satir_sayisi: aiList.length,
        son_guncelleme: Date.now(),
        kaynak: "ai-aggregate",
      };
      mahalleler = { results: aiList.map(m => ({ ...m, ilan_adet: 0, baseline_satir_sayisi: 1 })), success: true } as never;
    }
  }

  // YOKLUK KARARI: `ilceIstatistik` undefined ise spread hiçbir şey eklemiyor
  // ve gövde `{"mahalleler":[]}` olarak 200 dönüyordu. Site yalnızca `res.ok`e
  // baktığı için boş durum kartı HİÇ tetiklenmiyor, kullanıcıya "— TL/m²",
  // "— güncellendi", "Kaynak —" dolu bir kart gösteriliyordu. Aynı dosyadaki
  // mahalle yolu (yukarıda) zaten 404 dönüyor — davranış birleştirildi.
  // 404 yalnızca HİÇBİR ŞEY yokken: ilçe özeti düşmüş ama mahalle listesi
  // doluysa yanıt hâlâ işe yarıyor, onu atmak yeni bir kayıp olurdu.
  if (!ilceIstatistik && (mahalleler.results?.length ?? 0) === 0) {
    return c.json({ error: "Veri bulunamadı" }, 404);
  }

  c.header("Cache-Control", "public, s-maxage=3600");
  return c.json({
    ...ilceIstatistik,
    mahalleler: mahalleler.results ?? [],
  });
});

// İl bazlı sorgu
fiyatRoutes.get("/il/:il", async (c) => {
  const il = normalizeYerAdi(c.req.param("il"));
  const kategori = c.req.query("kategori") ?? "arsa";

  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }

  // Paralel
  const ilSonuc = await d1WithTimeout(Promise.all([
    c.env.DB.prepare(
      `SELECT medyan, ilan_adet, son_guncelleme, 'ilan-istatistik' AS kaynak
       FROM il_istatistik WHERE il_norm = ? AND kategori = ?`,
    ).bind(il, kategori)
      .first<{ medyan: number; ilan_adet: number; son_guncelleme: number; kaynak: string; baseline_satir_sayisi?: number }>(),
    c.env.DB.prepare(
      `SELECT ilce_norm, medyan, ilan_adet
       FROM ilce_istatistik
       WHERE il_norm = ? AND kategori = ?
       ORDER BY medyan DESC`,
    ).bind(il, kategori)
      .all<{ ilce_norm: string; medyan: number; ilan_adet: number }>(),
  ]), 4_000);
  if (isD1Timeout(ilSonuc)) return d1TimeoutYaniti(c);
  let [ilIstatistik, ilceler] = ilSonuc;

  // Fallback: AI baseline tablosundan il agregesi (ilçe başına AI medyan)
  if (!ilIstatistik || (ilceler.results?.length ?? 0) === 0) {
    const aiIlceler = await c.env.DB.prepare(
      `SELECT ilce_norm, AVG(tlm2) AS medyan, COUNT(*) AS baseline_satir_sayisi
       FROM mahalle_baseline_ai
       WHERE il_norm = ? AND kategori = ?
       GROUP BY ilce_norm
       ORDER BY medyan DESC`,
    )
      .bind(il, kategori)
      .all<{ ilce_norm: string; medyan: number; baseline_satir_sayisi: number }>();

    const aiList = aiIlceler.results ?? [];
    if (aiList.length > 0) {
      const ilFiyatlar = aiList.map(x => x.medyan).sort((a, b) => a - b);
      const ilMedyan = ilFiyatlar[Math.floor(ilFiyatlar.length / 2)] ?? 0;
      ilIstatistik = {
        medyan: ilMedyan,
        ilan_adet: 0,
        baseline_satir_sayisi: aiList.reduce((s, x) => s + x.baseline_satir_sayisi, 0),
        son_guncelleme: Date.now(),
        kaynak: "ai-aggregate",
      };
      ilceler = { results: aiList.map(x => ({ ...x, ilan_adet: 0 })), success: true } as never;
    }
  }

  // Yokluk kararı — bkz. /ilce yolundaki not. 200 + boş gövde, "veri yok" ile
  // "istek başarılı ama içerik boş"u ayırt edilemez kılıyordu.
  // Bkz. /ilce yolundaki not — 404 yalnızca il özeti DE ilçe listesi DE boşken.
  if (!ilIstatistik && (ilceler.results?.length ?? 0) === 0) {
    return c.json({ error: "Veri bulunamadı" }, 404);
  }

  c.header("Cache-Control", "public, s-maxage=3600");
  return c.json({
    ...ilIstatistik,
    ilceler: ilceler.results ?? [],
  });
});

// ── Toplu il fiyat özeti — harita choropleth için ──────────────────────────
/**
 * GET /v1/fiyat/toplu-ozet?kategori=arsa
 *
 * Tüm illerin medyan TL/m² değerlerini tek sorguda döndürür.
 * Site harita katmanı bu endpoint'ten beslenecek.
 *
 * Cache-Control: public, s-maxage=7200 (2 saat CDN)
 */
fiyatRoutes.get("/toplu-ozet", async (c) => {
  const kategori = c.req.query("kategori") ?? "arsa";
  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }

  // Tek sorgu, ~162 satırlık önden hesaplanmış tablo.
  //
  // ESKİDEN: `il_istatistik` taraması + `AVG(tlm2) FROM mahalle_baseline_ai
  // GROUP BY il_norm` — ikincisi 188.697 satırlık TAM TARAMA idi ve her
  // cache-miss'te koşuyordu. Ücretsiz katmanın günlük 5M okuma limitini tek
  // başına eritebilecek bir sorgu. Ağır agregasyon artık günlük cron'da bir kez
  // yapılıp `il_fiyat_ozet`e yazılıyor (migration 0032).
  const ozetRows = await c.env.DB.prepare(
    `SELECT il_norm, medyan_ilan, adet_ilan, medyan_ai, mahalle_ai_adet
     FROM il_fiyat_ozet
     WHERE kategori = ?
     ORDER BY il_norm`,
  ).bind(kategori).all<{
    il_norm: string;
    medyan_ilan: number | null;
    adet_ilan: number;
    medyan_ai: number | null;
    mahalle_ai_adet: number;
  }>();

  const sonuc: Array<{
    il_norm: string;
    medyan: number;
    ilan_adet: number;
    baseline_satir_sayisi: number;
    kaynak: "ilan" | "ai-baseline";
  }> = [];

  // Merge: ilan verisi varsa önce o (≥5 ilan), yoksa AI baseline.
  //
  // AI satırlarında `ilan_adet` 0 — çünkü ölçülmüş ilan yok. Eskiden buraya
  // `mahalle_baseline_ai` SATIR SAYISI yazılıyordu ve uzantı haritası onu
  // "650 ilan" diye gösteriyordu; gerçekte o ilde sıfır gözlem vardı.
  // Türetilmiş satır sayısı `mahalle_ai_adet` alanında ayrıca duruyor.
  for (const r of (ozetRows.results ?? [])) {
    if (r.medyan_ilan != null && r.adet_ilan >= 5) {
      sonuc.push({
        il_norm: r.il_norm,
        medyan: Math.round(r.medyan_ilan),
        ilan_adet: r.adet_ilan,
        baseline_satir_sayisi: 0,
        kaynak: "ilan",
      });
    } else if (r.medyan_ai != null && r.medyan_ai > 0) {
      sonuc.push({
        il_norm: r.il_norm,
        medyan: Math.round(r.medyan_ai),
        ilan_adet: 0,
        baseline_satir_sayisi: r.mahalle_ai_adet,
        kaynak: "ai-baseline",
      });
    }
  }

  sonuc.sort((a, b) => a.il_norm.localeCompare(b.il_norm));

  c.header("Cache-Control", "public, s-maxage=7200");
  return c.json({
    kategori,
    ilSayisi: sonuc.length,
    iller: sonuc,
    guncelleme: new Date().toISOString(),
  });
});

// ── Toplu ilçe fiyat özeti — il bazlı choropleth için ─────────────────────
/**
 * GET /v1/fiyat/toplu-ilce-ozet/:il?kategori=arsa
 *
 * Tek ilin tüm ilçelerinin medyan TL/m² değerlerini döndürür.
 * Haritada ilçeye yakınlaştırınca popup'ta gösterilir.
 *
 * Cache-Control: public, s-maxage=7200
 */
fiyatRoutes.get("/toplu-ilce-ozet/:il", async (c) => {
  const il      = normalizeYerAdi(c.req.param("il"));
  const kategori = c.req.query("kategori") ?? "arsa";

  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }

  // İlçe istatistik tablosundan çek
  const ilceRows = await c.env.DB.prepare(
    `SELECT ilce_norm, medyan, ilan_adet, son_guncelleme
     FROM ilce_istatistik
     WHERE il_norm = ? AND kategori = ?
     ORDER BY medyan DESC`,
  ).bind(il, kategori).all<{ ilce_norm: string; medyan: number; ilan_adet: number; son_guncelleme: number }>();

  // Mahalle sayısını da ekle (popup'ta göstermek için)
  const mahalleCountRows = await c.env.DB.prepare(
    `SELECT ilce_norm, COUNT(*) AS mahalle_sayi
     FROM mahalle_istatistik
     WHERE il_norm = ? AND kategori = ?
     GROUP BY ilce_norm`,
  ).bind(il, kategori).all<{ ilce_norm: string; mahalle_sayi: number }>();

  const mahalleMap = new Map<string, number>();
  for (const r of (mahalleCountRows.results ?? [])) {
    mahalleMap.set(r.ilce_norm, r.mahalle_sayi);
  }

  const ilceler = (ilceRows.results ?? []).map(r => ({
    ...r,
    medyan: Math.round(r.medyan),
    mahalle_sayi: mahalleMap.get(r.ilce_norm) ?? 0,
  }));

  c.header("Cache-Control", "public, s-maxage=7200");
  return c.json({ il, kategori, ilceler });
});

// ── Trend + Projeksiyon ─────────────────────────────────────────────────────
/**
 * GET /v1/fiyat/trend/:il/:ilce/:mahalle?kategori=arsa
 *
 * Son 18 aylık medyan + 6 aylık lineer regresyon projeksiyonu.
 * TÜFE yaklaşımı (aylık %3) ile reel değişim de hesaplanır.
 *
 * Cache-Control: public, s-maxage=21600 (6 saat CDN)
 */

interface ZamanNoktasi {
  yil: number;
  ay: number;
  medyan: number;
  ilan_adet: number;
}

/** Basit OLS lineer regresyon — saf JS, kütüphane yok. */
function olsRegresyon(ys: number[]): {
  egim: number;   // TL/m² / ay
  kesim: number;  // y-intercept
  r2: number;
  sigma: number;  // artık std sapma — güven bandı için
} {
  const n = ys.length;
  if (n < 3) return { egim: 0, kesim: ys[0] ?? 0, r2: 0, sigma: 0 };

  const xs = ys.map((_, i) => i);
  const xOrt = (n - 1) / 2;
  const yOrt = ys.reduce((s, v) => s + v, 0) / n;

  let ssXY = 0, ssXX = 0, ssYY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - xOrt;
    const dy = ys[i]! - yOrt;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }

  if (ssXX === 0) return { egim: 0, kesim: yOrt, r2: 0, sigma: 0 };

  const egim = ssXY / ssXX;
  const kesim = yOrt - egim * xOrt;
  const r2 = ssYY > 0 ? Math.min(1, Math.max(0, (ssXY * ssXY) / (ssXX * ssYY))) : 0;

  // Artık std sapma (σ)
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const tahmin = kesim + egim * i;
    ssRes += Math.pow(ys[i]! - tahmin, 2);
  }
  const sigma = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;

  return { egim, kesim, r2, sigma };
}

fiyatRoutes.get("/trend/:il/:ilce/:mahalle", async (c) => {
  const il      = normalizeYerAdi(c.req.param("il"));
  const ilce    = normalizeYerAdi(c.req.param("ilce"));
  const mahalle = normalizeYerAdi(c.req.param("mahalle"));
  const kategori = c.req.query("kategori") ?? "arsa";

  if (!VALID_KATEGORI.has(kategori)) {
    return c.json({ error: "Geçersiz kategori" }, 400);
  }

  // Son 18 ay — mahalle seviyesi
  let rows = await c.env.DB.prepare(
    `SELECT yil, ay, medyan, ilan_adet
     FROM mahalle_zaman_serisi
     WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ? AND kategori = ?
     ORDER BY yil ASC, ay ASC
     LIMIT 18`,
  ).bind(il, ilce, mahalle, kategori).all<ZamanNoktasi>();

  let seviye: "mahalle" | "ilce" | "il" = "mahalle";

  // W1c: Mahalle verisi yetersizse ilçe seviyesine fallback
  if ((rows.results ?? []).length < 3 && ilce) {
    const ilceRows = await c.env.DB.prepare(
      `SELECT yil, ay,
              ROUND(SUM(medyan * ilan_adet) / SUM(ilan_adet)) AS medyan,
              SUM(ilan_adet) AS ilan_adet
       FROM mahalle_zaman_serisi
       WHERE il_norm = ? AND ilce_norm = ? AND kategori = ?
       GROUP BY yil, ay
       ORDER BY yil ASC, ay ASC
       LIMIT 18`,
    ).bind(il, ilce, kategori).all<ZamanNoktasi>();

    if ((ilceRows.results ?? []).length >= 3) {
      rows = ilceRows;
      seviye = "ilce";
    }
  }

  // İlçe verisi de yetersizse il seviyesine fallback
  if ((rows.results ?? []).length < 3 && il) {
    const ilRows = await c.env.DB.prepare(
      `SELECT yil, ay,
              ROUND(SUM(medyan * ilan_adet) / SUM(ilan_adet)) AS medyan,
              SUM(ilan_adet) AS ilan_adet
       FROM mahalle_zaman_serisi
       WHERE il_norm = ? AND kategori = ?
       GROUP BY yil, ay
       ORDER BY yil ASC, ay ASC
       LIMIT 18`,
    ).bind(il, kategori).all<ZamanNoktasi>();

    if ((ilRows.results ?? []).length >= 3) {
      rows = ilRows;
      seviye = "il";
    }
  }

  const gecmis = rows.results ?? [];
  if (gecmis.length === 0) {
    return c.json({ error: "Trend verisi yok" }, 404);
  }

  // Regresyon — sadece son 12 ay üzerinden (daha güncel eğimi yakalar)
  const son12 = gecmis.slice(-12);
  const ys = son12.map(r => r.medyan);
  const reg = olsRegresyon(ys);

  // 6 ay ilerisi projeksiyon
  const sonNokta = gecmis[gecmis.length - 1]!;
  const projeksiyon = [];
  for (let i = 1; i <= 6; i++) {
    const ay = ((sonNokta.ay - 1 + i) % 12) + 1;
    const yil = sonNokta.yil + Math.floor((sonNokta.ay - 1 + i) / 12);
    const tahmin = Math.round(reg.kesim + reg.egim * (son12.length - 1 + i));
    const guvenBand = Math.round(reg.sigma * 1.96); // %95 CI
    projeksiyon.push({
      yil,
      ay,
      tahmin: Math.max(0, tahmin),
      guven_alt: Math.max(0, tahmin - guvenBand),
      guven_ust: tahmin + guvenBand,
    });
  }

  // Yıllık değişim
  const ilkFiyat = gecmis[0]!.medyan;
  const sonFiyat = sonNokta.medyan;
  const yillikDegisimYuzde = ilkFiyat > 0
    ? Math.round(((sonFiyat - ilkFiyat) / ilkFiyat) * 1000) / 10
    : 0;

  // Reel değişim: TÜFE yaklaşımı — her ay için ~%3 kümülatif enflasyon
  const aySayisi = gecmis.length;
  const tufeCarpani = Math.pow(1.03, aySayisi);
  const ruelDegisimYuzde = ilkFiyat > 0
    ? Math.round(((sonFiyat / (ilkFiyat * tufeCarpani)) - 1) * 1000) / 10
    : 0;

  const trend =
    reg.egim > sonFiyat * 0.005 ? "yukseliyor"
    : reg.egim < -sonFiyat * 0.005 ? "dusuyor"
    : "duruyor";

  c.header("Cache-Control", "public, s-maxage=21600");
  return c.json({
    gecmis,
    projeksiyon,
    yillikDegisimYuzde,
    ruelDegisimYuzde,
    trend,
    r2: Math.round(reg.r2 * 100) / 100,
    aylikEgimTlm2: Math.round(reg.egim),
    veriAyAdet: gecmis.length,
    /** W1c: hangi seviyede veri bulundu — "mahalle" | "ilce" | "il" */
    seviye,
  });
});
