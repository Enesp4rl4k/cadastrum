import { describe, it, expect, beforeEach } from "vitest";
import {
  SpatialRagStore,
  haversineMesafeKm,
  spatialDecaySkoru,
} from "../src/lib/rag/spatial-rag";
import {
  cosineSimilarity,
  sparseTokenize,
  sparseSimilarity,
  yerelEmbeddingUret,
} from "../src/lib/rag/embedding-service";
import type { VektorDokumani } from "../src/lib/rag/types";

describe("Semantik Katman: Spatial RAG & Embedding Motoru", () => {
  it("Cosine similarity özdeş vektörlerde 1.0 döner", () => {
    const v1 = [0.5, 0.5, 0.5, 0.5];
    const v2 = [0.5, 0.5, 0.5, 0.5];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0, 3);
  });

  it("Cosine similarity zıt/ortogonal vektörlerde 0 döner", () => {
    const v1 = [1, 0, 0];
    const v2 = [0, 1, 0];
    expect(cosineSimilarity(v1, v2)).toBe(0);
  });

  it("Haversine mesafe hesabını doğru yapar (İstanbul - İzmir ~330km)", () => {
    const istLat = 41.0082, istLng = 28.9784;
    const izmLat = 38.4192, izmLng = 27.1287;
    const mesafe = haversineMesafeKm(istLat, istLng, izmLat, izmLng);
    expect(mesafe).toBeGreaterThan(320);
    expect(mesafe).toBeLessThan(360);
  });

  it("Spatial decay sıfır mesafede 1.0 verir, uzaklaştıkça azalır", () => {
    expect(spatialDecaySkoru(0, 5)).toBe(1);
    expect(spatialDecaySkoru(5, 5)).toBeCloseTo(Math.exp(-1), 2);
    expect(spatialDecaySkoru(15, 5)).toBeLessThan(0.1);
  });

  it("BM25 sparse tokenization ve benzerlik doğru çalışır", () => {
    const t1 = sparseTokenize("Muğla Fethiye satılık imarlı zeytinlik");
    const t2 = sparseTokenize("Fethiye Ölüdeniz imarlı arsa satılık");
    const sim = sparseSimilarity(t1, t2);
    expect(sim).toBeGreaterThan(0.3);
  });

  it("SpatialRagStore hibrit semantik + uzamsal aramayı doğru sıralar", () => {
    const store = new SpatialRagStore();

    const doc1: VektorDokumani = {
      id: "doc-1",
      metin: "Muğla Fethiye Ölüdeniz manzaralı satılık villa arsası",
      metadata: {
        tip: "ilan",
        ilNorm: "mugla",
        ilceNorm: "fethiye",
        lat: 36.65,
        lng: 29.12,
        fiyatPerM2: 15_000,
        kategori: "arsa",
      },
    };

    const doc2: VektorDokumani = {
      id: "doc-2",
      metin: "Ankara Gölbaşı imarlı tarla",
      metadata: {
        tip: "ilan",
        ilNorm: "ankara",
        ilceNorm: "golbasi",
        lat: 39.79,
        lng: 32.81,
        fiyatPerM2: 2_000,
        kategori: "tarla",
      },
    };

    store.ekle(doc1);
    store.ekle(doc2);

    const sonuclar = store.ara({
      sorguMetni: "Fethiye deniz manzaralı arsa",
      merkezLat: 36.62,
      merkezLng: 29.11,
      maksMesafeKm: 20,
    });

    expect(sonuclar.length).toBe(1);
    expect(sonuclar[0]!.dokuman.id).toBe("doc-1");
    expect(sonuclar[0]!.rrfSkor).toBeGreaterThan(0.5);
  });
});