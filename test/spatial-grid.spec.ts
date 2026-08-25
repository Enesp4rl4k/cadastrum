import { describe, it, expect } from "vitest";
import { SpatialGrid, haversineMesafe } from "../src/lib/spatial/spatial-grid";

describe("SpatialGrid 2D Mekansal İndeks", () => {
  it("noktaları doğru grid hücrelerine ekler ve boyutunu sayar", () => {
    const grid = new SpatialGrid<{ lat: number; lng: number; ad: string }>();

    grid.insert({ lat: 41.01, lng: 28.95, ad: "İstanbul Tarihi Yarımada" });
    grid.insert({ lat: 41.08, lng: 29.05, ad: "İstanbul Beykoz" });
    grid.insert({ lat: 39.92, lng: 32.85, ad: "Ankara Kızılay" });

    expect(grid.size()).toBe(3);
  });

  it("BBox sorgusunda sadece sınırlar içindeki noktaları döndürür", () => {
    const grid = new SpatialGrid<{ lat: number; lng: number; ad: string }>();

    grid.load([
      { lat: 41.01, lng: 28.95, ad: "Fatih" },
      { lat: 41.08, lng: 29.05, ad: "Beykoz" },
      { lat: 40.98, lng: 29.02, ad: "Kadıköy" },
      { lat: 38.42, lng: 27.14, ad: "İzmir Konak" },
    ]);

    // İstanbul BBox
    const istanbul = grid.queryBbox(40.8, 28.5, 41.3, 29.5);
    expect(istanbul.length).toBe(3);
    const adlar = istanbul.map((x) => x.ad);
    expect(adlar).toContain("Fatih");
    expect(adlar).toContain("Beykoz");
    expect(adlar).toContain("Kadıköy");
    expect(adlar).not.toContain("İzmir Konak");
  });

  it("queryRadius mesafe sıralı ve yarıçap filtreli sonuç döndürür", () => {
    const grid = new SpatialGrid<{ lat: number; lng: number; id: number }>();

    // Merkez: 41.000, 29.000
    grid.insert({ lat: 41.001, lng: 29.001, id: 1 }); // ~140m
    grid.insert({ lat: 41.010, lng: 29.010, id: 2 }); // ~1400m
    grid.insert({ lat: 41.100, lng: 29.100, id: 3 }); // ~14km

    const sonuclar = grid.queryRadius(41.0, 29.0, 2000); // 2km radius
    expect(sonuclar.length).toBe(2);
    expect(sonuclar[0]?.item.id).toBe(1);
    expect(sonuclar[1]?.item.id).toBe(2);
    expect(sonuclar[0]?.mesafeM).toBeLessThan(sonuclar[1]?.mesafeM!);
  });

  it("findNearest en yakın k komşuyu doğru getirir", () => {
    const grid = new SpatialGrid<{ lat: number; lng: number; id: number }>();

    for (let i = 1; i <= 20; i++) {
      grid.insert({ lat: 41.0 + i * 0.005, lng: 29.0 + i * 0.005, id: i });
    }

    const nearest3 = grid.findNearest(41.0, 29.0, 3, 50_000);
    expect(nearest3.length).toBe(3);
    expect(nearest3[0]?.item.id).toBe(1);
    expect(nearest3[1]?.item.id).toBe(2);
    expect(nearest3[2]?.item.id).toBe(3);
  });

  it("haversineMesafe bilinen mesafeleri hassas hesaplar", () => {
    // İstanbul Fatih (41.0182, 28.9484) -> Kadıköy (40.9904, 29.0292) ≈ 7.5 km
    const m = haversineMesafe(41.0182, 28.9484, 40.9904, 29.0292);
    expect(m).toBeGreaterThan(7000);
    expect(m).toBeLessThan(8500);
  });
});
