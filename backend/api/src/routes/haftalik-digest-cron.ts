/**
 * Haftalık Portföy Digest Cron — P2.1
 *
 * Her Pazartesi 09:00'da çalışır (wrangler.toml: "0 9 * * 1").
 * Her aktif kullanıcının favorilerindeki parseller için fiyat özeti gönderir.
 *
 * Mantık:
 *   1. Son 7 günde giriş yapmış kullanıcıları al (aktif)
 *   2. Her kullanıcının favorilerini al (max 20 — Free tier sınırı)
 *   3. Her favori için fiyat baseline al (D1 istatistik tablosundan)
 *   4. Özet email oluştur → Resend ile gönder
 *
 * Limitler:
 *   - Free tier: max 5 favori gösterilir emailde
 *   - Pro/Pro+: tüm favoriler
 *   - Email gönderim hatası diğer kullanıcıları etkilemez
 *   - Günde max 1 email (tekrarlama engeli)
 */
import type { Env } from "../index.js";
import { emailGonder } from "./auth.js";

const SITE = "https://cadastrum.com.tr";
const DIGEST_SON_GONDERI_TABLOSU = "haftalik_digest_gonderi"; // migration'da oluşturulur

interface KullaniciRow {
  id: number;
  email: string;
  ad: string | null;
  tier: string;
}

interface FavoriRow {
  id: number;
  il_ad: string | null;
  ilce_ad: string | null;
  mahalle_ad: string | null;
  ada_no: number;
  parsel_no: number;
  nitelik: string | null;
  alan: number | null;
  fiyat_snapshot: string | null; // JSON
  ekleme_tarihi: number;
}

interface FiyatSnapshot {
  beklenenPerM2: number;
  altPerM2: number;
  ustPerM2: number;
  ts: number;
}

function fmtTLM2(n: number): string {
  return `${Math.round(n).toLocaleString("tr-TR")} TL/m²`;
}

function fmtTarih(ts: number): string {
  return new Date(ts).toLocaleDateString("tr-TR", {
    day: "numeric", month: "long", year: "numeric",
  });
}

/** Favori listesi için HTML tablo satırı */
function favoriSatiri(f: FavoriRow, snapshot: FiyatSnapshot | null): string {
  const konum = [f.mahalle_ad, f.ilce_ad, f.il_ad].filter(Boolean).join(", ");
  const parselAd = `Ada ${f.ada_no} / Parsel ${f.parsel_no}`;
  const paylasimUrl = `${SITE}/parsel?il=${f.il_ad ?? ""}&ilce=${f.ilce_ad ?? ""}&ada=${f.ada_no}&parsel=${f.parsel_no}`;

  const fiyatMetin = snapshot
    ? `<span style="font-weight:700;color:#1B2A4A">${fmtTLM2(snapshot.beklenenPerM2)}</span>
       <span style="font-size:11px;color:#64748b"> (${fmtTLM2(snapshot.altPerM2)}–${fmtTLM2(snapshot.ustPerM2)})</span>`
    : `<span style="color:#94a3b8">Fiyat verisi yok</span>`;

  return `
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:12px 16px">
        <div style="font-weight:600;color:#1B2A4A">${parselAd}</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px">${konum || "—"}</div>
        ${f.nitelik ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">${f.nitelik}${f.alan ? ` · ${f.alan.toLocaleString("tr-TR")} m²` : ""}</div>` : ""}
      </td>
      <td style="padding:12px 16px;text-align:right;vertical-align:top">
        ${fiyatMetin}
        ${snapshot ? `<div style="font-size:10px;color:#94a3b8;margin-top:4px">${fmtTarih(snapshot.ts)}</div>` : ""}
      </td>
      <td style="padding:12px 16px;text-align:center;vertical-align:top">
        <a href="${paylasimUrl}" style="display:inline-block;background:#1B2A4A;color:#fff;font-size:11px;font-weight:600;padding:5px 12px;border-radius:6px;text-decoration:none">
          Analiz et
        </a>
      </td>
    </tr>`;
}

/** Haftalık digest email HTML */
function digestHtml(ad: string | null, favoriler: FavoriRow[]): string {
  const isim = ad ?? "Değerli Kullanıcı";
  const tarih = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });

  const satirlar = favoriler
    .map((f) => {
      const snapshot: FiyatSnapshot | null = f.fiyat_snapshot
        ? (() => { try { return JSON.parse(f.fiyat_snapshot); } catch { return null; } })()
        : null;
      return favoriSatiri(f, snapshot);
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;color:#1B2A4A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1B2A4A 0%,#2C4275 100%);padding:24px 32px;text-align:center">
          <div style="color:#C9A86A;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Cadastrum</div>
          <div style="color:#fff;font-size:20px;font-weight:700;margin-top:6px">Haftalık Portföy Özeti</div>
          <div style="color:rgba(255,255,255,.65);font-size:12px;margin-top:4px">${tarih}</div>
        </td></tr>

        <!-- Selamlama -->
        <tr><td style="padding:24px 32px 8px">
          <p style="margin:0;font-size:15px;color:#1B2A4A">Merhaba ${isim},</p>
          <p style="margin:12px 0 0;font-size:14px;color:#475569;line-height:1.6">
            Favorilerine eklediğin <strong>${favoriler.length} parsel</strong> için bu haftaki fiyat bandı özeti:
          </p>
        </td></tr>

        <!-- Favori tablosu -->
        <tr><td style="padding:8px 16px 8px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
            <thead>
              <tr style="background:#f8fafc">
                <th style="padding:10px 16px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;font-weight:600">Parsel</th>
                <th style="padding:10px 16px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;font-weight:600">Tahmini Fiyat</th>
                <th style="padding:10px 16px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;font-weight:600">İşlem</th>
              </tr>
            </thead>
            <tbody>${satirlar}</tbody>
          </table>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:24px 32px;text-align:center">
          <a href="${SITE}/giris" style="display:inline-block;background:#1B2A4A;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none">
            Tüm favorilerini gör →
          </a>
          <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">
            Chrome eklentisini açarak parseller üzerinde anlık analiz yapabilirsin.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0">
          <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6">
            Cadastrum · cadastrum.com.tr<br/>
            Bu emaili almak istemiyorsan <a href="${SITE}/hesap/bildirimler" style="color:#64748b">bildirim ayarlarından</a> haftalık özeti kapatabilirsin.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Plain text fallback */
function digestMetin(ad: string | null, favoriler: FavoriRow[]): string {
  const isim = ad ?? "Değerli Kullanıcı";
  const tarih = new Date().toLocaleDateString("tr-TR");

  const satirlar = favoriler.map((f) => {
    const konum = [f.mahalle_ad, f.ilce_ad, f.il_ad].filter(Boolean).join(", ");
    const snapshot: FiyatSnapshot | null = f.fiyat_snapshot
      ? (() => { try { return JSON.parse(f.fiyat_snapshot); } catch { return null; } })()
      : null;
    const fiyat = snapshot ? fmtTLM2(snapshot.beklenenPerM2) : "Veri yok";
    return `- Ada ${f.ada_no} / Parsel ${f.parsel_no} (${konum}): ${fiyat}`;
  }).join("\n");

  return `Cadastrum Haftalık Portföy Özeti — ${tarih}\n\nMerhaba ${isim},\n\nFavorilerindeki parseller:\n${satirlar}\n\nDetaylar: ${SITE}/giris\n\n---\nCadastrum · cadastrum.com.tr`;
}

/**
 * haftalikDigestGonder — index.ts scheduled handler'dan çağrılır.
 * Cron: "0 9 * * 1" (Pazartesi 09:00 UTC)
 */
export async function haftalikDigestGonder(env: Env): Promise<{ gonderilen: number; atlanan: number; hatali: number }> {
  let gonderilen = 0;
  let atlanan = 0;
  let hatali = 0;

  const haftaBasiMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

  // 1. Son 7 günde aktif kullanıcılar — digest_kapalı = 0 olanlar
  const kullanicilar = await env.DB.prepare(`
    SELECT id, email, ad, tier
    FROM kullanicilar
    WHERE son_giris > ?
      AND (digest_kapalı IS NULL OR digest_kapalı = 0)
      AND email_dogrulandi = 1
    LIMIT 500
  `).bind(haftaBasiMs).all<KullaniciRow>();

  if (!kullanicilar.results?.length) return { gonderilen: 0, atlanan: 0, hatali: 0 };

  for (const kullanici of kullanicilar.results) {
    try {
      // 2. Bu haftaki digest zaten gönderildi mi?
      const sonGonderi = await env.DB.prepare(`
        SELECT gonderi_zamani FROM haftalik_digest_gonderi
        WHERE kullanici_id = ? AND gonderi_zamani > ?
      `).bind(kullanici.id, haftaBasiMs).first<{ gonderi_zamani: number }>();

      if (sonGonderi) {
        atlanan++;
        continue;
      }

      // 3. Kullanıcının favorileri
      const proTier = kullanici.tier !== "free";
      const limit = proTier ? 20 : 5;
      const favoriler = await env.DB.prepare(`
        SELECT id, il_ad, ilce_ad, mahalle_ad, ada_no, parsel_no, nitelik, alan, fiyat_snapshot, ekleme_tarihi
        FROM favoriler
        WHERE kullanici_id = ?
        ORDER BY ekleme_tarihi DESC
        LIMIT ?
      `).bind(kullanici.id, limit).all<FavoriRow>();

      if (!favoriler.results?.length) {
        atlanan++;
        continue;
      }

      // 4. Email gönder
      const html = digestHtml(kullanici.ad, favoriler.results);
      const metin = digestMetin(kullanici.ad, favoriler.results);
      const konu = `📍 Haftalık portföy özeti — ${favoriler.results.length} parsel`;

      const basarili = await emailGonder(env, kullanici.email, konu, html, metin);

      if (basarili) {
        // 5. Gönderim kaydı
        await env.DB.prepare(`
          INSERT INTO haftalik_digest_gonderi (kullanici_id, gonderi_zamani, parsel_sayisi)
          VALUES (?, ?, ?)
        `).bind(kullanici.id, Date.now(), favoriler.results.length).run();

        gonderilen++;
      } else {
        hatali++;
      }
    } catch (e) {
      console.error("[digest] kullanıcı hatası:", kullanici.id, e);
      hatali++;
    }
  }

  return { gonderilen, atlanan, hatali };
}
