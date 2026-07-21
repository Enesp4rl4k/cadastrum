/**
 * Arazi Avcısı Cron — YENI-1
 *
 * Her gün kriterleri tara, yeni adaylar varsa email uyarısı gönder.
 * Cloudflare Workers scheduled event'ten çağrılır ("0 8 * * *" — her gün 08:00 UTC).
 *
 * Çalışma mantığı:
 *   1. uyari_aktif=1 olan kriterleri çek (kullanıcı bazlı grupla)
 *   2. Her kriter için /v1/arazi-avci/ara ile eşdeğer sorgu çalıştır
 *   3. Sonuç sayısını son bildirimle karşılaştır (arazi_avci_kriter.son_uyari)
 *   4. Yeni adaylar varsa kullanıcıya Resend ile email gönder
 *   5. son_uyari + son_sonuc_adet güncelle
 *
 * Kota: ücretsiz — tier fark etmeksizin uyarı gönderilir.
 */

import type { Env } from "../index.js";
import { yatirimSkoruHesapla } from "../lib/yatirim-skoru.js";

interface KriterRow {
  id: number;
  kullanici_id: number;
  ad: string;
  il_norm: string | null;
  ilce_norm: string | null;
  kategori: string;
  imar_tipi: string | null;
  max_tlm2: number | null;
  min_skor: number;
  son_uyari: number | null;
  son_sonuc_adet: number | null;
  kullanici_email: string;
  kullanici_ad: string | null;
}

interface AraziAday {
  il_norm: string;
  ilce_norm: string;
  mahalle_norm: string | null;
  medyan_tlm2: number;
  ilan_adet: number;
  skor: number;
}

// ── Skor hesaplama (arazi-avci.ts ile aynı) ───────────────────────────────────

function skorHesapla(
  medyan_tlm2: number,
  ilan_adet: number,
  kaynak: string,
  imar_tipi?: string | null,
): number {
  return yatirimSkoruHesapla({
    guvenSkoru: Math.min(95, 40 + ilan_adet * 2),
    kaynak: kaynak as "mahalle-istatistik" | "il-fallback",
    emsalAdet: ilan_adet,
    imarTipi: imar_tipi ?? "belirsiz",
    emsal: null, taks: null,
    toplamCarpan: 1,
    altTlm2: medyan_tlm2 * 0.8,
    ustTlm2: medyan_tlm2 * 1.25,
    medyanTlm2: medyan_tlm2,
    trendDegisimYuzde: null,
  }).skor;
}

// ── Kriterle eşleşen adayları bul ────────────────────────────────────────────

async function adaylariBul(db: D1Database, kriter: KriterRow): Promise<AraziAday[]> {
  const { kategori, il_norm, ilce_norm, max_tlm2, min_skor, imar_tipi } = kriter;

  let sql = `
    SELECT il_norm, ilce_norm, mahalle_norm, medyan AS medyan_tlm2, ilan_adet,
           'mahalle-istatistik' AS kaynak
    FROM mahalle_istatistik
    WHERE kategori = ? AND medyan > 0 AND ilan_adet >= 3
  `;
  const params: (string | number)[] = [kategori];

  if (il_norm) { sql += " AND il_norm = ?"; params.push(il_norm); }
  if (ilce_norm) { sql += " AND ilce_norm = ?"; params.push(ilce_norm); }
  if (max_tlm2) { sql += " AND medyan <= ?"; params.push(max_tlm2); }

  sql += " ORDER BY ilan_adet DESC LIMIT 50";

  const rows = await db.prepare(sql).bind(...params).all<{
    il_norm: string; ilce_norm: string; mahalle_norm: string | null;
    medyan_tlm2: number; ilan_adet: number; kaynak: string;
  }>();

  return (rows.results ?? [])
    .map((r) => ({
      il_norm: r.il_norm,
      ilce_norm: r.ilce_norm,
      mahalle_norm: r.mahalle_norm,
      medyan_tlm2: Math.round(r.medyan_tlm2),
      ilan_adet: r.ilan_adet,
      skor: skorHesapla(r.medyan_tlm2, r.ilan_adet, r.kaynak, imar_tipi),
    }))
    .filter((a) => a.skor >= min_skor)
    .sort((a, b) => b.skor - a.skor)
    .slice(0, 10);
}

// ── Email içeriği ─────────────────────────────────────────────────────────────

function uyariEmailHtml(
  kullaniciAd: string | null,
  kriterAd: string,
  adaylar: AraziAday[],
  yeniAdet: number,
): { html: string; text: string } {
  const isim = kullaniciAd ?? "Değerli kullanıcı";
  const sorgu_url = "https://cadastrum.com.tr/sorgu";

  const adayListesi = adaylar
    .slice(0, 5)
    .map((a) => {
      const lokasyon = a.mahalle_norm
        ? `${a.mahalle_norm} / ${a.ilce_norm} / ${a.il_norm}`
        : `${a.ilce_norm} / ${a.il_norm}`;
      return `<li style="margin:4px 0"><strong>${lokasyon}</strong> — ${a.medyan_tlm2.toLocaleString("tr-TR")} TL/m² · Skor: ${a.skor}/100</li>`;
    })
    .join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b">
      <div style="margin-bottom:24px">
        <span style="font-size:24px">🏗️</span>
        <h1 style="display:inline;font-size:20px;font-weight:700;margin-left:8px;color:#1B2A4A">Arazi Avcısı Uyarısı</h1>
      </div>

      <p>Merhaba ${isim},</p>
      <p><strong>"${kriterAd}"</strong> kriterinizle eşleşen <strong>${adaylar.length} aday</strong> bölge var${yeniAdet > 0 ? ` (${yeniAdet} yeni)` : ""}.</p>

      <h2 style="font-size:16px;margin-top:20px">En İyi Adaylar</h2>
      <ul style="padding-left:16px;line-height:1.6">
        ${adayListesi}
      </ul>

      <div style="margin-top:24px">
        <a href="${sorgu_url}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px">
          Cadastrum'da İncele →
        </a>
      </div>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:12px;color:#94a3b8">
        Bu bilgilendirme amaçlıdır; yatırım tavsiyesi değildir.<br>
        Uyarıyı kapatmak için Cadastrum hesabınızdaki Arazi Avcısı bölümünü kullanın.
      </p>
    </div>
  `;

  const text = `
Arazi Avcısı Uyarısı — "${kriterAd}"

${adaylar.length} eşleşen bölge bulundu${yeniAdet > 0 ? ` (${yeniAdet} yeni)` : ""}.

İlk 5 aday:
${adaylar.slice(0, 5).map((a) => `- ${a.mahalle_norm ?? ""} ${a.ilce_norm}/${a.il_norm} — ${a.medyan_tlm2.toLocaleString("tr-TR")} TL/m² · Skor: ${a.skor}`).join("\n")}

Detaylar için: ${sorgu_url}

Bu bilgilendirme amaçlıdır; yatırım tavsiyesi değildir.
  `.trim();

  return { html, text };
}

// ── Resend ile email gönder ───────────────────────────────────────────────────

async function emailGonder(
  resendKey: string,
  to: string,
  konu: string,
  html: string,
  text: string,
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Cadastrum Avcı <noreply@cadastrum.com.tr>",
      to: [to],
      subject: konu,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${err.slice(0, 100)}`);
  }
}

// ── Ana cron fonksiyonu ───────────────────────────────────────────────────────

export async function araziAvciCronCalistir(env: Env): Promise<{
  islenen: number;
  uyari_gonderilen: number;
  hatali: number;
}> {
  // Aktif kriterler + kullanıcı email'lerini birleştir
  const kriterler = await env.DB.prepare(`
    SELECT
      k.id, k.kullanici_id, k.ad, k.il_norm, k.ilce_norm,
      k.kategori, k.imar_tipi, k.max_tlm2, k.min_skor,
      k.son_uyari, k.son_sonuc_adet,
      u.email AS kullanici_email, u.ad AS kullanici_ad
    FROM arazi_avci_kriter k
    JOIN kullanicilar u ON u.id = k.kullanici_id
    WHERE k.uyari_aktif = 1
      AND u.email IS NOT NULL
    ORDER BY k.kullanici_id, k.id
    LIMIT 500
  `).all<KriterRow>();

  const resendKey = (env as unknown as Record<string, unknown>).RESEND_API_KEY as string | undefined;

  let islenen = 0;
  let uyari_gonderilen = 0;
  let hatali = 0;

  for (const kriter of kriterler.results ?? []) {
    islenen++;
    try {
      const adaylar = await adaylariBul(env.DB, kriter);
      const mevcutAdet = adaylar.length;

      // Son bildirimden fark var mı?
      const eskiAdet = kriter.son_sonuc_adet ?? 0;
      const yeniAdet = Math.max(0, mevcutAdet - eskiAdet);

      // İlk bildirim VEYA yeni aday varsa gönder (her iki günde bir max)
      const sonUyariMs = kriter.son_uyari ?? 0;
      const gecenSure = Date.now() - sonUyariMs;
      const iki_gun_ms = 2 * 24 * 60 * 60 * 1000;
      const gondermeli = mevcutAdet > 0 && (sonUyariMs === 0 || (yeniAdet > 0 && gecenSure > iki_gun_ms));

      if (gondermeli && resendKey) {
        const { html, text } = uyariEmailHtml(kriter.kullanici_ad, kriter.ad, adaylar, yeniAdet);
        const konu = yeniAdet > 0
          ? `🏗️ Arazi Avcısı: "${kriter.ad}" için ${yeniAdet} yeni eşleşme`
          : `🏗️ Arazi Avcısı: "${kriter.ad}" — ${mevcutAdet} aktif eşleşme`;

        await emailGonder(resendKey, kriter.kullanici_email, konu, html, text);
        uyari_gonderilen++;
      }

      // Her run'da son durumu güncelle
      await env.DB.prepare(`
        UPDATE arazi_avci_kriter
        SET son_uyari = ?, son_sonuc_adet = ?, guncellendi = ?
        WHERE id = ?
      `).bind(
        gondermeli ? Date.now() : (kriter.son_uyari ?? Date.now()),
        mevcutAdet,
        Date.now(),
        kriter.id,
      ).run();

    } catch (e) {
      hatali++;
      console.error(`[arazi-avci-cron] kriter ${kriter.id} hatası:`, e instanceof Error ? e.message : String(e));
    }
  }

  return { islenen, uyari_gonderilen, hatali };
}
