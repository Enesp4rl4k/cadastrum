/**
 * Arz-Talep Endeksi — Sprint 4-E
 *
 * Mahalle/ilçe bazlı haftalık arz-talep dinamiği:
 *   - Arz: aktif ilan sayısı (bu hafta vs geçen hafta)
 *   - Talep sinyal proxy: fiyat değişimi × ilan hızı (kaç günde satıldı proxy)
 *   - Endeks: -100 (çok yüksek arz) → +100 (çok yüksek talep)
 *
 * Backend endpoint: GET /v1/istatistik/arz-talep?il=&ilce=&mahalle=
 * Extension: AiHubView'de trend sekmesine eklenir.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { rateLimitMiddleware } from "../lib/rate-limit.js";

export const arzTalepRoutes = new Hono<{ Bindings: Env }>();
arzTalepRoutes.use("*", rateLimitMiddleware(60, "arz-talep"));

/**
 * GET /v1/istatistik/arz-talep
 *
 * Parametreler:
 *   il (zorunlu)
 *   ilce (opsiyonel — yoksa il düzeyi)
 *   mahalle (opsiyonel — yoksa ilçe düzeyi)
 *   kategori (arsa|tarla|konut, varsayılan: arsa)
 *   hafta (kaç haftalık geçmiş, 1-12, varsayılan: 4)
 *
 * Yanıt:
 *   endeks: -100..100 (+ = yüksek talep, - = yüksek arz)
 *   aciklama: "Arz fazlası — fiyat baskısı bekleniyor" vb.
 *   haftalikVeri: [{hafta, ilanAdet, medyan, degisimYuzde}]
 *   onYorum: AI değil, kural tabanlı yorum
 */
arzTalepRoutes.get("/arz-talep", async (c) => {
  const il       = c.req.query("il")?.trim().toLowerCase();
  const ilce     = c.req.query("ilce")?.trim().toLowerCase();
  const mahalle  = c.req.query("mahalle")?.trim().toLowerCase();
  const kategori = c.req.query("kategori") ?? "arsa";
  const hafta    = Math.min(12, Math.max(1, parseInt(c.req.query("hafta") ?? "4", 10)));

  if (!il) return c.json({ error: "il parametresi gerekli" }, 400);

  try {
    // D1'deki ilanGozlem kayıtlarından haftalık arz analizi
    // Her kayıt bir ilan gözlemi; created_at sütunu haftalık gruplamak için kullanılır.
    const birHaftaMs = 7 * 24 * 60 * 60 * 1000;
    const baslangic = Date.now() - hafta * birHaftaMs;

    let whereKosula = "il_norm = ?";
    const params: (string | number)[] = [il, baslangic];

    if (ilce) {
      whereKosula += " AND ilce_norm = ?";
      params.splice(1, 0, ilce); // params: [il, ilce, baslangic]
      params[params.length === 3 ? 2 : 3] = baslangic;
    }
    if (mahalle) {
      whereKosula += " AND mahalle_norm = ?";
    }
    whereKosula += " AND kategori = ? AND fiyat_per_m2 > 0 AND para_birimi = 'TL'";

    // Dinamik param sıralaması
    const allParams: (string | number)[] = [il];
    if (ilce) allParams.push(ilce);
    if (mahalle) allParams.push(mahalle);
    allParams.push(kategori);
    allParams.push(baslangic);

    // Haftalık gruplama — Unix timestamp / hafta sayısına göre bucket
    const sonuc = await c.env.DB.prepare(`
      SELECT
        CAST((gorunme_tarihi - ${baslangic}) / ${birHaftaMs} AS INTEGER) AS hafta_no,
        COUNT(*) AS ilan_adet,
        ROUND(AVG(fiyat_per_m2), 0) AS ort_fiyat,
        MIN(fiyat_per_m2) AS min_fiyat,
        MAX(fiyat_per_m2) AS max_fiyat
      FROM ilan_gozlem
      WHERE ${whereKosula}
        AND gorunme_tarihi >= ?
      GROUP BY hafta_no
      ORDER BY hafta_no ASC
    `).bind(...allParams).all<{
      hafta_no: number;
      ilan_adet: number;
      ort_fiyat: number;
      min_fiyat: number;
      max_fiyat: number;
    }>();

    const veri = sonuc.results ?? [];

    // Arz-talep endeksi hesabı
    const endeks = hesaplaEndeks(veri);
    const aciklama = endeksAciklama(endeks);

    // Haftalık değişim yüzdeleri
    const haftalikVeri = veri.map((v, i) => ({
      hafta: v.hafta_no,
      ilanAdet: v.ilan_adet,
      ortFiyat: v.ort_fiyat,
      degisimYuzde: i > 0 && veri[i - 1]!.ort_fiyat > 0
        ? Math.round(((v.ort_fiyat - veri[i - 1]!.ort_fiyat) / veri[i - 1]!.ort_fiyat) * 1000) / 10
        : null,
    }));

    return c.json({
      ok: true,
      il,
      ilce: ilce ?? null,
      mahalle: mahalle ?? null,
      kategori,
      endeks,
      aciklama,
      haftalikVeri,
      toplamIlan: veri.reduce((s, v) => s + v.ilan_adet, 0),
      hesapHaftaSayisi: hafta,
    });
  } catch (e) {
    console.error("[arz-talep]", e);
    return c.json({ error: "Hesaplama hatası" }, 500);
  }
});

/**
 * Endeks hesabı: ilan sayısı trendi + fiyat trendi birleşimi.
 * Sonuç: -100 (çok yüksek arz) → +100 (çok yüksek talep)
 */
function hesaplaEndeks(
  veri: Array<{ hafta_no: number; ilan_adet: number; ort_fiyat: number }>,
): number {
  if (veri.length < 2) return 0;

  const ilk    = veri[0]!;
  const son    = veri[veri.length - 1]!;

  // İlan sayısı değişimi: artış = arz artıyor = talep düşüyor (negatif)
  const ilanDegisim = ilk.ilan_adet > 0
    ? (son.ilan_adet - ilk.ilan_adet) / ilk.ilan_adet
    : 0;

  // Fiyat değişimi: artış = talep güçlü (pozitif)
  const fiyatDegisim = ilk.ort_fiyat > 0
    ? (son.ort_fiyat - ilk.ort_fiyat) / ilk.ort_fiyat
    : 0;

  // Ağırlıklı endeks: fiyat değişimi %60, ilan sayısı tersi %40
  const raw = (fiyatDegisim * 0.6) - (ilanDegisim * 0.4);

  // -1..1 aralığını -100..100'e ölçekle (tanh ile sınırla)
  const sınırlı = Math.tanh(raw * 5);
  return Math.round(sınırlı * 100);
}

function endeksAciklama(endeks: number): string {
  if (endeks >= 60)  return "Güçlü talep — fiyat artışı bekleniyor";
  if (endeks >= 30)  return "Orta talep — piyasa dengeli yükseliyor";
  if (endeks >= -10) return "Dengeli piyasa — belirgin sinyal yok";
  if (endeks >= -30) return "Arz artışı — fiyat baskısı var";
  return "Yüksek arz — alıcı piyasası, fiyat düşüşü riski";
}
