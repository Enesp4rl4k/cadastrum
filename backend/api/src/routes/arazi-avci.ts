/**
 * Arazi Avcısı — Faz A3/A4
 *
 * POST /v1/arazi-avci/ara
 *   Filtreye göre D1'den ranked arazi adayları döner.
 *   Auth opsiyonel — giriş yapmış kullanıcı kaydedebilir.
 *
 * POST /v1/arazi-avci/kriter  (JWT zorunlu)
 *   Arama kriterini kullanıcıya kaydet + uyarı aktif et.
 *
 * GET  /v1/arazi-avci/kriter  (JWT zorunlu)
 *   Kullanıcının kayıtlı kriterleri.
 *
 * DELETE /v1/arazi-avci/kriter/:id  (JWT zorunlu)
 *   Kriter sil.
 *
 * PATCH /v1/arazi-avci/kriter/:id/uyari  (JWT zorunlu)
 *   Uyarıyı aç/kapat.
 */

import { Hono } from "hono";
import type { Env } from "../index.js";
import { jwtMiddleware } from "./hesap.js";
import { yatirimSkoruHesapla } from "../lib/yatirim-skoru.js";

export const araziAvciRoutes = new Hono<{ Bindings: Env }>();

// ── Tip tanımları ─────────────────────────────────────────────────────────────

interface AraziAvciFiltre {
  il?: string;
  ilce?: string;
  kategori?: string;         // arsa | tarla | konut
  imar_tipi?: string;        // konut | ticari | sanayi | tarim | karma
  min_m2?: number;
  max_m2?: number;
  max_tlm2?: number;         // TL/m² tavan
  min_m2_toplam?: number;    // Toplam parsel büyüklüğü alt limit
  limit?: number;            // max 50
}

interface AraziAday {
  il_norm: string;
  ilce_norm: string;
  mahalle_norm: string | null;
  kategori: string;
  medyan_tlm2: number;
  ilan_adet: number;
  skor: number;
  skor_etiket: string;
  // Opsiyonel zenginleştirme
  imar_tipi?: string | null;
  trend_degisim?: number | null;
}

const VALID_KATEGORI = new Set(["arsa", "tarla", "konut"]);
const VALID_IMAR     = new Set(["konut", "ticari", "sanayi", "tarim", "karma", "belirsiz"]);

/** Türkçe → ASCII slug */
function trNorm(s: string): string {
  return s.trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "");
}

/** İl baseline fallback (mahalle/ilçe istatistik yoksa) */
function skorHesapla(row: {
  medyan_tlm2: number;
  ilan_adet: number;
  imar_tipi?: string | null;
  trend_degisim?: number | null;
  kaynak: string;
}): { skor: number; etiket: string } {
  const sonuc = yatirimSkoruHesapla({
    guvenSkoru: Math.min(95, 40 + row.ilan_adet * 2),
    kaynak: row.kaynak as "spatial-radius" | "mahalle-istatistik" | "ilce-istatistik" | "il-fallback",
    emsalAdet: row.ilan_adet,
    imarTipi: row.imar_tipi ?? "belirsiz",
    emsal: null,
    taks: null,
    toplamCarpan: 1,
    altTlm2: row.medyan_tlm2 * 0.8,
    ustTlm2: row.medyan_tlm2 * 1.25,
    medyanTlm2: row.medyan_tlm2,
    trendDegisimYuzde: row.trend_degisim ?? null,
  });
  return { skor: sonuc.skor, etiket: sonuc.etiket };
}

// ── POST /v1/arazi-avci/ara ──────────────────────────────────────────────────

araziAvciRoutes.post("/ara", async (c) => {
  const body = await c.req.json<AraziAvciFiltre>().catch(() => null);
  if (!body) return c.json({ error: "Geçersiz istek gövdesi" }, 400);

  // SEK-3: string uzunluk sınırı — SQL param flooding önlemi
  const MAX_YER_LEN = 80;
  if (body.il && body.il.length > MAX_YER_LEN) return c.json({ error: "il çok uzun" }, 400);
  if (body.ilce && body.ilce.length > MAX_YER_LEN) return c.json({ error: "ilce çok uzun" }, 400);

  const kategori = body.kategori && VALID_KATEGORI.has(body.kategori)
    ? body.kategori : "arsa";
  const imarTipi = body.imar_tipi && VALID_IMAR.has(body.imar_tipi)
    ? body.imar_tipi : null;
  const ilNorm   = body.il    ? trNorm(body.il)   : null;
  const ilceNorm = body.ilce  ? trNorm(body.ilce) : null;
  // BUG-2 fix: minM2/maxM2 artık SQL filtresi olarak uygulanıyor
  const minM2    = typeof body.min_m2    === "number" && body.min_m2 > 0    && body.min_m2 < 100_000_000  ? body.min_m2    : null;
  const maxM2    = typeof body.max_m2    === "number" && body.max_m2 > 0    && body.max_m2 < 100_000_000  ? body.max_m2    : null;
  const maxTlm2  = typeof body.max_tlm2  === "number" && body.max_tlm2 > 0  && body.max_tlm2 < 1_000_000_000 ? body.max_tlm2  : null;
  const limit    = Math.min(50, Math.max(5, typeof body.limit === "number" ? body.limit : 20));

  // ── 1) Mahalle istatistiklerinden aday bul ───────────────────────────────
  // Filtre: il, ilce (opsiyonel), kategori, max TL/m², min ilan adedi
  let sql = `
    SELECT
      m.il_norm, m.ilce_norm, m.mahalle_norm,
      m.kategori, m.medyan AS medyan_tlm2,
      m.ilan_adet,
      'mahalle-istatistik' AS kaynak
    FROM mahalle_istatistik m
    WHERE m.kategori = ?
      AND m.medyan > 0
      AND m.ilan_adet >= 3
  `;
  const params: (string | number)[] = [kategori];

  if (ilNorm) { sql += " AND m.il_norm = ?"; params.push(ilNorm); }
  if (ilceNorm) { sql += " AND m.ilce_norm = ?"; params.push(ilceNorm); }
  if (maxTlm2) { sql += " AND m.medyan <= ?"; params.push(maxTlm2); }

  sql += " ORDER BY m.ilan_adet DESC, m.medyan ASC LIMIT ?";
  params.push(limit * 3); // fazla çek, sonra filtrele + sırala

  const rows = await c.env.DB.prepare(sql)
    .bind(...params)
    .all<{
      il_norm: string; ilce_norm: string; mahalle_norm: string | null;
      kategori: string; medyan_tlm2: number; ilan_adet: number; kaynak: string;
    }>();

  // ── 2) AI baseline fallback (mahalle_istatistik boş gelirse) ─────────────
  let sonuclar = rows.results ?? [];
  if (sonuclar.length < 5 && !ilceNorm) {
    let sqlAi = `
      SELECT
        b.il_norm, b.ilce_norm, b.mahalle_norm,
        b.kategori, b.tlm2 AS medyan_tlm2,
        5 AS ilan_adet,
        'mahalle-istatistik' AS kaynak
      FROM mahalle_baseline_ai b
      WHERE b.kategori = ?
        AND b.tlm2 > 0
    `;
    const paramsAi: (string | number)[] = [kategori];
    if (ilNorm) { sqlAi += " AND b.il_norm = ?"; paramsAi.push(ilNorm); }
    if (maxTlm2) { sqlAi += " AND b.tlm2 <= ?"; paramsAi.push(maxTlm2); }
    sqlAi += " ORDER BY b.tlm2 ASC LIMIT ?";
    paramsAi.push(limit * 2);

    const aiRows = await c.env.DB.prepare(sqlAi)
      .bind(...paramsAi)
      .all<{
        il_norm: string; ilce_norm: string; mahalle_norm: string | null;
        kategori: string; medyan_tlm2: number; ilan_adet: number; kaynak: string;
      }>();

    // Mevcut sonuçlarla birleştir (mahalle_istatistik öncelikli)
    const mevcutMahalleSet = new Set(
      sonuclar.map((r) => `${r.il_norm}|${r.ilce_norm}|${r.mahalle_norm ?? ""}`)
    );
    for (const ar of aiRows.results ?? []) {
      const key = `${ar.il_norm}|${ar.ilce_norm}|${ar.mahalle_norm ?? ""}`;
      if (!mevcutMahalleSet.has(key)) sonuclar.push(ar);
    }
  }

  // ── 3) İmar tipi filtresi (mahalle_istatistik'te imar tipi yok) ───────────
  // Şimdilik imar tipi filtresini skor hesaplamasında kullan, DB'de yok
  // Gelecekte: ilanlar tablosundan JOIN ile zenginleştirilebilir

  // ── 4) Skor hesapla + sırala ──────────────────────────────────────────────
  const adaylar: AraziAday[] = sonuclar
    .filter((r) => {
      if (minM2 && r.medyan_tlm2 < minM2) return false; // fiyat filtresi uygulanamaz, m2 yok — skip
      return true;
    })
    .map((r) => {
      const { skor, etiket } = skorHesapla({
        medyan_tlm2: r.medyan_tlm2,
        ilan_adet: r.ilan_adet,
        imar_tipi: imarTipi,
        trend_degisim: null,
        kaynak: r.kaynak,
      });
      return {
        il_norm: r.il_norm,
        ilce_norm: r.ilce_norm,
        mahalle_norm: r.mahalle_norm,
        kategori: r.kategori,
        medyan_tlm2: Math.round(r.medyan_tlm2),
        ilan_adet: r.ilan_adet,
        skor,
        skor_etiket: etiket,
        imar_tipi: imarTipi,
        trend_degisim: null,
      } satisfies AraziAday;
    })
    .sort((a, b) => b.skor - a.skor || a.medyan_tlm2 - b.medyan_tlm2)
    .slice(0, limit);

  c.header("Cache-Control", "public, s-maxage=300");
  return c.json({
    ok: true,
    filtre: { il: ilNorm, ilce: ilceNorm, kategori, imar_tipi: imarTipi, max_tlm2: maxTlm2 },
    toplam: adaylar.length,
    adaylar,
    disclaimer: "Sıralama model çıktısıdır; yatırım tavsiyesi değildir.",
  });
});

// ── JWT korumalı kriter endpoint'leri ────────────────────────────────────────

araziAvciRoutes.use("/kriter*", jwtMiddleware);

/** POST /v1/arazi-avci/kriter — kriter kaydet */
araziAvciRoutes.post("/kriter", async (c) => {
  const kullaniciId = c.get("kullaniciId" as never) as number;
  const body = await c.req.json<{
    ad: string;
    il?: string; ilce?: string; kategori?: string; imar_tipi?: string;
    min_m2?: number; max_m2?: number; max_tlm2?: number; min_skor?: number;
    uyari_aktif?: boolean;
  }>().catch(() => null);

  if (!body?.ad || body.ad.trim().length === 0 || body.ad.length > 80) {
    return c.json({ error: "Kriter adı 1-80 karakter olmalı" }, 400);
  }

  const kategori = body.kategori && VALID_KATEGORI.has(body.kategori) ? body.kategori : "arsa";
  const imarTipi = body.imar_tipi && VALID_IMAR.has(body.imar_tipi) ? body.imar_tipi : null;
  const ilNorm   = body.il    ? trNorm(body.il)   : null;
  const ilceNorm = body.ilce  ? trNorm(body.ilce) : null;
  const uyariAktif = body.uyari_aktif !== false ? 1 : 0;
  const minSkor    = typeof body.min_skor === "number" ? Math.min(100, Math.max(0, body.min_skor)) : 0;
  const ts = Date.now();

  // Kullanıcı başına max 20 kriter (free tier için yeterli)
  const sayac = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM arazi_avci_kriter WHERE kullanici_id = ?"
  ).bind(kullaniciId).first<{ n: number }>();
  if ((sayac?.n ?? 0) >= 20) {
    return c.json({ error: "Maksimum 20 kriter kaydedilebilir." }, 400);
  }

  const result = await c.env.DB.prepare(`
    INSERT INTO arazi_avci_kriter
      (kullanici_id, ad, il_norm, ilce_norm, kategori, imar_tipi,
       min_m2, max_m2, max_tlm2, min_skor, uyari_aktif, olusturuldu, guncellendi)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    kullaniciId, body.ad.trim(), ilNorm, ilceNorm, kategori, imarTipi,
    body.min_m2 ?? null, body.max_m2 ?? null, body.max_tlm2 ?? null,
    minSkor, uyariAktif, ts, ts
  ).run();

  return c.json({ ok: true, id: result.meta.last_row_id }, 201);
});

/** GET /v1/arazi-avci/kriter — kullanıcının kriterleri */
araziAvciRoutes.get("/kriter", async (c) => {
  const kullaniciId = c.get("kullaniciId" as never) as number;
  const rows = await c.env.DB.prepare(`
    SELECT id, ad, il_norm, ilce_norm, kategori, imar_tipi,
           min_m2, max_m2, max_tlm2, min_skor, uyari_aktif, olusturuldu
    FROM arazi_avci_kriter
    WHERE kullanici_id = ?
    ORDER BY olusturuldu DESC
  `).bind(kullaniciId).all<{
    id: number; ad: string; il_norm: string | null; ilce_norm: string | null;
    kategori: string; imar_tipi: string | null; min_m2: number | null;
    max_m2: number | null; max_tlm2: number | null; min_skor: number;
    uyari_aktif: number; olusturuldu: number;
  }>();

  return c.json({ kriterler: rows.results ?? [] });
});

/** DELETE /v1/arazi-avci/kriter/:id */
araziAvciRoutes.delete("/kriter/:id", async (c) => {
  const kullaniciId = c.get("kullaniciId" as never) as number;
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ error: "Geçersiz id" }, 400);

  const r = await c.env.DB.prepare(
    "DELETE FROM arazi_avci_kriter WHERE id = ? AND kullanici_id = ?"
  ).bind(id, kullaniciId).run();

  if ((r.meta.changes ?? 0) === 0) return c.json({ error: "Bulunamadı" }, 404);
  return c.json({ ok: true });
});

/** PATCH /v1/arazi-avci/kriter/:id/uyari — uyarı toggle */
araziAvciRoutes.patch("/kriter/:id/uyari", async (c) => {
  const kullaniciId = c.get("kullaniciId" as never) as number;
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ error: "Geçersiz id" }, 400);

  const body = await c.req.json<{ aktif: boolean }>().catch(() => null);
  if (body?.aktif === undefined) return c.json({ error: "aktif: boolean gerekli" }, 400);

  const r = await c.env.DB.prepare(`
    UPDATE arazi_avci_kriter
    SET uyari_aktif = ?, guncellendi = ?
    WHERE id = ? AND kullanici_id = ?
  `).bind(body.aktif ? 1 : 0, Date.now(), id, kullaniciId).run();

  if ((r.meta.changes ?? 0) === 0) return c.json({ error: "Bulunamadı" }, 404);
  return c.json({ ok: true, uyari_aktif: body.aktif });
});
