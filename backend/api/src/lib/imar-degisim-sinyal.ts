/**
 * İmar Değişikliği Sinyal — Faz C1
 *
 * Resmi plan hükmü değildir. Proxy sinyal hesabı:
 *   1. Uydu gelişim skoru (çevresel yapılaşma ivmesi)
 *   2. TKGM satış yoğunluğu (spekülatif faaliyet proxy)
 *   3. Komşu emsal sıçraması (yakın mahalle/ilçe emsal artışı)
 *   4. ÇDP katmanı mesafesi (kentsel dönüşüm sınırına yakınlık)
 *   5. İmar tipi belirsizliği (boş/tarım = dönüşüm potansiyeli)
 *
 * Çıktı: { olasılik: "dusuk"|"orta"|"yuksek", skor: 0-100, bilesenler: [...], gerekce: string }
 */

export type ImarDegisimOlasılık = "dusuk" | "orta" | "yuksek";

export interface ImarDegisimGirdi {
  /** Uydu gelişim skoru -100…+100 (GelisimTrendi'nden) */
  gelisimSkoru?: number | null;
  /** TKGM satış yoğunluğu (son 1 yıl, yakın çevre) */
  tkgmSatisYogunlugu?: number | null;
  /** Komşu ilçe medyan TL/m² artışı — yüzde (son 12 ay) */
  komsuemsalDegisimYuzde?: number | null;
  /** ÇDP kentsel dönüşüm sınırına mesafe km */
  cdpMesafeKm?: number | null;
  /** Mevcut imar tipi */
  imarTipi?: string | null;
  /** Emsal (KAKS) — düşük emsal = dönüşüm baskısı */
  emsal?: number | null;
  /** İl/ilçe bazlı fiyat trendi değişim yüzdesi */
  bolgeselTrendYuzde?: number | null;
}

export interface ImarDegisimBilesen {
  id: string;
  ad: string;
  puan: number;  // 0-30
  max: number;
  yorum: string;
}

export interface ImarDegisimSonuc {
  skor: number;                  // 0-100
  olasılik: ImarDegisimOlasılık;
  bilesenler: ImarDegisimBilesen[];
  gerekce: string;
  disclaimer: string;
}

const DISCLAIMER =
  "Proxy sinyallere dayalı model çıktısıdır. Resmi imar planı değişikliği için " +
  "yetkili belediye veya Çevre ve Şehircilik İl Müdürlüğü'ne başvurun.";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

// ── Bileşen hesaplayıcılar ────────────────────────────────────────────────────

function puanGelisim(g: ImarDegisimGirdi): ImarDegisimBilesen {
  const max = 30;
  const gs = g.gelisimSkoru;
  if (gs == null || !Number.isFinite(gs)) {
    return { id: "gelisim", ad: "Uydu gelişim", puan: 10, max, yorum: "Uydu sinyali yok — nötr" };
  }
  // +50 üzeri → güçlü yapılaşma ivmesi → yüksek dönüşüm baskısı
  const puan = clamp(Math.round(10 + gs * 0.2), 0, max);
  return {
    id: "gelisim",
    ad: "Uydu gelişim",
    puan,
    max,
    yorum: gs > 30
      ? `Çevre hızla yapılaşıyor (skor +${Math.round(gs)}) — imar baskısı yüksek`
      : gs > 0
        ? `Orta düzey yapılaşma ivmesi (skor +${Math.round(gs)})`
        : `Çevresel gelişim zayıf (skor ${Math.round(gs)})`,
  };
}

function puanSatis(g: ImarDegisimGirdi): ImarDegisimBilesen {
  const max = 20;
  const sy = g.tkgmSatisYogunlugu;
  if (sy == null || !Number.isFinite(sy) || sy < 0) {
    return { id: "satis", ad: "TKGM satış yoğunluğu", puan: 7, max, yorum: "TKGM verisi yok" };
  }
  // Satış yoğunluğu > 0.05 → spekülatif ilgi
  const puan = clamp(Math.round(sy * 200), 0, max);
  return {
    id: "satis",
    ad: "TKGM satış yoğunluğu",
    puan,
    max,
    yorum: sy > 0.05
      ? `Yüksek satış yoğunluğu — spekülatif faaliyet sinyali`
      : sy > 0.01
        ? `Orta düzey işlem hacmi`
        : `Düşük satış yoğunluğu`,
  };
}

function puanKomsuEmsal(g: ImarDegisimGirdi): ImarDegisimBilesen {
  const max = 20;
  const ked = g.komsuemsalDegisimYuzde;
  if (ked == null || !Number.isFinite(ked)) {
    return { id: "emsal", ad: "Komşu emsal sıçraması", puan: 5, max, yorum: "Komşu emsal verisi yok" };
  }
  // %30+ yıllık fiyat artışı → güçlü emsal sıçraması sinyali
  const puan = clamp(Math.round(Math.max(0, ked) * 0.5), 0, max);
  return {
    id: "emsal",
    ad: "Komşu emsal sıçraması",
    puan,
    max,
    yorum: ked > 30
      ? `Komşu bölge %${Math.round(ked)} değer kazandı — emsal baskısı yüksek`
      : ked > 10
        ? `Orta düzey komşu emsal artışı (%${Math.round(ked)})`
        : `Komşu emsal değişimi sınırlı (%${Math.round(ked)})`,
  };
}

function puanCdp(g: ImarDegisimGirdi): ImarDegisimBilesen {
  const max = 15;
  const cdp = g.cdpMesafeKm;
  if (cdp == null || !Number.isFinite(cdp) || cdp < 0) {
    return { id: "cdp", ad: "ÇDP mesafesi", puan: 5, max, yorum: "ÇDP verisi yok" };
  }
  // 0-2 km = çok yakın, 2-5 km = yakın, 5+ km = uzak
  const puan = clamp(Math.round(max - cdp * 2), 0, max);
  return {
    id: "cdp",
    ad: "ÇDP mesafesi",
    puan,
    max,
    yorum: cdp < 2
      ? `ÇDP kentsel dönüşüm sınırına çok yakın (${cdp.toFixed(1)} km)`
      : cdp < 5
        ? `ÇDP sınırına orta mesafede (${cdp.toFixed(1)} km)`
        : `ÇDP sınırından uzak (${cdp.toFixed(1)} km)`,
  };
}

function puanImarPotansiyel(g: ImarDegisimGirdi): ImarDegisimBilesen {
  const max = 15;
  let puan = 5;
  const tip = (g.imarTipi ?? "belirsiz").toLowerCase();

  // Tarım/belirsiz → yüksek dönüşüm potansiyeli
  if (tip.includes("tar") || tip === "tarim") puan = 12;
  else if (tip === "belirsiz" || tip === "") puan = 10;
  else if (tip === "konut" && g.emsal != null && g.emsal < 0.5) puan = 8;
  else if (tip === "konut") puan = 5;
  else if (tip === "ticari") puan = 3; // zaten yüksek — dönüşüm baskısı az
  else puan = 5;

  // Bölgesel trend katkısı
  if (g.bolgeselTrendYuzde != null && g.bolgeselTrendYuzde > 20) puan += 3;

  puan = clamp(puan, 0, max);
  return {
    id: "imar",
    ad: "İmar dönüşüm potansiyeli",
    puan,
    max,
    yorum: tip.includes("tar") || tip === "tarim"
      ? "Tarımsal parsel — imar dönüşümüne açık"
      : tip === "belirsiz"
        ? "İmar belirsiz — dönüşüm riski/potansiyeli var"
        : `${tip} imarı — mevcut kullanım ${puan > 8 ? "değişim baskısında" : "stabil"}`,
  };
}

// ── Ana hesaplama ─────────────────────────────────────────────────────────────

export function imarDegisimHesapla(g: ImarDegisimGirdi): ImarDegisimSonuc {
  const bilesenler = [
    puanGelisim(g),
    puanSatis(g),
    puanKomsuEmsal(g),
    puanCdp(g),
    puanImarPotansiyel(g),
  ];

  const skor = clamp(
    bilesenler.reduce((s, b) => s + b.puan, 0),
    0,
    100,
  );

  const olasılik: ImarDegisimOlasılık =
    skor >= 60 ? "yuksek" : skor >= 35 ? "orta" : "dusuk";

  // Gerekçe özeti
  const gucluB = [...bilesenler].sort((a, b) => b.puan / b.max - a.puan / a.max)[0]!;
  const zayifB = [...bilesenler].sort((a, b) => a.puan / a.max - b.puan / b.max)[0]!;

  const olasılikTr = olasılik === "yuksek" ? "Yüksek" : olasılik === "orta" ? "Orta" : "Düşük";
  const gerekce =
    `İmar değişikliği olasılığı: ${olasılikTr} (skor ${skor}/100). ` +
    `Güçlü sinyal: ${gucluB.ad} — ${gucluB.yorum}. ` +
    (zayifB.id !== gucluB.id ? `Zayıf sinyal: ${zayifB.ad} — ${zayifB.yorum}.` : "");

  return { skor, olasılik, bilesenler, gerekce, disclaimer: DISCLAIMER };
}

/** Olasılık rengi */
export function imarDegisimRenk(olasılik: ImarDegisimOlasılık): string {
  if (olasılik === "yuksek") return "#059669"; // emerald
  if (olasılik === "orta")   return "#d97706"; // amber
  return "#6b7280"; // gray
}
