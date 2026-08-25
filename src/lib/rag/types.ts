/**
 * Semantik Katman & Spatial RAG Tipleri.
 */

export interface EmbeddingVector {
  vector: number[];
  dimension: number;
}

export interface VektorDokumani {
  id: string;
  metin: string;
  vektor?: number[];
  sparseTokens?: Record<string, number>; // BM25 token frekansları
  metadata: {
    tip: "ilan" | "mevzuat" | "emsal" | "plan_notu" | "ekspertiz";
    baslik?: string;
    kaynak?: string;
    kanunNo?: string;
    maddeNo?: string;
    ilNorm?: string;
    ilceNorm?: string;
    mahalleNorm?: string;
    lat?: number;
    lng?: number;
    fiyatPerM2?: number;
    kategori?: string;
    tarih?: string | number;
    ekBilgiler?: Record<string, unknown>;
  };
}

export interface SpatialRagSorgusu {
  sorguMetni: string;
  merkezLat?: number;
  merkezLng?: number;
  maksMesafeKm?: number;
  kategori?: string;
  ilNorm?: string;
  ilceNorm?: string;
  topK?: number;
  filtreler?: {
    tip?: VektorDokumani["metadata"]["tip"];
    minFiyatPerM2?: number;
    maksFiyatPerM2?: number;
    kanunNo?: string;
  };
}

export interface SpatialRagSonucu {
  dokuman: VektorDokumani;
  denseSkor: number;
  sparseSkor: number;
  spatialSkor: number;
  mesafeKm?: number;
  rrfSkor: number; // Reciprocal Rank Fusion birleşik skor (0-1)
  eslesmeGerekcesi: string;
}

export interface MevzuatMaddesi {
  kanunAdi: string;
  kanunNo: string;
  maddeNo: string;
  maddeBasligi: string;
  metin: string;
  ozet: string;
  etiketler: string[];
  riskKategorisi: "yuksek" | "orta" | "dusuk" | "bilgi";
}