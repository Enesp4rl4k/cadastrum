/**
 * Pipeline Health Check — D1 veri kalitesi + scraper alarm sistemi.
 *
 * Manuel HTTP endpoint: GET /v1/admin/pipeline-health?secret=XXX
 * Bu endpoint index.ts'de tanımlanır, bu dosya sadece logic içerir.
 *
 * Problem: Scraper sessizce çuvalayabilir (PerimeterX, site değişikliği vb.)
 * D1'deki ilan sayısı haftalar içinde düşerse kimse fark etmez.
 * Tahmin motoru stale veriye dayandığı için kullanıcılara yanlış sonuç döner.
 *
 * Çözüm: Günlük cron → D1 tablo sayıları kontrol → eşik altındaysa admin email.
 *
 * Kontrol edilen tablolar + eşikler:
 *   ilanlar          → min 50.000 aktif ilan (Türkiye geneli)
 *   ilanlar (7 gün)  → min 500 son 7 gün eklenen (scraper çalışıyor mu?)
 *   mahalle_istatistik → min 5.000 mahalle kaydı (istatistik refresh çalışıyor mu?)
 *
 * Deployment: istatistikRefresh ile aynı cron'a eklenir (her gün 03:00 UTC).
 *
 * Endpoint: GET /v1/admin/pipeline-health?secret=XXX (manuel tetikleme)
 */

import type { Env } from "../index.js";

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface PipelineKontrolSonucu {
  /** Kontrol zamanı */
  ts: number;
  /** Tüm kontroller geçti mi? */
  saglikli: boolean;
  /** Detay kontroller */
  kontroller: PipelineKontrol[];
  /** Kaç alarm tetiklendi */
  alarmSayisi: number;
  /** Email gönderildi mi */
  emailGonderildi: boolean;
}

export interface PipelineKontrol {
  ad: string;
  deger: number;
  esik: number;
  gecti: boolean;
  mesaj: string;
}

// ─── Eşik değerleri ───────────────────────────────────────────────────────────

const KONTROL_ESLIKLERI = {
  /** Toplam aktif ilan sayısı */
  TOPLAM_ILAN_MIN: 50_000,
  /** Son 7 gün eklenen ilan (scraper canlı mı?) */
  SON_7_GUN_ILAN_MIN: 200,
  /** Son 30 gün eklenen ilan */
  SON_30_GUN_ILAN_MIN: 1_000,
  /** mahalle_istatistik tablo satırı */
  MAHALLE_ISTATISTIK_MIN: 3_000,
  /** mahalle_baseline_ai tablo satırı */
  MAHALLE_BASELINE_MIN: 1_000,
} as const;

const GUN_MS = 86_400_000;

// ─── Kontrol fonksiyonu ───────────────────────────────────────────────────────

export async function pipelineHealthKontrol(
  db: D1Database,
): Promise<PipelineKontrolSonucu> {
  const ts = Date.now();
  const kontroller: PipelineKontrol[] = [];

  // 1. Toplam aktif ilan sayısı
  const toplamIlan = await db.prepare(
    `SELECT COUNT(*) as n FROM ilanlar WHERE aktif = 1`,
  ).first<{ n: number }>().catch(() => null);

  kontroller.push({
    ad: "Toplam aktif ilan",
    deger: toplamIlan?.n ?? 0,
    esik: KONTROL_ESLIKLERI.TOPLAM_ILAN_MIN,
    gecti: (toplamIlan?.n ?? 0) >= KONTROL_ESLIKLERI.TOPLAM_ILAN_MIN,
    mesaj: toplamIlan?.n != null
      ? `${toplamIlan.n.toLocaleString("tr-TR")} aktif ilan`
      : "Tablo erişim hatası",
  });

  // 2. Son 7 gün eklenen ilan (scraper canlı mı?)
  const yon7Gun = ts - 7 * GUN_MS;
  const son7GunIlan = await db.prepare(
    `SELECT COUNT(*) as n FROM ilanlar WHERE yakalanma_tarihi >= ?`,
  ).bind(yon7Gun).first<{ n: number }>().catch(() => null);

  kontroller.push({
    ad: "Son 7 gün yeni ilan",
    deger: son7GunIlan?.n ?? 0,
    esik: KONTROL_ESLIKLERI.SON_7_GUN_ILAN_MIN,
    gecti: (son7GunIlan?.n ?? 0) >= KONTROL_ESLIKLERI.SON_7_GUN_ILAN_MIN,
    mesaj: son7GunIlan?.n != null
      ? `${son7GunIlan.n} ilan son 7 günde`
      : "Tablo erişim hatası",
  });

  // 3. Son 30 gün eklenen ilan
  const yon30Gun = ts - 30 * GUN_MS;
  const son30GunIlan = await db.prepare(
    `SELECT COUNT(*) as n FROM ilanlar WHERE yakalanma_tarihi >= ?`,
  ).bind(yon30Gun).first<{ n: number }>().catch(() => null);

  kontroller.push({
    ad: "Son 30 gün yeni ilan",
    deger: son30GunIlan?.n ?? 0,
    esik: KONTROL_ESLIKLERI.SON_30_GUN_ILAN_MIN,
    gecti: (son30GunIlan?.n ?? 0) >= KONTROL_ESLIKLERI.SON_30_GUN_ILAN_MIN,
    mesaj: son30GunIlan?.n != null
      ? `${son30GunIlan.n} ilan son 30 günde`
      : "Tablo erişim hatası",
  });

  // 4. mahalle_istatistik satır sayısı
  const mahalleIstatistik = await db.prepare(
    `SELECT COUNT(*) as n FROM mahalle_istatistik`,
  ).first<{ n: number }>().catch(() => null);

  kontroller.push({
    ad: "Mahalle istatistik kayıtları",
    deger: mahalleIstatistik?.n ?? 0,
    esik: KONTROL_ESLIKLERI.MAHALLE_ISTATISTIK_MIN,
    gecti: (mahalleIstatistik?.n ?? 0) >= KONTROL_ESLIKLERI.MAHALLE_ISTATISTIK_MIN,
    mesaj: mahalleIstatistik?.n != null
      ? `${mahalleIstatistik.n.toLocaleString("tr-TR")} mahalle istatistik kaydı`
      : "Tablo erişim hatası veya tablo boş",
  });

  // 5. mahalle_baseline_ai satır sayısı
  const mahalleBaseline = await db.prepare(
    `SELECT COUNT(*) as n FROM mahalle_baseline_ai`,
  ).first<{ n: number }>().catch(() => null);

  kontroller.push({
    ad: "Mahalle baseline AI kayıtları",
    deger: mahalleBaseline?.n ?? 0,
    esik: KONTROL_ESLIKLERI.MAHALLE_BASELINE_MIN,
    gecti: (mahalleBaseline?.n ?? 0) >= KONTROL_ESLIKLERI.MAHALLE_BASELINE_MIN,
    mesaj: mahalleBaseline?.n != null
      ? `${mahalleBaseline.n.toLocaleString("tr-TR")} mahalle baseline kaydı`
      : "Tablo erişim hatası veya tablo boş",
  });

  const alarmSayisi = kontroller.filter((k) => !k.gecti).length;
  const saglikli = alarmSayisi === 0;

  return { ts, saglikli, kontroller, alarmSayisi, emailGonderildi: false };
}

// ─── Email alarm ──────────────────────────────────────────────────────────────

/**
 * Health check sonucuna göre admin email gönder.
 * Sadece alarm varsa (saglikli === false) gönderilir.
 */
export async function pipelineAlarmEmailGonder(
  env: Env,
  sonuc: PipelineKontrolSonucu,
): Promise<boolean> {
  if (sonuc.saglikli || !env.RESEND_API_KEY) return false;

  // Admin listesini DB'den çek
  const adminler = await env.DB.prepare(
    `SELECT email, ad FROM kullanicilar WHERE admin = 1`,
  ).all<{ email: string; ad: string | null }>().catch(() => ({ results: [] }));

  if (!adminler.results?.length) return false;

  const tarih = new Date(sonuc.ts).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
  const alarmlar = sonuc.kontroller.filter((k) => !k.gecti);

  const alarmHtml = alarmlar.map((k) => `
    <tr style="background:#fef2f2">
      <td style="padding:8px 12px;border-bottom:1px solid #fee2e2;font-weight:500;color:#991b1b">${k.ad}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #fee2e2;color:#dc2626">${k.deger.toLocaleString("tr-TR")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #fee2e2;color:#6b7280">≥ ${k.esik.toLocaleString("tr-TR")}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #fee2e2;color:#374151">${k.mesaj}</td>
    </tr>`).join("");

  const tamKontrolHtml = sonuc.kontroller.map((k) => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9">${k.ad}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;color:${k.gecti ? "#16a34a" : "#dc2626"}">${k.deger.toLocaleString("tr-TR")}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;color:#6b7280">≥ ${k.esik.toLocaleString("tr-TR")}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9">${k.gecti ? "✅" : "❌"} ${k.mesaj}</td>
    </tr>`).join("");

  const html = `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:20px">
      <h2 style="color:#991b1b">🚨 Cadastrum Pipeline Alarmı</h2>
      <p style="color:#4b5563">${tarih} — <strong>${sonuc.alarmSayisi} kontrol başarısız</strong></p>

      <h3 style="color:#374151;margin-top:24px">Başarısız Kontroller</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Kontrol</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Mevcut</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Eşik</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Durum</th>
          </tr>
        </thead>
        <tbody>${alarmHtml}</tbody>
      </table>

      <h3 style="color:#374151;margin-top:24px">Tüm Kontroller</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tbody>${tamKontrolHtml}</tbody>
      </table>

      <div style="margin-top:24px;padding:16px;background:#f0f9ff;border-radius:8px;border-left:4px solid #0284c7">
        <strong style="color:#0284c7">Olası Nedenler ve Düzeltme:</strong>
        <ul style="margin:8px 0;padding-left:20px;color:#374151;font-size:14px">
          <li>Scraper durdu → Chrome'da extension Bootstrap başlat</li>
          <li>İstatistik refresh çalışmadı → <code>curl /v1/istatistik/refresh</code></li>
          <li>D1 yazma hatası → Cloudflare dashboard D1 loglarına bak</li>
        </ul>
      </div>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:12px;color:#64748b">Bu mail her gün 03:00 UTC cron tarafından gönderilir. Devre dışı bırakmak için pipeline_health_check = 0 yap.</p>
    </div>`;

  const metin = `Cadastrum Pipeline Alarmı — ${sonuc.alarmSayisi} kontrol başarısız (${tarih})\n\n${
    alarmlar.map((k) => `❌ ${k.ad}: ${k.deger} (eşik: ${k.esik})\n  ${k.mesaj}`).join("\n")
  }\n\nDüzeltme: Chrome extension Bootstrap başlat veya /v1/istatistik/refresh çağır.`;

  for (const admin of adminler.results ?? []) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Cadastrum <alarm@cadastrum.com.tr>",
        to: [admin.email],
        subject: `🚨 [Cadastrum] Pipeline Alarmı — ${sonuc.alarmSayisi} kontrol başarısız`,
        html,
        text: metin,
      }),
    }).catch(() => {});
  }

  return true;
}

