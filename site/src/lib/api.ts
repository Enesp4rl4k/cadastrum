/**
 * Cadastrum API client (server-side, Cloudflare Workers fetch).
 * /veri/* sayfaları SSR — bu modülden veri çekilir, HTML render edilir.
 */
import { PUBLIC_API_BASE } from "./config";
const API_BASE = PUBLIC_API_BASE;

export type Kategori = "arsa" | "tarla" | "konut";

export interface MahalleVeri {
  medyan?: number;
  q1?: number;
  q3?: number;
  ortalama?: number;
  ilan_adet?: number;
  son_guncelleme?: number;
  kaynak?: string;
  trend?: Array<{ yil: number; ay: number; medyan: number; ilan_adet: number }>;
}

export interface IlceVeri extends MahalleVeri {
  mahalleler?: Array<{ mahalle_norm: string; medyan: number; ilan_adet: number }>;
}

export interface IlVeri extends MahalleVeri {
  ilceler?: Array<{ ilce_norm: string; medyan: number; ilan_adet: number }>;
}

export async function getMahalle(
  il: string,
  ilce: string,
  mahalle: string,
  kategori: Kategori = "arsa",
): Promise<MahalleVeri | null> {
  try {
    const url = `${API_BASE}/fiyat/mahalle/${encodeURIComponent(il)}/${encodeURIComponent(ilce)}/${encodeURIComponent(mahalle)}?kategori=${kategori}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getIlce(
  il: string,
  ilce: string,
  kategori: Kategori = "arsa",
): Promise<IlceVeri | null> {
  try {
    const url = `${API_BASE}/fiyat/ilce/${encodeURIComponent(il)}/${encodeURIComponent(ilce)}?kategori=${kategori}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getIl(
  il: string,
  kategori: Kategori = "arsa",
): Promise<IlVeri | null> {
  try {
    const url = `${API_BASE}/fiyat/il/${encodeURIComponent(il)}?kategori=${kategori}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Slug → Türkçe başlık. "kadikoy" → "Kadıköy"
 * Kabaca capital + il/ilçe data tablomuzdan eşleştirme.
 * Şimdilik basit capitalize, ileride mahalleler.json'dan tam isim alınır.
 */
export function slugDisplay(slug: string): string {
  return slug
    .split("-")
    .map(w => w.charAt(0).toLocaleUpperCase("tr") + w.slice(1))
    .join(" ");
}

export function fmtTL(n: number | undefined | null): string {
  if (!n || n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M TL`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K TL`;
  return `${Math.round(n).toLocaleString("tr-TR")} TL`;
}

export function fmtTLM2(n: number | undefined | null): string {
  if (!n || n <= 0) return "—";
  return `${Math.round(n).toLocaleString("tr-TR")} TL/m²`;
}

export function gunGecen(ts: number | undefined | null): string {
  if (!ts) return "—";
  const gun = Math.floor((Date.now() - ts) / 86400000);
  if (gun < 1) return "bugün";
  if (gun === 1) return "1 gün önce";
  if (gun < 30) return `${gun} gün önce`;
  if (gun < 365) return `${Math.floor(gun / 30)} ay önce`;
  return `${Math.floor(gun / 365)} yıl önce`;
}
