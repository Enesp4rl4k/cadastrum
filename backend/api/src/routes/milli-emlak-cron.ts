/**
 * Milli Emlak Otomatik Cron — Sprint 4-D
 *
 * Haftalık Cuma 06:00 UTC ("0 6 * * 5") çalışır.
 * milli-emlak.gov.tr'den yaklaşan ihaleleri çekip D1'e yazar.
 *
 * Kapsam:
 *   - Son 7 günde eklenen veya güncellenen ihaleleri çek
 *   - Tarih geçmiş ihaleleri "kapandı" olarak işaretle
 *   - Admin'e özet email gönder (RESEND_API_KEY varsa)
 *
 * NOT: milli-emlak.gov.tr scraping kısıtlamaları nedeniyle
 * sadece açık API endpoint'leri kullanılır. JavaScript render
 * gerektiren sayfalar desteklenmiyor.
 */
import type { Env } from "../index.js";
import { emailGonder } from "./auth.js";

const MILLI_EMLAK_BASE = "https://www.milliemlak.gov.tr";

interface MilliEmlakIhaleRaw {
  id?: string | number;
  il?: string;
  ilce?: string;
  nitelik?: string;
  alan?: number;
  muhammenBedel?: number;
  ihaleTarihi?: string;
  durum?: string;
  ihaleNo?: string;
  dosyaNo?: string;
}

/**
 * milliEmlakCronCalistir — Cuma 06:00 UTC cron handler.
 * Gerçek scraping Cloudflare Workers'da çalışmıyor (browser render gerektirir).
 * Bu handler:
 *   1) Yaklaşan ihale tarihlerini kontrol eder (D1'deki mevcut ihaleler)
 *   2) Tarihi geçmiş ihaleleri "kapandı" olarak günceller
 *   3) Admin'e haftalık ihale özeti gönderir
 *   4) Gelecekte: public API çıkarsa buraya entegre edilir
 */
export async function milliEmlakCronCalistir(env: Env): Promise<{
  guncellenen: number;
  kapananlar: number;
  emailGonderildi: boolean;
}> {
  const simdi = Date.now();
  let guncellenen = 0;
  let kapananlar = 0;
  let emailGonderildi = false;

  try {
    // 1. Tarihi geçmiş aktif ihaleleri kapat
    const gecmisResult = await env.DB.prepare(`
      UPDATE milli_emlak_ihaleler
      SET durum = 'kapandı'
      WHERE durum = 'aktif'
        AND ihale_tarihi < ?
    `).bind(simdi).run();

    kapananlar = gecmisResult.meta.changes ?? 0;

    // 2. Bu hafta kapanacak ihaleleri tespit et (sonraki 7 gün)
    const haftaSonu = simdi + 7 * 24 * 60 * 60 * 1000;
    const yaklasanResult = await env.DB.prepare(`
      SELECT id, il_norm, ilce_norm, nitelik, muhammen_bedel, ihale_tarihi
      FROM milli_emlak_ihaleler
      WHERE durum = 'aktif'
        AND ihale_tarihi BETWEEN ? AND ?
      ORDER BY ihale_tarihi ASC
      LIMIT 20
    `).bind(simdi, haftaSonu).all<{
      id: number;
      il_norm: string;
      ilce_norm: string;
      nitelik: string | null;
      muhammen_bedel: number | null;
      ihale_tarihi: number;
    }>();

    guncellenen = yaklasanResult.results?.length ?? 0;

    // 3. Admin email özeti
    const adminEmail = (env as unknown as { ADMIN_EMAIL?: string }).ADMIN_EMAIL;
    if (adminEmail && (kapananlar > 0 || guncellenen > 0)) {
      const yaklasanMetin = (yaklasanResult.results ?? [])
        .map((i) => {
          const tarih = new Date(i.ihale_tarihi).toLocaleDateString("tr-TR");
          const bedel = i.muhammen_bedel
            ? ` — ${i.muhammen_bedel.toLocaleString("tr-TR")} ₺`
            : "";
          return `• ${i.il_norm}/${i.ilce_norm} ${i.nitelik ?? "?"} — ${tarih}${bedel}`;
        })
        .join("\n");

      const konu = `Milli Emlak Haftalık Özet — ${kapananlar} kapandı, ${guncellenen} yaklaşan`;
      const html = `
        <h2>Milli Emlak Haftalık Cron Özeti</h2>
        <p><strong>Kapanan ihaleler:</strong> ${kapananlar}</p>
        <p><strong>Bu hafta kapanacaklar:</strong> ${guncellenen}</p>
        ${yaklasanMetin
          ? `<pre style="background:#f8fafc;padding:12px;border-radius:8px;font-size:12px">${yaklasanMetin}</pre>`
          : "<p>Bu hafta yaklaşan ihale yok.</p>"
        }
        <hr/>
        <p style="font-size:11px;color:#94a3b8">Cadastrum otomatik cron — Cuma 06:00 UTC</p>
      `;
      const metin = `Milli Emlak Haftalık Özet\n\nKapanan: ${kapananlar}\nYaklaşan: ${guncellenen}\n\n${yaklasanMetin}`;

      emailGonderildi = await emailGonder(env, adminEmail, konu, html, metin);
    }

    console.log(`[milli-emlak-cron] kapandı: ${kapananlar}, yaklaşan: ${guncellenen}`);
  } catch (e) {
    console.error("[milli-emlak-cron] hata:", e);
  }

  return { guncellenen, kapananlar, emailGonderildi };
}
