import { describe, it, expect } from "vitest";
import { ImarKnowledgeGraph } from "../src/lib/rag/knowledge-graph";

describe("GraphRAG: İmar Hukuku Knowledge Graph", () => {
  it("Tarımsal plan alanından 5403 bölünemezlik kısıtlaması zincirini bulur", () => {
    const graph = new ImarKnowledgeGraph();
    const zincirler = graph.zincirleriBul("tarim_alani", 3);

    expect(zincirler.length).toBeGreaterThan(0);
    const ifrazZinciri = zincirler.find((z) => z.sonucKisitlamasi.includes("20.000"));
    expect(ifrazZinciri).toBeDefined();
    expect(ifrazZinciri?.yasalDayanak).toContain("5403");
  });

  it("Zeytin alanından 3573 sanayi yasağı kısıtlamasını bulur", () => {
    const graph = new ImarKnowledgeGraph();
    const zincirler = graph.zincirleriBul("zeytin_alani", 3);

    expect(zincirler.length).toBeGreaterThan(0);
    const zeytinZinciri = zincirler.find((z) => z.sonucKisitlamasi.includes("3 km"));
    expect(zeytinZinciri).toBeDefined();
    expect(zeytinZinciri?.yasalDayanak).toContain("3573");
  });
});