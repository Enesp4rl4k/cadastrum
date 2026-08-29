/**
 * Heuristic fiyat tahmin motoru — Ana Orkestratör.
 * Çoklu sinyali birleştirir: sahibinden ilanGozlem birikimi (varsa ground truth),
 * TKGM analiz likiditesi, çevre POI yoğunluğu, eğim, nitelik, konum.
 *
 * Çıktı: alt/beklenen/üst TL/m² + güven skoru + bileşen breakdown.
 */

import type { Parsel } from "../types/tkgm";
import type { CevreAnalizi } from "./osm";
import type { EgimAnalizi } from "./elevation";
import type { EPlanImarVerisi } from "./eplan";
import { manuelVeriOku } from "./manuel-veri";
import { normalizeYerAdi } from "./tkgm-api";
import { baselineBandGenisletme } from "./baseline-engine";
import { ilLikiditeCarpani } from "./data/il-likidite";
import { biasCarpani } from "./bias-kalibrasyon";
import { depremRiskiGetir } from "./data/deprem-zonlari";
import { pgaCarpani } from "./deprem-tdth";
import { taskinRiskiGetir, taskinCarpani } from "./data/taskin-risk";
import {
  HEURISTIC_MULTIPLIER_BANT,
} from "./fiyat/constants";
import {
  manuelEmsaliIlanaCevir,
  yasAgirligi,
  clamp,
} from "./fiyat/emsal-havuzu";
import {
  guvenHesapla,
  ekGuvenKatmani,
  guvenSkoruTavani,
} from "./fiyat/guven-motoru";
import {
  bolgeBaseliniGetir,
} from "./fiyat/bolge-baseline";
import {
  nitelikCarpani,
  alanCarpani,
  konumCarpani,
  nufusYogunlukCarpani,
  cevreCarpani,
  kirsalCarpani,
  egimCarpani,
  fiyatIcinImarSec,
  imarCarpani,
  alanBandi,
  alanBandUyumu,
  segmentBul,
  segmentUyumu,
  imarSiniflandir,
  resmiImarSiniflandir,
  imarUyumu,
  alanBenzerlikSkoru,
  tarımsalMi,
  type ImarSinifi,
} from "./carpan-zinciri";

export interface FiyatBileseni {
  ad: string;
  carpan: number;
  not: string;
}

export interface FiyatTahmini {
  /** TL/m² alt sınır */
  altPerM2: number;
  /** TL/m² beklenen */
  beklenenPerM2: number;
  /** TL/m² üst sınır */
  ustPerM2: number;
  /** Toplam parsel TL alt */
  toplamAlt: number;
  /** Toplam parsel TL beklenen */
  toplamBeklenen: number;
  /** Toplam parsel TL üst */
  toplamUst: number;
  bilesenler: FiyatBileseni[];
  guven: "yuksek" | "orta" | "dusuk";
  guvenAciklama: string;
  /** Hangi kaynak baseline olarak kullanıldı */
  baselineKaynak: "spatial-radius" | "ilanGozlem-mahalle" | "ilanGozlem-ilce" | "mahalle-baseline" | "ilce-semt-baseline" | "ilce-baseline" | "il-baseline" | "fallback";
  baselineDeger: number;
  baselineNot: string;
  /**
   * Baseline'a uygulanan asking→kapanış iskontosu (0-1). Sadece gerçek emsal
   * havuzu kullanıldığında > 0. Motorun hedefi kapanış fiyatı olduğu için,
   * ilan (asking) fiyatlarıyla karşılaştırma yapan doğrulama araçları bu oranı
   * geri ekleyerek elmayla elmayı kıyaslamalı.
   */
  uygulananIndirim?: number;
  /** Kullanılan ilanGozlem kayıt sayısı (0 = statik tablo) */
  baselineAdet: number;
  /** 0-100 arası özet güven skoru */
  guvenSkoru: number;
  /** Kullanıcıya gösterilecek veri kalitesi işaretleri */
  veriKalitesiNotlari: string[];
  guvenKirilimi: Array<{
    etiket: string;
    puan: number;
    durum: "pozitif" | "notr" | "uyari";
  }>;
  sonrakiHamleler: string[];
  aralikGenisligiYuzde: number;
  /** Emsal havuzunun yaş dağılımı — TR enflasyonunda taze veri kritik */
  tazelikOzeti: {
    havuzAdet: number;
    tazeAdet: number;
    stalAdet: number;
    son30Gun: number;
    son90Gun: number;
    ortalamaYasGun: number;
  } | null;
  /** Kullanılan emsal havuzu özeti */
  emsalOzeti: {
    secilenAdet: number;
    mahalleAdet: number;
    ilceAdet: number;
    dogrulanabilirAdet: number;
    ortalamaBenzerlik: number;
    weightedAsking: number;
    outlierAdet: number;
    dovizDonusturulenAdet: number;
  } | null;
  imarOzeti: {
    sinif: ImarSinifi;
    kaynak: "eplan-resmi" | "ilan-imar" | "parsel-nitelik";
    not: string;
    resmiDetay: {
      kullanimKarari: string | null;
      planKarari: string | null;
      yapiNizami: string | null;
      emsal: number | null;
      taks: number | null;
      maksKat: number | null;
      yakalandiAt: number | null;
      guvenSkoru: number | null;
    } | null;
  };
  /** AI için ham emsal verileri */
  emsalListesi: Array<{
    fiyatPerM2: number;
    alan: number;
    benzerlik: number;
    tazelikGun: number;
    ilanNo: string;
  }>;
  /** Triangulasyon uyumsuzluğu yüksekse true */
  manuelReviewGerek?: boolean;
}

export async function fiyatTahminEt(
  parsel: Parsel,
  cevre: CevreAnalizi | null = null,
  egim: EgimAnalizi | null = null,
  resmiImar: EPlanImarVerisi | null = null,
  _heyelan?: unknown,
  _taskinKoord?: unknown,
): Promise<FiyatTahmini> {
  const manuelVeri = await manuelVeriOku(parsel);
  const manuelIlanlar = manuelVeri.emsaller.map(m => manuelEmsaliIlanaCevir(parsel, m));
  const baseline = await bolgeBaseliniGetir(parsel, manuelIlanlar);

  if (parsel.merkezNokta?.lat != null && parsel.merkezNokta?.lng != null) {
    try {
      const { radiusEmsalGetir, spatialBaselineYeterliMi, D_BY_KATEGORI } = await import("./spatial-emsal");
      const spatialKategori = baseline.kategori === "tarla" ? "tarla" : "arsa";
      const D = D_BY_KATEGORI[spatialKategori];
      const radiusM = 2 * D;
      const spatial = await radiusEmsalGetir(
        parsel.merkezNokta.lat,
        parsel.merkezNokta.lng,
        radiusM,
        spatialKategori,
      );

      let blendBaseline: number | null = spatial.baseline;
      let blendAdet = spatial.emsaller.length;
      let blendNot: string | null = null;
      try {
        const { apiSpatialEmsalGetir } = await import("./api-fiyat");
        const remote = await apiSpatialEmsalGetir(
          parsel.merkezNokta.lat,
          parsel.merkezNokta.lng,
          radiusM / 1000,
          spatialKategori,
        );
        if (remote?.baseline != null && remote.adet > 0) {
          const wLocal = Math.min((spatial.emsaller.length || 0) / 20, 0.6);
          const wRemote = 1 - wLocal;
          if (spatial.baseline != null && spatial.emsaller.length > 0) {
            blendBaseline = Math.round(
              spatial.baseline * wLocal + remote.baseline * wRemote,
            );
            blendNot = `Hibrit (yerel ${spatial.emsaller.length} × ${(wLocal * 100).toFixed(0)}% + backend ${remote.adet} × ${(wRemote * 100).toFixed(0)}%)`;
          } else {
            blendBaseline = remote.baseline;
            blendNot = `Sadece backend havuz (${remote.adet} emsal)`;
          }
          blendAdet = (spatial.emsaller.length || 0) + remote.adet;
        }
      } catch {
        // Fallback to local
      }

      if (
        (spatialBaselineYeterliMi(spatial) || (blendNot && blendBaseline != null)) &&
        blendBaseline != null
      ) {
        baseline.baseline = blendBaseline;
        baseline.kaynak = "spatial-radius";
        baseline.guvenAdet = Math.max(baseline.guvenAdet, blendAdet);
        baseline.veriKalitesiNotlari.unshift(
          `Spatial emsal: ${spatial.emsaller.length} ilan (1km: ${spatial.halkaDagilimi.r0_1km}, 3km: ${spatial.halkaDagilimi.r1_3km}, 5km: ${spatial.halkaDagilimi.r3_5km}), D=${spatial.D}m${blendNot ? " · " + blendNot : ""}`,
        );
      }
    } catch (e) {
      console.warn("[fiyat-tahmin] spatial baseline hatası:", e);
    }
  }

  const resmiImarVar = !!resmiImar && resmiImar.kaynakUrl !== "manuel";
  const manuelImarVar =
    !!(resmiImar as { manuelGirildi?: boolean } | null)?.manuelGirildi ||
    (!!resmiImar && resmiImar.kaynakUrl === "manuel");
  const manuelImarDetayAdet = [
    resmiImar?.kullanimKarari || resmiImar?.planKarari,
    resmiImar?.taks,
    resmiImar?.emsal,
    resmiImar?.maksKat,
    resmiImar?.yapiNizami,
  ].filter((v) => v != null && v !== "").length;

  let nitelik = nitelikCarpani(parsel.nitelik);
  if (baseline.kategori === "tarla") {
    if (/tarla/i.test(parsel.nitelik)) {
      nitelik = { ad: "Tarla", carpan: 1.0, not: "Tarımsal baseline kalibreli" };
    } else if (/zeytin/i.test(parsel.nitelik)) {
      nitelik = { ad: "Zeytinlik", carpan: 1.4, not: "Zeytinlik primi (3573 sayılı kanun)" };
    } else if (/bahçe|bahce/i.test(parsel.nitelik)) {
      nitelik = { ad: "Bahçe", carpan: 1.3, not: "Bahçe primi (sulu/yetiştirme)" };
    } else if (/bağ\b|bag\b/iu.test(parsel.nitelik)) {
      nitelik = { ad: "Bağ", carpan: 1.1, not: "Bağ niteliği" };
    } else if (/arsa/i.test(parsel.nitelik)) {
      nitelik = { ad: "Arsa", carpan: 4.0, not: "Tarımsal baseline'dan arsa kategorisine upgrade" };
    } else if (/mesken|bina/i.test(parsel.nitelik)) {
      nitelik = { ad: "Yapılı", carpan: 8.0, not: "Yapı + arsa kombo, tarımsal baseline üzeri" };
    }
  }
  const imar = fiyatIcinImarSec(parsel, resmiImar);
  const imarC = imarCarpani(imar, baseline.kategori);

  if (
    baseline.kategori !== "tarla" &&
    (imar.sinif === "konut-imarli" ||
      imar.sinif === "ticari-imarli" ||
      imar.sinif === "sanayi-imarli")
  ) {
    if (/tarla/i.test(parsel.nitelik) && nitelik.carpan < 0.5) {
      nitelik = { ad: nitelik.ad, carpan: 0.5, not: `${nitelik.not} (imar ${imar.sinif} ile yukarı çekildi)` };
    } else if (/bahçe|bahce/i.test(parsel.nitelik) && nitelik.carpan < 0.85) {
      nitelik = { ad: nitelik.ad, carpan: 0.85, not: `${nitelik.not} (imar ${imar.sinif} ile yukarı çekildi)` };
    } else if (/bağ\b|bag\b/iu.test(parsel.nitelik) && nitelik.carpan < 0.7) {
      nitelik = { ad: nitelik.ad, carpan: 0.7, not: `${nitelik.not} (imar ${imar.sinif} ile yukarı çekildi)` };
    } else if (/zeytin/i.test(parsel.nitelik) && nitelik.carpan < 0.6) {
      nitelik = { ad: nitelik.ad, carpan: 0.6, not: `${nitelik.not} (imar ${imar.sinif} ile yukarı çekildi)` };
    }
  }

  const alan = alanCarpani(parsel.alan, baseline.kategori);
  const konum = konumCarpani(parsel);
  const cevreC = cevreCarpani(cevre);
  const egimC = egimCarpani(egim);
  const kirsalC = kirsalCarpani(parsel.nitelik, cevre?.kirsal ?? null);

  const kategoriMultiplier = nitelik.carpan * imarC.carpan;
  const rawIncearMultiplier = alan.carpan * konum.carpan * cevreC.carpan * egimC.carpan * kirsalC.carpan;
  // Koruma bandı kategoriye bağlı — alan etkisinin gerçek aralığı arsa ve tarlada
  // farklı, tek bir band arsa'nın uçlarını kırpıyordu (bkz. constants.ts).
  const incearBant = HEURISTIC_MULTIPLIER_BANT[baseline.kategori];
  const clampedIncearMultiplier =
    rawIncearMultiplier <= 0
      ? 0
      : clamp(rawIncearMultiplier, incearBant.min, incearBant.max);
  const incearClampFactor =
    rawIncearMultiplier > 0 ? clampedIncearMultiplier / rawIncearMultiplier : 1;
  const incearClamped = Math.abs(incearClampFactor - 1) > 0.01;

  const clampedMultiplier = kategoriMultiplier * clampedIncearMultiplier;
  const kategoriMultiplierAsiri = kategoriMultiplier > 6.0;
  const multiplierClamped = incearClamped || kategoriMultiplierAsiri;

  const bilesenler: FiyatBileseni[] = [
    {
      ad: `Bölge baseline (${baseline.kaynak})`,
      carpan: baseline.baseline,
      not: baseline.not,
    },
    { ad: `Nitelik: ${nitelik.ad}`, carpan: nitelik.carpan, not: nitelik.not },
    { ad: "İmar sinyali", carpan: imarC.carpan, not: imarC.not },
    { ad: "Alan etkisi", carpan: alan.carpan, not: alan.not },
    { ad: "Konum etkisi", carpan: konum.carpan, not: konum.not },
    { ad: "Çevre/POI", carpan: cevreC.carpan, not: cevreC.not },
    { ad: "Eğim", carpan: egimC.carpan, not: egimC.not },
  ];
  if (kirsalC.carpan !== 1.0) {
    bilesenler.push({ ad: "Kırsal (Su/Yol/Köy)", carpan: kirsalC.carpan, not: kirsalC.not });
  }
  if (incearClamped) {
    bilesenler.push({
      ad: "İnce ayar koruma bandı",
      carpan: incearClampFactor,
      not: `İnce ayar çarpanları ham ×${rawIncearMultiplier.toFixed(2)} idi; ×${clampedIncearMultiplier.toFixed(2)} bandına çekildi (kategori çarpanları clamp dışı).`,
    });
  }
  if (kategoriMultiplierAsiri) {
    bilesenler.push({
      ad: "Aşırı kategori çarpanı uyarısı",
      carpan: kategoriMultiplier,
      not: `Nitelik × imar = ×${kategoriMultiplier.toFixed(2)} (>6). Kategori sıçraması doğal olabilir ama güven düşürüldü; manuel doğrulama önerilir.`,
    });
  }

  const ilNormForBias = parsel.ilAd ? normalizeYerAdi(parsel.ilAd) : null;
  const ilceNormForBias = parsel.ilceAd ? normalizeYerAdi(parsel.ilceAd) : null;
  const biasKategori = baseline.kategori === "tarla" ? "tarla" : "arsa";
  const bias = await biasCarpani(ilNormForBias, ilceNormForBias, biasKategori);
  if (bias.carpan !== 1.0) {
    bilesenler.push({
      ad: "Bias düzeltme",
      carpan: bias.carpan,
      not: bias.aciklama,
    });
  }

  const nufusC = nufusYogunlukCarpani(ilNormForBias);
  if (nufusC.carpan !== 1.0) {
    bilesenler.push({
      ad: "Nüfus yoğunluğu",
      carpan: nufusC.carpan,
      not: nufusC.not,
    });
  }

  const depremRisk = ilNormForBias ? depremRiskiGetir(ilNormForBias) : null;
  let dCarpan = 1.0;
  if (depremRisk) {
    dCarpan = pgaCarpani(depremRisk.pga);
    if (dCarpan !== 1.0) {
      bilesenler.push({
        ad: `Deprem riski: ${depremRisk.zon}`,
        carpan: dCarpan,
        not: `${depremRisk.not} (PGA ${depremRisk.pga.toFixed(2)}g)`,
      });
    }
  }

  const taskinBilgi = ilNormForBias ? taskinRiskiGetir(ilNormForBias) : null;
  let tCarpan = 1.0;
  if (taskinBilgi && taskinBilgi.risk !== "orta") {
    tCarpan = taskinCarpani(taskinBilgi.risk);
    if (tCarpan !== 1.0) {
      bilesenler.push({
        ad: `Taşkın riski: ${taskinBilgi.risk}`,
        carpan: tCarpan,
        not: taskinBilgi.not,
      });
    }
  }

  // ── LOG-HEDONİK SÖNÜMLEME (Multiplier Compounding Engeli) ─────────────────
  // İkincil faktörlerin (çevre, eğim, nüfus, deprem, taşkın, bias) bağımsız çarpım
  // yerine logaritmik uzayda dengelenmesi:
  const logIkincil =
    Math.log(clampedIncearMultiplier > 0 ? clampedIncearMultiplier : 1) +
    Math.log(bias.carpan > 0 ? bias.carpan : 1) +
    Math.log(nufusC.carpan > 0 ? nufusC.carpan : 1) +
    Math.log(dCarpan > 0 ? dCarpan : 1) +
    Math.log(tCarpan > 0 ? tCarpan : 1);

  // İkincil çarpan bandını [0.65, 1.45] arasında yumuşat
  const sonumlenmisIkincilCarpan = Math.exp(clamp(logIkincil, Math.log(0.65), Math.log(1.45)));

  let nihaiCarpan = kategoriMultiplier * sonumlenmisIkincilCarpan;

  // Aşırı sıçramayı önleyen kategori tavan/taban sınırları:
  if (baseline.kategori === "tarla") {
    nihaiCarpan = clamp(nihaiCarpan, 0.40, 2.50);
  } else {
    nihaiCarpan = clamp(nihaiCarpan, 0.35, 4.20);
  }

  let beklenenPerM2 = Math.round(baseline.baseline * nihaiCarpan);

  // Sahte hassasiyeti kaldır (yuvarlama)
  if (beklenenPerM2 >= 10000) {
    beklenenPerM2 = Math.round(beklenenPerM2 / 50) * 50;
  } else if (beklenenPerM2 >= 1000) {
    beklenenPerM2 = Math.round(beklenenPerM2 / 10) * 10;
  }

  const guvenBilgisi = guvenHesapla({
    baseline,
    cevreVar: cevre != null,
    egimVar: egim != null,
    multiplierClamped,
    resmiImarVar,
  });
  const ekGuven = ekGuvenKatmani({
    baseline,
    cevreVar: cevre != null,
    egimVar: egim != null,
    multiplierClamped,
    resmiImarVar,
    manuelImarVar,
    manuelImarDetayAdet,
    manuelEmsalAdet: manuelVeri.emsaller.length,
  });

  const kaynakTavan = guvenSkoruTavani(baseline.kaynak);
  const guvenSkoru = Math.min(
    kaynakTavan,
    clamp(guvenBilgisi.guvenSkoru + ekGuven.ekSkor, 5, 98),
  );
  const veriKalitesiNotlari = [...guvenBilgisi.veriKalitesiNotlari, ...ekGuven.ekNotlar];

  const ilNorm = parsel.ilAd ? normalizeYerAdi(parsel.ilAd) : "";
  const likidite = ilLikiditeCarpani(ilNorm);
  const rangeAyari = likidite.carpan < 1 ? (1 - likidite.carpan) * 0.5 : 0;
  const bandEk = baselineBandGenisletme({
    kaynak: baseline.kaynak,
    uyumsuzluk: baseline.triUyumsuzluk,
  });
  const altRangeAyarli = clamp(
    guvenBilgisi.altRange + ekGuven.altRangeDelta - rangeAyari - bandEk,
    0.4, 0.96,
  );
  const ustRangeAyarli = clamp(
    guvenBilgisi.ustRange + ekGuven.ustRangeDelta + rangeAyari + bandEk,
    1.04, 1.6,
  );
  const altPerM2 = Math.round(beklenenPerM2 * altRangeAyarli);
  const ustPerM2 = Math.round(beklenenPerM2 * ustRangeAyarli);

  if (ilNorm && likidite.aciklama) {
    veriKalitesiNotlari.push(`Likidite: ${likidite.aciklama}.`);
  }

  return {
    altPerM2,
    beklenenPerM2,
    ustPerM2,
    toplamAlt: Math.round(altPerM2 * parsel.alan),
    toplamBeklenen: Math.round(beklenenPerM2 * parsel.alan),
    toplamUst: Math.round(ustPerM2 * parsel.alan),
    bilesenler,
    guven: guvenBilgisi.guven,
    guvenAciklama: guvenBilgisi.guvenAciklama,
    baselineKaynak: baseline.kaynak,
    baselineDeger: Math.round(baseline.baseline),
    baselineNot: baseline.not,
    uygulananIndirim: baseline.uygulananIndirim,
    baselineAdet: baseline.guvenAdet,
    guvenSkoru,
    veriKalitesiNotlari,
    guvenKirilimi: ekGuven.guvenKirilimi,
    sonrakiHamleler: ekGuven.sonrakiHamleler.slice(0, 3),
    aralikGenisligiYuzde: Math.round((ustRangeAyarli - altRangeAyarli) * 100),
    emsalOzeti: baseline.emsalOzeti,
    tazelikOzeti: baseline.tazelikOzeti,
    imarOzeti: {
      sinif: imar.sinif,
      kaynak: imar.kaynak,
      not: imar.not,
      resmiDetay: resmiImar
        ? {
            kullanimKarari: resmiImar.kullanimKarari,
            planKarari: resmiImar.planKarari,
            yapiNizami: resmiImar.yapiNizami,
            emsal: resmiImar.emsal,
            taks: resmiImar.taks,
            maksKat: resmiImar.maksKat,
            yakalandiAt: resmiImar.yakalandiAt,
            guvenSkoru: resmiImar.guvenSkoru,
          }
        : null,
    },
    emsalListesi: baseline.emsalListesi || [],
    manuelReviewGerek: baseline.triManuelReview === true ? true : undefined,
  };
}

export function fmtTL(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} Milyar TL`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M TL`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K TL`;
  return `${n.toLocaleString("tr-TR")} TL`;
}

export function fmtTLM2(n: number): string {
  return `${n.toLocaleString("tr-TR")} TL/m²`;
}

// Geriye dönük uyumluluk re-export'ları (diğer modüller ve testler için)
export {
  guvenSkoruTavani,
  yasAgirligi,
  alanBandi,
  alanBandUyumu,
  segmentBul,
  segmentUyumu,
  imarSiniflandir,
  resmiImarSiniflandir,
  imarCarpani,
  imarUyumu,
  alanBenzerlikSkoru,
  alanCarpani,
  nitelikCarpani,
  tarımsalMi,
  bolgeBaseliniGetir,
};