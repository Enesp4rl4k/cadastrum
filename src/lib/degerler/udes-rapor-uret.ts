/**
 * UDES Uyumlu Değerleme Raporu Üreticisi.
 *
 * Türkiye UDES zorunlu bölümleri:
 *   1. Rapor Başlığı / Referans
 *   2. Taşınmaz Tanımı
 *   3. Piyasa Analizi
 *   4. Emsal Karşılaştırma Tablosu
 *   5. Değerleme Yaklaşımları
 *   6. Uzlaştırma ve Sonuç
 *   7. Sınırlayıcı Koşullar
 */

import type { Parsel } from "../../types/tkgm";
import type { DegerlemeKarari } from "./degerleme-ajani";
import type { GelirYaklasimSonucu } from "./gelir-motoru";
import type { MaliyetYaklasimSonucu } from "./maliyet-motoru";
import type { FiyatTahmini } from "../fiyat-tahmin";

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface UdesRaporGirdisi {
  referansNo?: string;
  degerlenmeTarihi: string;
  amac: string;
  musteriAdi?: string;
  uzmanAdi?: string;
  parsel: Parsel;
  karsilastirmali: FiyatTahmini;
  gelir?: GelirYaklasimSonucu | null;
  maliyet?: MaliyetYaklasimSonucu | null;
  karar: DegerlemeKarari;
}

export interface UdesRapor {
  referansNo: string;
  olusturmaTarihi: string;
  degerlenmeTarihi: string;
  amac: string;
  musteriAdi: string;
  uzmanAdi: string;
  htmlIcerik: string;
  ozet: {
    sonucDegerTL: number;
    sonucDegerPerM2: number;
    altDegerTL: number;
    ustDegerTL: number;
    kullanilanYaklasimSayisi: number;
    guvenDuzeyi: string;
    guvenSkoru: number;
  };
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function fmtTL(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} Milyar ₺`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)} Milyon ₺`;
  return `${n.toLocaleString("tr-TR")} ₺`;
}

function fmtm2(n: number): string {
  return `${n.toLocaleString("tr-TR")} ₺/m²`;
}

function tarih(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("tr-TR", {
      day: "2-digit", month: "long", year: "numeric",
    });
  } catch { return iso; }
}

function refUret(): string {
  const n = new Date();
  return `CAD-${n.getFullYear()}${String(n.getMonth()+1).padStart(2,"0")}${String(n.getDate()).padStart(2,"0")}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `body{font-family:Arial,sans-serif;font-size:10pt;color:#1e293b;margin:0;padding:0}
.sayfa{max-width:210mm;margin:0 auto;padding:20mm 18mm;background:#fff}
h1{font-size:16pt;color:#0f172a;font-weight:700;margin:0 0 4px}
h2{font-size:12pt;color:#0f172a;font-weight:600;border-bottom:2px solid #3b82f6;padding-bottom:4px;margin:24px 0 12px}
h3{font-size:10pt;font-weight:600;color:#334155;margin:16px 0 8px}
p{margin:6px 0;line-height:1.6}
table{width:100%;border-collapse:collapse;font-size:9pt;margin:12px 0}
th{background:#1e3a5f;color:#fff;padding:7px 10px;text-align:left;font-weight:600}
td{padding:6px 10px;border-bottom:1px solid #e2e8f0}
tr:nth-child(even) td{background:#f8fafc}
.hdr{background:#1e3a5f;color:#fff;padding:20px 24px;margin:0 -18mm 24px}
.hdr h1{color:#fff}.hdr p{color:#93c5fd;font-size:9pt;margin:2px 0}
.sonuc{background:#f0f9ff;border:2px solid #3b82f6;border-radius:8px;padding:16px 20px;margin:16px 0}
.sonuc .b{font-size:22pt;font-weight:700;color:#1d4ed8}
.sonuc .s{font-size:10pt;color:#64748b}
.uyari{background:#fff7ed;border-left:4px solid #f59e0b;padding:10px 14px;margin:10px 0;font-size:9pt;color:#92400e}
.hata{background:#fef2f2;border-left:4px solid #ef4444;padding:10px 14px;margin:10px 0;font-size:9pt;color:#991b1b}
.bilgi{background:#f0fdf4;border-left:4px solid #22c55e;padding:10px 14px;margin:10px 0;font-size:9pt;color:#166534}
.ftr{border-top:1px solid #e2e8f0;margin-top:32px;padding-top:12px;font-size:8pt;color:#94a3b8}
pre{font-family:monospace;font-size:8pt;background:#f8fafc;padding:12px;border-radius:4px;white-space:pre-wrap}
@media print{.sayfa{padding:15mm}}`;

// ─── Bölümler ─────────────────────────────────────────────────────────────────

function b1(g: UdesRaporGirdisi, ref: string): string {
  const p = g.parsel;
  return `<div class="hdr"><h1>TAŞINMAZ DEĞERLEME RAPORU</h1>
  <p>Rapor No: <strong>${ref}</strong> &nbsp;|&nbsp; Değerleme Tarihi: <strong>${tarih(g.degerlenmeTarihi)}</strong></p>
  <p>Cadastrum Değerleme Sistemi &nbsp;|&nbsp; UDES Uyumlu</p></div>
  <table>
    <tr><th colspan="4">RAPOR KİMLİK BİLGİLERİ</th></tr>
    <tr><td><strong>İl / İlçe / Mahalle</strong></td><td>${p.ilAd??"-"} / ${p.ilceAd??"-"} / ${p.mahalleAd??"-"}</td>
        <td><strong>Ada / Parsel</strong></td><td>${p.adaNo} / ${p.parselNo}</td></tr>
    <tr><td><strong>Değerleme Amacı</strong></td><td>${g.amac}</td>
        <td><strong>Müşteri</strong></td><td>${g.musteriAdi??"—"}</td></tr>
    <tr><td><strong>Uzman</strong></td><td>${g.uzmanAdi??"Cadastrum AI"}</td>
        <td><strong>Rapor Tarihi</strong></td><td>${tarih(new Date().toISOString().split("T")[0]!)}</td></tr>
  </table>`;
}

function b2(p: Parsel): string {
  return `<h2>1. TAŞINMAZIN TANIMI</h2>
  <table>
    <tr><th>Özellik</th><th>Değer</th><th>Özellik</th><th>Değer</th></tr>
    <tr><td>İl</td><td>${p.ilAd??"-"}</td><td>İlçe</td><td>${p.ilceAd??"-"}</td></tr>
    <tr><td>Mahalle</td><td>${p.mahalleAd??"-"}</td><td>Ada No</td><td>${p.adaNo}</td></tr>
    <tr><td>Parsel No</td><td>${p.parselNo}</td><td>Alan</td><td>${p.alan!=null?p.alan.toLocaleString("tr-TR")+" m²":"—"}</td></tr>
    <tr><td>Nitelik</td><td>${p.nitelik??"—"}</td><td>Mahalle Kodu</td><td>${p.mahalleKodu??"—"}</td></tr>
  </table>`;
}

function b3(k: FiyatTahmini): string {
  const e = k.emsalOzeti;
  return `<h2>2. PİYASA ANALİZİ</h2>
  <p>Değerleme tarihi itibarıyla bölge piyasası incelenmiş, emsal satış verileri kalifikasyon testinden geçirilmiştir.</p>
  ${e ? `<table>
    <tr><th colspan="2">EMSAL HAVUZU ÖZETİ</th></tr>
    <tr><td>Kalifikasyonu Geçen Emsal</td><td>${e.secilenAdet}</td></tr>
    <tr><td>— Mahalle / İlçe</td><td>${e.mahalleAdet} / ${e.ilceAdet}</td></tr>
    <tr><td>Aykırı Değer Çıkarılan</td><td>${e.outlierAdet??0}</td></tr>
    <tr><td>Ağırlıklı Ort. Asking Fiyat</td><td>${fmtm2(e.weightedAsking)}</td></tr>
    <tr><td>Ort. Benzerlik Skoru</td><td>%${Math.round((e.ortalamaBenzerlik??0)*100)}</td></tr>
  </table>` : `<p class="uyari">Emsal verisi bulunamadı — statik baseline kullanıldı.</p>`}`;
}

function b4(k: FiyatTahmini): string {
  const liste = k.emsalListesi;
  if (!liste?.length) {
    return `<h2>3. EMSAL KARŞILAŞTIRMA TABLOSU</h2>
    <p class="uyari">Karşılaştırılabilir emsal tespit edilememiştir. Değerleme istatistiksel baseline ile yapılmıştır.</p>`;
  }
  const s = liste.slice(0,10).map((e,i) =>
    `<tr><td>${i+1}</td><td>${fmtm2(e.fiyatPerM2)}</td><td>${e.alan.toLocaleString("tr-TR")} m²</td><td>${e.tazelikGun} gün</td><td>%${Math.round(e.benzerlik*100)}</td></tr>`
  ).join("");
  return `<h2>3. EMSAL KARŞILAŞTIRMA TABLOSU</h2>
  <p>Hisseli, icra ve anakronik ilanlar değerlendirme dışı tutulmuştur.</p>
  <table>
    <tr><th>#</th><th>Birim Fiyat</th><th>Alan</th><th>Yaş (gün)</th><th>Benzerlik</th></tr>
    ${s}
  </table>
  <p style="font-size:8pt;color:#64748b">Düzeltmeler: zaman, alan, segment uyumu dahil.</p>`;
}

function b5(karar: DegerlemeKarari, gelir?: GelirYaklasimSonucu|null, maliyet?: MaliyetYaklasimSonucu|null): string {
  const s = karar.yaklasimllar.map((y) =>
    `<tr><td>${y.ad}</td><td>${fmtm2(y.degerPerM2)}</td><td>%${Math.round(y.agirlik*100)}</td>
    <td>${y.guven==="yuksek"?"✅ Yüksek":y.guven==="orta"?"⚠️ Orta":"🔴 Düşük"}</td>
    <td style="font-size:8pt;color:#64748b">${y.gerekce}</td></tr>`
  ).join("");
  return `<h2>4. DEĞERLEME YAKLAŞIMLARI</h2>
  <h3>4.1 Karşılaştırmalı Satışlar Yaklaşımı</h3>
  <p>Emsal satışlar analiz edilmiş; benzerlik, alan, segment ve imar düzeltmeleri uygulanmıştır.</p>
  ${gelir?`<h3>4.2 Gelir Yaklaşımı</h3><p>${gelir.gerekce}</p>`:""}
  ${maliyet?`<h3>4.3 Maliyet Yaklaşımı</h3><p>${maliyet.gerekce}</p>`:""}
  <h3>Yaklaşım Sonuçları</h3>
  <table>
    <tr><th>Yaklaşım</th><th>Birim Değer</th><th>Ağırlık</th><th>Güven</th><th>Not</th></tr>${s}
  </table>
  <h3>Uyumsuzluk Analizi</h3>
  <p class="${karar.uyumsuzluk.kategori==="dusuk"?"bilgi":karar.uyumsuzluk.kategori==="orta"?"uyari":"hata"}">
    ${karar.uyumsuzluk.aciklama}${karar.uyumsuzluk.maksSapmaYuzde>0?` (${karar.uyumsuzluk.sapamaYaklasimlari})`:""}
  </p>`;
}

function b6(karar: DegerlemeKarari, alan: number): string {
  return `<h2>5. UZLAŞTIRMA VE SONUÇ DEĞER</h2>
  <pre>${karar.metodolojGerekce}</pre>
  <div class="sonuc">
    <div class="s">SONUÇ DEĞER</div>
    <div class="b">${fmtTL(karar.toplamBeklenen)}</div>
    <div class="s">${fmtm2(karar.beklenenPerM2)} &nbsp;|&nbsp; Alan: ${alan.toLocaleString("tr-TR")} m²</div>
    <div style="margin-top:8px;font-size:9pt;color:#1e3a5f">
      Değer Aralığı: <strong>${fmtTL(karar.toplamAlt)}</strong> — <strong>${fmtTL(karar.toplamUst)}</strong>
      &nbsp;|&nbsp; Güven: <strong>${karar.guvenSkoru}/100</strong> (${karar.guvenDuzeyi})
    </div>
  </div>
  ${karar.kirmiziBayraklar.length>0?
    `<h3>⚠️ Dikkat Edilmesi Gereken Hususlar</h3>${karar.kirmiziBayraklar.map((b)=>`<p class="uyari">⚠️ ${b}</p>`).join("")}`:""}`;
}

function b7(): string {
  return `<h2>6. SINIRLAYI KOŞULLAR VE BEYAN</h2>
  <ol style="font-size:9pt;line-height:1.8">
    <li>Değerleme fiziksel inceleme olmaksızın mevcut kayıt ve veriler üzerinden yapılmıştır.</li>
    <li>Emsal veriler ilan platformlarından derlenmiştir; gerçek satış bedeli ile fark olabilir.</li>
    <li>Tespit edilemeyen hukuki kısıtlamalar (şerh, ipotek) değer üzerinde önemli etki yapabilir.</li>
    <li>Bu rapor gösterge niteliğindedir. Resmi işlemler için SPK lisanslı uzman onayı gerekir.</li>
    <li>Yüksek enflasyon ortamında sonuçlar kısa sürede güncelliğini yitirebilir.</li>
  </ol>
  <p style="font-size:8pt;color:#64748b;margin-top:16px"><em>Cadastrum değerleme sistemi tarafından
  UDES rehberi gözetilerek hazırlanmıştır. Bilgilendirme amaçlıdır.</em></p>`;
}

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

export function udesRaporUret(girdi: UdesRaporGirdisi): UdesRapor {
  const ref = girdi.referansNo || refUret();
  const alan = girdi.parsel.alan ?? 0;

  const govde = [
    b1(girdi, ref), b2(girdi.parsel), b3(girdi.karsilastirmali),
    b4(girdi.karsilastirmali), b5(girdi.karar, girdi.gelir, girdi.maliyet),
    b6(girdi.karar, alan), b7(),
    `<div class="ftr"><p>Rapor No: ${ref} &nbsp;|&nbsp; ${new Date().toLocaleString("tr-TR")} &nbsp;|&nbsp; Cadastrum</p></div>`,
  ].join("\n");

  const htmlIcerik = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8">
<title>Değerleme Raporu — ${ref}</title>
<style>${CSS}</style></head>
<body><div class="sayfa">${govde}</div></body></html>`;

  return {
    referansNo: ref,
    olusturmaTarihi: new Date().toISOString(),
    degerlenmeTarihi: girdi.degerlenmeTarihi,
    amac: girdi.amac,
    musteriAdi: girdi.musteriAdi ?? "—",
    uzmanAdi: girdi.uzmanAdi ?? "Cadastrum AI Sistemi",
    htmlIcerik,
    ozet: {
      sonucDegerTL:             girdi.karar.toplamBeklenen,
      sonucDegerPerM2:          girdi.karar.beklenenPerM2,
      altDegerTL:               girdi.karar.toplamAlt,
      ustDegerTL:               girdi.karar.toplamUst,
      kullanilanYaklasimSayisi: girdi.karar.kullanilanYaklasimSayisi,
      guvenDuzeyi:              girdi.karar.guvenDuzeyi,
      guvenSkoru:               girdi.karar.guvenSkoru,
    },
  };
}
