/**
 * JWT decode — signature verify YAPMIYOR (backend verir).
 * Sadece `sub`, `admin`/`adm`, `tier` gibi claim'leri tarayıcıda okumak için.
 *
 * Bu dosya React import etmez — service worker scope'unda da güvenle kullanılır.
 * `lisans.ts` bunu re-export eder (geriye dönük import yolu).
 */

export interface JwtPayload {
  sub?: string | number;
  /** Backend bazen `adm`, bazen `admin` yazıyor — her ikisini de oku */
  admin?: 0 | 1;
  adm?: 0 | 1;
  tier?: string;
  exp?: number;
}

export function decodeJwt(token: string | null | undefined): JwtPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1]!
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(parts[1]!.length + ((4 - (parts[1]!.length % 4)) % 4), "=");
    const json = atob(payload);
    const obj = JSON.parse(json) as JwtPayload;
    if (obj.exp && Date.now() / 1000 > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}

export function tokenAdminMi(payload: JwtPayload | null): boolean {
  if (!payload) return false;
  return payload.admin === 1 || payload.adm === 1;
}
