/**
 * İmar Değişikliği Sinyal — Faz C1
 * Extension + backend'de ortak kullanılan pure hesaplama lib'i.
 * Resmi plan hükmü değildir.
 */

export type ImarDegisimOlasılık = "dusuk" | "orta" | "yuksek";

export interface ImarDegisimGirdi {
  gelisimSkoru?: number | null;
  tkgmSatisYogunlugu?: number | null;
  komsuemsalDegisimYuzde?: number | null;
  cdpMesafeKm?: number | null;
  imarTipi?: string | null;
  emsal?: number | null;
  bolgeselTrendYuzde?: number | null;
}

export interface ImarDegisimBilesen {
  id: string;
  ad: string;
  puan: number;
  max: number;
  yorum: string;
}

export interface ImarDegisimSonuc {
  skor: number;
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

function puanGelisim(g: ImarDegisimGirdi): ImarDegisimBilesen {
  const max = 30;
  const gs = g.gelisimSkoru;
  if (gs == null || !Number.isFinite(gs)) {
    return { id: "gelisim", ad: "Uydu gelişim", puan: 10, max, yorum: "Uydu sinyali yok — nötr" };
  }
  const puan = clamp(Math.round(10 + gs * 0.2), 0, max);
  return {
    id: "gelisim", ad: "Uydu gelişim", puan, max,
    yorum: gs > 30
      ? `Çevre hızla yapılaşıyor (skor +${Math.round(gs)}) — imar baskısı yüksek`
      : gs > 0 ? `Orta düzey yapılaşma ivmesi (skor +${Math.round(gs)})`
      : `Çevresel gelişim zayıf (skor ${Math.round(gs)})`,
  };
}

function puanSatis(g: ImarDegisimGirdi): ImarDegisimBilesen {
  const max = 20;
  const sy = g.tkgmSatisYogunlugu;
  if (sy == null || !Number.isFinite(sy) || sy < 0) {
    return { id: "satis", ad: "TKGM satış yoğunluğu", puan: 7, max, yorum: "TKGM verisi yok" };
  }
  const puan = clamp(Math.round(sy * 200), 0, max);
  return {
    id: "satis", ad: "TKGM satış yoğunluğu", puan, max,
    yorum: sy > 0.05 ? "Yüksek satış yoğunluğu — spekülatif faaliyet sinyali"
      : sy > 0.01 ? "Orta düzey işlem hacmi"
      : "Düşük satış yoğunluğu",
  };
}

function puanKomsuEmsal(g: ImarDegisimGirdi): ImarDegisimBilesen {
  const max = 20;
  const ked = g.komsuemsalDegisimYuzde;
  if (ked == null || !Number.isFinite(ked)) {
    return { id: "emsal", ad: "Komşu emsal sıçraması", puan: 5, max, yorum: "Komşu emsal verisi yok" };
  }
  const puan = clamp(Math.round(Math.max(0, ked) * 0.5), 0, max);
  return {
    id: "emsal", ad: "Komşu emsal sıçraması", puan, max,
    yorum: ked > 30 ? `Komşu bölge %${Math.round(ked)} değer kazandı — emsal baskısı yüksek`
      : ked > 10 ? `Orta düzey komşu emsal artışı (%${Math.round(ked)})`
      : `Komşu emsal değişimi sınırlı (%${Math.round(ked)})`,
  };
}

function puanCdp(g: ImarDegisimGirdi): ImarDegisimBilesen {
  const max = 15;
  const cdp = g.cdpMesafeKm;
  if (cdp == null || !Number.isFinite(cdp) || cdp < 0) {
    return { id: "cdp", ad: "ÇDP mesafesi", puan: 5, max, yorum: "ÇDP verisi yok" };
  }
  const puan = clamp(Math.round(max - cdp * 2), 0, max);
  return {
    id: "cdp", ad: "ÇDP mesafesi", puan, max,
    yorum: cdp < 2 ? `ÇDP kentsel dönüşüm sınırına çok yakın (${cdp.toFixed(1)} km)`
      : cdp < 5 ? `ÇDP sınırına orta mesafede (${cdp.toFixed(1)} km)`
      : `ÇDP sınırından uzak (${cdp.toFixed(1)} km)`,
  };
}

function puanImarPotansiyel(g: ImarDegisimGirdi): ImarDegisimBilesen {
  const max = 15;
  let puan = 5;
  const tip = (g.imarTipi ?? "belirsiz").toLowerCase();
  if (tip.includes("tar") || tip === "tarim") puan = 12;
  else if (tip === "belirsiz" || tip === "") puan = 10;
  else if (tip === "konut" && g.emsal != null && g.emsal < 0.5) puan = 8;
  else if (tip === "konut") puan = 5;
  else if (tip === "ticari") puan = 3;
  else puan = 5;
  if (g.bolgeselTrendYuzde != null && g.bolgeselTrendYuzde > 20) puan += 3;
  puan = clamp(puan, 0, max);
  return {
    id: "imar", ad: "İmar dönüşüm potansiyeli", puan, max,
    yorum: tip.includes("tar") || tip === "tarim" ? "Tarımsal parsel — imar dönüşümüne açık"
      : tip === "belirsiz" ? "İmar belirsiz — dönüşüm riski/potansiyeli var"
      : `${tip} imarı — mevcut kullanım ${puan > 8 ? "değişim baskısında" : "stabil"}`,
  };
}

export function imarDegisimHesapla(g: ImarDegisimGirdi): ImarDegisimSonuc {
  const bilesenler: ImarDegisimBilesen[] = [
    puanGelisim(g), puanSatis(g), puanKomsuEmsal(g), puanCdp(g), puanImarPotansiyel(g),
  ];
  const skor = clamp(bilesenler.reduce((s, b) => s + b.puan, 0), 0, 100);
  const olasılik: ImarDegisimOlasılık = skor >= 60 ? "yuksek" : skor >= 35 ? "orta" : "dusuk";

  const sorted = [...bilesenler].sort((a, b) => b.puan / b.max - a.puan / a.max);
  const gucluB = sorted[0]!;
  const zayifB = sorted[sorted.length - 1]!;
  const olasılikTr = olasılik === "yuksek" ? "Yüksek" : olasılik === "orta" ? "Orta" : "Düşük";
  const gerekce =
    `İmar değişikliği olasılığı: ${olasılikTr} (skor ${skor}/100). ` +
    `Güçlü sinyal: ${gucluB.ad}. ` +
    (zayifB.id !== gucluB.id ? `Zayıf sinyal: ${zayifB.ad}.` : "");

  return { skor, olasılik, bilesenler, gerekce, disclaimer: DISCLAIMER };
}

export function imarDegisimRenk(olasılik: ImarDegisimOlasılık): string {
  if (olasılik === "yuksek") return "#059669";
  if (olasılik === "orta")   return "#d97706";
  return "#6b7280";
}
