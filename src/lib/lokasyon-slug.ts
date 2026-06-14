/**
 * İlan URL slug'larından lokasyon çıkarımı (ASCII).
 * TKGM eşleşmesi normalizeTr ile uyumludur.
 */
import { normalizeTr } from "./tkgm-api";

const SAHIBINDEN_KATEGORI =
  /^(?:arsa|tarla|konut|ticari|emlak|satilik|kiralik|arsasi|konut-arsasi|ticari-arsa|bahce|bag|zeytinlik|depo|fabrika|is-yeri|isyeri|dukkan|magaza|bina|devre-mulk|devremulk|turistik|tesis|prefabrik|kooperatif)(?:-|$)/i;

/** Türkçe → ASCII slug parçası (URL ile karşılaştırma) */
export function asciiSlugParca(s: string): string {
  return normalizeTr(s).replace(/\s+/g, "-");
}

function slugParcalariCap(parts: string[]): string {
  const cap = (x: string) =>
    x ? x.charAt(0).toLocaleUpperCase("tr") + x.slice(1) : "";
  return parts.map(cap).join(" ");
}

/**
 * Sahibinden ilan URL: /ilan/arsa-satilik-balikesir-altieylul-bozen-12345678901
 */
export function sahibindenUrldenLokasyon(url: string): {
  il: string | null;
  ilce: string | null;
  mahalle: string | null;
} {
  const m = /\/ilan\/([a-z0-9-]+)-(\d{8,11})(?:\/|$|\?)/i.exec(url);
  if (!m?.[1]) return { il: null, ilce: null, mahalle: null };

  let parts = m[1].split("-").filter(Boolean);
  while (parts.length > 0 && SAHIBINDEN_KATEGORI.test(parts[0]!)) {
    parts = parts.slice(1);
  }
  if (parts.length < 2) return { il: null, ilce: null, mahalle: null };

  return {
    il: slugParcalariCap([parts[0]!]),
    ilce: slugParcalariCap([parts[1]!]),
    mahalle: parts.length >= 3 ? slugParcalariCap(parts.slice(2)) : null,
  };
}

/**
 * Hepsiemlak: /balikesir-altieylul-bozen-satilik-arsa/...
 */
export function hepsiemlakUrldenLokasyon(url: string): {
  il: string | null;
  ilce: string | null;
  mahalle: string | null;
} {
  try {
    const path = new URL(url, "https://www.hepsiemlak.com").pathname
      .replace(/^\/en\//, "/")
      .replace(/^\/tr\//, "/");
    const m = /\/([a-z0-9-]+)-(?:satilik|kiralik)(?:-[a-z0-9-]+)?(?:\/|$)/i.exec(path);
    if (!m?.[1]) return { il: null, ilce: null, mahalle: null };
    const parts = m[1].split("-").filter(Boolean);
    if (parts.length < 2) return { il: null, ilce: null, mahalle: null };
    return {
      il: slugParcalariCap([parts[0]!]),
      ilce: slugParcalariCap([parts[1]!]),
      mahalle: parts.length >= 3 ? slugParcalariCap(parts.slice(2)) : null,
    };
  } catch {
    return { il: null, ilce: null, mahalle: null };
  }
}

export function ilanUrldenLokasyon(
  url: string,
  kaynak: "sahibinden" | "hepsiemlak",
): { il: string | null; ilce: string | null; mahalle: string | null } {
  return kaynak === "hepsiemlak"
    ? hepsiemlakUrldenLokasyon(url)
    : sahibindenUrldenLokasyon(url);
}
