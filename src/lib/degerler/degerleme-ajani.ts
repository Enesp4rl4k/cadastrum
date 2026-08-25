/**
 * Değerleme Ajanı — SPL Değerleme Uzmanı Orkestratörü.
 *
 * Bu modül 3 değerleme yaklaşımını koordine eder:
 *   1. Karşılaştırmalı Satışlar (Sales Comparison Approach)
 *   2. Gelir Yaklaşımı          (Income Approach)
 *   3. Maliyet Yaklaşımı        (Cost Approach)
 *
 * UDES Standardı (Bölüm 6 — Değerleme Yaklaşımları):
 *   "Değerleme uzmanı mümkün olduğu her durumda birden fazla yaklaşım
 *    kullanmalı; yaklaşımlar arasındaki farkları açıklayarak en güvenilir
 *    sonuca ulaşan ağırlıklandırma yapmalıdır."
 *
 * Ajan akışı:
 *   1. Her yaklaşımı bağımsız hesapla
 *   2. Yaklaşımlar arası uyumsuzluk analizi (sapma < %15 / %15-30 / >%30)
 *   3. Güvenilirlik tabanlı ağırlık belirleme
 *   4. Ağırlıklı ortalama değer
 *   5. AI destekli gerekçe üretimi (opsiyonel)
 *   6. Değerleme kararı
 *
 * Kırmızı bayraklar (otomatik):
 *   - Yaklaşımlar arası >%30 sapma → uzman incelemesi gerekebilir
 *   - Emsal sayısı < 3 → karşılaştırmalı yaklaşım zayıf
 *   - Sadece 1 yaklaşım çalıştı → değerleme güveni düşük
 */

import type { FiyatTahmini } from "../fiyat-tahmin";
import type { GelirYaklasimSonucu } from "./gelir-motoru";
import type { MaliyetYaklasimSonucu } from "./maliyet-motoru";
import { gelirYaklasimUygunMu } from "./gelir-motoru";
import { maliyetYaklasimUygunMu } from "./maliyet-motoru";
import type { YapiVerisi } from "./maliyet-motoru";

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface DegerlemeAjaniGirdisi {
  /** Karşılaştırmalı yaklaşım sonucu (heuristic motor çıktısı) */
  karsilastirmali: FiyatTahmini;
  /** Gelir yaklaşımı sonucu (opsiyonel) */
  gelir?: GelirYaklasimSonucu | null;
  /** Maliyet yaklaşımı sonucu (opsiyonel) */
  maliyet?: MaliyetYaklasimSonucu | null;
  /** Yapı bilgisi (maliyet yaklaşımı için) */
  yapi?: YapiVerisi;
  /** Gelir kategorisi */
  gelirKategorisi?: import("./gelir-motoru").GelirKategorisi;
  /** Parsel alanı m² */
  arsaAlanM2: number;
}

export interface YaklasimOzeti {
  ad: string;
  degerPerM2: number;
  toplam: number;
  agirlik: number;
  guven: "yuksek" | "orta" | "dusuk";
  gerekce: string;
  sinirlar: string[];
}

export interface UyumsuzlukAnalizi {
  /** Yaklaşımlar arası maksimum sapma (%) */
  maksSapmaYuzde: number;
  /** Uyumsuzluk kategorisi */
  kategori: "dusuk" | "orta" | "yuksek";
  /** Hangi iki yaklaşım arasında */
  sapamaYaklasimlari: string;
  /** Açıklama */
  aciklama: string;
  /** Uzman incelemesi gerekiyor mu? */
  uzmanIncelemeGerekli: boolean;
}

export interface DegerlemeKarari {
  // ─── Yaklaşım sonuçları ──────────────────────────────────────────────────
  yaklasimllar: YaklasimOzeti[];
  uyumsuzluk: UyumsuzlukAnalizi;

  // ─── Ağırlıklandırma ─────────────────────────────────────────────────────
  /** Uygulanan ağırlıklar */
  agirliklar: {
    karsilastirmali: number;
    gelir: number;
    maliyet: number;
  };

  // ─── Nihai değer ─────────────────────────────────────────────────────────
  /** Ağırlıklı ortalama TL/m² */
  beklenenPerM2: number;
  /** Alt bant TL/m² */
  altPerM2: number;
  /** Üst bant TL/m² */
  ustPerM2: number;
  /** Toplam değer TL */
  toplamBeklenen: number;
  toplamAlt: number;
  toplamUst: number;

  // ─── Değerlendirme ───────────────────────────────────────────────────────
  /** Genel güven düzeyi */
  guvenDuzeyi: "yuksek" | "orta" | "dusuk";
  /** Güven skoru 0-100 */
  guvenSkoru: number;
  /** Kaç yaklaşım kullanıldı */
  kullanilanYaklasimSayisi: number;
  /** Kırmızı bayraklar */
  kirmiziBayraklar: string[];
  /** Metodoloji gerekçesi (UDES formatı) */
  metodolojGerekce: string;
}

// ─── Uyumsuzluk analizi ───────────────────────────────────────────────────────

function uyumsuzlukAnalizYap(
  degerler: Array<{ ad: string; degerPerM2: number }>,
): UyumsuzlukAnalizi {
  if (degerler.length < 2) {
    return {
      maksSapmaYuzde: 0,
      kategori: "dusuk",
      sapamaYaklasimlari: "Tek yaklaşım",
      aciklama: "Karşılaştırma yapılabilecek yeterli yaklaşım yok",
      uzmanIncelemeGerekli: false,
    };
  }

  let maksSapma = 0;
  let sapamaIkili = "";
  const ortalama = degerler.reduce((s, d) => s + d.degerPerM2, 0) / degerler.length;

  for (let i = 0; i < degerler.length; i++) {
    for (let j = i + 1; j < degerler.length; j++) {
      const a = degerler[i]!;
      const b = degerler[j]!;
      const sapma = Math.abs(a.degerPerM2 - b.degerPerM2) / Math.max(a.degerPerM2, b.degerPerM2) * 100;
      if (sapma > maksSapma) {
        maksSapma = sapma;
        sapamaIkili = `${a.ad} vs ${b.ad}`;
      }
    }
  }

  const kategori: UyumsuzlukAnalizi["kategori"] =
    maksSapma < 15 ? "dusuk" :
    maksSapma < 30 ? "orta" :
    "yuksek";

  const aciklama =
    kategori === "dusuk"
      ? `Yaklaşımlar tutarlı (<%15 sapma) — değerleme güvenilir`
      : kategori === "orta"
      ? `Orta düzey uyumsuzluk (%${maksSapma.toFixed(1)}) — gerekçelendirme gerekli`
      : `Yüksek uyumsuzluk (%${maksSapma.toFixed(1)}) — uzman incelemesi önerilir`;

  return {
    maksSapmaYuzde: Math.round(maksSapma * 10) / 10,
    kategori,
    sapamaYaklasimlari: sapamaIkili,
    aciklama,
    uzmanIncelemeGerekli: maksSapma > 30,
  };
}

// ─── Ağırlık belirleme ────────────────────────────────────────────────────────

/**
 * UDES rehberi ağırlıklandırma kriterleri:
 *   - Emsal kalitesi ve miktarı
 *   - Piyasa aktivitesi
 *   - Yaklaşımın bu mülk tipi için güvenilirliği
 */
function agirliklariBelirle(
  karsilastirmali: FiyatTahmini,
  gelir?: GelirYaklasimSonucu | null,
  maliyet?: MaliyetYaklasimSonucu | null,
  gelirKategorisi?: import("./gelir-motoru").GelirKategorisi,
  yapi?: YapiVerisi,
): { karsilastirmali: number; gelir: number; maliyet: number } {
  // Temel ağırlıklar — yaklaşım uygulanabilirliğinden başla
  let k = 0;
  let g = 0;
  let m = 0;

  // Karşılaştırmalı yaklaşım ağırlığı
  const emsal = karsilastirmali.emsalOzeti;
  if (emsal && emsal.secilenAdet >= 5) {
    k = 0.70; // Çok emsal → karşılaştırmalı güçlü
  } else if (emsal && emsal.secilenAdet >= 3) {
    k = 0.55;
  } else if (emsal && emsal.secilenAdet >= 1) {
    k = 0.40;
  } else {
    k = 0.25; // Emsal yok → zayıf
  }

  // Gelir yaklaşımı ağırlığı
  if (gelir && gelir.hesaplananDeger > 0) {
    const uygunluk = gelirYaklasimUygunMu(gelirKategorisi ?? "konut-imarli-arsa");
    g = gelir.guven === "yuksek"
      ? uygunluk.agirlik
      : gelir.guven === "orta"
      ? uygunluk.agirlik * 0.7
      : uygunluk.agirlik * 0.4;
  }

  // Maliyet yaklaşımı ağırlığı
  if (maliyet && maliyet.toplamDegerTL > 0) {
    const uygunluk = maliyetYaklasimUygunMu(yapi);
    m = maliyet.guven === "yuksek"
      ? uygunluk.agirlik
      : maliyet.guven === "orta"
      ? uygunluk.agirlik * 0.7
      : uygunluk.agirlik * 0.4;
  }

  // Normalize et (toplam = 1.0)
  const toplam = k + g + m;
  if (toplam <= 0) return { karsilastirmali: 1, gelir: 0, maliyet: 0 };

  return {
    karsilastirmali: Math.round((k / toplam) * 100) / 100,
    gelir: Math.round((g / toplam) * 100) / 100,
    maliyet: Math.round((m / toplam) * 100) / 100,
  };
}

// ─── Güven skoru hesabı ───────────────────────────────────────────────────────

function guvenSkoruHesapla(
  kullanilanSayi: number,
  uyumsuzluk: UyumsuzlukAnalizi,
  karsilastirGuveni: number, // 0-100
  kirmiziBayrak: boolean,
): number {
  let skor = karsilastirGuveni;

  // Çoklu yaklaşım bonusu
  if (kullanilanSayi >= 3) skor += 10;
  else if (kullanilanSayi === 2) skor += 5;

  // Uyumsuzluk cezası
  if (uyumsuzluk.kategori === "yuksek") skor -= 20;
  else if (uyumsuzluk.kategori === "orta") skor -= 10;

  // Kırmızı bayrak cezası
  if (kirmiziBayrak) skor -= 15;

  return Math.max(5, Math.min(98, skor));
}

// ─── Metodoloji gerekçesi ────────────────────────────────────────────────────

function metodolojGerekceOlustur(
  yaklasimllar: YaklasimOzeti[],
  agirliklar: { karsilastirmali: number; gelir: number; maliyet: number },
  uyumsuzluk: UyumsuzlukAnalizi,
  beklenenPerM2: number,
): string {
  const satirlar: string[] = [];

  satirlar.push("DEĞERLEME METODOLOJİSİ");
  satirlar.push("─".repeat(50));

  // Kullanılan yaklaşımlar
  satirlar.push(`\nKullanılan Yaklaşımlar (${yaklasimllar.length} adet):`);
  for (const y of yaklasimllar) {
    satirlar.push(
      `  • ${y.ad}: ${y.degerPerM2.toLocaleString("tr-TR")} ₺/m²` +
      ` (ağırlık %${Math.round(y.agirlik * 100)}, güven: ${y.guven})`
    );
  }

  // Uyumsuzluk
  satirlar.push(`\nYaklaşımlar Arası Uyumsuzluk:`);
  satirlar.push(`  ${uyumsuzluk.aciklama}`);
  if (uyumsuzluk.sapamaYaklasimlari !== "Tek yaklaşım") {
    satirlar.push(`  En yüksek sapma: ${uyumsuzluk.sapamaYaklasimlari} — %${uyumsuzluk.maksSapmaYuzde}`);
  }

  // Ağırlıklandırma gerekçesi
  satirlar.push(`\nAğırlıklandırma Gerekçesi:`);
  if (agirliklar.karsilastirmali > 0.5) {
    satirlar.push(`  Karşılaştırmalı yaklaşım (%${Math.round(agirliklar.karsilastirmali * 100)}) ağırlıklı — ` +
      `aktif piyasa verileri mevcut.`);
  }
  if (agirliklar.gelir > 0.2) {
    satirlar.push(`  Gelir yaklaşımı (%${Math.round(agirliklar.gelir * 100)}) teyit edici — ` +
      `kira potansiyeli güvenilir veri sunuyor.`);
  }
  if (agirliklar.maliyet > 0.15) {
    satirlar.push(`  Maliyet yaklaşımı (%${Math.round(agirliklar.maliyet * 100)}) destekleyici — ` +
      `yapı maliyeti baz değer kontrolü.`);
  }

  // Sonuç
  satirlar.push(`\nSonuç Değer: ${beklenenPerM2.toLocaleString("tr-TR")} ₺/m²`);
  satirlar.push(`(Ağırlıklı ortalama — UDES Bölüm 6 uyumlu)`);

  return satirlar.join("\n");
}

// ─── Ana ajan fonksiyonu ──────────────────────────────────────────────────────

/**
 * Değerleme ajanı — 3 yaklaşımı ağırlıklandırarak nihai değere ulaşır.
 *
 * @param girdi  3 yaklaşım sonuçları + parsel bilgisi
 */
export function degerlemeKarariAl(girdi: DegerlemeAjaniGirdisi): DegerlemeKarari {
  const { karsilastirmali, gelir, maliyet, yapi, gelirKategorisi, arsaAlanM2 } = girdi;
  const kirmiziBayraklar: string[] = [];

  // ─── 1. Yaklaşım özetleri ─────────────────────────────────────────────────
  const yaklasimllar: YaklasimOzeti[] = [];

  // Karşılaştırmalı
  const karsilastirmaliPerM2 = karsilastirmali.beklenenPerM2;
  yaklasimllar.push({
    ad: "Karşılaştırmalı Satışlar",
    degerPerM2: karsilastirmaliPerM2,
    toplam: karsilastirmali.toplamBeklenen,
    agirlik: 0, // sonra doldurulacak
    guven: karsilastirmali.guven,
    gerekce: `${karsilastirmali.baselineAdet} emsal, ${karsilastirmali.baselineKaynak}`,
    sinirlar: karsilastirmali.veriKalitesiNotlari,
  });

  // Emsal az uyarısı
  if (!karsilastirmali.emsalOzeti || karsilastirmali.emsalOzeti.secilenAdet < 3) {
    kirmiziBayraklar.push("Karşılaştırmalı yaklaşım için yeterli emsal yok (< 3)");
  }

  // Gelir yaklaşımı
  if (gelir && gelir.hesaplananDeger > 0) {
    const gPerM2 = (gelir as unknown as { degerPerM2Arsa?: number; degerPerM2?: number }).degerPerM2Arsa ?? (gelir as unknown as { degerPerM2Arsa?: number; degerPerM2?: number }).degerPerM2 ?? 0;
    const gText = (gelir as unknown as { gerekce?: string; aciklama?: string }).gerekce ?? (gelir as unknown as { gerekce?: string; aciklama?: string }).aciklama ?? "";
    yaklasimllar.push({
      ad: "Gelir Yaklaşımı",
      degerPerM2: gPerM2,
      toplam: gelir.hesaplananDeger,
      agirlik: 0,
      guven: gelir.guven,
      gerekce: (gText.slice(0, 100)) + "…",
      sinirlar: gelir.sinirlar ?? [],
    });
  }

  // Maliyet yaklaşımı
  if (maliyet && maliyet.toplamDegerTL > 0) {
    yaklasimllar.push({
      ad: "Maliyet Yaklaşımı",
      degerPerM2: maliyet.degerPerM2ArsaTL ?? (maliyet as unknown as { degerPerM2?: number }).degerPerM2 ?? 0,
      toplam: maliyet.toplamDegerTL,
      agirlik: 0,
      guven: maliyet.guven,
      gerekce: ((maliyet.gerekce ?? (maliyet as unknown as { aciklama?: string }).aciklama ?? "").slice(0, 100)) + "…",
      sinirlar: maliyet.sinirlar ?? [],
    });
  }

  // ─── 2. Uyumsuzluk analizi ────────────────────────────────────────────────
  const uyumsuzluk = uyumsuzlukAnalizYap(
    yaklasimllar.map((y) => ({ ad: y.ad, degerPerM2: y.degerPerM2 })),
  );

  if (uyumsuzluk.uzmanIncelemeGerekli) {
    kirmiziBayraklar.push(
      `Yaklaşımlar arası %${uyumsuzluk.maksSapmaYuzde} sapma — ` +
      `uzman incelemesi önerilir (${uyumsuzluk.sapamaYaklasimlari})`
    );
  }

  if (yaklasimllar.length === 1) {
    kirmiziBayraklar.push("Sadece 1 yaklaşım uygulandı — değerleme güveni sınırlı");
  }

  // ─── 3. Ağırlıklar ────────────────────────────────────────────────────────
  const agirliklar = agirliklariBelirle(
    karsilastirmali, gelir, maliyet, gelirKategorisi, yapi,
  );

  // Yaklaşım özetlerine ağırlıkları yaz
  for (const y of yaklasimllar) {
    if (y.ad === "Karşılaştırmalı Satışlar") y.agirlik = agirliklar.karsilastirmali;
    else if (y.ad === "Gelir Yaklaşımı") y.agirlik = agirliklar.gelir;
    else if (y.ad === "Maliyet Yaklaşımı") y.agirlik = agirliklar.maliyet;
  }

  // ─── 4. Ağırlıklı ortalama değer ─────────────────────────────────────────
  const gelirBirim = (gelir as unknown as { degerPerM2Arsa?: number; degerPerM2?: number })?.degerPerM2Arsa ?? (gelir as unknown as { degerPerM2Arsa?: number; degerPerM2?: number })?.degerPerM2 ?? 0;
  const maliyetBirim = maliyet?.degerPerM2ArsaTL ?? (maliyet as unknown as { degerPerM2?: number })?.degerPerM2 ?? 0;
  const agirlikliPerM2 =
    karsilastirmaliPerM2 * agirliklar.karsilastirmali +
    gelirBirim * agirliklar.gelir +
    maliyetBirim * agirliklar.maliyet;

  const beklenenPerM2 = Math.round(agirlikliPerM2);

  // Bant: karşılaştırmalı motorun bant oranlarını kullan, uyumsuzluk varsa genişlet
  const uyumsuzlukFaktor = uyumsuzluk.kategori === "yuksek" ? 1.4
    : uyumsuzluk.kategori === "orta" ? 1.2
    : 1.0;

  const altOran = karsilastirmali.altPerM2 / karsilastirmali.beklenenPerM2;
  const ustOran = karsilastirmali.ustPerM2 / karsilastirmali.beklenenPerM2;
  const altPerM2 = Math.round(beklenenPerM2 * (1 + (altOran - 1) * uyumsuzlukFaktor));
  const ustPerM2 = Math.round(beklenenPerM2 * (1 + (ustOran - 1) * uyumsuzlukFaktor));

  // Toplam değerler
  const toplamBeklenen = Math.round(beklenenPerM2 * arsaAlanM2);
  const toplamAlt = Math.round(altPerM2 * arsaAlanM2);
  const toplamUst = Math.round(ustPerM2 * arsaAlanM2);

  // ─── 5. Güven skoru ───────────────────────────────────────────────────────
  const guvenSkoru = guvenSkoruHesapla(
    yaklasimllar.length,
    uyumsuzluk,
    karsilastirmali.guvenSkoru,
    kirmiziBayraklar.length > 0,
  );

  const guvenDuzeyi: "yuksek" | "orta" | "dusuk" =
    guvenSkoru >= 65 ? "yuksek" :
    guvenSkoru >= 40 ? "orta" :
    "dusuk";

  // ─── 6. Metodoloji gerekçesi ──────────────────────────────────────────────
  const metodolojGerekce = metodolojGerekceOlustur(
    yaklasimllar, agirliklar, uyumsuzluk, beklenenPerM2,
  );

  return {
    yaklasimllar,
    uyumsuzluk,
    agirliklar,
    beklenenPerM2,
    altPerM2,
    ustPerM2,
    toplamBeklenen,
    toplamAlt,
    toplamUst,
    guvenDuzeyi,
    guvenSkoru,
    kullanilanYaklasimSayisi: yaklasimllar.length,
    kirmiziBayraklar,
    metodolojGerekce,
  };
}

// ─── Hızlı yardımcılar ───────────────────────────────────────────────────────

/**
 * Sadece karşılaştırmalı yaklaşımla (mevcut sistem) değerleme kararı al.
 * Sprint geçişi için geriye dönük uyumlu wrapper.
 */
export function karsilastirmalidenKarar(
  karsilastirmali: FiyatTahmini,
  arsaAlanM2: number,
): DegerlemeKarari {
  return degerlemeKarariAl({
    karsilastirmali,
    arsaAlanM2,
  });
}
