/**
 * Veri Rafinerisi — İki Kademeli Outlier Temizleme & Emsal Havuzlama Motoru
 *
 * Bu modül, ham emsal listesini alır ve sırasıyla:
 * 1. NLP & Kural tabanlı sanitasyon (hisseli tapu, kooperatif, hobi bahçesi, 2B elemesi).
 * 2. Zaman serisi / enflasyon düzeltmesi (eski ilanları bugünkü TL/m² değerine taşıma).
 * 3. İl + Kategori bağlamsal mutlak sınır kontrolü.
 * 4. İl + İlçe + Kategori bazlı gruplu Tukey IQR istatistiksel aykırı değer elemesi.
 *
 * Not: Docstring önceki sürümde "Robust MAD (Median Absolute Deviation)" filtresi de
 * vaat ediyordu; bu implementasyonda MAD hesabı yoktur — yalnızca Tukey IQR uygulanır.
 * MAD ölçülmeden ikinci bir filtre katmanı eklenmedi (bkz. proje planı).
 *
 * Çıktı: Değerleme motorlarının güvenle kullanabileceği filtrelenmiş ve normalize edilmiş temiz havuz.
 */

import { ilanSanitizeEt, type RawIlanGirdisi, type SanitizedIlanSonuc } from "./data-sanitizer";
import { fiyatiBuguneTasi, type ZamanEndekslemeSonuc } from "./time-decay-engine";
import { normalizeYerAdi } from "../tkgm-api";
import { IL_KATEGORI_SINIR } from "../fiyat-correction";
import { weightedAverage, weightedMedian } from "./emsal-havuzu";

export interface RafineEmsal {
  ilanNo: string;
  orijinalIlan: RawIlanGirdisi;
  sanitasyon: SanitizedIlanSonuc;
  zamanEndeksi: ZamanEndekslemeSonuc;
  /** Bugünkü normalize edilmiş TL/m² fiyatı */
  normalizeFiyatPerM2: number;
  /** Nihai güven ağırlığı (tazelik * mülkiyet temizliği) */
  agirlik: number;
}

export interface ElenenEmsal {
  ilanNo: string;
  orijinalIlan: RawIlanGirdisi;
  neden: string;
  asama: "sanitasyon" | "zaman_veya_fiyat" | "mutlak_sinir" | "istatistiksel_iqr";
}

export interface HavuzIstatistikleri {
  hamAdet: number;
  temizAdet: number;
  elenenAdet: number;
  medyanFiyatPerM2: number;
  ortalamaFiyatPerM2: number;
  q1: number;
  q3: number;
  iqr: number;
  standartSapma: number;
  varyasyonKatsayisi: number; // CV = std / mean
}

export interface RafinasyonSonucu {
  temizHavuz: RafineEmsal[];
  elenenler: ElenenEmsal[];
  istatistikler: HavuzIstatistikleri;
}

/**
 * Sayısal dizinin yüzdelik (percentile) değerini hesaplar (0..1).
 */
function hesaplaPercentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sirali = [...arr].sort((a, b) => a - b);
  const index = (sirali.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return (sirali[lower] ?? 0) * (1 - weight) + (sirali[upper] ?? sirali[lower] ?? 0) * weight;
}

/**
 * Ham emsal dizisini tam rafineri boru hattından geçirir.
 */
export async function emsalHavuzunuRafineEt(
  hamEmsaller: RawIlanGirdisi[],
  varsayilanIl?: string,
  varsayilanKategori?: string,
): Promise<RafinasyonSonucu> {
  const elenenler: ElenenEmsal[] = [];
  const adayAdaylari: Array<{
    orijinalIlan: RawIlanGirdisi;
    sanitasyon: SanitizedIlanSonuc;
    zamanEndeksi: ZamanEndekslemeSonuc;
    normalizeFiyatPerM2: number;
    agirlik: number;
  }> = [];

  const ilNormVarsayilan = normalizeYerAdi(varsayilanIl ?? "");
  const kategoriNorm = (varsayilanKategori ?? "arsa").toLowerCase().includes("tarla") ? "tarla" : "arsa";

  // AŞAMA 1 & 2: NLP Sanitasyon ve Zaman Serisi Enflasyon Taşınması.
  // Paralel çalışır — `enflasyonCarpaniniGetir` (enflasyon-duzeltme.ts) kendi
  // içinde (ay, il) bazlı cache tuttuğu için aynı ay/il kombinasyonuna düşen
  // yüzlerce ilan tek bir çözümü paylaşır; sıralı await zinciri gerekmez.
  type Asama12Sonuc =
    | { tip: "elendi"; ilanNo: string; raw: RawIlanGirdisi; neden: string; asama: ElenenEmsal["asama"] }
    | {
        tip: "aday";
        raw: RawIlanGirdisi;
        sanitasyon: SanitizedIlanSonuc;
        zamanEndeksi: ZamanEndekslemeSonuc;
        normalizeFiyatPerM2: number;
        agirlik: number;
      };

  const asama12Sonuclari: Asama12Sonuc[] = await Promise.all(
    hamEmsaller.map(async (raw, i): Promise<Asama12Sonuc> => {
      const ilanNo = raw.ilanNo || `ilan_${i + 1}`;

      // 1. NLP Sanitasyon
      const s = ilanSanitizeEt(raw);
      if (!s.kullanilabilir) {
        return {
          tip: "elendi",
          ilanNo,
          raw,
          neden: s.aciklamalar.join("; ") || "Sanitasyon kriterlerini karşılamadı.",
          asama: "sanitasyon",
        };
      }

      // 2. Zaman Endeksleme
      const il = raw.ilAd || varsayilanIl;
      const z = await fiyatiBuguneTasi(s.duzeltilmisFiyatPerM2, raw.tarih, il);
      if (z.guncelFiyatPerM2 <= 0) {
        return {
          tip: "elendi",
          ilanNo,
          raw,
          neden: "Enflasyon endeksleme sonrası geçersiz fiyat.",
          asama: "zaman_veya_fiyat",
        };
      }

      // 3. Mutlak Sınır Kontrolü
      const ilNorm = raw.ilAd ? normalizeYerAdi(raw.ilAd) : ilNormVarsayilan;
      const sinirKey = `${ilNorm}:${kategoriNorm}`;
      const sinir = IL_KATEGORI_SINIR[sinirKey] ?? IL_KATEGORI_SINIR[`_default:${kategoriNorm}`] ?? { altMin: 30, ustMax: 50_000_000 };
      if (z.guncelFiyatPerM2 < sinir.altMin || z.guncelFiyatPerM2 > sinir.ustMax) {
        return {
          tip: "elendi",
          ilanNo,
          raw,
          neden: `Mutlak bölgesel sınır dışında (${z.guncelFiyatPerM2.toLocaleString("tr-TR")} TL/m², Sınırlar: ${sinir.altMin} - ${sinir.ustMax} TL).`,
          asama: "mutlak_sinir",
        };
      }

      const agirlik = Number((s.guvenlikCarpani * z.tazelikSkoru).toFixed(3));
      return {
        tip: "aday",
        raw,
        sanitasyon: s,
        zamanEndeksi: z,
        normalizeFiyatPerM2: z.guncelFiyatPerM2,
        agirlik,
      };
    }),
  );

  for (const sonuc of asama12Sonuclari) {
    if (sonuc.tip === "elendi") {
      elenenler.push({ ilanNo: sonuc.ilanNo, orijinalIlan: sonuc.raw, neden: sonuc.neden, asama: sonuc.asama });
    } else {
      adayAdaylari.push({
        orijinalIlan: sonuc.raw,
        sanitasyon: sonuc.sanitasyon,
        zamanEndeksi: sonuc.zamanEndeksi,
        normalizeFiyatPerM2: sonuc.normalizeFiyatPerM2,
        agirlik: sonuc.agirlik,
      });
    }
  }

  // AŞAMA 4: İl + İlçe + Kategori bazlı gruplu Tukey IQR filtresi.
  // Global IQR, farklı bölge/kategorideki fiyat dağılımlarını tek çite sokup
  // anlamsızlaştırır (İstanbul arsası ile Erzurum tarlası aynı havuzda olamaz) —
  // bkz. fiyat-correction.ts:outlierTemizleBaglamsalAsimli ile aynı ilke.
  const gruplar = new Map<string, typeof adayAdaylari>();
  for (const aday of adayAdaylari) {
    const ilNorm = aday.orijinalIlan.ilAd ? normalizeYerAdi(aday.orijinalIlan.ilAd) : ilNormVarsayilan;
    const ilceNorm = aday.orijinalIlan.ilceAd ? normalizeYerAdi(aday.orijinalIlan.ilceAd) : "";
    const kategori = aday.orijinalIlan.nitelik?.toLowerCase().includes("tarla") ? "tarla" : kategoriNorm;
    const key = `${ilNorm}__${ilceNorm}__${kategori}`;
    const grup = gruplar.get(key);
    if (grup) grup.push(aday);
    else gruplar.set(key, [aday]);
  }

  const temizHavuz: RafineEmsal[] = [];
  for (const grup of gruplar.values()) {
    if (grup.length >= 4) {
      const fiyatlar = grup.map((a) => a.normalizeFiyatPerM2);
      const q1 = hesaplaPercentile(fiyatlar, 0.25);
      const q3 = hesaplaPercentile(fiyatlar, 0.75);
      const iqr = q3 - q1;

      // Kural: 1.5 * IQR Fences (Tukey)
      const iqrAlt = Math.max(10, q1 - 1.5 * iqr);
      const iqrUst = q3 + 1.5 * iqr;

      for (const aday of grup) {
        const ilanNo = aday.orijinalIlan.ilanNo || "ilan";
        if (aday.normalizeFiyatPerM2 < iqrAlt || aday.normalizeFiyatPerM2 > iqrUst) {
          elenenler.push({
            ilanNo,
            orijinalIlan: aday.orijinalIlan,
            neden: `İstatistiksel aykırı değer (Tukey IQR: ${iqrAlt.toFixed(0)} - ${iqrUst.toFixed(0)} TL/m² dışı: ${aday.normalizeFiyatPerM2.toLocaleString("tr-TR")} TL/m²).`,
            asama: "istatistiksel_iqr",
          });
        } else {
          temizHavuz.push({
            ilanNo,
            orijinalIlan: aday.orijinalIlan,
            sanitasyon: aday.sanitasyon,
            zamanEndeksi: aday.zamanEndeksi,
            normalizeFiyatPerM2: aday.normalizeFiyatPerM2,
            agirlik: aday.agirlik,
          });
        }
      }
    } else {
      // 4'ten az emsalli grupta IQR güvenilmezdir; mutlak filtreden geçenlerin hepsi kabul edilir
      for (const aday of grup) {
        temizHavuz.push({
          ilanNo: aday.orijinalIlan.ilanNo || "ilan",
          orijinalIlan: aday.orijinalIlan,
          sanitasyon: aday.sanitasyon,
          zamanEndeksi: aday.zamanEndeksi,
          normalizeFiyatPerM2: aday.normalizeFiyatPerM2,
          agirlik: aday.agirlik,
        });
      }
    }
  }

  // Havuz İstatistikleri — ağırlıklı (güvenlik cezası × tazelik skoru).
  const n = temizHavuz.length;
  const agirlikliDegerler = temizHavuz.map((t) => ({ value: t.normalizeFiyatPerM2, weight: t.agirlik || 0.01 }));
  const medyan = Math.round(weightedMedian(agirlikliDegerler));
  const ortalama = Math.round(weightedAverage(agirlikliDegerler));
  const temizFiyatlar = temizHavuz.map((t) => t.normalizeFiyatPerM2);
  const q1 = n > 0 ? Math.round(hesaplaPercentile(temizFiyatlar, 0.25)) : 0;
  const q3 = n > 0 ? Math.round(hesaplaPercentile(temizFiyatlar, 0.75)) : 0;
  const iqr = q3 - q1;

  const toplamAgirlik = temizHavuz.reduce((s, t) => s + (t.agirlik || 0.01), 0);
  const varyans = n > 1 && toplamAgirlik > 0
    ? temizHavuz.reduce((acc, t) => acc + (t.agirlik || 0.01) * Math.pow(t.normalizeFiyatPerM2 - ortalama, 2), 0) / toplamAgirlik
    : 0;
  const standartSapma = Math.round(Math.sqrt(varyans));
  const cv = ortalama > 0 ? Number((standartSapma / ortalama).toFixed(2)) : 0;

  return {
    temizHavuz,
    elenenler,
    istatistikler: {
      hamAdet: hamEmsaller.length,
      temizAdet: temizHavuz.length,
      elenenAdet: elenenler.length,
      medyanFiyatPerM2: medyan,
      ortalamaFiyatPerM2: ortalama,
      q1,
      q3,
      iqr,
      standartSapma,
      varyasyonKatsayisi: cv,
    },
  };
}
