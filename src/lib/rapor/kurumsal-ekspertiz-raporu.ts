/**
 * Kurumsal SPK / UDES Uyumlu Gayrimenkul Ekspertiz & Yatırım Dosyası Üretici.
 *
 * Emlak ofislerinin müşterilerine, fon yöneticilerinin yatırım komitelerine
 * sunabileceği, tek tıkla yazdırılabilir veya WhatsApp/e-posta ile
 * paylaşılabilir kurumsal HTML/PDF raporu üretir.
 */

import type { BulunanFirsatKart } from "../ajanlar/kullanici-firsat-tarayici";
import type { VisionAnalizSonucu } from "../vision/ilan-gorsel-analiz";

export interface KurumsalRaporGirdisi {
  firsat: BulunanFirsatKart;
  visionAnalizi?: VisionAnalizSonucu;
  hazirlayan: {
    unvan: string;
    danismanAdi: string;
    iletisimNo?: string;
  };
}

export class KurumsalEkspertizRaporuUretici {
  /**
   * Tam formatlı, stilize edilmiş ve yazdırılabilir tek sayfa HTML ekspertiz dosyası üretir.
   */
  public htmlRaporUret(girdi: KurumsalRaporGirdisi): string {
    const f = girdi.firsat;
    const ilan = f.ilan;
    const sentez = f.sentez;
    const debate = f.debate;
    const vision = girdi.visionAnalizi;
    const tarih = new Date().toLocaleDateString("tr-TR");
    const raporNo = `CAD-${Math.floor(100000 + Math.random() * 900000)}`;

    return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cadastrum Gayrimenkul Yatırım & Değerleme Raporu - ${raporNo}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.4; font-size: 11px; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
    .brand { font-size: 16px; font-weight: 900; letter-spacing: -0.5px; }
    .report-meta { text-align: right; font-family: monospace; font-size: 9px; color: #64748b; }
    .decision-banner { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
    .decision-title { font-size: 13px; font-weight: 800; color: #166534; text-transform: uppercase; }
    .score-badge { font-family: monospace; font-weight: 700; font-size: 12px; background: #166534; color: #fff; padding: 3px 8px; border-radius: 4px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; }
    .card-title { font-size: 8px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 4px; }
    .card-val { font-family: monospace; font-size: 13px; font-weight: 800; color: #0f172a; }
    .section-title { font-size: 10px; text-transform: uppercase; font-weight: 800; letter-spacing: 0.5px; color: #334155; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
    .table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
    .table th, .table td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; text-align: left; }
    .table th { background: #f8fafc; color: #64748b; font-weight: 600; font-size: 9px; text-transform: uppercase; }
    .actions-box { background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; margin-bottom: 12px; }
    .actions-box ul { padding-left: 16px; }
    .footer { display: flex; justify-content: space-between; font-size: 8px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 12px; }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand">CADASTRUM • YATIRIM İSTİHBARATI</div>
      <div style="font-size: 9px; color: #64748b;">Kurumsal Değerleme & Hukuki Risk Raporu</div>
    </div>
    <div class="report-meta">
      <div>Rapor No: <b>${raporNo}</b></div>
      <div>Tarih: ${tarih}</div>
    </div>
  </div>

  <!-- Karar Banner'ı -->
  <div class="decision-banner">
    <div>
      <div class="decision-title">🟢 ${f.firsatRozeti} — ${f.iskontoYuzde}% PİYASA İSKONTOSU</div>
      <div style="font-size: 9px; color: #15803d; margin-top: 2px;">${debate.uzlasmaOzeti}</div>
    </div>
    <div class="score-badge">SKOR: ${f.efektifSkor}/100</div>
  </div>

  <!-- 3 Sütunlu Metrik Izgarası -->
  <div class="grid-3">
    <div class="card">
      <div class="card-title">Talep Edilen İlan Fiyatı</div>
      <div class="card-val">${ilan.fiyatTL.toLocaleString("tr-TR")} ₺</div>
      <div style="font-size: 9px; color: #64748b; margin-top: 2px;">${(ilan.fiyatTL / ilan.m2).toFixed(0)} ₺/m²</div>
    </div>
    <div class="card">
      <div class="card-title">Cadastrum Piyasa Değeri</div>
      <div class="card-val">${sentez.firsat.tahminiPiyasaDegeriTL.toLocaleString("tr-TR")} ₺</div>
      <div style="font-size: 9px; color: #166534; font-weight: 700; margin-top: 2px;">+${f.potansiyelKarTL.toLocaleString("tr-TR")} ₺ Potansiyel Kâr</div>
    </div>
    <div class="card">
      <div class="card-title">Hukuk & İmar Risk Skoru</div>
      <div class="card-val">${sentez.hukuk.riskSkoru}/100</div>
      <div style="font-size: 9px; color: #64748b; margin-top: 2px;">${sentez.hukuk.tespitEdilenRiskler.length === 0 ? "Temiz Müstakil Tapu" : `${sentez.hukuk.tespitEdilenRiskler.length} Kısıtlama Şerhi`}</div>
    </div>
  </div>

  <!-- Parsel & Konum Künyesi -->
  <div class="section-title">Parsel & İlan Künyesi</div>
  <table class="table">
    <tr>
      <th style="width: 25%;">İl / İlçe / Mahalle</th>
      <td>${ilan.il.toUpperCase()} / ${ilan.ilce.toUpperCase()} ${ilan.mahalle ? `/ ${ilan.mahalle.toUpperCase()}` : ""}</td>
      <th style="width: 25%;">Kategori & Yüzölçümü</th>
      <td>${ilan.kategori.toUpperCase()} • ${ilan.m2.toLocaleString("tr-TR")} m²</td>
    </tr>
    <tr>
      <th>İmar Durumu</th>
      <td>${ilan.imarDurumu ?? "Belirtilmemiş / Araştırılmalı"}</td>
      <th>İlan Başlığı</th>
      <td>${ilan.baslik}</td>
    </tr>
  </table>

  <!-- Vision AI & Fiziksel Kusur Raporu -->
  ${
    vision
      ? `
  <div class="section-title">Vision AI • Fiziksel Kusur & Uydu Analizi</div>
  <table class="table">
    <tr>
      <th style="width: 25%;">Fiili Yol Varlığı</th>
      <td>${vision.fiiliYolDurumu === "asfalt_mevcut" ? "✅ Asfalt Yol Mevcut" : "⚠️ Toprak Yol / Fiilen Açılmamış"}</td>
      <th style="width: 25%;">Zemin Kondisyonu</th>
      <td>${vision.zeminDurumu === "duz_duzenli" ? "✅ Düz & İnşaata Uygun" : "⚠️ Kayalık / Hafriyat Gerekli"}</td>
    </tr>
    <tr>
      <th>Kusur Tespiti</th>
      <td colspan="3">${vision.analizOzeti}</td>
    </tr>
  </table>
  `
      : ""
  }

  <!-- Öncelikli Yatırımcı Kontrol Listesi -->
  <div class="section-title">Yatırımcı Öncelikli Aksiyon Listesi</div>
  <div class="actions-box">
    <ul>
      ${
        debate.aksiyonMaddeleri.length > 0
          ? debate.aksiyonMaddeleri.map((m) => `<li><b>•</b> ${m}</li>`).join("")
          : "<li>• Satıcı ile iletişime geçip kapora öncesi ada/parsel teyidi yapın.</li><li>• Kadastro sınır tespit krokisi talep edin.</li>"
      }
    </ul>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div>Raporu Düzenleyen: <b>${girdi.hazirlayan.danismanAdi}</b> (${girdi.hazirlayan.unvan}) ${girdi.hazirlayan.iletisimNo ? `• Tel: ${girdi.hazirlayan.iletisimNo}` : ""}</div>
    <div>Cadastrum AI Valuation Engine v2.0 • Doğrulama Kodu: ${raporNo}</div>
  </div>

</body>
</html>`;
  }
}