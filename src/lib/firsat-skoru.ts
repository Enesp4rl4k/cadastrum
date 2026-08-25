/**
 * Arsa Fırsat Skoru Motoru.
 *
 * Temel fikir: İlan fiyatı < Tahmini gerçek değer → fırsat var.
 * Ne kadar büyük fark, o kadar yüksek fırsat puanı.
 *
 * Skor bileşenleri (toplam 100 puan):
 *   1. Fiyat İskontosu (0-40 puan)
 *      İlan fiyatı ile tahmin edilen değer arasındaki fark.
 *      %10 iskonto → 10 puan, %30+ iskonto → 40 puan (tavan)
 *
 *   2. Değerleme Güveni (0-20 puan)
 *      Tahmin motoru güven skoru yüksekse fırsat tespiti güvenilir.
 *      Güven < 30 → 0 puan (tahmin güvenilmez, fırsat değerlendirilemez)
 *
 *   3. Likidite (0-15 puan)
 *      Bölgede emsal çok varsa → likit piyasa → gerçek fırsat.
 *      Emsal az → spekülatif fiyat, aldatıcı iskonto olabilir.
 *
 *   4. Risk Düzeyi (0-15 puan)
 *      Deprem/taşkın/heyelan riski düşükse → pozitif katkı.
 *      Yüksek risk → fırsat değil tuzak.
 *
 *   5. İmar Potansiyeli (0-10 puan)
 *      İmarlı + yüksek emsal → büyüme potansiyeli.
 *      Tarımsal + imarsız → düşük puan.
 *
 * Kullanım:
 *   const skor = firsatSkoruHesapla({ ilanFiyati, tahmin, emsal, risler });
 */

import type { FiyatTahmini } from "./fiyat-tahmin";
import type { DepremRiskKoord } from "./deprem-tdth";
import type { TaskinKoordSonuc } from "./taskin-koord";

// ─── Tipler ──────────────────────────────────────────────────────────────────

export type FirsatSeviyesi =
  | "cok-yuksek"  // 80-100 — nadiren görülür, hemen incele
  | "yuksek"      // 60-79  — güçlü fırsat
  | "orta"        // 40-59  — potansiyel var, daha araştır
  | "dusuk"       // 20-39  — zayıf, dikkatli ol
  | "yok";        // 0-19   — fırsat değil

export interface FirsatSkoruGirdisi {
  /** İlan fiyatı (TL) — asking price */
  ilanFiyatiTL: number;
  /** Parsel alanı m² */
  alanM2: number;
  /** Heuristic fiyat tahmini çıktısı */
  tahmin: FiyatTahmini;
  /** Deprem risk koordinat verisi (opsiyonel) */
  deprem?: DepremRiskKoord | null;
  /** Taşkın risk verisi (opsiyonel) */
  taskin?: TaskinKoordSonuc | null;
  /** Mevcut emsal sayısı (havuz büyüklüğü) */
  emsalSayisi?: number;
}

export interface FirsatSkoruCiktisi {
  /** Toplam puan 0-100 */
  toplamPuan: number;
  /** Skor seviyesi */
  seviye: FirsatSeviyesi;
  /** Bileşen puanları */
  bilesenler: Array<{
    ad: string;
    puan: number;
    maksimum: number;
    aciklama: string;
  }>;
  /** İlan fiyatı TL/m² */
  ilanPerM2: number;
  /** Tahmin TL/m² */
  tahminPerM2: number;
  /** İskonto oranı: (tahmin - ilan) / tahmin */
  iskontoOrani: number;
  /** Pozitif mi? (ilan < tahmin) */
  pozitifFark: boolean;
  /** Özet metin (UI için) */
  ozet: string;
  /** Güvenilir mi? (tahmin güveni yeterli) */
  guvenilir: boolean;
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function puanKisit(puan: number, maks: number): number {
  return Math.max(0, Math.min(maks, Math.round(puan)));
}

function seviyeBelirle(puan: number): FirsatSeviyesi {
  if (puan >= 80) return "cok-yuksek";
  if (puan >= 60) return "yuksek";
  if (puan >= 40) return "orta";
  if (puan >= 20) return "dusuk";
  return "yok";
}

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

export function firsatSkoruHesapla(girdi: FirsatSkoruGirdisi): FirsatSkoruCiktisi {
  const { ilanFiyatiTL, alanM2, tahmin, deprem, taskin, emsalSayisi = 0 } = girdi;

  const ilanPerM2 = alanM2 > 0 ? Math.round(ilanFiyatiTL / alanM2) : 0;
  const tahminPerM2 = tahmin.beklenenPerM2;
  const pozitifFark = ilanPerM2 < tahminPerM2 && tahminPerM2 > 0;
  const iskontoOrani = tahminPerM2 > 0
    ? (tahminPerM2 - ilanPerM2) / tahminPerM2
    : 0;

  const bilesenler: FirsatSkoruCiktisi["bilesenler"] = [];

  // ─── 1. Fiyat İskontosu (0-40 puan) ───────────────────────────────────────
  let iskontoPuan = 0;
  let iskontoAciklama = "";
  if (!pozitifFark) {
    iskontoPuan = 0;
    iskontoAciklama = `İlan fiyatı (${ilanPerM2.toLocaleString("tr-TR")} ₺/m²) tahmin değerinin üzerinde — fırsat yok`;
  } else {
    const yuzde = iskontoOrani * 100;
    if (yuzde >= 30) { iskontoPuan = 40; iskontoAciklama = `%${yuzde.toFixed(0)} iskonto — çok güçlü fırsat`; }
    else if (yuzde >= 20) { iskontoPuan = 30; iskontoAciklama = `%${yuzde.toFixed(0)} iskonto — güçlü fırsat`; }
    else if (yuzde >= 10) { iskontoPuan = 20; iskontoAciklama = `%${yuzde.toFixed(0)} iskonto — makul fırsat`; }
    else if (yuzde >= 5)  { iskontoPuan = 10; iskontoAciklama = `%${yuzde.toFixed(0)} iskonto — zayıf fırsat`; }
    else                  { iskontoPuan = 3;  iskontoAciklama = `%${yuzde.toFixed(1)} iskonto — ihmal edilebilir`; }
  }
  bilesenler.push({ ad: "Fiyat İskontosu", puan: puanKisit(iskontoPuan, 40), maksimum: 40, aciklama: iskontoAciklama });

  // ─── 2. Değerleme Güveni (0-20 puan) ──────────────────────────────────────
  const guvenSkoru = tahmin.guvenSkoru;
  const guvenilir = guvenSkoru >= 35;
  let guvenPuan = 0;
  let guvenAciklama = "";
  if (guvenSkoru >= 65) { guvenPuan = 20; guvenAciklama = `Güven ${guvenSkoru}/100 — yüksek (${tahmin.baselineAdet}+ emsal)`; }
  else if (guvenSkoru >= 50) { guvenPuan = 14; guvenAciklama = `Güven ${guvenSkoru}/100 — orta`; }
  else if (guvenSkoru >= 35) { guvenPuan = 8;  guvenAciklama = `Güven ${guvenSkoru}/100 — düşük, dikkatli yorumla`; }
  else                       { guvenPuan = 0;  guvenAciklama = `Güven ${guvenSkoru}/100 — yetersiz, fırsat tespiti güvenilmez`; }
  bilesenler.push({ ad: "Değerleme Güveni", puan: puanKisit(guvenPuan, 20), maksimum: 20, aciklama: guvenAciklama });

  // ─── 3. Likidite (0-15 puan) ──────────────────────────────────────────────
  let liditePuan = 0;
  let liditiAciklama = "";
  const emsal = tahmin.emsalOzeti;
  const gercekEmsalSayisi = emsal?.secilenAdet ?? emsalSayisi;
  if (gercekEmsalSayisi >= 10) { liditePuan = 15; liditiAciklama = `${gercekEmsalSayisi} emsal — likit piyasa`; }
  else if (gercekEmsalSayisi >= 5) { liditePuan = 10; liditiAciklama = `${gercekEmsalSayisi} emsal — orta likidite`; }
  else if (gercekEmsalSayisi >= 2) { liditePuan = 5;  liditiAciklama = `${gercekEmsalSayisi} emsal — düşük likidite`; }
  else                             { liditePuan = 0;  liditiAciklama = "Emsal yok — spekülatif fiyat riski"; }
  bilesenler.push({ ad: "Piyasa Likiditesi", puan: puanKisit(liditePuan, 15), maksimum: 15, aciklama: liditiAciklama });

  // ─── 4. Risk Düzeyi (0-15 puan) ───────────────────────────────────────────
  let riskPuan = 15; // Başlangıç: risk yok varsayımı
  const riskNotlari: string[] = [];

  // Deprem riski
  if (deprem) {
    const pga = deprem.pga ?? 0;
    if (pga >= 0.4)       { riskPuan -= 8; riskNotlari.push(`Yüksek deprem riski (PGA ${pga.toFixed(2)}g)`); }
    else if (pga >= 0.2)  { riskPuan -= 4; riskNotlari.push(`Orta deprem riski (PGA ${pga.toFixed(2)}g)`); }
  }

  // Taşkın riski
  if (taskin) {
    if (taskin.risk === "yuksek")      { riskPuan -= 7; riskNotlari.push("Yüksek taşkın riski"); }
    else if (taskin.risk === "orta")   { riskPuan -= 3; riskNotlari.push("Orta taşkın riski"); }
  }

  riskPuan = Math.max(0, riskPuan);
  const riskAciklama = riskNotlari.length > 0
    ? riskNotlari.join(", ")
    : "Risk düşük — olumlu";
  bilesenler.push({ ad: "Risk Düzeyi", puan: puanKisit(riskPuan, 15), maksimum: 15, aciklama: riskAciklama });

  // ─── 5. İmar Potansiyeli (0-10 puan) ──────────────────────────────────────
  let imarPuan = 5; // Nötr
  let imarAciklama = "";
  const imarOzet = tahmin.imarOzeti;
  if (imarOzet) {
    const sinif = imarOzet.sinif;
    if (sinif === "konut-imarli" || sinif === "ticari-imarli") {
      const emsal = imarOzet.resmiDetay?.emsal ?? 0;
      imarPuan = emsal >= 2 ? 10 : 8;
      imarAciklama = `${sinif.replace("-imarli", "")} imarlı${emsal > 0 ? `, emsal ${emsal}` : ""}`;
    } else if (sinif === "sanayi-imarli") {
      imarPuan = 8; imarAciklama = "Sanayi/endüstriyel imar";
    } else if (sinif === "tarimsal" || sinif === "arsa-imar-belirsiz") {
      imarPuan = 3; imarAciklama = "Tarımsal/imar belirsiz — düşük potansiyel";
    } else if (sinif === "korumali") {
      imarPuan = 0; imarAciklama = "Korumalı alan — yapılaşma yasak";
    } else {
      imarPuan = 5; imarAciklama = "İmar bilgisi belirsiz";
    }
  } else {
    imarAciklama = "İmar bilgisi yok — orta potansiyel";
  }
  bilesenler.push({ ad: "İmar Potansiyeli", puan: puanKisit(imarPuan, 10), maksimum: 10, aciklama: imarAciklama });

  // ─── Toplam ───────────────────────────────────────────────────────────────
  const toplamPuan = bilesenler.reduce((s, b) => s + b.puan, 0);
  const seviye = seviyeBelirle(toplamPuan);

  const seviyeEmoji: Record<FirsatSeviyesi, string> = {
    "cok-yuksek": "🔥",
    "yuksek": "⭐",
    "orta": "👀",
    "dusuk": "⚠️",
    "yok": "❌",
  };

  const ozet = pozitifFark
    ? `${seviyeEmoji[seviye]} ${seviye === "cok-yuksek" ? "Çok Yüksek Fırsat" : seviye === "yuksek" ? "Yüksek Fırsat" : seviye === "orta" ? "Potansiyel Fırsat" : "Zayıf Fırsat"} — ilan fiyatı tahminin %${Math.abs(iskontoOrani * 100).toFixed(0)} altında`
    : `❌ Fırsat Yok — ilan fiyatı (${ilanPerM2.toLocaleString("tr-TR")} ₺/m²) tahminin üzerinde`;

  return {
    toplamPuan,
    seviye,
    bilesenler,
    ilanPerM2,
    tahminPerM2,
    iskontoOrani,
    pozitifFark,
    ozet,
    guvenilir,
  };
}

/**
 * Çoklu ilan listesine fırsat skoru uygula ve sırala.
 * İlan havuzunu tararken toplu kullanım için.
 */
export function havuzuFirsatSirala(
  ilanlar: Array<{
    ilanFiyatiTL: number;
    alanM2: number;
    tahmin: FiyatTahmini;
  }>,
): Array<{ skor: FirsatSkoruCiktisi; index: number }> {
  return ilanlar
    .map((ilan, i) => ({
      skor: firsatSkoruHesapla({ ...ilan }),
      index: i,
    }))
    .filter((s) => s.skor.pozitifFark && s.skor.guvenilir)
    .sort((a, b) => b.skor.toplamPuan - a.skor.toplamPuan);
}
