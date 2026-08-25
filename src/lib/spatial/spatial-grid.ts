/**
 * 2D Spatial Grid & Geospatial Indexing
 *
 * Provides $O(1)$ grid lookup and fast $O(\log N)$ / candidate-pruned spatial range
 * and k-nearest neighbor queries over coordinates (65k+ mahalleler, emsaller).
 */

export interface Point2D {
  lat: number;
  lng: number;
}

/** Haversine distance in meters between two lat/lng coordinates */
export function haversineMesafe(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export class SpatialGrid<T extends Point2D> {
  private grid: Map<string, T[]> = new Map();
  private readonly cellSizeDeg: number;
  private itemCount = 0;

  /**
   * @param cellSizeDeg Grid cell size in degrees (default: 0.05° ≈ 5.5 km at Turkey latitude)
   */
  constructor(cellSizeDeg = 0.05) {
    this.cellSizeDeg = cellSizeDeg;
  }

  private cellKey(lat: number, lng: number): string {
    const x = Math.floor(lng / this.cellSizeDeg);
    const y = Math.floor(lat / this.cellSizeDeg);
    return `${x}:${y}`;
  }

  public insert(item: T): void {
    if (typeof item.lat !== "number" || typeof item.lng !== "number") return;
    const key = this.cellKey(item.lat, item.lng);
    let bucket = this.grid.get(key);
    if (!bucket) {
      bucket = [];
      this.grid.set(key, bucket);
    }
    bucket.push(item);
    this.itemCount++;
  }

  public load(items: T[]): void {
    for (const item of items) {
      this.insert(item);
    }
  }

  public clear(): void {
    this.grid.clear();
    this.itemCount = 0;
  }

  public size(): number {
    return this.itemCount;
  }

  /**
   * Query all items within a bounding box.
   */
  public queryBbox(minLat: number, minLng: number, maxLat: number, maxLng: number): T[] {
    const minX = Math.floor(minLng / this.cellSizeDeg);
    const maxX = Math.floor(maxLng / this.cellSizeDeg);
    const minY = Math.floor(minLat / this.cellSizeDeg);
    const maxY = Math.floor(maxLat / this.cellSizeDeg);

    const results: T[] = [];

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const bucket = this.grid.get(`${x}:${y}`);
        if (!bucket) continue;
        for (const item of bucket) {
          if (
            item.lat >= minLat &&
            item.lat <= maxLat &&
            item.lng >= minLng &&
            item.lng <= maxLng
          ) {
            results.push(item);
          }
        }
      }
    }

    return results;
  }

  /**
   * Query items within radius (in meters) from a center coordinate.
   */
  public queryRadius(lat: number, lng: number, radiusM: number): Array<{ item: T; mesafeM: number }> {
    const latDelta = radiusM / 111_000;
    const lngDelta = radiusM / (111_000 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));

    const candidates = this.queryBbox(
      lat - latDelta,
      lng - lngDelta,
      lat + latDelta,
      lng + lngDelta
    );

    const matched: Array<{ item: T; mesafeM: number }> = [];

    for (const item of candidates) {
      const d = haversineMesafe(lat, lng, item.lat, item.lng);
      if (d <= radiusM) {
        matched.push({ item, mesafeM: Math.round(d) });
      }
    }

    matched.sort((a, b) => a.mesafeM - b.mesafeM);
    return matched;
  }

  /**
   * Find k-nearest neighbors to a center coordinate within maxRadiusM.
   */
  public findNearest(lat: number, lng: number, k = 5, maxRadiusM = 50_000): Array<{ item: T; mesafeM: number }> {
    const radial = this.queryRadius(lat, lng, maxRadiusM);
    return radial.slice(0, k);
  }
}
