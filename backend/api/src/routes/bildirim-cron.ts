/**
 * Bildirim kontrol cron handler — Faz 4 Sprint G3.
 *
 * Cloudflare Worker `scheduled` handler içinden saatlik çağrılır.
 * Aktif abonelikleri tarar, her biri için koşul kontrolü yapar; tetiklenen
 * abonelikler için Resend ile email gönderir.
 *
 * Email gönderim hatası abonelik'i bozmaz — log yazılır, devam edilir.
 *
 * Performans: D1 free 100k req/day. 100 abonelik × 1 spatial sorgu + 1 update
 * = ~200 query/saat. Günlük 4800 query — limit içinde.
 */
import type { Env } from "../index.js";

interface AbonelikRow {
  id: number;
  kullanici_id: number;
  tip: "fiyat-degisimi" | "yeni-emsal" | "esik-asildi";
  parametre_json: string;
  son_tetik: number | null;
  son_baseline: number | null;
}

interface KullaniciRow {
  email: string;
  ad: string | null;
}

interface AbonelikParametre {
  lat: number;
  lng: number;
  radius_km: number;
  kategori?: string;
  esik_yuzde?: number;
  esik_tlm2?: number;
}

const SAAT_MS = 3_600_000;

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Bir bölgenin güncel weighted median fiyatı (TL/m²).
 * Spatial endpoint'iyle aynı algoritma — burada inline (cron worker context).
 */
async function bolgeMedyani(
  env: Env,
  lat: number,
  lng: number,
  radiusKm: number,
  kategori: string,
): Promise<{ medyan: number | null; adet: number }> {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const yasEsigi = Date.now() - 180 * 86_400_000;
  const rows = await env.DB.prepare(
    `SELECT fiyat_per_m2, lat, lng FROM ilanlar
     WHERE kategori = ? AND aktif = 1
       AND lat IS NOT NULL AND lng IS NOT NULL
       AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
       AND yakalanma_tarihi >= ?
     LIMIT 500`,
  ).bind(kategori, lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta, yasEsigi)
    .all<{ fiyat_per_m2: number; lat: number; lng: number }>();

  const D = kategori === "konut" ? 2000 : kategori === "tarla" ? 8000 : 5000;
  const radiusM = radiusKm * 1000;
  const items = (rows.results ?? [])
    .map((r) => ({
      fiyat: r.fiyat_per_m2,
      mesafeM: haversineM(lat, lng, r.lat, r.lng),
    }))
    .filter((r) => r.mesafeM <= radiusM);
  if (items.length === 0) return { medyan: null, adet: 0 };

  const weighted = items.map((i) => ({
    fiyat: i.fiyat,
    weight: Math.exp(-i.mesafeM / D),
  }));
  weighted.sort((a, b) => a.fiyat - b.fiyat);
  const total = weighted.reduce((s, w) => s + w.weight, 0);
  if (total <= 0) return { medyan: null, adet: items.length };
  let acc = 0;
  for (const it of weighted) {
    acc += it.weight;
    if (acc >= total / 2) return { medyan: Math.round(it.fiyat), adet: items.length };
  }
  return { medyan: Math.round(weighted[weighted.length - 1]!.fiyat), adet: items.length };
}

async function emailGonder(
  env: Env,
  alici: string,
  konu: string,
  metin: string,
): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[cron-email DRY-RUN] ${alici} → ${konu}: ${metin.slice(0, 80)}`);
    return true;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Cadastrum <no-reply@cadastrum.com.tr>",
        to: alici,
        subject: konu,
        text: metin,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function aboneligiTetikle(
  env: Env,
  abone: AbonelikRow,
  kul: KullaniciRow,
  yeniBaseline: number,
  ozet: string,
): Promise<void> {
  const basarili = await emailGonder(
    env,
    kul.email,
    `[Cadastrum] ${ozet}`,
    `Merhaba ${kul.ad ?? ""},\n\n${ozet}\n\nAbonelik detayları için: https://cadastrum.com.tr/hesap/bildirimler\n\nBu maili almak istemiyorsanız aboneliği iptal edebilirsiniz.`,
  );
  await env.DB.prepare(
    `UPDATE bildirim_aboneligi SET son_tetik = ?, son_baseline = ? WHERE id = ?`,
  ).bind(Date.now(), yeniBaseline, abone.id).run();
  await env.DB.prepare(
    `INSERT INTO bildirim_gonderim_log (abonelik_id, ts, tip, ozet, basarili)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(abone.id, Date.now(), abone.tip, ozet, basarili ? 1 : 0).run();
}

/**
 * Cron giriş noktası — index.ts'in scheduled handler'ından çağrılır.
 * Min son_tetik 23 saat önce: spam koruması (günde max 1 tetik per abonelik).
 */
export async function bildirimKontroluCalistir(env: Env): Promise<{ tetiklenen: number; hata: number }> {
  const minSonTetik = Date.now() - 23 * SAAT_MS;
  const abonelikler = await env.DB.prepare(
    `SELECT id, kullanici_id, tip, parametre_json, son_tetik, son_baseline
     FROM bildirim_aboneligi
     WHERE durum = 'aktif' AND (son_tetik IS NULL OR son_tetik < ?)
     LIMIT 500`,
  ).bind(minSonTetik).all<AbonelikRow>();

  let tetiklenen = 0;
  let hata = 0;

  for (const abone of abonelikler.results ?? []) {
    let par: AbonelikParametre;
    try {
      par = JSON.parse(abone.parametre_json) as AbonelikParametre;
    } catch {
      hata++;
      continue;
    }
    if (typeof par.lat !== "number" || typeof par.lng !== "number") {
      hata++;
      continue;
    }
    const kategori = par.kategori ?? "arsa";
    const sonuc = await bolgeMedyani(env, par.lat, par.lng, par.radius_km, kategori);
    if (sonuc.medyan == null) continue;

    const kul = await env.DB.prepare(
      `SELECT email, ad FROM kullanicilar WHERE id = ?`,
    ).bind(abone.kullanici_id).first<KullaniciRow>();
    if (!kul?.email) {
      hata++;
      continue;
    }

    if (abone.tip === "fiyat-degisimi") {
      if (abone.son_baseline == null) {
        // İlk seed — sadece baseline kaydet, tetikleme
        await env.DB.prepare(
          `UPDATE bildirim_aboneligi SET son_baseline = ? WHERE id = ?`,
        ).bind(sonuc.medyan, abone.id).run();
        continue;
      }
      const yuzde = ((sonuc.medyan - abone.son_baseline) / abone.son_baseline) * 100;
      const esik = par.esik_yuzde ?? 5;
      if (Math.abs(yuzde) >= esik) {
        const yon = yuzde > 0 ? "arttı" : "düştü";
        const ozet = `${kategori} bölgesi medyan fiyatı %${Math.abs(yuzde).toFixed(1)} ${yon} (₺${abone.son_baseline.toLocaleString("tr-TR")} → ₺${sonuc.medyan.toLocaleString("tr-TR")}/m²)`;
        await aboneligiTetikle(env, abone, kul, sonuc.medyan, ozet);
        tetiklenen++;
      }
    } else if (abone.tip === "yeni-emsal") {
      // Basit: son_baseline'ı son adet olarak kullan, artış varsa tetikle
      const sonAdet = abone.son_baseline ?? 0;
      const artis = sonuc.adet - sonAdet;
      if (sonAdet > 0 && artis >= 3) {
        const ozet = `Bölgede ${artis} yeni emsal eklendi (toplam ${sonuc.adet})`;
        await aboneligiTetikle(env, abone, kul, sonuc.adet, ozet);
        tetiklenen++;
      } else {
        await env.DB.prepare(
          `UPDATE bildirim_aboneligi SET son_baseline = ? WHERE id = ?`,
        ).bind(sonuc.adet, abone.id).run();
      }
    } else if (abone.tip === "esik-asildi") {
      const esik = par.esik_tlm2 ?? 0;
      if (esik > 0 && sonuc.medyan <= esik) {
        const ozet = `Bölge medyan fiyatı ₺${sonuc.medyan.toLocaleString("tr-TR")}/m² hedef eşiğin (₺${esik.toLocaleString("tr-TR")}) altına düştü`;
        await aboneligiTetikle(env, abone, kul, sonuc.medyan, ozet);
        tetiklenen++;
      }
    }
  }

  return { tetiklenen, hata };
}
