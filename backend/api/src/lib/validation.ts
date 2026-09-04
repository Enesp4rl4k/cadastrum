import { z } from "zod";
import type { Context } from "hono";

export const KategoriSchema = z.enum(["arsa", "tarla", "konut", "bahce", "bag", "zeytinlik", "diger"]);

export const CoordinatesSchema = z.object({
  lat: z.coerce.number().min(35.5, "Enlem T�rkiye s�n�rlar� d���nda").max(42.5, "Enlem T�rkiye s�n�rlar� d���nda"),
  lng: z.coerce.number().min(25.5, "Boylam T�rkiye s�n�rlar� d���nda").max(45.0, "Boylam T�rkiye s�n�rlar� d���nda"),
  kategori: KategoriSchema.default("arsa"),
  radiusKm: z.coerce.number().min(0.1).max(100).default(5),
});

export const IlceAnalizQuerySchema = z.object({
  ilceKodu: z.coerce.number().int().positive("Ge�ersiz il�e kodu"),
  analizTip: z.coerce.number().int().min(1).max(5).default(1),
  yil: z.coerce.number().int().min(2000).max(new Date().getFullYear()).optional(),
  birlesik: z.enum(["0", "1"]).optional(),
});

export const IlanIngestSchema = z.object({
  kaynak: z.enum(["sahibinden", "hepsiemlak", "extension", "emlakjet"]),
  /**
   * SENTETİK İLAN YASAĞI — `bl_` önekli ilan_no reddedilir.
   *
   * 2026-09-04'te silinen `scripts/seed-baseline-sql.mjs`, `mahalle-baseline.ts`
   * tahminlerinden 109.272 satır üretip `kaynak='extension'` etiketiyle
   * `ilanlar` tablosuna basıyordu. Tek ayırt edici işaret bu önekti ve onu
   * filtreleyen tek satır kod yoktu — yani tahmin, gözlem havuzuna gözlem
   * kılığında giriyordu. Gerekçe: scripts/SENTETIK-ILAN-YASAGI.md
   *
   * Üretimde hiç çalıştırılmamıştı (doğrulandı: canlı sayım 0). Bu kural o
   * durumun korunması için.
   */
  ilanNo: z.string().min(1, "İlan numarası boş olamaz").max(64)
    .refine((v) => !v.startsWith("bl_"), {
      message: "Sentetik baseline ilan numarası kabul edilmez (bkz. scripts/SENTETIK-ILAN-YASAGI.md)",
    }),
  il: z.string().min(1).max(50),
  ilce: z.string().min(1).max(50),
  mahalle: z.string().max(100).optional().nullable(),
  fiyatPerM2: z.number().positive("Fiyat/m2 pozitif olmal�"),
  m2: z.number().positive().max(50_000_000).optional().nullable(),
  paraBirimi: z.string().default("TL"),
  kategori: KategoriSchema.default("arsa"),
  imarDurumu: z.string().max(100).optional().nullable(),
  /**
   * Ilan basligi.
   *
   * Extension her ilanda basligi YAKALIYOR ve yerel olarak kullaniyor
   * (background/scraping-runtime.ts kategori cikarimi, rafineri NLP'si), ama
   * bu sema alani tanimadigi icin backend'e yuklerken sessizce ATILIYORDU —
   * uretimde 530 extension ilaninin hicbirinde baslik yoktu.
   *
   * Rafinerinin hisseli/kooperatif tespiti bu metne bakiyor; backend
   * tarafindaki emsaller bu yuzden sinyalsiz kaliyordu.
   */
  baslik: z.string().max(300).optional().nullable(),
  /** Tapu durumu — "Hisseli Tapu" / "Mustakil Tapu". Yapisal alan. */
  tapuDurumu: z.string().max(100).optional().nullable(),
  /**
   * Koordinat kaynagi — "dom" (ilan sayfasindan), "mahalle-merkez" (cozumlendi),
   * "manuel". Spatial emsal motoru GERCEK parsel koordinati ile mahalle
   * merkezini bu alanla ayirt ediyor.
   *
   * SEMADA YOKTU: `baslik` hatasinin birebir ikizi. Extension bu alani
   * gonderiyordu (background/scraping-runtime.ts, service-worker.ts) ama zod
   * bilinmeyen anahtarlari strip ettigi icin /ilan/batch ve /ilan/katki
   * yollarinda HER ZAMAN NULL yaziliyordu. Tekil POST /ilan yolu ham govdeden
   * okudugu icin calisiyordu — yani ayni alan bir yolda dogru, iki yolda kayip.
   */
  koordKaynagi: z.enum(["dom", "mahalle-merkez", "manuel"]).optional().nullable(),
  /**
   * Ilanin yayin tarihi (ms). `yakalanma_tarihi` ile KARISTIRILMAMALI: biri
   * ilanin ne zaman yayinlandigi, digeri bizim ne zaman gordugumuz. Zaman
   * agirlikli fiyat modelleri (lib/fiyat/time-decay-engine) ilkini ister.
   */
  ilanTarihi: z.number().int().positive().optional().nullable(),
  /**
   * Koordinat araligi BILEREK genis: Turkiye bbox kontrolu ve 3 ondalik
   * quantize `koordSanitize` icinde yapiliyor (routes/ilan.ts). Burada dar bir
   * aralik kullanmak, koordinati bozuk bir ilanin TAMAMINI 422 ile dusururdu —
   * oysa fiyat/m2 verisi saglam; kaybedilmesi gereken sadece koordinat.
   */
  lat: z.number().finite().optional().nullable(),
  lng: z.number().finite().optional().nullable(),
});

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function formatZodError(error: z.ZodError): ApiErrorResponse {
  return {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "),
      details: error.format(),
    },
  };
}

export async function validateBody<T>(schema: z.ZodSchema<T>, c: Context): Promise<{ data?: T; errorResponse?: Response }> {
  try {
    const raw = await c.req.json().catch(() => null);
    if (!raw) {
      return {
        errorResponse: c.json({
          success: false,
          error: { code: "INVALID_JSON", message: "Ge�ersiz JSON g�vdesi" },
        }, 400),
      };
    }
    const parsed = schema.parse(raw);
    return { data: parsed };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { errorResponse: c.json(formatZodError(err), 400) };
    }
    return {
      errorResponse: c.json({
        success: false,
        error: { code: "BAD_REQUEST", message: "�stek do�rulanamad�" },
      }, 400),
    };
  }
}
