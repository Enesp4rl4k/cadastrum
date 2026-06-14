/**
 * Doğal dil sorgu parser — Faz 5 Sprint H.
 *
 * "Beykoz, 1000m² üstü, 5M altı arsa" → yapısal sorgu objesi.
 *
 * Yerel regex tabanlı (deterministik, hızlı, AI çağrısı yok). Türkçe rakam
 * yazımları (5M, 500K, 2.5M, 100bin) + m² eşikleri + kategori + il/ilçe adı.
 *
 * Backend Gemini fallback ileride eklenebilir (Pro tier rate limit içinde);
 * şu an %90 vakayı yerel parser yakalar.
 */

import { IL_DEPREM } from "./data/deprem-zonlari";

export type NlKategori = "arsa" | "tarla" | "konut";

export interface NlSorgu {
  /** Hammetin */
  ham: string;
  /** Tespit edilen il (normalize edilmiş) */
  ilNorm?: string | null;
  /** Tespit edilen ilçe (normalize edilmiş, basit eşleştirme yapılır) */
  ilceNorm?: string | null;
  /** Kategori */
  kategori?: NlKategori;
  /** Min m² */
  minM2?: number;
  /** Maks m² */
  maksM2?: number;
  /** Min fiyat (TL) */
  minFiyat?: number;
  /** Maks fiyat (TL) */
  maksFiyat?: number;
  /** Sahil yakını ister mi */
  sahilYakini?: boolean;
  /** Düşük deprem riski ister mi */
  dusukDepremRiski?: boolean;
  /** Tespit edilen anahtar kelimeler (debug) */
  bulunan: string[];
}

const TR_LOWER = (s: string) =>
  s.toLocaleLowerCase("tr").replace(/[çğıöşü]/g, (c) =>
    ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c,
  );

/**
 * "5M", "500K", "2.5milyon", "100bin", "5 milyon" gibi yazımları sayıya çevir.
 * Döndüğü değer TL olarak (1 milyon = 1_000_000).
 */
function parseSayi(metin: string): number | null {
  // Boşlukları temizle, virgülü noktaya çevir
  const t = metin.replace(/\s+/g, "").replace(",", ".");
  const m = t.match(/^(\d+(?:\.\d+)?)([kmb])?$/i) ||
    t.match(/^(\d+(?:\.\d+)?)(milyon|m\b)?$/i) ||
    t.match(/^(\d+(?:\.\d+)?)(bin|k\b)?$/i);
  if (!m) {
    // sadece sayı?
    const sade = parseFloat(t);
    return Number.isFinite(sade) ? sade : null;
  }
  const sayi = parseFloat(m[1]!);
  if (!Number.isFinite(sayi)) return null;
  const suffix = (m[2] ?? "").toLowerCase();
  if (suffix === "k" || suffix === "bin") return sayi * 1000;
  if (suffix === "m" || suffix === "milyon") return sayi * 1_000_000;
  if (suffix === "b") return sayi * 1_000_000_000;
  return sayi;
}

/** Türkiye 81 il + popüler ilçe key listesi (deprem-zonlari'ndan reuse). */
const IL_LISTESI = Object.keys(IL_DEPREM);

const POPULER_ILCELER: Record<string, string> = {
  // istanbul
  "beykoz": "istanbul",
  "kadikoy": "istanbul",
  "besiktas": "istanbul",
  "uskudar": "istanbul",
  "sariyer": "istanbul",
  "buyukcekmece": "istanbul",
  "silivri": "istanbul",
  "catalca": "istanbul",
  "sile": "istanbul",
  // ankara
  "cankaya": "ankara",
  "etimesgut": "ankara",
  "golbasi": "ankara",
  // izmir
  "cesme": "izmir",
  "urla": "izmir",
  "selcuk": "izmir",
  // mugla
  "bodrum": "mugla",
  "fethiye": "mugla",
  "marmaris": "mugla",
  // antalya
  "alanya": "antalya",
  "manavgat": "antalya",
  "kemer": "antalya",
};

/**
 * Doğal dil sorgusunu yapısal objeye çevir.
 * Best-effort — tüm alanlar opsiyonel; tespit edilemeyen alanlar undefined.
 */
export function nlParse(metin: string): NlSorgu {
  const ham = metin.trim();
  const t = TR_LOWER(ham);
  const bulunan: string[] = [];
  const sonuc: NlSorgu = { ham, bulunan };

  // Kategori
  if (/\btarla\b|\bzeytin\b|\bbag\b|\bbahce\b/.test(t)) {
    sonuc.kategori = "tarla";
    bulunan.push("kategori:tarla");
  } else if (/\bkonut\b|\bdaire\b|\bvilla\b|\bmustakil\b|\bmesken\b|\bev\b/.test(t)) {
    sonuc.kategori = "konut";
    bulunan.push("kategori:konut");
  } else if (/\barsa\b/.test(t)) {
    sonuc.kategori = "arsa";
    bulunan.push("kategori:arsa");
  }

  // İl tespiti — kelime sınırıyla
  for (const il of IL_LISTESI) {
    const re = new RegExp(`\\b${il}\\b`, "i");
    if (re.test(t)) {
      sonuc.ilNorm = il;
      bulunan.push(`il:${il}`);
      break;
    }
  }

  // İlçe tespiti
  for (const [ilce, il] of Object.entries(POPULER_ILCELER)) {
    const re = new RegExp(`\\b${ilce}\\b`, "i");
    if (re.test(t)) {
      sonuc.ilceNorm = ilce;
      if (!sonuc.ilNorm) sonuc.ilNorm = il;
      bulunan.push(`ilce:${ilce}`);
      break;
    }
  }

  // m² eşikleri — "1000m² üstü", "500 m2 alt", "min 1000 m²", "max 5000 m²"
  const m2Match = [...t.matchAll(/(\d+(?:\.\d+)?)\s*m[²2]?/g)];
  for (const m of m2Match) {
    const sayi = parseFloat(m[1]!);
    if (!Number.isFinite(sayi)) continue;
    const idx = m.index ?? 0;
    const oncesi = t.slice(Math.max(0, idx - 20), idx);
    const sonrasi = t.slice(idx + m[0].length, idx + m[0].length + 20);
    if (/\bust|\bbuyuk|\bmin|\bartik|\bdaha\s*buyuk/.test(oncesi + sonrasi)) {
      sonuc.minM2 = sayi;
      bulunan.push(`minM2:${sayi}`);
    } else if (/\balt|\bkucuk|\bmaks|\bmax|\bdaha\s*kucuk/.test(oncesi + sonrasi)) {
      sonuc.maksM2 = sayi;
      bulunan.push(`maksM2:${sayi}`);
    } else if (sonuc.minM2 == null && sonuc.maksM2 == null) {
      // bağlam yoksa min varsayım
      sonuc.minM2 = sayi;
      bulunan.push(`minM2:${sayi}`);
    }
  }

  // Fiyat eşikleri — "5M altı", "2 milyon üstü", "500k-1M arası"
  const fiyatRe = /(\d+(?:[.,]\d+)?)\s*(m\b|milyon|k\b|bin)?/gi;
  // Daha hedefli: "X tl/m" m2 fiyat ihtimalini ele
  // Basit yaklaşım: "M/milyon/k/bin" suffix'i olan sayıları topla, bağlam'a göre min/max ata
  const sayilarBuyuk: Array<{ deger: number; idx: number; uzunluk: number }> = [];
  let match: RegExpExecArray | null;
  fiyatRe.lastIndex = 0;
  while ((match = fiyatRe.exec(t)) != null) {
    if (!match[2]) continue; // suffix'i olmayan sayılar fiyat değil
    const v = parseSayi(match[0]);
    if (v != null && v >= 1000) {
      sayilarBuyuk.push({ deger: v, idx: match.index, uzunluk: match[0].length });
    }
  }
  for (const s of sayilarBuyuk) {
    const oncesi = t.slice(Math.max(0, s.idx - 20), s.idx);
    const sonrasi = t.slice(s.idx + s.uzunluk, s.idx + s.uzunluk + 20);
    const ctx = oncesi + sonrasi;
    if (/\balt|\bkucuk|\bmaks|\bmax|\baltinda|\badanak/.test(ctx)) {
      sonuc.maksFiyat = s.deger;
      bulunan.push(`maksFiyat:${s.deger}`);
    } else if (/\bust|\bbuyuk|\bmin|\bartik|\bustunde/.test(ctx)) {
      sonuc.minFiyat = s.deger;
      bulunan.push(`minFiyat:${s.deger}`);
    } else if (sonuc.maksFiyat == null) {
      // bağlam yoksa max varsayım (genel kullanıcı "bütçem" demek istiyor)
      sonuc.maksFiyat = s.deger;
      bulunan.push(`maksFiyat:${s.deger}`);
    }
  }

  // Modifier'lar
  if (/\bsahile?\s+yakin|\bdenize?\s+yakin|\bsahil\s+manzaral/.test(t)) {
    sonuc.sahilYakini = true;
    bulunan.push("modifier:sahil");
  }
  if (/\bdusuk\s+deprem|\bguvenli\s+bolge|\bdeprem\s+riski\s+dusuk/.test(t)) {
    sonuc.dusukDepremRiski = true;
    bulunan.push("modifier:dusuk-deprem");
  }

  return sonuc;
}
