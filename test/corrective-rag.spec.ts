import { describe, it, expect } from "vitest";
import { SpatialRagStore } from "../src/lib/rag/spatial-rag";
import { CorrectiveRagEngine } from "../src/lib/rag/corrective-rag";
import type { VektorDokumani } from "../src/lib/rag/types";

describe("CRAG: Corrective RAG & Adaptive Search Engine", () => {
  it("Sonuç yetersiz olduğunda arama yarıçapını otomatik genişletir (Self-Correction)", () => {
    const store = new SpatialRagStore();

    // 8 km uzakta bir emsal ekle
    const docUzak: VektorDokumani = {
      id: "doc-uzak-1",
      metin: "İzmir Çeşme Alaçatı satılık arsa",
      metadata: {
        tip: "ilan",
        lat: 38.35,
        lng: 26.40,
        kategori: "arsa",
      },
    };
    store.ekle(docUzak);

    const crag = new CorrectiveRagEngine(store);

    // 3 km yarıçapla ara -> Normalde boş dönerdi, CRAG genişletip bulmalı
    const sonuc = crag.ara({
      sorguMetni: "Çeşme satılık arsa",
      merkezLat: 38.30,
      merkezLng: 26.35,
      maksMesafeKm: 3,
    });

    expect(sonuc.uygulananDuzeltmeler.length).toBeGreaterThan(0);
    expect(sonuc.uygulananDuzeltmeler[0]).toContain("genişletildi");
    expect(sonuc.sonuclar.length).toBeGreaterThanOrEqual(1);
    expect(sonuc.sonuclar[0]!.dokuman.id).toBe("doc-uzak-1");
  });
});