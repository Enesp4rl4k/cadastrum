/**
 * POST /v1/gercek-satis — kullanıcı gerçek satış/alış fiyatı geri besleme döngüsü.
 *
 * ── NEDEN ÖNEMLİ ────────────────────────────────────────────────────────────
 *
 * Projenin tüm doğruluk ölçümleri İLAN fiyatı üzerine. Motor ise KAPANIŞ
 * fiyatını hedefliyor ve aradaki farkı `dinamikIndirimOrani` ile %6-24 arası
 * bir iskontoyla modelliyor. O model hiç ölçülmedi. Gerçek işlem fiyatı onu
 * ölçmenin tek yolu.
 *
 * ── FİYATA DOKUNMUYOR (G3.1) ────────────────────────────────────────────────
 *
 * Bu uç yalnızca TOPLUYOR. Toplanan veri motora bağlanmıyor — önce ayrı bir
 * hold-out olarak ölçülecek, ölçüm pozitifse bağlanacak (P1). A2'de hukuk
 * ajanı için konan kuralın aynısı: ölçülmemiş bilgi fiyata değil, ölçüme gider.
 *
 * ── 2026-09-11 DÜZELTMELERİ ─────────────────────────────────────────────────
 *
 * İlk sürüm deploy edilmişti ama tablosu yoktu (migration 0037 hiç
 * uygulanmamıştı) — her POST 503 dönüyordu. Ayrıca beş eksik vardı; her biri
 * aşağıda ilgili yerde gerekçesiyle.
 */
import { Hono } from "hono";
import type { Env } from "../index.js";
import { log } from "../lib/logger.js";
import { rateLimitMiddleware } from "../lib/rate-limit.js";
import { normalizeYerAdi } from "../lib/normalize.js";
import { jwtMiddleware } from "./hesap.js";
import { adminMiddleware } from "./admin.js";

export const gercekSatisRoutes = new Hono<{ Bindings: Env }>();

const VALID_TIP = new Set(["satin-alindi", "satildi", "bilgi"]);
const VALID_ALAN_BANT = new Set(["<250m²", "250-1000m²", "1000-5000m²", "5000-20000m²", ">20000m²"]);

/**
 * Motorun ürettiği kategoriler. Konut YOK: motor o kategoriyi üretmiyor
 * (data/o2-konut-kategorisi-olcum.json); kabul edilseydi hiçbir tahminle
 * kıyaslanamayan satırlar birikirdi.
 */
const VALID_KATEGORI = new Set(["arsa", "tarla"]);

/** Backtest kırılımıyla aynı adlar — ölçümde katman bazında kıyas için. */
const VALID_BASELINE_KAYNAK = new Set([
  "spatial-radius", "ilanGozlem-mahalle", "ilanGozlem-ilce", "mahalle-baseline",
  "ilce-semt-baseline", "ilce-baseline", "il-baseline", "fallback",
]);

/**
 * Kabul edilen TL/m² aralığı.
 *
 * İLK SÜRÜM ALT SINIRI 500'dü ve bu, ölçümü sistematik olarak bozacaktı.
 * Korpusta ölçüldü (2026-09-11):
 *
 *   tarla  n=15.820  medyan 800    <500 TL/m²: 5.734 (%36,2)   min 1
 *   arsa   n=50.801  medyan 2.270  <500 TL/m²: 7.475 (%14,7)   min 1
 *
 * Yani tarla işlemlerinin ÜÇTE BİRİNDEN FAZLASI reddedilecekti — ve tam da
 * motorun en çok yanıldığı ucuz kırsal bantta. Hold-out yanlı olurdu: ölçüm
 * motoru olduğundan iyi gösterirdi.
 *
 * Alt sınır 1: korpusun minimumu. Bunun altı birim hatası — gerçek bir fiyat
 * değil. Üst sınır 5.000.000: arsa korpusunun maksimumu (5,33M) civarı; p99,9
 * 184k. Sınırların işi birim hatasını yakalamak, "tuhaf" fiyatı elemek değil —
 * tuhaf fiyat ölçümün konusu.
 */
export const FIYAT_SINIRI = { MIN: 1, MAX: 5_000_000 } as const;

export interface GercekSatisPayload {
  istemciKimligi: string;
  ilAd: string;
  ilceAd: string;
  mahalleAd: string;
  kategori: string;
  gercekPerM2: number;
  alanBant: string;
  tip: string;
  tahminGorulduMu: boolean;
  heuristicPerM2: number | null;
  baselineKaynak?: string | null;
  uygulananIndirim?: number | null;
  girisTarihi: number;
}

export interface DogrulanmisSatis {
  istemciKimligi: string;
  il: string;
  ilce: string;
  mahalle: string;
  kategori: "arsa" | "tarla";
  gercekPerM2: number;
  alanBant: string;
  tip: string;
  tahminGoruldu: boolean;
  heuristicPerM2: number | null;
  baselineKaynak: string | null;
  uygulananIndirim: number | null;
  girisTarihi: number;
}

/**
 * Gövdeyi doğrular ve normalize eder. Saf fonksiyon — test edilebilir olsun diye
 * route'tan ayrı.
 *
 * YER ADLARI SUNUCUDA NORMALİZE EDİLİYOR. İlk sürüm `.toLowerCase()` yapıyordu:
 * "Çatalca" → "çatalca". Korpus ve motor `normalizeYerAdi` kullanıyor →
 * "catalca". Hiçbir satır motorun anahtarlarıyla eşleşmezdi ve bu hiçbir hata
 * vermeden olurdu. İstemciye güvenilmiyor: normalizasyon burada.
 */
export function gercekSatisDogrula(
  b: Partial<GercekSatisPayload> | null | undefined,
): { ok: true; veri: DogrulanmisSatis } | { ok: false; hata: string } {
  if (!b || typeof b !== "object") return { ok: false, hata: "Gövde yok" };

  if (typeof b.istemciKimligi !== "string" || !/^[0-9a-f-]{16,64}$/i.test(b.istemciKimligi)) {
    return { ok: false, hata: "istemciKimligi eksik ya da geçersiz" };
  }
  if (typeof b.ilAd !== "string" || typeof b.ilceAd !== "string" || typeof b.mahalleAd !== "string") {
    return { ok: false, hata: "Konum alanları eksik" };
  }
  const il = normalizeYerAdi(b.ilAd);
  const ilce = normalizeYerAdi(b.ilceAd);
  const mahalle = normalizeYerAdi(b.mahalleAd);
  if (!il || !ilce) return { ok: false, hata: "İl ve ilçe zorunlu" };

  if (typeof b.kategori !== "string" || !VALID_KATEGORI.has(b.kategori)) {
    return { ok: false, hata: "kategori 'arsa' ya da 'tarla' olmalı" };
  }
  if (
    typeof b.gercekPerM2 !== "number" || !Number.isFinite(b.gercekPerM2) ||
    b.gercekPerM2 < FIYAT_SINIRI.MIN || b.gercekPerM2 > FIYAT_SINIRI.MAX
  ) {
    return { ok: false, hata: `Fiyat aralık dışı (${FIYAT_SINIRI.MIN}–${FIYAT_SINIRI.MAX} ₺/m²)` };
  }
  if (typeof b.alanBant !== "string" || !VALID_ALAN_BANT.has(b.alanBant)) {
    return { ok: false, hata: "Geçersiz alan bandı" };
  }
  if (typeof b.tip !== "string" || !VALID_TIP.has(b.tip)) {
    return { ok: false, hata: "Geçersiz tip" };
  }
  if (typeof b.tahminGorulduMu !== "boolean") {
    return { ok: false, hata: "tahminGorulduMu zorunlu" };
  }

  // Opsiyonel alanlar: geçersizse REDDETME, null yaz. Tahmin bağlamı eksik bir
  // satış yine de değerli (işlem fiyatının kendisi); ama geçersiz bağlamı
  // saklamak ölçümü sessizce kirletirdi.
  const heuristic =
    typeof b.heuristicPerM2 === "number" && Number.isFinite(b.heuristicPerM2) && b.heuristicPerM2 > 0
      ? b.heuristicPerM2
      : null;
  const katman =
    typeof b.baselineKaynak === "string" && VALID_BASELINE_KAYNAK.has(b.baselineKaynak)
      ? b.baselineKaynak
      : null;
  const indirim =
    typeof b.uygulananIndirim === "number" && b.uygulananIndirim >= 0 && b.uygulananIndirim < 1
      ? b.uygulananIndirim
      : null;

  return {
    ok: true,
    veri: {
      istemciKimligi: b.istemciKimligi.toLowerCase(),
      il,
      ilce,
      mahalle,
      kategori: b.kategori as "arsa" | "tarla",
      gercekPerM2: b.gercekPerM2,
      alanBant: b.alanBant,
      tip: b.tip,
      tahminGoruldu: b.tahminGorulduMu,
      heuristicPerM2: heuristic,
      baselineKaynak: katman,
      uygulananIndirim: indirim,
      girisTarihi: typeof b.girisTarihi === "number" ? b.girisTarihi : Date.now(),
    },
  };
}

gercekSatisRoutes.post(
  "/",
  rateLimitMiddleware(30, "gercek-satis"),
  async (c) => {
    let body: Partial<GercekSatisPayload>;
    try {
      body = await c.req.json<Partial<GercekSatisPayload>>();
    } catch {
      return c.json({ error: "Geçersiz JSON" }, 400);
    }

    const d = gercekSatisDogrula(body);
    if (!d.ok) return c.json({ error: d.hata }, 422);
    const v = d.veri;

    try {
      /**
       * `ON CONFLICT(istemci_kimligi) DO NOTHING` — `INSERT OR IGNORE` DEĞİL.
       *
       * `OR IGNORE` yalnızca UNIQUE çakışmasını değil CHECK ve NOT NULL
       * ihlallerini de SESSİZCE yutar; hatalı bir satır "tekrar gönderim"
       * gibi görünüp kaybolurdu. Hedefli çakışma yalnızca tekrar gönderimi
       * yutuyor, geri kalan her ihlal hata olarak yüzeye çıkıyor.
       */
      const r = await c.env.DB.prepare(
        `INSERT INTO gercek_satislar
           (istemci_kimligi, il_norm, ilce_norm, mahalle_norm, kategori,
            gercek_per_m2, alan_bant, tip, tahmin_goruldu, heuristic_per_m2,
            baseline_kaynak, uygulanan_indirim, giris_tarihi, yakalanma_tarihi)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(istemci_kimligi) DO NOTHING`,
      ).bind(
        v.istemciKimligi, v.il, v.ilce, v.mahalle, v.kategori,
        v.gercekPerM2, v.alanBant, v.tip, v.tahminGoruldu ? 1 : 0, v.heuristicPerM2,
        v.baselineKaynak, v.uygulananIndirim, v.girisTarihi, Date.now(),
      ).run();

      // Tekrar gönderim BAŞARI sayılır: kayıt zaten sunucuda. Uzantı bunu
      // görüp senkron bayrağını kaldırmalı, sonsuza dek yeniden denememeli.
      const tekrar = (r.meta?.changes ?? 1) === 0;

      // Log'a fiyat ve mahalle YAZILMIYOR: küçük bir köyde mahalle + tarih +
      // fiyat tek bir işlemi tanımlayabilir. Tabloda zorunlu; log'da değil.
      log.info("gercek-satis.kaydedildi", { kategori: v.kategori, il: v.il, tekrar });

      return c.json({ ok: true, tekrar }, tekrar ? 200 : 201);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("no such table")) {
        log.warn("gercek-satis.tablo-yok", { hata: msg });
        return c.json({ error: "Tablo henüz oluşturulmamış — migration uygulayın", kod: "tablo-yok" }, 503);
      }
      log.error("gercek-satis.db-hata", { hata: msg });
      return c.json({ error: "Sunucu hatası" }, 500);
    }
  },
);

/**
 * Özetin bir mahalle-kategori satırı için asgari örnek.
 *
 * 1-2 kayıtlı bir mahallenin medyanı gürültüdür ve tek bir kişinin girişi
 * olabilir — hem istatistik hem gizlilik gerekçesi.
 */
export const OZET_MIN_N = 3;

function medyan(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * GET /v1/gercek-satis/ozet?il=istanbul&ilce=catalca — YALNIZCA ADMIN.
 *
 * İLK SÜRÜMDE YORUM "JWT admin claim gerektirir" diyordu ama KOD HİÇBİR
 * YETKİ KONTROLÜ YAPMIYORDU — herkes okuyabiliyordu. Artık `jwtMiddleware` +
 * `adminMiddleware` (admin.ts ile aynı, tek kaynak).
 *
 * İKİ ÖLÇÜ DEĞİŞTİ:
 *  - ORTALAMA → MEDYAN. Tek bir kötü niyetli ya da hatalı giriş ortalamayı
 *    istediği yere çeker; medyanı çekmek için yarısını ele geçirmek gerekir.
 *  - `AVG((tahmin − gerçek)/gerçek)` KALDIRILDI. Bu ölçü asimetrik — 100→500
 *    +%400, tersi −%80 — ve projede bias diye kovaladığımız şeyin büyük
 *    ölçüde bu artefakt olduğu ölçüldü (data/bias-metrigi-carpikligi.json).
 *    Yerine MEDYAN sapma.
 *
 * `OZET_MIN_N` altındaki mahalleler gösterilmiyor ama SAYILIYOR
 * (`gizlenen_mahalle`): gizlenenin sayısı görünmezse özet olduğundan
 * kapsamlı görünür.
 */
gercekSatisRoutes.get("/ozet", jwtMiddleware, adminMiddleware, async (c) => {
  const il = c.req.query("il");
  const ilce = c.req.query("ilce");
  if (!il) return c.json({ error: "il parametresi zorunlu" }, 400);
  const ilN = normalizeYerAdi(il);
  const ilceN = ilce ? normalizeYerAdi(ilce) : null;

  // YALNIZCA gerçek işlemler — 'bilgi' duyum ve ölçüme karışmaz.
  const rows = await c.env.DB.prepare(
    `SELECT ilce_norm, mahalle_norm, kategori, gercek_per_m2, heuristic_per_m2
     FROM gercek_satislar
     WHERE il_norm = ? ${ilceN ? "AND ilce_norm = ?" : ""}
       AND tip IN ('satin-alindi', 'satildi')
     LIMIT 5000`,
  ).bind(...(ilceN ? [ilN, ilceN] : [ilN])).all<{
    ilce_norm: string;
    mahalle_norm: string;
    kategori: string;
    gercek_per_m2: number;
    heuristic_per_m2: number | null;
  }>();

  const gruplar = new Map<string, {
    ilce: string; mahalle: string; kategori: string; gercek: number[]; sapma: number[];
  }>();
  for (const r of rows.results ?? []) {
    const k = `${r.ilce_norm}|${r.mahalle_norm}|${r.kategori}`;
    let g = gruplar.get(k);
    if (!g) {
      g = { ilce: r.ilce_norm, mahalle: r.mahalle_norm, kategori: r.kategori, gercek: [], sapma: [] };
      gruplar.set(k, g);
    }
    g.gercek.push(r.gercek_per_m2);
    if (r.heuristic_per_m2 && r.heuristic_per_m2 > 0) {
      g.sapma.push((r.heuristic_per_m2 - r.gercek_per_m2) / r.gercek_per_m2);
    }
  }

  let gizlenen = 0;
  const ozet: Array<{
    ilce_norm: string; mahalle_norm: string; kategori: string; n: number;
    medyan_gercek_per_m2: number | null; medyan_sapma_yuzde: number | null; tahminli_n: number;
  }> = [];
  for (const g of gruplar.values()) {
    if (g.gercek.length < OZET_MIN_N) {
      gizlenen++;
      continue;
    }
    const ms = medyan(g.sapma);
    ozet.push({
      ilce_norm: g.ilce,
      mahalle_norm: g.mahalle,
      kategori: g.kategori,
      n: g.gercek.length,
      medyan_gercek_per_m2: medyan(g.gercek),
      medyan_sapma_yuzde: ms == null ? null : Math.round(ms * 1000) / 10,
      tahminli_n: g.sapma.length,
    });
  }
  ozet.sort((a, b) => b.n - a.n);

  return c.json({ ozet, gizlenen_mahalle: gizlenen, min_n: OZET_MIN_N });
});
