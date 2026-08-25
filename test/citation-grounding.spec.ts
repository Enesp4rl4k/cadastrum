import { describe, it, expect } from "vitest";
import { CitationGroundingGuardrail } from "../src/lib/rag/citation-grounding";

describe("Citation Grounding & Guardrails", () => {
  const guard = new CitationGroundingGuardrail();

  it("Mevzuat içeren metinlere resmi kanun dipnotu ekler", () => {
    const metin = "Bu parselde belediye tarafından DOP kesintisi uygulanabilir.";
    const sonuc = guard.dogrulaVeDipnotEkle(metin);

    expect(sonuc.dipnotluMetin).toContain("[Kaynak: 3194 SK Md. 18]");
    expect(sonuc.referanslar.some((r) => r.kanunNo === "3194")).toBe(true);
    expect(sonuc.guvenliMi).toBe(true);
  });
});