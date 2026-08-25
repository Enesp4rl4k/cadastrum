/**
 * Corrective RAG (CRAG) & Dinamik Öz-Düzeltmeli Arama Motoru.
 *
 * Prensip:
 *   1. Retrieval Kalitesi Değerlendirme (Evaluator)
 *   2. Yetersiz / Düşük güven durumunda Self-Correction Refleksiyonu
 *   3. Kademeli Arama Yarıçapı Genişletme (3km -> 6km -> 15km -> 30km)
 *   4. Kategori & Filtre Esnetme (Query Relaxation)
 */

import type { SpatialRagSorgusu, SpatialRagSonucu } from "./types";
import { SpatialRagStore } from "./spatial-rag";

export interface CragDegerlendirmeSonucu {
  yeterliMi: boolean;
  guvenDerecesi: "yuksek" | "orta" | "yetersiz";
  bulunanAdet: number;
  ortalamaBenzerlik: number;
  uygulananDuzeltmeler: string[];
  sonuclar: SpatialRagSonucu[];
}

export class CorrectiveRagEngine {
  private store: SpatialRagStore;

  constructor(store: SpatialRagStore) {
    this.store = store;
  }

  /**
   * Corrective RAG döngüsü ile sorguyu çalıştırır ve gerekirse kendi kendini düzelterek
   * aramayı genişletir.
   */
  public ara(sorgu: SpatialRagSorgusu): CragDegerlendirmeSonucu {
    const duzeltmeler: string[] = [];
    let aktifSorgu: SpatialRagSorgusu = { ...sorgu };

    // 1. Aşama: İlk Arama
    let sonuclar = this.store.ara(aktifSorgu);
    let ortalamaBenzerlik = this.hesaplaOrtalamaBenzerlik(sonuclar);

    // 2. Aşama: Kalite Değerlendirmesi
    const MIN_EMSAL_ADET = 3;
    const MIN_BENZERLIK_ESIGI = 0.55;

    // Eğer sonuç yetersizse 1. Düzeltme: Yarıçapı 2 katına çıkar
    if (sonuclar.length < MIN_EMSAL_ADET && aktifSorgu.merkezLat !== undefined) {
      const eskiYaricap = aktifSorgu.maksMesafeKm ?? 5;
      const yeniYaricap = Math.min(30, eskiYaricap * 2.5);
      aktifSorgu = { ...aktifSorgu, maksMesafeKm: yeniYaricap };
      duzeltmeler.push(`Yarıçap ${eskiYaricap} km'den ${yeniYaricap} km'ye genişletildi.`);

      sonuclar = this.store.ara(aktifSorgu);
      ortalamaBenzerlik = this.hesaplaOrtalamaBenzerlik(sonuclar);
    }

    // Hala sonuç yetersizse 2. Düzeltme: Kategori filtresini esnet
    if (sonuclar.length < MIN_EMSAL_ADET && aktifSorgu.kategori) {
      const eskiKat = aktifSorgu.kategori;
      aktifSorgu = { ...aktifSorgu, kategori: undefined };
      duzeltmeler.push(`Kategori filtresi (${eskiKat}) genel gayrimenkul havuzuna esnetildi.`);

      sonuclar = this.store.ara(aktifSorgu);
      ortalamaBenzerlik = this.hesaplaOrtalamaBenzerlik(sonuclar);
    }

    // Nihai Güven Derecesi Belirleme
    let guvenDerecesi: CragDegerlendirmeSonucu["guvenDerecesi"] = "yetersiz";
    const yeterliMi = sonuclar.length >= MIN_EMSAL_ADET && ortalamaBenzerlik >= MIN_BENZERLIK_ESIGI;

    if (sonuclar.length >= 5 && ortalamaBenzerlik >= 0.70) {
      guvenDerecesi = "yuksek";
    } else if (sonuclar.length >= 2 && ortalamaBenzerlik >= 0.45) {
      guvenDerecesi = "orta";
    } else {
      guvenDerecesi = "yetersiz";
    }

    return {
      yeterliMi,
      guvenDerecesi,
      bulunanAdet: sonuclar.length,
      ortalamaBenzerlik,
      uygulananDuzeltmeler: duzeltmeler,
      sonuclar,
    };
  }

  private hesaplaOrtalamaBenzerlik(sonuclar: SpatialRagSonucu[]): number {
    if (sonuclar.length === 0) return 0;
    const toplam = sonuclar.reduce((sum, s) => sum + s.rrfSkor, 0);
    return Number((toplam / sonuclar.length).toFixed(4));
  }
}