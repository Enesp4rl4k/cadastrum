/**
 * Drip Email Sequence — Sprint 4-B
 *
 * Kullanıcı kaydından sonra 3 aşamalı email dizisi:
 *   D+1: "İlk parseli nasıl analiz edersin?" — onboarding
 *   D+3: "AI Hub özelliği" — özellik keşfi
 *   D+7: "Pro'ya geç" — conversion CTA
 *
 * Cloudflare Cron: "0 10 * * *" (günlük 10:00 UTC)
 * Her çalışmada bekleyen kullanıcıları tarar, uygun emaili gönderir.
 *
 * Kontrol: drip_email_gonderi tablosuna kayıt eder, tekrar göndermez.
 */
import type { Env } from "../index.js";
import { emailGonder } from "./auth.js";

const SITE = "https://cadastrum.com.tr";
const CWS_URL = "https://chromewebstore.google.com/detail/cadastrum/";

// ── Email şablonları ──────────────────────────────────────────────────────────

function d1Html(ad: string | null): string {
  const isim = ad ?? "Değerli Kullanıcı";
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;color:#1B2A4A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">
        <tr><td style="background:linear-gradient(135deg,#1B2A4A 0%,#2C4275 100%);padding:24px 32px">
          <div style="color:#C9A86A;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Cadastrum</div>
          <div style="color:#fff;font-size:20px;font-weight:700;margin-top:6px">İlk adım: Parsel analizi</div>
        </td></tr>
        <tr><td style="padding:24px 32px">
          <p style="font-size:15px;color:#1B2A4A;margin:0">Merhaba ${isim}! 👋</p>
          <p style="font-size:14px;color:#475569;line-height:1.6;margin:12px 0">
            Cadastrum'a hoş geldiniz. Sizi 1 dakikada ilk analizinize götürelim:
          </p>
          <ol style="font-size:14px;color:#475569;line-height:1.8;padding-left:20px;margin:12px 0">
            <li><strong>Chrome eklentisini yükleyin</strong> (ücretsiz)</li>
            <li>Sahibinden veya Hepsiemlak'ta bir ilan açın</li>
            <li>Sağ alt köşedeki Cadastrum simgesine tıklayın</li>
            <li>TKGM doğrulama + fiyat tahmini + risk analizi otomatik gelir</li>
          </ol>
          <div style="margin:24px 0;text-align:center">
            <a href="${CWS_URL}" style="display:inline-block;background:#1B2A4A;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none">
              Chrome'a Yükle (Ücretsiz) →
            </a>
          </div>
          <p style="font-size:12px;color:#94a3b8;text-align:center">
            Eklentiyi zaten yüklediyseniz, bugün bir parsel deneyin. 🏗️
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0">
          <p style="margin:0;font-size:11px;color:#94a3b8">
            Cadastrum · cadastrum.com.tr · <a href="${SITE}/hesap/bildirimler" style="color:#64748b">Abonelikten çık</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function d3Html(ad: string | null): string {
  const isim = ad ?? "Değerli Kullanıcı";
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;color:#1B2A4A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden">
        <tr><td style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);padding:24px 32px">
          <div style="color:#e9d5ff;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Cadastrum · Yeni Özellik</div>
          <div style="color:#fff;font-size:20px;font-weight:700;margin-top:6px">🤖 AI Hub — Tek tıkla derin analiz</div>
        </td></tr>
        <tr><td style="padding:24px 32px">
          <p style="font-size:15px;color:#1B2A4A;margin:0">Merhaba ${isim},</p>
          <p style="font-size:14px;color:#475569;line-height:1.6;margin:12px 0">
            Eklentideki yeni <strong>AI Hub sekmesi</strong>ni denediniz mi?
          </p>
          <div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:8px;padding:16px;margin:16px 0">
            <div style="font-size:13px;color:#3730a3;font-weight:600;margin-bottom:8px">AI Hub içinde neler var?</div>
            <ul style="font-size:13px;color:#475569;line-height:1.8;padding-left:16px;margin:0">
              <li>🤖 <strong>AI Danışman</strong> — parsel bağlamlı yatırım soruları</li>
              <li>📈 <strong>Trend Grafik</strong> — mahalle TL/m² zaman serisi</li>
              <li>⚡ <strong>İmar Sinyali</strong> — dönüşüm olasılığı tahmini</li>
              <li>🏗️ <strong>Dijital İkiz</strong> — 2.5D imar zarfı görünümü</li>
              <li>🔍 <strong>Mahalle Karşılaştırma</strong> — 5 konumu yan yana</li>
            </ul>
          </div>
          <div style="text-align:center;margin-top:20px">
            <a href="${CWS_URL}" style="display:inline-block;background:#7c3aed;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none">
              AI Hub'ı Aç →
            </a>
          </div>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0">
          <p style="margin:0;font-size:11px;color:#94a3b8">
            Cadastrum · <a href="${SITE}/hesap/bildirimler" style="color:#64748b">Abonelikten çık</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function d7Html(ad: string | null): string {
  const isim = ad ?? "Değerli Kullanıcı";
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;color:#1B2A4A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden">
        <tr><td style="background:linear-gradient(135deg,#C9A86A 0%,#d2b375 100%);padding:24px 32px">
          <div style="color:#1B2A4A;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700">Cadastrum Pro</div>
          <div style="color:#1B2A4A;font-size:20px;font-weight:700;margin-top:6px">1 haftadır Cadastrum'dasınız — Pro'ya geç</div>
        </td></tr>
        <tr><td style="padding:24px 32px">
          <p style="font-size:15px;color:#1B2A4A;margin:0">Merhaba ${isim},</p>
          <p style="font-size:14px;color:#475569;line-height:1.6;margin:12px 0">
            1 haftadır Cadastrum kullanıyorsunuz. Free plandaki tüm kısıtlamalar <strong>Pro ile kalkar:</strong>
          </p>
          <div style="background:#fef9f0;border:1px solid #C9A86A;border-radius:8px;padding:16px;margin:16px 0">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;color:#475569">
              <div>✅ AI fiyat tahmini</div>
              <div>✅ Pro PDF rapor (15-20 sayfa)</div>
              <div>✅ Portföy yönetimi</div>
              <div>✅ İmar değişim radari</div>
              <div>✅ Sentinel-2 NDVI analizi</div>
              <div>✅ Sınırsız favori &amp; tarama</div>
            </div>
          </div>
          <div style="text-align:center;background:#fef9f0;border-radius:8px;padding:16px;margin:16px 0">
            <div style="font-size:28px;font-weight:700;color:#1B2A4A">₺89<span style="font-size:14px;font-weight:400;color:#64748b"> / ay</span></div>
            <div style="font-size:12px;color:#64748b;margin-top:4px">Yıllık: ₺890 (2 ay bedava · ₺74/ay)</div>
          </div>
          <div style="text-align:center;margin-top:20px">
            <a href="${SITE}/fiyat?plan=pro&source=drip-d7&utm_campaign=drip" style="display:inline-block;background:#C9A86A;color:#1B2A4A;font-size:14px;font-weight:700;padding:12px 32px;border-radius:8px;text-decoration:none">
              Pro'ya Geç →
            </a>
          </div>
          <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:12px">
            İstediğiniz an iptal · Tüm özellikler anında aktif
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0">
          <p style="margin:0;font-size:11px;color:#94a3b8">
            Cadastrum · <a href="${SITE}/hesap/bildirimler" style="color:#64748b">Abonelikten çık</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── D+3 şablonu güncelleme (yeni özellikler) ────────────────────────────────

function d3HtmlYeni(ad: string | null): string {
  const isim = ad ?? "Değerli Kullanıcı";
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;color:#1B2A4A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden">
        <tr><td style="background:linear-gradient(135deg,#065f46 0%,#047857 100%);padding:24px 32px">
          <div style="color:#a7f3d0;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Cadastrum · Veri Zekası</div>
          <div style="color:#fff;font-size:20px;font-weight:700;margin-top:6px">🛰️ Tarlanızın uydu analizi hazır</div>
        </td></tr>
        <tr><td style="padding:24px 32px">
          <p style="font-size:15px;color:#1B2A4A;margin:0">Merhaba ${isim},</p>
          <p style="font-size:14px;color:#475569;line-height:1.6;margin:12px 0">
            Cadastrum'da yeni neler var? Son güncellemelerle eklenti daha da güçlendi:
          </p>
          <div style="border-left:3px solid #10b981;padding-left:16px;margin:16px 0">
            <div style="font-size:13px;font-weight:700;color:#065f46;margin-bottom:4px">🛰️ Sentinel-2 NDVI Analizi (YENİ)</div>
            <div style="font-size:13px;color:#475569;line-height:1.6">ESA Copernicus uydu görüntüsünden tarla verimliliği ölçümü. NDVI değeri &gt; 0.4 = aktif tarım alanı. Pro özellik.</div>
          </div>
          <div style="border-left:3px solid #7c3aed;padding-left:16px;margin:16px 0">
            <div style="font-size:13px;font-weight:700;color:#5b21b6;margin-bottom:4px">📊 Portföy Dashboard (YENİ)</div>
            <div style="font-size:13px;color:#475569;line-height:1.6">Favori parsellerinizin toplam tahmini değeri, delta takip ve imar değişikliği uyarıları tek ekranda.</div>
          </div>
          <div style="border-left:3px solid #d97706;padding-left:16px;margin:16px 0">
            <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:4px">📄 Pro PDF Rapor (İyileştirildi)</div>
            <div style="font-size:13px;color:#475569;line-height:1.6">15-20 sayfa: kapak sayfası, AI analizi, emsal tablo, fizibilite ve yasal bölüm. Yatırımcıya sunum kalitesi.</div>
          </div>
          <div style="text-align:center;margin-top:20px">
            <a href="${CWS_URL}" style="display:inline-block;background:#1B2A4A;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none">
              Eklentiyi Güncelle ve Dene →
            </a>
          </div>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0">
          <p style="margin:0;font-size:11px;color:#94a3b8">
            Cadastrum · <a href="${SITE}/hesap/bildirimler" style="color:#64748b">Abonelikten çık</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── D+6 trial hatırlatma şablonu ────────────────────────────────────────────

function d6Html(ad: string | null): string {
  const isim = ad ?? "Değerli Kullanıcı";
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;color:#1B2A4A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden">
        <tr><td style="background:linear-gradient(135deg,#dc2626 0%,#ef4444 100%);padding:24px 32px">
          <div style="color:#fecaca;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Cadastrum · Hatırlatma</div>
          <div style="color:#fff;font-size:20px;font-weight:700;margin-top:6px">⏰ Yarın kısıtlamalar devreye giriyor</div>
        </td></tr>
        <tr><td style="padding:24px 32px">
          <p style="font-size:15px;color:#1B2A4A;margin:0">Merhaba ${isim},</p>
          <p style="font-size:14px;color:#475569;line-height:1.6;margin:12px 0">
            Bugün Free planın 7. günü. <strong>Yarından itibaren günlük AI analiz limiti ve PDF rapor kısıtlaması aktif olacak.</strong>
          </p>
          <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin:16px 0">
            <div style="font-size:13px;font-weight:700;color:#991b1b;margin-bottom:8px">Pro ile yarından itibaren de sınırsız:</div>
            <div style="font-size:13px;color:#475569;line-height:1.8">
              ✅ Sınırsız AI fiyat tahmini<br>
              ✅ Pro PDF rapor (15-20 sayfa)<br>
              ✅ Portföy dashboard + imar radari<br>
              ✅ Sentinel-2 uydu NDVI analizi
            </div>
          </div>
          <div style="text-align:center;background:#fff8f0;border-radius:8px;padding:12px;margin:16px 0">
            <div style="font-size:22px;font-weight:800;color:#1B2A4A">₺89 / ay</div>
            <div style="font-size:12px;color:#64748b">veya ₺890/yıl (2 ay bedava)</div>
          </div>
          <div style="text-align:center;margin-top:16px">
            <a href="${SITE}/fiyat?plan=pro&source=drip-d6&utm_campaign=trial-expiry" style="display:inline-block;background:#dc2626;color:#fff;font-size:14px;font-weight:700;padding:12px 32px;border-radius:8px;text-decoration:none">
              Şimdi Pro'ya Geç →
            </a>
          </div>
          <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:12px">
            İstediğiniz an iptal · Kart bilgisi girmeden önce fiyat sayfasını inceleyin
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0">
          <p style="margin:0;font-size:11px;color:#94a3b8">
            Cadastrum · <a href="${SITE}/hesap/bildirimler" style="color:#64748b">Abonelikten çık</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── D+14 win-back şablonu ────────────────────────────────────────────────────

function d14Html(ad: string | null): string {
  const isim = ad ?? "Değerli Kullanıcı";
  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;color:#1B2A4A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden">
        <tr><td style="background:linear-gradient(135deg,#1e1b4b 0%,#3730a3 100%);padding:24px 32px">
          <div style="color:#c7d2fe;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Cadastrum · Son Fırsat</div>
          <div style="color:#fff;font-size:20px;font-weight:700;margin-top:6px">2 haftadır beklediniz — hazır olduğunuzda buradayız</div>
        </td></tr>
        <tr><td style="padding:24px 32px">
          <p style="font-size:15px;color:#1B2A4A;margin:0">Merhaba ${isim},</p>
          <p style="font-size:14px;color:#475569;line-height:1.6;margin:12px 0">
            2 haftadır Free planda Cadastrum'ı kullanıyorsunuz. Henüz Pro'ya geçmediyseniz,
            belki doğru zamanlama olmadı. Şimdi hatırlatmak istedik:
          </p>
          <div style="background:#eef2ff;border-radius:8px;padding:16px;margin:16px 0">
            <div style="font-size:14px;color:#312e81;font-weight:600;margin-bottom:10px">Pro kullanıcılarımız ne diyor?</div>
            <div style="background:#fff;border-radius:6px;padding:12px;margin-bottom:8px;border-left:3px solid #6366f1">
              <div style="font-size:13px;color:#374151;line-height:1.5;font-style:italic">"Beykoz'da 5 tarla gördüm, Cadastrum'un risk analizi olmasa hangisini almamam gerektiğini bilemezdim."</div>
              <div style="font-size:11px;color:#6b7280;margin-top:6px">— Pro kullanıcı, İstanbul</div>
            </div>
            <div style="background:#fff;border-radius:6px;padding:12px;border-left:3px solid #6366f1">
              <div style="font-size:13px;color:#374151;line-height:1.5;font-style:italic">"Portföy dashboard'u ile 12 parseli tek ekranda takip ediyorum. Excel'den vazgeçtim."</div>
              <div style="font-size:11px;color:#6b7280;margin-top:6px">— Pro kullanıcı, Ankara</div>
            </div>
          </div>
          <div style="text-align:center;margin-top:20px">
            <a href="${SITE}/fiyat?plan=pro&source=drip-d14&utm_campaign=winback" style="display:inline-block;background:#3730a3;color:#fff;font-size:14px;font-weight:700;padding:12px 32px;border-radius:8px;text-decoration:none">
              Pro'yu Keşfet — ₺89/ay →
            </a>
          </div>
          <p style="font-size:12px;color:#475569;text-align:center;margin-top:12px;line-height:1.5">
            Bu son drip emailimiz. Pro'ya geçmek için acele etmenize gerek yok —<br>
            istediğiniz zaman <a href="${SITE}/fiyat" style="color:#3730a3">cadastrum.com.tr/fiyat</a>'tan geçebilirsiniz.
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0">
          <p style="margin:0;font-size:11px;color:#94a3b8">
            Cadastrum · <a href="${SITE}/hesap/bildirimler" style="color:#64748b">Abonelikten çık</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── Drip sequence tanımları ───────────────────────────────────────────────────
// sadeceFree: true ise Pro/Kurumsal kullanıcılara gönderilmez

interface DripTanim {
  gun: number;
  kod: string;
  konu: string;
  htmlFn: (ad: string | null) => string;
  metinFn: (ad: string | null) => string;
  /** true: sadece Free tier kullanıcılara gönder */
  sadeceFree?: boolean;
}

const DRIPLAR: DripTanim[] = [
  {
    gun: 1,
    kod: "d1-onboarding",
    konu: "Cadastrum'da ilk adım — 1 dakikada parsel analizi",
    htmlFn: d1Html,
    metinFn: (ad) =>
      `Merhaba ${ad ?? ""}!\n\nCadastrum'a hoş geldiniz. İlk analiziniz için Chrome eklentisini yükleyin:\n${CWS_URL}\n\n---\nCadastrum · cadastrum.com.tr`,
  },
  {
    gun: 3,
    kod: "d3-yenilik",
    konu: "🛰️ Yeni: Uydu NDVI analizi + Portföy dashboard",
    htmlFn: d3HtmlYeni,
    metinFn: (ad) =>
      `Merhaba ${ad ?? ""}!\n\nCadastrum'da yeni özellikler: Sentinel-2 uydu NDVI analizi (tarla verimliliği), Portföy dashboard ve geliştirilmiş PDF rapor.\n\n${CWS_URL}\n\n---\nCadastrum · cadastrum.com.tr`,
  },
  {
    gun: 6,
    kod: "d6-trial-bitis",
    konu: "⏰ Yarın Free plan kısıtlamaları başlıyor",
    htmlFn: d6Html,
    metinFn: (ad) =>
      `Merhaba ${ad ?? ""}!\n\nBugün 6. gün. Yarından itibaren AI analiz limiti ve PDF kısıtlaması aktif olacak. Pro ile devam etmek için:\n${SITE}/fiyat?plan=pro&source=drip-d6\n\n₺89/ay · İstediğiniz an iptal\n\n---\nCadastrum · cadastrum.com.tr`,
    sadeceFree: true,
  },
  {
    gun: 7,
    kod: "d7-pro",
    konu: "1 hafta oldu — Pro'ya geçin, sınırsız kullanın",
    htmlFn: d7Html,
    metinFn: (ad) =>
      `Merhaba ${ad ?? ""}!\n\n1 haftadır Cadastrum kullanıyorsunuz. Pro ile sınırsız AI fiyat, PDF rapor, portföy ve uydu analizi:\n${SITE}/fiyat?plan=pro&source=drip-d7\n\n₺89/ay · Yıllık ₺890\n\n---\nCadastrum · cadastrum.com.tr`,
    sadeceFree: true,
  },
  {
    gun: 14,
    kod: "d14-winback",
    konu: "2 hafta oldu — hazır olduğunuzda buradayız",
    htmlFn: d14Html,
    metinFn: (ad) =>
      `Merhaba ${ad ?? ""}!\n\n2 haftadır Free planda Cadastrum'ı kullanıyorsunuz. Pro'ya geçmek için acele etmenize gerek yok. Hazır olduğunuzda:\n${SITE}/fiyat?plan=pro&source=drip-d14\n\n---\nCadastrum · cadastrum.com.tr`,
    sadeceFree: true,
  },
];

// ── Ana cron fonksiyonu ───────────────────────────────────────────────────────

/**
 * dripEmailCalistir — günlük cron ("0 10 * * *") içinden çağrılır.
 * Her drip için bekleyen kullanıcıları tarar ve email gönderir.
 */
export async function dripEmailCalistir(env: Env): Promise<{
  gonderilen: number;
  atlanan: number;
  hatali: number;
}> {
  let gonderilen = 0;
  let atlanan = 0;
  let hatali = 0;

  const simdi = Date.now();

  for (const drip of DRIPLAR) {
    const gecmesiGereken = drip.gun * 24 * 60 * 60 * 1000;
    // Kayıt tarihi X gün önce olan ve bu drip'i almamış kullanıcılar
    const sinir = simdi - gecmesiGereken;
    const altSinir = sinir - 24 * 60 * 60 * 1000; // 24 saatlik pencere

    // sadeceFree: Pro/Kurumsal kullanıcılar bu drip'i almaz
    const tierFiltre = drip.sadeceFree ? "AND k.tier = 'free'" : "";

    const kullanicilar = await env.DB.prepare(`
      SELECT k.id, k.email, k.ad, k.tier
      FROM kullanicilar k
      WHERE k.olusturuldu BETWEEN ? AND ?
        AND k.email_dogrulandi = 1
        AND (k.drip_kapali IS NULL OR k.drip_kapali = 0)
        ${tierFiltre}
        AND NOT EXISTS (
          SELECT 1 FROM drip_email_gonderi d
          WHERE d.kullanici_id = k.id AND d.drip_kodu = ?
        )
      LIMIT 200
    `).bind(altSinir, sinir, drip.kod).all<{
      id: number;
      email: string;
      ad: string | null;
      tier: string;
    }>();

    for (const kullanici of kullanicilar.results ?? []) {
      try {
        const html = drip.htmlFn(kullanici.ad);
        const metin = drip.metinFn(kullanici.ad);

        const basarili = await emailGonder(env, kullanici.email, drip.konu, html, metin);

        if (basarili) {
          await env.DB.prepare(`
            INSERT INTO drip_email_gonderi (kullanici_id, drip_kodu, gonderi_zamani)
            VALUES (?, ?, ?)
          `).bind(kullanici.id, drip.kod, simdi).run();

          gonderilen++;
        } else {
          hatali++;
        }
      } catch (e) {
        console.error("[drip] hata:", kullanici.id, drip.kod, e);
        hatali++;
      }
    }
  }

  return { gonderilen, atlanan, hatali };
}
