/**
 * Spatial RAG Engine — Uzamsal + Vektörel Hibrit Bilgi Geri Çağırma Motoru.
 *
 * Algoritma:
 *   1. Dense Semantik Benzerlik (Cosine Sim)
 *   2. Sparse Anahtar Kelime Uyumu (BM25 Token Sim)
 *   3. Uzamsal Mesafe Bozulması (Spatial Distance Decay / Haversine)
 *   4. Reciprocal Rank Fusion (RRF) ile Çok Kriterli Birleştirme
 */

import type {
  VektorDokumani,
  SpatialRagSorgusu,
  SpatialRagSonucu,
} from "./types";
import {
  cosineSimilarity,
  sparseTokenize,
  sparseSimilarity,
  yerelEmbeddingUret,
} from "./embedding-service";

const EARTH_RADIUS_KM = 6371;

/**
 * İki koordinat arasındaki Haversine mesafesini km cinsinden hesaplar.
 */
export function haversineMesafeKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((EARTH_RADIUS_KM * c).toFixed(3));
}

/**
 * Mesafeye göre üstel azalma (decay) fonksiyonu.
 * Mesafe 0 km -> Skor 1.0
 * Mesafe = yariCapKm -> Skor ~0.37
 */
export function spatialDecaySkoru(mesafeKm: number, yariCapKm = 5): number {
  if (mesafeKm < 0) return 0;
  return Number(Math.exp(-mesafeKm / Math.max(1, yariCapKm)).toFixed(4));
}

export class SpatialRagStore {
  private dokumanlar: Map<string, VektorDokumani> = new Map();

  /**
   * Doküman ekler veya günceller (vektör yoksa otomatik üretir).
   */
  public ekle(dokuman: VektorDokumani): void {
    if (!dokuman.vektor) {
      dokuman.vektor = yerelEmbeddingUret(dokuman.metin).vector;
    }
    if (!dokuman.sparseTokens) {
      dokuman.sparseTokens = sparseTokenize(dokuman.metin);
    }
    this.dokumanlar.set(dokuman.id, dokuman);
  }

  /**
   * Toplu doküman yükler.
   */
  public topluEkle(dokumanlar: VektorDokumani[]): void {
    for (const d of dokumanlar) {
      this.ekle(d);
    }
  }

  public get(id: string): VektorDokumani | undefined {
    return this.dokumanlar.get(id);
  }

  public toplamAdet(): number {
    return this.dokumanlar.size;
  }

  public temizle(): void {
    this.dokumanlar.clear();
  }

  /**
   * Hibrit Spatial + Vektörel Arama Gerçekleştirir.
   */
  public ara(sorgu: SpatialRagSorgusu): SpatialRagSonucu[] {
    const topK = sorgu.topK ?? 10;
    const sorguTokens = sparseTokenize(sorgu.sorguMetni);
    const sorguVector = yerelEmbeddingUret(sorgu.sorguMetni).vector;

    const adaylar: Array<{
      dokuman: VektorDokumani;
      denseSkor: number;
      sparseSkor: number;
      spatialSkor: number;
      mesafeKm?: number;
    }> = [];

    for (const doc of this.dokumanlar.values()) {
      // 1. Temel Metadata Filtreleri
      if (sorgu.filtreler?.tip && doc.metadata.tip !== sorgu.filtreler.tip) {
        continue;
      }
      if (sorgu.ilNorm && doc.metadata.ilNorm && doc.metadata.ilNorm !== sorgu.ilNorm) {
        continue;
      }
      if (sorgu.ilceNorm && doc.metadata.ilceNorm && doc.metadata.ilceNorm !== sorgu.ilceNorm) {
        continue;
      }
      if (sorgu.kategori && doc.metadata.kategori && doc.metadata.kategori !== sorgu.kategori) {
        continue;
      }
      if (sorgu.filtreler?.minFiyatPerM2 && doc.metadata.fiyatPerM2 && doc.metadata.fiyatPerM2 < sorgu.filtreler.minFiyatPerM2) {
        continue;
      }
      if (sorgu.filtreler?.maksFiyatPerM2 && doc.metadata.fiyatPerM2 && doc.metadata.fiyatPerM2 > sorgu.filtreler.maksFiyatPerM2) {
        continue;
      }

      // 2. Dense Cosine Similarity
      const denseSkor = doc.vektor ? cosineSimilarity(sorguVector, doc.vektor) : 0;

      // 3. Sparse BM25 Similarity
      const sparseSkor = doc.sparseTokens ? sparseSimilarity(sorguTokens, doc.sparseTokens) : 0;

      // 4. Spatial Mesafe ve Decay Skoru
      let spatialSkor = 0.5; // Coğrafi koordinat yoksa nötr
      let mesafeKm: number | undefined;

      if (
        sorgu.merkezLat !== undefined &&
        sorgu.merkezLng !== undefined &&
        doc.metadata.lat !== undefined &&
        doc.metadata.lng !== undefined
      ) {
        mesafeKm = haversineMesafeKm(
          sorgu.merkezLat,
          sorgu.merkezLng,
          doc.metadata.lat,
          doc.metadata.lng,
        );

        if (sorgu.maksMesafeKm && mesafeKm > sorgu.maksMesafeKm) {
          continue; // Mesafe sınırını aştı
        }

        spatialSkor = spatialDecaySkoru(mesafeKm, sorgu.maksMesafeKm ?? 10);
      }

      adaylar.push({
        dokuman: doc,
        denseSkor,
        sparseSkor,
        spatialSkor,
        mesafeKm,
      });
    }

    // 5. Reciprocal Rank Fusion (RRF) ile Sıralama
    const denseSirali = [...adaylar].sort((a, b) => b.denseSkor - a.denseSkor);
    const sparseSirali = [...adaylar].sort((a, b) => b.sparseSkor - a.sparseSkor);
    const spatialSirali = [...adaylar].sort((a, b) => b.spatialSkor - a.spatialSkor);

    const rrfKatsayisi = 60;
    const wDense = 0.45;
    const wSparse = 0.25;
    const wSpatial = 0.30;

    const sonuclar: SpatialRagSonucu[] = adaylar.map((item) => {
      const denseRank = denseSirali.indexOf(item) + 1;
      const sparseRank = sparseSirali.indexOf(item) + 1;
      const spatialRank = spatialSirali.indexOf(item) + 1;

      const rrf =
        (wDense / (rrfKatsayisi + denseRank)) +
        (wSparse / (rrfKatsayisi + sparseRank)) +
        (wSpatial / (rrfKatsayisi + spatialRank));

      // 0-1 aralığına normalize et
      const maxRrf = (wDense + wSparse + wSpatial) / (rrfKatsayisi + 1);
      const rrfSkor = Number(Math.min(1, rrf / maxRrf).toFixed(4));

      let eslesmeGerekcesi = "";
      if (item.denseSkor > 0.5) eslesmeGerekcesi += "Semantik anlam eşleşti. ";
      if (item.sparseSkor > 0.3) eslesmeGerekcesi += "Anahtar kelimeler bulundu. ";
      if (item.mesafeKm !== undefined) {
        eslesmeGerekcesi += `${item.mesafeKm} km yakınlıkta.`;
      }

      return {
        dokuman: item.dokuman,
        denseSkor: item.denseSkor,
        sparseSkor: item.sparseSkor,
        spatialSkor: item.spatialSkor,
        mesafeKm: item.mesafeKm,
        rrfSkor,
        eslesmeGerekcesi: eslesmeGerekcesi.trim(),
      };
    });

    return sonuclar.sort((a, b) => b.rrfSkor - a.rrfSkor).slice(0, topK);
  }
}