import type { Parsel } from "../types/tkgm";

export interface CoordInput {
  lat: number;
  lng: number;
  label?: string;
}

/**
 * CSV / paste metnini lat,lng[,label] satırlarına ayırır.
 * - Virgül, noktalı virgül, sekme ayırıcı kabul eder.
 * - "lat,lng" başlık satırını atlar.
 * - Decimal virgül (Türkçe Excel) destekler: "41,0086" → 41.0086.
 *   Ayırıcı virgülse 41,0086,28,9802 → ilk iki sayı lat-int+frac karışır → noktalı virgülle ayrılmasını öner.
 */
export function parseCoordsText(text: string): {
  coords: CoordInput[];
  errors: string[];
} {
  const coords: CoordInput[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const [i, raw] of lines.entries()) {
    // Başlık satırını atla
    if (i === 0 && /^(lat|enlem|y)[\s,;\t]/i.test(raw)) continue;

    const sep = raw.includes("\t")
      ? "\t"
      : raw.includes(";")
        ? ";"
        : ",";
    const parts = raw.split(sep).map((p) => p.trim());

    if (parts.length < 2) {
      errors.push(`Satır ${i + 1}: en az lat,lng bekleniyor → "${raw}"`);
      continue;
    }

    // Decimal virgül desteği — sadece ayırıcı sekme/noktalı virgülse
    const norm = (s: string) =>
      sep === "," ? s : s.replace(",", ".");

    const lat = Number.parseFloat(norm(parts[0] ?? ""));
    const lng = Number.parseFloat(norm(parts[1] ?? ""));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      errors.push(`Satır ${i + 1}: geçersiz sayı → "${raw}"`);
      continue;
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      errors.push(
        `Satır ${i + 1}: lat/lng aralık dışı (lat ±90, lng ±180) → "${raw}"`,
      );
      continue;
    }

    coords.push({
      lat,
      lng,
      label: parts[2]?.trim() || undefined,
    });
  }

  return { coords, errors };
}

export interface BulkResult {
  input: CoordInput;
  parsel: Parsel | null;
  hata: string | null;
}

export function toCsv(results: BulkResult[]): string {
  const header = [
    "lat",
    "lng",
    "label",
    "il",
    "ilce",
    "mahalle",
    "ada",
    "parsel",
    "alan_m2",
    "nitelik",
    "pafta",
    "hata",
  ];
  const rows = results.map((r) => {
    const p = r.parsel;
    return [
      r.input.lat,
      r.input.lng,
      r.input.label ?? "",
      p?.ilAd ?? "",
      p?.ilceAd ?? "",
      p?.mahalleAd ?? "",
      p?.adaNo ?? "",
      p?.parselNo ?? "",
      p?.alan ?? "",
      p?.nitelik ?? "",
      p?.pafta ?? "",
      r.hata ?? "",
    ].map(csvCell);
  });
  return [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toGeoJson(results: BulkResult[]): string {
  const features = results
    .filter((r) => r.parsel)
    .map((r) => {
      const p = r.parsel as Parsel;
      return {
        type: "Feature" as const,
        geometry: p.geometri,
        properties: {
          input_lat: r.input.lat,
          input_lng: r.input.lng,
          label: r.input.label ?? "",
          il: p.ilAd,
          ilce: p.ilceAd,
          mahalle: p.mahalleAd,
          ada: p.adaNo,
          parsel: p.parselNo,
          alan_m2: p.alan,
          nitelik: p.nitelik,
          pafta: p.pafta,
        },
      };
    });
  return JSON.stringify(
    { type: "FeatureCollection", features },
    null,
    2,
  );
}

export function toKml(results: BulkResult[]): string {
  const placemarks = results
    .filter((r) => r.parsel)
    .map((r) => {
      const p = r.parsel as Parsel;
      const ring = (p.geometri.coordinates[0] ?? []) as number[][];
      const coordsStr = ring
        .map((c) => `${c[0]},${c[1]},0`)
        .join(" ");
      const name = `${p.adaNo}/${p.parselNo}`;
      const desc = [
        `İl: ${p.ilAd}`,
        `İlçe: ${p.ilceAd}`,
        `Mahalle: ${p.mahalleAd}`,
        `Alan: ${p.alan} m²`,
        `Nitelik: ${p.nitelik}`,
      ].join("\n");
      return `    <Placemark>
      <name>${escXml(name)}</name>
      <description>${escXml(desc)}</description>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordsStr}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>TKGM Parsel Sorgu Sonuçları</name>
${placemarks}
  </Document>
</kml>`;
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function downloadFile(
  content: string,
  filename: string,
  mime: string,
): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
