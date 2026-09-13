/**
 * GET /v1/statik/il/:il?kategori=arsa|tarla
 *
 * Bir ilin TÜM fiyat yanıtlarını tek seferde üretir: il, her ilçe, her
 * mahalle, her mahalle trendi ve harita ilçe özeti. Site build'i bunu il
 * başına bir kez çağırıp JSON dosyalarına böler ve Cloudflare Pages'e koyar.
 *
 * ── NEDEN (2026-09-13) ──────────────────────────────────────────────────────
 *
 * Veri sayfaları (/veri/il/ilçe/mahalle, embed, endeks) veriyi TARAYICIDA
 * API'den çekiyor: her ziyaretçi = Worker çağrısı + D1 okuması. Ücretsiz
 * katmanda Worker günde 100.000 istek, D1 günde 5.000.000 okuma — trafik
 * artınca ikisi de siteyi düşürür. Pages statik dosyaları sınırsız ve
 * ücretsiz sunuyor; veri zaten gecelik cron'la değişiyor.
 *
 * ── TASARIM ─────────────────────────────────────────────────────────────────
 *
 * Canlı rotaları dahili çağırmak mümkün değil: D1 ücretsiz katmanda çağrı
 * başına en fazla 50 sorgu. Burada (il, kategori) başına en fazla 8 TOPLU
 * sorgu var; yanıtlar canlı rotalarla AYNI fonksiyonlarla kuruluyor
 * (lib/fiyat-yanit.ts). Sorgular canlı rotaların SQL ifadelerini ve
 * sıralamalarını birebir kullanıyor; toplamalar JS'te yeniden yapılmıyor.
 *
 * Bilinen sınır: ağırlıklı ay medyanı `ROUND(SUM(medyan*ilan_adet)/SUM(ilan_adet))`.
 * Toplu sorgu ile canlı sorgu grubu farklı sırada birleştirebilir; kayan
 * nokta toplamı çok nadiren tam .5 sınırında ±1 TL fark verebilir.
 * test/statik-esdegerlik.spec.ts kontrollü veride birebir eşitliği ölçüyor.
 *
 * 404 GÖSTERİMİ: bir ilçe/mahalle anahtarı pakette YOKSA canlı rota 404
 * döner. Site bu yüzden "paket var ama anahtar yok"u kesin yokluk sayıp
 * API'ye gitmiyor.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { normalizeYerAdi } from "../lib/normalize.js";
import { gecerliIl } from "../data/iller.js";
import {
  type Yanit,
  type MahalleIstatistik,
  type ZamanSatiri,
  type MahalleAi,
  type IlceOzetTamSatiri,
  type AiIlceSatiri,
  mahalleYaniti,
  ilceYaniti,
  ilYaniti,
  ilAiGerekli,
  topluIlceOzetYaniti,
  trendYaniti,
} from "../lib/fiyat-yanit.js";

export const statikRoutes = new Hono<{ Bindings: Env }>();

/** Yalnızca ölçülmüş kategoriler — konut canlıda D1'e dokunmadan 422 dönüyor. */
export const STATIK_KATEGORILER = new Set(["arsa", "tarla"]);
export const STATIK_PAKET_SURUMU = 1;

const TREND_LIMIT = 18;
const TREND_MAHALLE_SON = 6;
const ILCE_MAHALLE_LIMIT = 50;

type Govde = Record<string, unknown>;

export interface IlPaketi {
  surum: number;
  il: string;
  kategori: string;
  uretildi: number;
  /** il yanıtı; durum 404 olabilir */
  il_yaniti: { durum: number; govde: Govde };
  /** ilce_norm → yanıt (yalnızca 200) */
  ilceler: Record<string, Govde>;
  /** harita popup — /fiyat/toplu-ilce-ozet/:il */
  toplu_ilce_ozet: Govde;
  /** ilce_norm → mahalle_norm → yanıt (yalnızca 200) */
  mahalleler: Record<string, Record<string, Govde>>;
  /** ilce_norm → { mahalle: mahalle_norm → trend, varsayilan: kendi serisi olmayan mahalle } */
  trendler: Record<string, { mahalle: Record<string, Govde>; varsayilan: Govde | null }>;
  /**
   * Canlı rotanın ULAŞAMAYACAĞI için pakete alınmayan ilçe/mahalle adı sayısı.
   * Canlı rota her parametreyi normalizeYerAdi'dan geçiriyor; D1'deki ad bu
   * fonksiyonun sabit noktası değilse (ör. "koy" → "") hiçbir istek ona
   * denk gelmez. Sessizce düşmesin diye sayılıyor.
   */
  erisilemeyen: number;
}

function grupla<T>(satirlar: T[], anahtar: (s: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const s of satirlar) {
    const k = anahtar(s);
    const liste = m.get(k);
    if (liste) liste.push(s); else m.set(k, [s]);
  }
  return m;
}

const govdeYa = (y: Yanit): Govde | null => (y.durum === 200 ? y.govde : null);

export async function ilPaketiKur(db: D1Database, il: string, kategori: string, simdi: number): Promise<IlPaketi> {
  const [ilIst, ilceSatir, mahSatir, zamanSatir, ilceAgg, ilAgg, aiSatir] = await Promise.all([
    db.prepare(
      `SELECT medyan, ilan_adet, son_guncelleme FROM il_istatistik WHERE il_norm = ? AND kategori = ?`,
    ).bind(il, kategori).first<{ medyan: number; ilan_adet: number; son_guncelleme: number }>(),
    db.prepare(
      `SELECT ilce_norm, medyan, q1, q3, ilan_adet, son_guncelleme
       FROM ilce_istatistik WHERE il_norm = ? AND kategori = ?
       ORDER BY medyan DESC, ilce_norm ASC`,
    ).bind(il, kategori).all<IlceOzetTamSatiri & { q1: number; q3: number }>(),
    db.prepare(
      `SELECT ilce_norm, mahalle_norm, medyan, q1, q3, ortalama, ilan_adet, son_guncelleme
       FROM mahalle_istatistik WHERE il_norm = ? AND kategori = ?
       ORDER BY ilce_norm ASC, ilan_adet DESC, mahalle_norm ASC`,
    ).bind(il, kategori).all<MahalleIstatistik & { ilce_norm: string; mahalle_norm: string }>(),
    db.prepare(
      `SELECT ilce_norm, mahalle_norm, yil, ay, medyan, ilan_adet
       FROM mahalle_zaman_serisi WHERE il_norm = ? AND kategori = ?
       ORDER BY ilce_norm ASC, mahalle_norm ASC, yil ASC, ay ASC`,
    ).bind(il, kategori).all<ZamanSatiri & { ilce_norm: string; mahalle_norm: string }>(),
    // Canlı trend rotasının ilçe ifadesi — ilçe başına gruplanmış hâli.
    db.prepare(
      `SELECT ilce_norm, yil, ay,
              ROUND(SUM(medyan * ilan_adet) / SUM(ilan_adet)) AS medyan,
              SUM(ilan_adet) AS ilan_adet
       FROM mahalle_zaman_serisi WHERE il_norm = ? AND kategori = ?
       GROUP BY ilce_norm, yil, ay
       ORDER BY ilce_norm ASC, yil ASC, ay ASC`,
    ).bind(il, kategori).all<ZamanSatiri & { ilce_norm: string }>(),
    db.prepare(
      `SELECT yil, ay,
              ROUND(SUM(medyan * ilan_adet) / SUM(ilan_adet)) AS medyan,
              SUM(ilan_adet) AS ilan_adet
       FROM mahalle_zaman_serisi WHERE il_norm = ? AND kategori = ?
       GROUP BY yil, ay
       ORDER BY yil ASC, ay ASC
       LIMIT ${TREND_LIMIT}`,
    ).bind(il, kategori).all<ZamanSatiri>(),
    db.prepare(
      `SELECT ilce_norm, mahalle_norm, tlm2, guven, kaynak, yakalandi
       FROM mahalle_baseline_ai WHERE il_norm = ? AND kategori = ?
       ORDER BY ilce_norm ASC, tlm2 DESC, mahalle_norm ASC`,
    ).bind(il, kategori).all<{
      ilce_norm: string; mahalle_norm: string; tlm2: number; guven: number | null; kaynak: string | null; yakalandi: number | null;
    }>(),
  ]);

  const ilceler = ilceSatir.results ?? [];
  const mahalleler = mahSatir.results ?? [];
  const zaman = zamanSatir.results ?? [];
  const ilceAggMap = grupla(ilceAgg.results ?? [], (r) => r.ilce_norm);
  const ilSeri = ilAgg.results ?? [];
  const ai = aiSatir.results ?? [];

  const mahByIlce = grupla(mahalleler, (r) => r.ilce_norm);
  const aiByIlce = grupla(ai, (r) => r.ilce_norm);
  const zamanByMah = grupla(zaman, (r) => `${r.ilce_norm}|${r.mahalle_norm}`);
  const ilceIstByAd = new Map(ilceler.map((r) => [r.ilce_norm, r]));

  // ── İl ────────────────────────────────────────────────────────────────────
  const ilListe = ilceler.map((r) => ({ ilce_norm: r.ilce_norm, medyan: r.medyan, ilan_adet: r.ilan_adet }));
  let aiIlceler: AiIlceSatiri[] | null = null;
  if (ilAiGerekli(ilIst, ilListe)) {
    // Canlı il rotasının AVG ifadesi birebir — JS'te ortalama alınmıyor.
    aiIlceler = (await db.prepare(
      `SELECT ilce_norm, AVG(tlm2) AS medyan, COUNT(*) AS baseline_satir_sayisi
       FROM mahalle_baseline_ai
       WHERE il_norm = ? AND kategori = ?
       GROUP BY ilce_norm
       ORDER BY medyan DESC, ilce_norm ASC`,
    ).bind(il, kategori).all<AiIlceSatiri>()).results ?? [];
  }
  const ilY = ilYaniti(ilIst, ilListe, aiIlceler, simdi);

  // ── İlçeler, mahalleler, trendler ─────────────────────────────────────────
  const ilceAdlari = new Set<string>([...ilceIstByAd.keys(), ...mahByIlce.keys(), ...aiByIlce.keys(), ...ilceAggMap.keys()]);
  const paketIlceler: Record<string, Govde> = {};
  const paketMahalleler: IlPaketi["mahalleler"] = {};
  const paketTrendler: IlPaketi["trendler"] = {};
  const ilTrend = ilSeri.slice(0, TREND_LIMIT);

  let erisilemeyen = 0;
  for (const ilce of [...ilceAdlari].sort()) {
    if (normalizeYerAdi(ilce) !== ilce) { erisilemeyen++; continue; }
    const ist = ilceIstByAd.get(ilce);
    const mahListe = (mahByIlce.get(ilce) ?? [])
      .slice(0, ILCE_MAHALLE_LIMIT)
      .map((r) => ({ mahalle_norm: r.mahalle_norm, medyan: r.medyan, ilan_adet: r.ilan_adet }));
    const aiIlce = aiByIlce.get(ilce) ?? [];
    const ilceY = ilceYaniti(
      ist ? { medyan: ist.medyan, q1: ist.q1, q3: ist.q3, ilan_adet: ist.ilan_adet, son_guncelleme: ist.son_guncelleme } : null,
      mahListe,
      aiIlce.slice(0, ILCE_MAHALLE_LIMIT).map((r) => ({ mahalle_norm: r.mahalle_norm, medyan: r.tlm2 })),
      simdi,
    );
    const ilceGovde = govdeYa(ilceY);
    if (ilceGovde) paketIlceler[ilce] = ilceGovde;

    // Mahalle yanıtları: istatistiği ya da AI satırı olan her mahalle.
    const istByMah = new Map((mahByIlce.get(ilce) ?? []).map((r) => [r.mahalle_norm, r]));
    const aiByMah = new Map(aiIlce.map((r) => [r.mahalle_norm, r]));
    const mahAdlari = new Set([...istByMah.keys(), ...aiByMah.keys()]);
    const mahPaket: Record<string, Govde> = {};
    for (const m of [...mahAdlari].sort()) {
      if (normalizeYerAdi(m) !== m) { erisilemeyen++; continue; }
      const r = istByMah.get(m);
      const a = aiByMah.get(m);
      const seri = zamanByMah.get(`${ilce}|${m}`) ?? [];
      const son6 = seri.slice(-TREND_MAHALLE_SON).reverse().map(({ yil, ay, medyan, ilan_adet }) => ({ yil, ay, medyan, ilan_adet }));
      const y = mahalleYaniti(
        r ? { medyan: r.medyan, q1: r.q1, q3: r.q3, ortalama: r.ortalama, ilan_adet: r.ilan_adet, son_guncelleme: r.son_guncelleme } : null,
        son6,
        a ? { medyan: a.tlm2, guven: a.guven, kaynak: a.kaynak, son_guncelleme: a.yakalandi } as MahalleAi : null,
      );
      const g = govdeYa(y);
      if (g) mahPaket[m] = g;
    }
    if (Object.keys(mahPaket).length > 0) paketMahalleler[ilce] = mahPaket;

    // Trend: kendi serisi olan mahalleler + serisi olmayanlar için varsayılan.
    const ilceTrend = (ilceAggMap.get(ilce) ?? []).slice(0, TREND_LIMIT).map(({ yil, ay, medyan, ilan_adet }) => ({ yil, ay, medyan, ilan_adet }));
    const trendMah: Record<string, Govde> = {};
    for (const [anahtar, seri] of zamanByMah) {
      const [zIlce, m] = anahtar.split("|") as [string, string];
      if (zIlce !== ilce || normalizeYerAdi(m) !== m) continue;
      const g = govdeYa(trendYaniti(
        seri.slice(0, TREND_LIMIT).map(({ yil, ay, medyan, ilan_adet }) => ({ yil, ay, medyan, ilan_adet })),
        ilceTrend,
        ilTrend,
      ));
      if (g) trendMah[m] = g;
    }
    paketTrendler[ilce] = { mahalle: trendMah, varsayilan: govdeYa(trendYaniti([], ilceTrend, ilTrend)) };
  }

  const mahalleSayilari = new Map([...mahByIlce].map(([k, v]) => [k, v.length]));
  const toplu = topluIlceOzetYaniti(il, kategori, ilceler.map((r) => ({
    ilce_norm: r.ilce_norm, medyan: r.medyan, ilan_adet: r.ilan_adet, son_guncelleme: r.son_guncelleme,
  })), mahalleSayilari);

  return {
    surum: STATIK_PAKET_SURUMU,
    il,
    kategori,
    uretildi: simdi,
    il_yaniti: { durum: ilY.durum, govde: ilY.govde },
    ilceler: paketIlceler,
    toplu_ilce_ozet: toplu.govde,
    mahalleler: paketMahalleler,
    trendler: paketTrendler,
    erisilemeyen,
  };
}

/**
 * Paket GÜNÜ — 03:30 UTC'de döner.
 *
 * Gecelik cron istatistikleri 03:00 UTC'de tazeliyor; sınır ondan sonra ki
 * cron öncesi bir build dünkü paketi kullansın, taze veriyi kaçırmasın.
 * Date.now() gövdede: Workers'ta modül düzeyi saat tuzağına düşmesin.
 */
export function paketGunu(zaman?: number): string {
  const t = (zaman ?? Date.now()) - 3.5 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 36 saat: bir günlük anahtar + cron/build gecikmesi payı. */
const STATIK_TTL_SN = 36 * 60 * 60;

/**
 * ── GÜNDE BİR HESAP ─────────────────────────────────────────────────────────
 *
 * Paket hesabı (il, kategori) başına D1'de birkaç bin satır okuyor; 162 paket
 * ≈ 200-300k okuma. Site her push'ta yeniden build ediliyor (bu depoda günde
 * 10-15 push görüldü) → önbelleksiz günde 3-4,5M okuma, bütçenin tamamı.
 * Paket KV'de GÜNLÜK anahtarla tutuluyor: günün ilk build'i hesaplar, sonraki
 * build'ler KV'den okur ve D1'e dokunmaz.
 *
 * İl, sabit 81 il listesine karşı doğrulanıyor: anahtar uzayı 81 × 2 ile
 * sınırlı, kötü niyetli istek bile günde en fazla 162 hesap tetikleyebilir.
 * Bu yüzden bu uçta KV tabanlı istek sınırlayıcı YOK (index.ts notu) — o her
 * istekte KV'ye yazıyor ve build başına 162 yazma, günlük 1.000 KV yazmasının
 * önemli bir kısmını yerdi.
 */
statikRoutes.get("/il/:il", async (c) => {
  const il = normalizeYerAdi(c.req.param("il"));
  const kategori = c.req.query("kategori") ?? "arsa";
  if (!gecerliIl(il) || !STATIK_KATEGORILER.has(kategori)) {
    return c.json({ error: "il (81 ilden biri) ve kategori (arsa|tarla) zorunlu" }, 400);
  }

  const anahtar = `statik:v${STATIK_PAKET_SURUMU}:${paketGunu()}:${kategori}:${il}`;
  const kv = c.env.RATE_LIMIT_KV;
  if (kv) {
    const kayit = await kv.get(anahtar, "text");
    if (kayit) {
      return new Response(kayit, {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Statik-Onbellek": "HIT" },
      });
    }
  }

  const govde = JSON.stringify(await ilPaketiKur(c.env.DB, il, kategori, Date.now()));
  if (kv) await kv.put(anahtar, govde, { expirationTtl: STATIK_TTL_SN });
  return new Response(govde, {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Statik-Onbellek": "MISS" },
  });
});
