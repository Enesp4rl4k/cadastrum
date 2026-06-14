/**
 * Cadastrum email şablonları — brand-tutarlı HTML + plain text.
 *
 * Imperial Blue + Champagne renkler, Cadastrum logo, responsive layout.
 * Resend API üzerinden gönderilir (auth.ts'teki emailGonder helper'ı).
 */

const SITE = "https://cadastrum.com.tr";

interface TemplateOpt {
  baslik: string;
  icerik: string;
  ctaButon?: { metin: string; link: string };
  not?: string;
}

/** Ortak HTML wrapper — header logo + footer disclaimer */
function htmlSarmala({ baslik, icerik, ctaButon, not }: TemplateOpt): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${baslik}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;color:#1B2A4A;line-height:1.6">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1B2A4A 0%,#2C4275 100%);padding:24px 32px;text-align:center">
          <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
            <td style="vertical-align:middle;padding-right:10px">
              <!-- V3 Geometric logo (light variant — header dark olduğu için beyaz hatlı) -->
              <svg width="32" height="32" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="display:block">
                <circle cx="32" cy="32" r="30" fill="#FFFFFF"/>
                <path d="M 32 12 A 20 20 0 1 0 50 38" stroke="#1B2A4A" stroke-width="6" fill="none" stroke-linecap="round"/>
                <circle cx="50" cy="38" r="3.5" fill="#C9A86A" stroke="#FFFFFF" stroke-width="0.8"/>
                <circle cx="32" cy="32" r="27" fill="none" stroke="#C9A86A" stroke-width="0.5" opacity="0.6"/>
              </svg>
            </td>
            <td style="vertical-align:middle">
              <span style="font-size:18pt;font-weight:700;color:#FFFFFF;letter-spacing:-0.01em;font-family:Georgia,serif">Cadastrum</span>
            </td>
          </tr></table>
        </td></tr>

        <!-- Content -->
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 16px;font-size:18pt;font-weight:600;color:#1B2A4A;letter-spacing:-0.01em">${baslik}</h1>
          <div style="font-size:11pt;color:#475569;line-height:1.7">${icerik}</div>

          ${ctaButon ? `
          <div style="text-align:center;margin:28px 0 8px">
            <a href="${ctaButon.link}" style="display:inline-block;padding:12px 28px;background:#1B2A4A;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:11pt;border-radius:6px">
              ${ctaButon.metin}
            </a>
          </div>` : ""}

          ${not ? `
          <div style="margin-top:24px;padding:12px 16px;background:#F8FAFC;border-left:3px solid #C9A86A;border-radius:4px;font-size:9.5pt;color:#64748B">
            ${not}
          </div>` : ""}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#F8FAFC;border-top:1px solid #E2E8F0;text-align:center;font-size:9pt;color:#94A3B8">
          <div style="margin-bottom:6px">
            <a href="${SITE}" style="color:#1B2A4A;text-decoration:none;font-weight:500">cadastrum.com.tr</a> ·
            <a href="${SITE}/iletisim" style="color:#94A3B8;text-decoration:none">İletişim</a> ·
            <a href="${SITE}/gizlilik" style="color:#94A3B8;text-decoration:none">Gizlilik</a>
          </div>
          <div>Cadastrum &mdash; TKGM parsel zekası ve gayrimenkul analiz platformu</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── 1. Doğrulama kodu (kayıt sonrası) ─────────────────────────
export function dogrulamaKoduTemplate(ad: string | null, kod: string): { html: string; metin: string } {
  const adKisim = ad ? `, ${ad}` : "";
  const html = htmlSarmala({
    baslik: "Email adresinizi doğrulayın",
    icerik: `
      <p style="margin:0 0 14px">Merhaba${adKisim},</p>
      <p style="margin:0 0 14px">Cadastrum hesabınızı doğrulamak için aşağıdaki kodu girin:</p>
      <div style="text-align:center;margin:24px 0">
        <div style="display:inline-block;padding:18px 32px;background:#F8FAFC;border:2px solid #1B2A4A;border-radius:8px;font-family:Menlo,Consolas,monospace;font-size:28pt;font-weight:700;color:#1B2A4A;letter-spacing:8px">
          ${kod}
        </div>
      </div>
      <p style="margin:0 0 8px;color:#64748B;font-size:10pt">Bu kod <strong>10 dakika</strong> geçerli.</p>
    `,
    not: "Bu emaili siz talep etmediyseniz görmezden gelebilirsiniz, hesabınız güvende.",
  });
  const metin = `Cadastrum email doğrulama\n\nKodunuz: ${kod}\n10 dakika geçerli.\n\n— Cadastrum`;
  return { html, metin };
}

// ── 2. Hoş geldin (email doğrulandıktan sonra) ────────────────
export function welcomeTemplate(ad: string | null): { html: string; metin: string } {
  const adKisim = ad ? `, ${ad}` : "";
  const html = htmlSarmala({
    baslik: `Cadastrum'a hoş geldin${adKisim}!`,
    icerik: `
      <p style="margin:0 0 14px">Email doğrulandı. Artık <strong>Free planında</strong> günlük 3 AI fiyat analizi, sınırsız TKGM parsel sorgu ve mahalle bazlı emsal verilerine erişebilirsin.</p>
      <p style="margin:0 0 14px">İlk adımlar:</p>
      <ol style="margin:0 0 16px;padding-left:20px;color:#475569">
        <li style="margin-bottom:8px"><strong>Chrome eklentisini yükle</strong> — sahibinden veya hepsiemlak ilanı açtığında otomatik analiz başlar.</li>
        <li style="margin-bottom:8px"><strong>İlana göz at</strong> — TKGM, e-Plan ve fiyat tahmini yan panelde gelir.</li>
        <li style="margin-bottom:8px"><strong>PDF rapor üret</strong> — 6 sayfalık profesyonel rapor (kapak + harita + risk + SWOT).</li>
      </ol>
    `,
    ctaButon: { metin: "Chrome'a ekle", link: "https://chromewebstore.google.com/" },
    not: "Pro planda neler var: sınırsız AI, sınırsız PDF rapor, toplu parsel analizi. /fiyat sayfasından inceleyebilirsin.",
  });
  const metin = `Cadastrum'a hoş geldin${adKisim}!\n\nEmail doğrulandı. Free planda 3 AI/gün, sınırsız TKGM, mahalle emsali.\n\nBaşlamak için: ${SITE}\n\n— Cadastrum`;
  return { html, metin };
}

// ── 3. Şifre sıfırlama bağlantısı ─────────────────────────────
export function sifreSifirlamaTemplate(ad: string | null, sifirlamaUrl: string): { html: string; metin: string } {
  const adKisim = ad ? `, ${ad}` : "";
  const html = htmlSarmala({
    baslik: "Şifre sıfırlama bağlantısı",
    icerik: `
      <p style="margin:0 0 14px">Merhaba${adKisim},</p>
      <p style="margin:0 0 14px">Şifrenizi sıfırlamak için aşağıdaki butona tıklayın. Bağlantı <strong>1 saat</strong> geçerli.</p>
    `,
    ctaButon: { metin: "Şifremi yenile", link: sifirlamaUrl },
    not: "Bu emaili siz talep etmediyseniz görmezden gelin, hesabınız güvende. Hiç kimse şifrenize erişemez.",
  });
  const metin = `Cadastrum şifre sıfırlama\n\nBağlantı:\n${sifirlamaUrl}\n\n1 saat geçerli.\n\n— Cadastrum`;
  return { html, metin };
}

// ── 4. Pro abonelik aktivasyon ─────────────────────────────────
export function proAktivasyonTemplate(ad: string | null, plan: string, bitis: number | null): { html: string; metin: string } {
  const adKisim = ad ? `, ${ad}` : "";
  const planAd = plan === "pro" ? "Pro" : plan === "pro_plus" ? "Pro+" : "Kurumsal";
  const bitisStr = bitis ? new Date(bitis).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : null;
  const html = htmlSarmala({
    baslik: `${planAd} planınız aktif!`,
    icerik: `
      <p style="margin:0 0 14px">Merhaba${adKisim},</p>
      <p style="margin:0 0 14px">${planAd} planına geçişiniz başarıyla tamamlandı. Tüm Pro özellikler hesabınızda aktif:</p>
      <ul style="margin:0 0 16px;padding-left:20px;color:#475569">
        ${plan === "pro" ? `
          <li style="margin-bottom:6px"><strong>Sınırsız TKGM sorgusu</strong></li>
          <li style="margin-bottom:6px"><strong>Günde 100 AI fiyat analizi</strong></li>
          <li style="margin-bottom:6px">Hepsiemlak ilan tanıma</li>
          <li style="margin-bottom:6px">Aylık 10 PDF rapor</li>
          <li style="margin-bottom:6px">TKGM yoğunluk haritası</li>
        ` : plan === "pro_plus" ? `
          <li style="margin-bottom:6px"><strong>Pro tüm özellikleri</strong></li>
          <li style="margin-bottom:6px"><strong>Günde 1000 AI analizi</strong></li>
          <li style="margin-bottom:6px"><strong>Sınırsız PDF rapor</strong></li>
          <li style="margin-bottom:6px">Toplu parsel analizi</li>
          <li style="margin-bottom:6px">TCMB kalibrasyon + Excel export</li>
        ` : `
          <li style="margin-bottom:6px"><strong>Pro+ tüm özellikleri</strong></li>
          <li style="margin-bottom:6px"><strong>5+ kullanıcı, ortak veri</strong></li>
          <li style="margin-bottom:6px">REST API erişimi</li>
          <li style="margin-bottom:6px">SLA garantisi (%99.5)</li>
        `}
      </ul>
      ${bitisStr ? `<p style="margin:0 0 14px;color:#64748B;font-size:10pt">Mevcut dönem: ${bitisStr} tarihine kadar.</p>` : ""}
    `,
    ctaButon: { metin: "Hesabıma git", link: `${SITE}/hesap` },
    not: "Aboneliği istediğin zaman /hesap sayfasından iptal edebilirsin. Dönem sonuna kadar Pro özellikler açık kalır.",
  });
  const metin = `${planAd} planınız aktif!\n\nTüm Pro özellikler hesabınızda açık.${bitisStr ? `\nDönem sonu: ${bitisStr}` : ""}\n\nHesap: ${SITE}/hesap\n\n— Cadastrum`;
  return { html, metin };
}

// ── 5. Abonelik iptali ────────────────────────────────────────
export function aboneliyIptalTemplate(ad: string | null, donemSonu: number | null): { html: string; metin: string } {
  const adKisim = ad ? `, ${ad}` : "";
  const sonStr = donemSonu ? new Date(donemSonu).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : null;
  const html = htmlSarmala({
    baslik: "Aboneliğiniz iptal edildi",
    icerik: `
      <p style="margin:0 0 14px">Merhaba${adKisim},</p>
      <p style="margin:0 0 14px">Aboneliğinizin iptal edildiğini onayladık. ${sonStr ? `Mevcut dönem (<strong>${sonStr}</strong>) sonuna kadar Pro özellikler aktif kalmaya devam edecek.` : "Pro özellikler dönem sonuna kadar açık."}</p>
      <p style="margin:0 0 14px">Hesabınız ve verileriniz silinmeyecek. Free planına otomatik geçiş yapılacak.</p>
    `,
    ctaButon: { metin: "Geri dönmek için /fiyat", link: `${SITE}/fiyat` },
    not: "Geri bildirim için kısa bir email atabilir misin? Hangi özellik eksik kaldı, neyi geliştirebiliriz? — iletisim@cadastrum.com.tr",
  });
  const metin = `Aboneliğiniz iptal edildi.${sonStr ? `\nDönem sonu: ${sonStr}` : ""}\nFree planına geçiş otomatik.\n\n— Cadastrum`;
  return { html, metin };
}

// ── 6. Ödeme başarısız ─────────────────────────────────────────
export function odemeBasarisizTemplate(ad: string | null): { html: string; metin: string } {
  const adKisim = ad ? `, ${ad}` : "";
  const html = htmlSarmala({
    baslik: "Ödeme alınamadı",
    icerik: `
      <p style="margin:0 0 14px">Merhaba${adKisim},</p>
      <p style="margin:0 0 14px">Aboneliğinizin yenilenmesinde sorun yaşadık — kart bilgileriniz reddedildi veya yetersiz bakiye gibi bir durum olabilir.</p>
      <p style="margin:0 0 14px"><strong>Birkaç gün içinde tekrar deneyeceğiz.</strong> Bu sırada kart bilgilerinizi güncellemek için aşağıdaki bağlantıyı kullanabilirsiniz.</p>
    `,
    ctaButon: { metin: "Kartı güncelle", link: `${SITE}/hesap` },
    not: "3 başarısız denemeden sonra plan otomatik Free'ye düşecek. Sorun değil — istediğin zaman tekrar Pro'ya geçebilirsin.",
  });
  const metin = `Ödeme alınamadı.\nKart bilgilerinizi güncellemek için: ${SITE}/hesap\n\n— Cadastrum`;
  return { html, metin };
}
