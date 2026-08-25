import { describe, it, expect } from "vitest";
import { mevzuatStoreOlustur } from "../src/lib/rag/mevzuat-knowledge-base";

describe("Mevzuat RAG: İmar & Gayrimenkul Hukuku Knowledge Base", () => {
  const store = mevzuatStoreOlustur();

  it("Mevzuat store tüm temel kanunları içerir", () => {
    expect(store.toplamAdet()).toBeGreaterThanOrEqual(6);
  });

  it("DOP / 18. Madde sorgusu İmar Kanunu 18. Maddeyi ilk sırada bulur", () => {
    const sonuclar = store.ara({
      sorguMetni: "DOP kesintisi arsa düzenlemesi belediye yol terki",
      topK: 3,
    });

    expect(sonuclar.length).toBeGreaterThan(0);
    const ilkSonuc = sonuclar[0]!;
    expect(ilkSonuc.dokuman.metadata.kanunNo).toBe("3194");
    expect(ilkSonuc.dokuman.metadata.maddeNo).toBe("18");
  });

  it("Zeytinlik 3km koruma kuşağı sorgusunu doğru eşler", () => {
    const sonuclar = store.ara({
      sorguMetni: "Zeytinlik sahaya 3 kilometre fabrika sanayi yasağı",
      topK: 1,
    });

    expect(sonuclar.length).toBe(1);
    expect(sonuclar[0]!.dokuman.metadata.kanunNo).toBe("3573");
  });

  it("Hisseli tarla bölünemezlik 5403 kanununu bulur", () => {
    const sonuclar = store.ara({
      sorguMetni: "Tarla hisseli ifraz asgari 20 dönüm büyüklük",
      topK: 1,
    });

    expect(sonuclar.length).toBe(1);
    expect(sonuclar[0]!.dokuman.metadata.kanunNo).toBe("5403");
  });
});