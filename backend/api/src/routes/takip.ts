/**
 * Parsel Değişiklik Takip Servisi — /v1/takip
 *
 * Favori parsellerin TKGM verilerini haftalık snapshot alır,
 * önceki snapshot ile karşılaştırır ve değişiklik varsa bildirim üretir.
 *
 * Endpoints (JWT zorunlu):
 *   GET  /v1/takip/degisiklikler   → kullanıcının değişiklik logu
 *   POST /v1/takip/kontrol         → manuel tetikleme (test için)
 *
 * Cron: "0 5 * * 1" (Pazartesi 05:00 UTC) — index.ts scheduled handler'dan çağrılır.
 *
 * Akış:
 *   1. Portföy veya favorilerden parsel listesi çek
 *   2. TKGM proxy üzerinden parsel bilgisi çek (ada/parsel/nitelik/alan)
 *   3. SHA-256 hash ile önceki snapshot'la karşılaştır
 *   4. Fark varsa parsel_degisiklik_log'a yaz + Chrome notification için bildirim_log'a ekle
 */

import { Hono } from "hono";
import { jwtMiddleware } from "./hesap.js";
import type { Env, AppVariables } from "../index.js";
import { log } from "../lib/logger.js";
import { rateLimitMiddleware } from "../lib/rate-limit.js";

type TakipCtx = { Bindings: Env; Variables: AppVariables };

const takip = new Hono<TakipCtx>();
takip.use("*", jwtMiddleware);

// TKGM parsel proxy base — mevcut proxy.ts route'unu kullanır
const TKGM_PROXY_PATH = "/v1/proxy/tkgm-analiz";

// ── SHA-256 hex (değişim tespiti için) ────────────────────────────────────────

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Tek parsel snapshot çek ───────────────────────────────────────────────────

interface ParselBilgi {
  alan_m2: number | null;
  nitelik: string | null;
  ada_no: string | null;
  parsel_no: string | null;
}

async function parselBilgiCek(
  env: Env,
  mahalleKodu: string,
  adaNo: string,
  parselNo: string,
  baseUrl: string,
): Promise<ParselBilgi | null> {
  try {
    // TKGM parsel analiz proxy endpoint'ini kullan
    const url = `${baseUrl}${TKGM_PROXY_PATH}?mahalleKodu=${encodeURIComponent(mahalleKodu)}&adaNo=${encodeURIComponent(adaNo)}&parselNo=${encodeURIComponent(parselNo)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      alan?: number | null;
      nitelik?: string | null;
      adaNo?: string | null;
      parselNo?: string | null;
    };
    return {
      alan_m2: data.alan ?? null,
      nitelik: data.nitelik ?? null,
      ada_no: data.adaNo ?? null,
      parsel_no: data.parselNo ?? null,
    };
  } catch {
    return null;
  }
}

// ── Snapshot karşılaştır ve değişiklik tespit et ──────────────────────────────

interface DegisiklikTespiti {
  degisiklik: "alan-degisimi" | "nitelik-degisimi" | "polygon-degisimi";
  onceki: string;
  yeni: string;
}

function degisiklikleriTespit(
  snapshot: { alan_m2: number | null; nitelik: string | null; hash: string | null },
  yeni: ParselBilgi,
  yeniHash: string,
): DegisiklikTespiti[] {
  const sonuclar: DegisiklikTespiti[] = [];

  // Alan değişimi: %5'ten fazla sapma
  if (snapshot.alan_m2 != null && yeni.alan_m2 != null) {
    const fark = Math.abs(yeni.alan_m2 - snapshot.alan_m2) / snapshot.alan_m2;
    if (fark > 0.05) {
      sonuclar.push({
        degisiklik: "alan-degisimi",
        onceki: JSON.stringify({ alan_m2: snapshot.alan_m2 }),
        yeni: JSON.stringify({ alan_m2: yeni.alan_m2 }),
      });
    }
  }

  // Nitelik değişimi
  if (
    snapshot.nitelik != null &&
    yeni.nitelik != null &&
    snapshot.nitelik !== yeni.nitelik
  ) {
    sonuclar.push({
      degisiklik: "nitelik-degisimi",
      onceki: JSON.stringify({ nitelik: snapshot.nitelik }),
      yeni: JSON.stringify({ nitelik: yeni.nitelik }),
    });
  }

  // Hash değişimi (genel polygon değişimi)
  if (snapshot.hash != null && snapshot.hash !== yeniHash) {
    // Alan veya nitelik değişimi yoksa genel hash değişimi logla
    if (sonuclar.length === 0) {
      sonuclar.push({
        degisiklik: "polygon-degisimi",
        onceki: JSON.stringify({ hash: snapshot.hash }),
        yeni: JSON.stringify({ hash: yeniHash }),
      });
    }
  }

  return sonuclar;
}

// ── Ana takip çalıştırıcı — cron + manuel tetiklemeden çağrılır ───────────────

export async function parselTakipCalistir(
  env: Env,
  baseUrl: string,
  maxParsel = 100,
): Promise<{ kontrol: number; degisiklik: number; hata: number }> {
  let kontrol = 0, degisiklik = 0, hata = 0;

  // Portföydeki parselleri çek — tüm kullanıcılar için (haftalık toplu kontrol)
  const portfoyParseller = await env.DB.prepare(
    `SELECT DISTINCT p.parsel_key, p.kullanici_id, p.ada_no, p.parsel_no,
            p.lat, p.lng, p.il_ad, p.ilce_ad, p.mahalle_ad
     FROM portfoy p
     WHERE p.lat IS NOT NULL
     ORDER BY p.eklendi ASC
     LIMIT ?`,
  ).bind(maxParsel).all<{
    parsel_key: string;
    kullanici_id: number;
    ada_no: string | null;
    parsel_no: string | null;
    lat: number;
    lng: number;
    il_ad: string | null;
    ilce_ad: string | null;
    mahalle_ad: string | null;
  }>();

  const liste = portfoyParseller.results ?? [];
  log.info("parsel-takip.basladi", { parsel_sayisi: liste.length });

  for (const kayit of liste) {
    if (!kayit.ada_no || !kayit.parsel_no) continue;

    // parsel_key'den mahalle kodu çıkar: "{mahalleKodu}:{adaNo}:{parselNo}"
    const [mahalleKodu] = kayit.parsel_key.split(":");
    if (!mahalleKodu) continue;

    kontrol++;

    try {
      // TKGM'den güncel bilgi çek
      const yeniBilgi = await parselBilgiCek(env, mahalleKodu, kayit.ada_no, kayit.parsel_no, baseUrl);
      if (!yeniBilgi) { hata++; continue; }

      // Yeni hash hesapla
      const hashGirdisi = `${yeniBilgi.alan_m2}:${yeniBilgi.nitelik}`;
      const yeniHash = await sha256Hex(hashGirdisi);

      // Önceki snapshot'ı çek
      const oncekiSnap = await env.DB.prepare(
        `SELECT alan_m2, nitelik, polygon_hash FROM parsel_snapshots
         WHERE parsel_key = ? AND kullanici_id = ?`,
      ).bind(kayit.parsel_key, kayit.kullanici_id)
        .first<{ alan_m2: number | null; nitelik: string | null; polygon_hash: string | null }>();

      if (!oncekiSnap) {
        // İlk kontrol — sadece baseline kaydet
        await env.DB.prepare(
          `INSERT OR REPLACE INTO parsel_snapshots
             (parsel_key, kullanici_id, alan_m2, nitelik, polygon_hash, cekilen)
           VALUES (?, ?, ?, ?, ?, unixepoch())`,
        ).bind(
          kayit.parsel_key, kayit.kullanici_id,
          yeniBilgi.alan_m2, yeniBilgi.nitelik, yeniHash,
        ).run();
        continue;
      }

      // Değişiklikleri tespit et
      const tespitler = degisiklikleriTespit(
        { alan_m2: oncekiSnap.alan_m2, nitelik: oncekiSnap.nitelik, hash: oncekiSnap.polygon_hash },
        yeniBilgi,
        yeniHash,
      );

      if (tespitler.length > 0) {
        degisiklik += tespitler.length;

        // Log'a yaz
        for (const t of tespitler) {
          await env.DB.prepare(
            `INSERT INTO parsel_degisiklik_log
               (parsel_key, kullanici_id, degisiklik, onceki, yeni)
             VALUES (?, ?, ?, ?, ?)`,
          ).bind(
            kayit.parsel_key, kayit.kullanici_id,
            t.degisiklik, t.onceki, t.yeni,
          ).run();
        }

        // Snapshot güncelle
        await env.DB.prepare(
          `INSERT OR REPLACE INTO parsel_snapshots
             (parsel_key, kullanici_id, alan_m2, nitelik, polygon_hash, cekilen)
           VALUES (?, ?, ?, ?, ?, unixepoch())`,
        ).bind(
          kayit.parsel_key, kayit.kullanici_id,
          yeniBilgi.alan_m2, yeniBilgi.nitelik, yeniHash,
        ).run();

        // Değişiklik özeti bildirim_log'a ekle (scheduler.ts bildirimKontrol'e benzer)
        const degisiklikOzet = tespitler.map((t) => t.degisiklik).join(", ");
        const mesaj = `${kayit.mahalle_ad ?? kayit.ilce_ad ?? "Parsel"} için değişiklik tespit edildi: ${degisiklikOzet}`;
        log.info("parsel-takip.degisiklik", {
          parsel_key: kayit.parsel_key,
          kullanici_id: kayit.kullanici_id,
          degisiklikler: tespitler.map((t) => t.degisiklik),
        });

        // bildirim tablosuna ekle (kullanıcı panel açınca görsün)
        await env.DB.prepare(
          `INSERT OR IGNORE INTO bildirim
             (kullanici_id, tur, il, ilce, mahalle, mesaj, olusturuldu)
           VALUES (?, 'parsel-degisimi', ?, ?, ?, ?, unixepoch())`,
        ).bind(
          kayit.kullanici_id,
          kayit.il_ad ?? "",
          kayit.ilce_ad ?? "",
          kayit.mahalle_ad ?? "",
          mesaj,
        ).run().catch(() => {}); // bildirim tablosu yoksa sessiz geç
      }

      // Rate limit — TKGM'ye nazik ol
      await new Promise((r) => setTimeout(r, 1_500));
    } catch (e) {
      hata++;
      log.warn("parsel-takip.hata", {
        parsel_key: kayit.parsel_key,
        hata: e instanceof Error ? e.message : String(e),
      });
    }
  }

  log.info("parsel-takip.tamamlandi", { kontrol, degisiklik, hata });
  return { kontrol, degisiklik, hata };
}

// ── GET /v1/takip/degisiklikler ───────────────────────────────────────────────

takip.get("/degisiklikler", rateLimitMiddleware(30, "takip"), async (c) => {
  const kullaniciId = c.get("kullaniciId");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50"), 100);

  const kayitlar = await c.env.DB.prepare(
    `SELECT id, parsel_key, degisiklik, onceki, yeni, tespit_tarihi
     FROM parsel_degisiklik_log
     WHERE kullanici_id = ?
     ORDER BY tespit_tarihi DESC
     LIMIT ?`,
  ).bind(kullaniciId, limit).all<{
    id: number;
    parsel_key: string;
    degisiklik: string;
    onceki: string | null;
    yeni: string | null;
    tespit_tarihi: number;
  }>();

  const sonuc = (kayitlar.results ?? []).map((r) => ({
    ...r,
    onceki: r.onceki ? JSON.parse(r.onceki) : null,
    yeni: r.yeni ? JSON.parse(r.yeni) : null,
  }));

  return c.json({ degisiklikler: sonuc, toplam: sonuc.length });
});

// ── POST /v1/takip/kontrol (manuel tetikleme — test + admin) ──────────────────

takip.post("/kontrol", rateLimitMiddleware(3, "takip-kontrol"), async (c) => {
  // Base URL — production'da workers.dev, dev'de localhost
  const host = new URL(c.req.url).origin;

  c.executionCtx.waitUntil((async () => {
    const r = await parselTakipCalistir(c.env, host, 20); // Manuel: max 20 parsel
    log.info("parsel-takip.manuel", r);
  })());

  return c.json({ ok: true, mesaj: "Takip başlatıldı (arka planda)" });
});

export { takip as takipRoutes };
