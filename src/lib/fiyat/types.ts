/**
 * fiyat/types.ts — Fiyat tahmin motoru ortak tipleri.
 *
 * Bu dosya fiyat-tahmin.ts'ten çıkarılmıştır.
 * Geriye dönük uyumluluk: fiyat-tahmin.ts bu dosyayı re-export eder.
 */

import type { ImarSinifi } from "../carpan-zinciri";

export type { ImarSinifi };

export interface FiyatBileseni {
  ad: string;
  carpan: number;
  not: string;
}

export interface FiyatTahmini {
  /** TL/m² alt sınır */
  altPerM2: number;
  /** TL/m² beklenen */
  beklenenPerM2: number;
  /** TL/m² üst sınır */
  ustPerM2: number;
  /** Toplam parsel TL alt */
  toplamAlt: number;
  /** Toplam parsel TL beklenen */
  toplamBeklenen: number;
  /** Toplam parsel TL üst */
  toplamUst: number;
  /** Bileşen çarpanları (heuristic chain) */
  bilesenler: FiyatBileseni[];
  /** "yuksek" = çok ilan gözlemi var, "orta" = az gözlem, "dusuk" = sadece baseline */
  guven: "yuksek" | "orta" | "dusuk";
  guvenAciklama: string;
  /** Hangi kaynak baseline olarak kullanıldı */
  baselineKaynak:
    | "spatial-radius"
    | "ilanGozlem-mahalle"
    | "ilanGozlem-ilce"
    | "mahalle-baseline"
    | "ilce-semt-baseline"
    | "ilce-baseline"
    | "il-baseline"
    | "fallback";
  baselineDeger: number;
  baselineNot: string;
  /** Kullanılan ilanGozlem kayıt sayısı (0 = statik tablo) */
  baselineAdet: number;
  /** 0-100 arası özet güven skoru */
  guvenSkoru: number;
  /** Kullanıcıya gösterilecek veri kalitesi işaretleri */
  veriKalitesiNotlari: string[];
  guvenKirilimi: Array<{
    etiket: string;
    puan: number;
    durum: "pozitif" | "notr" | "uyari";
  }>;
  sonrakiHamleler: string[];
  aralikGenisligiYuzde: number;
  /** Emsal havuzunun yaş dağılımı — TR enflasyonunda taze veri kritik */
  tazelikOzeti: {
    /** Toplam aday (yaş filtresinden önce) */
    havuzAdet: number;
    /** Yaş filtresinden geçen ve emsal seçilebilen taze ilan sayısı */
    tazeAdet: number;
    /** Atılan stale ilan sayısı (180+ gün) */
    stalAdet: number;
    /** Son 30 gündeki ilan sayısı */
    son30Gun: number;
    /** Son 90 gündeki ilan sayısı */
    son90Gun: number;
    /** Seçilen emsallerin ağırlıklı ortalama yaşı (gün) */
    ortalamaYasGun: number;
  } | null;
  /** Kullanılan emsal havuzu özeti */
  emsalOzeti: {
    secilenAdet: number;
    mahalleAdet: number;
    ilceAdet: number;
    dogrulanabilirAdet: number;
    ortalamaBenzerlik: number;
    weightedAsking: number;
    /** Tukey IQR ile havuz dışı bırakılan aykırı sayısı */
    outlierAdet: number;
    /** Güncel kurla TL'ye çevrilen dövizli ilan sayısı */
    dovizDonusturulenAdet: number;
  } | null;
  imarOzeti: {
    sinif: ImarSinifi;
    kaynak: "eplan-resmi" | "ilan-imar" | "parsel-nitelik";
    not: string;
    resmiDetay: {
      kullanimKarari: string | null;
      planKarari: string | null;
      yapiNizami: string | null;
      emsal: number | null;
      taks: number | null;
      maksKat: number | null;
      yakalandiAt: number | null;
      guvenSkoru: number | null;
    } | null;
  };
  /** AI için ham emsal verileri */
  emsalListesi: Array<{
    fiyatPerM2: number;
    alan: number;
    benzerlik: number;
    tazelikGun: number;
    ilanNo: string;
  }>;
  /** Triangulasyon kaynakları yüksek varyans gösterdi — UI manuel kontrol rozetini göster */
  manuelReviewGerek?: boolean;
}
