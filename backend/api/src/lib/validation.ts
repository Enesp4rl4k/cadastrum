import { z } from "zod";
import type { Context } from "hono";

export const KategoriSchema = z.enum(["arsa", "tarla", "konut", "bahce", "bag", "zeytinlik", "diger"]);

export const CoordinatesSchema = z.object({
  lat: z.coerce.number().min(35.5, "Enlem Türkiye sýnýrlarý dýþýnda").max(42.5, "Enlem Türkiye sýnýrlarý dýþýnda"),
  lng: z.coerce.number().min(25.5, "Boylam Türkiye sýnýrlarý dýþýnda").max(45.0, "Boylam Türkiye sýnýrlarý dýþýnda"),
  kategori: KategoriSchema.default("arsa"),
  radiusKm: z.coerce.number().min(0.1).max(100).default(5),
});

export const IlceAnalizQuerySchema = z.object({
  ilceKodu: z.coerce.number().int().positive("Geçersiz ilçe kodu"),
  analizTip: z.coerce.number().int().min(1).max(5).default(1),
  yil: z.coerce.number().int().min(2000).max(new Date().getFullYear()).optional(),
  birlesik: z.enum(["0", "1"]).optional(),
});

export const IlanIngestSchema = z.object({
  kaynak: z.enum(["sahibinden", "hepsiemlak", "extension", "emlakjet"]),
  ilanNo: z.string().min(1, "Ýlan numarasý boþ olamaz").max(64),
  il: z.string().min(1).max(50),
  ilce: z.string().min(1).max(50),
  mahalle: z.string().max(100).optional().nullable(),
  fiyatPerM2: z.number().positive("Fiyat/m2 pozitif olmalý"),
  m2: z.number().positive().max(50_000_000).optional().nullable(),
  paraBirimi: z.string().default("TL"),
  kategori: KategoriSchema.default("arsa"),
  imarDurumu: z.string().max(100).optional().nullable(),
  lat: z.number().min(35.5).max(42.5).optional().nullable(),
  lng: z.number().min(25.5).max(45.0).optional().nullable(),
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
          error: { code: "INVALID_JSON", message: "Geçersiz JSON gövdesi" },
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
        error: { code: "BAD_REQUEST", message: "Ýstek doðrulanamadý" },
      }, 400),
    };
  }
}
