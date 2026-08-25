import type { Parsel } from "../../types/tkgm";
import type { IlanGozlem } from "../db";
import type { FiyatTahmini } from "./types";
import { db } from "../db";
import { normalizeYerAdi } from "../tkgm-api";
import {
  GUN_MS,
  MAX_ILAN_YASI_GUN,
  MIN_MAHALLE_BASELINE_SAMPLES,
  MIN_ILCE_BASELINE_SAMPLES,
  IL_BASELINE_ARSA_TL_M2,
  IL_BASELINE_TARLA_TL_M2,
  FALLBACK_BASELINE_TL_M2,
  FALLBACK_TARLA_BASELINE_TL_M2,
} from "./constants";
import {
  emsalAdaylariniOlustur,
  emsalSec,
  weightedAverage,
  weightedMedian,
  clamp,
} from "./emsal-havuzu";
import { tarımsalMi } from "../carpan-zinciri";
import {
  bolgeFiyatOzetiHesapla,
  dinamikIndirimOrani,
  outlierTemizleBaglamsalAsimli,
} from "../fiyat-correction";
import { ilceBaselineGetir } from "../data/ilce-baseline";
import { enflasyonDuzelt } from "../enflasyon-duzeltme";
import {
  mahalleBaselineGetirAsync,
  triangulateBaseline,
  type TriangulasyonKaynak,
} from "../baseline-engine";
import { apiFiyatMahalleSorgula } from "../api-fiyat";
import type { BolgeBaselineSonuc } from "./guven-motoru";

export function yerelBaselineAgirligi(args: {
  secilenAdet: number;
  ortalamaBenzerlik: number;
  ortalamaYasGun: number;
  mahalleOrani: number;
  alanBandUyumOrani: number;
}): number {
  const adetSkoru = clamp(args.secilenAdet / 8, 0.25, 1);
  const benzerlikSkoru = clamp(args.ortalamaBenzerlik, 0, 1);
  const tazelikSkoru =
    args.ortalamaYasGun <= 30 ? 1 :
    args.ortalamaYasGun <= 60 ? 0.9 :
    args.ortalamaYasGun <= 90 ? 0.78 :
    args.ortalamaYasGun <= 120 ? 0.66 : 0.55;
  const mahalleSkoru = clamp(0.55 + args.mahalleOrani * 0.45, 0.55, 1);
  const bandSkoru = clamp(0.5 + args.alanBandUyumOrani * 0.5, 0.5, 1);
  return clamp(
    adetSkoru * 0.32 +
      benzerlikSkoru * 0.24 +
      tazelikSkoru * 0.18 +
      mahalleSkoru * 0.14 +
      bandSkoru * 0.12,
    0.35,
    0.94,
  );
}

export async function destekBaselineGetir(
  parsel: Parsel,
  kategori: "arsa" | "tarla",
): Promise<{
  baseline: number;
  kaynak: "mahalle-baseline" | "ilce-semt-baseline" | "ilce-baseline" | "il-baseline" | "fallback";
  not: string;
} | null> {
  const mahalleSonuc = await mahalleBaselineGetirAsync(
    parsel.ilAd,
    parsel.ilceAd,
    parsel.mahalleAd,
    kategori,
  );
  if (mahalleSonuc && mahalleSonuc.kaynak !== "ilce-only" && mahalleSonuc.kaynak !== "fallback") {
    return {
      baseline: mahalleSonuc.baseline,
      kaynak: "mahalle-baseline",
      not: mahalleSonuc.not,
    };
  }

  const ilceStatik = ilceBaselineGetir(
    parsel.ilAd ?? "",
    parsel.ilceAd ?? "",
    parsel.mahalleAd,
    kategori,
  );
  if (ilceStatik) return ilceStatik;

  if (kategori === "tarla") {
    const tarlaBaselineHam =
      IL_BASELINE_TARLA_TL_M2[parsel.ilAd] ?? FALLBACK_TARLA_BASELINE_TL_M2;
    const { guncelFiyat: tarlaBaseline } = enflasyonDuzelt(tarlaBaselineHam);
    return {
      baseline: tarlaBaseline,
      kaynak: "il-baseline",
      not: `${parsel.ilAd} ili tarımsal il baseline desteği`,
    };
  }

  const ilBaselineHam = IL_BASELINE_ARSA_TL_M2[parsel.ilAd];
  if (ilBaselineHam) {
    const { guncelFiyat: ilBaseline } = enflasyonDuzelt(ilBaselineHam);
    return {
      baseline: ilBaseline,
      kaynak: "il-baseline",
      not: `${parsel.ilAd} ili arsa il baseline desteği`,
    };
  }

  return {
    baseline: FALLBACK_BASELINE_TL_M2,
    kaynak: "fallback",
    not: "Genel fallback baseline desteği",
  };
}

export async function bolgeBaseliniGetir(
  parsel: Parsel,
  ekEmsaller: IlanGozlem[] = [],
): Promise<BolgeBaselineSonuc> {
  const isTarimsal = tarımsalMi(parsel.nitelik);
  const veriKalitesiNotlari: string[] = [];
  const ilceNorm = parsel.ilceAd ? normalizeYerAdi(parsel.ilceAd) : "";
  const dbKayitlar = await db.ilanGozlem.toArray();
  const tumKayitlar = ekEmsaller.length > 0 ? [...dbKayitlar, ...ekEmsaller] : dbKayitlar;

  const ilceyeUygunHamHavuz = ilceNorm
    ? tumKayitlar.filter((k) => {
        const kayitIlceN = k.ilceNorm ?? (k.ilceAd ? normalizeYerAdi(k.ilceAd) : "");
        return kayitIlceN === ilceNorm;
      })
    : [];
  const stalAdet = ilceyeUygunHamHavuz.filter(
    (k) => k.zaman && (Date.now() - k.zaman) / GUN_MS > MAX_ILAN_YASI_GUN,
  ).length;

  const emsalAdaylari = ilceNorm ? emsalAdaylariniOlustur(parsel, tumKayitlar) : [];
  const secilenEmsaller = emsalSec(emsalAdaylari);
  const mahalleAdet = secilenEmsaller.filter((a) => a.isSameMahalle).length;
  const ilceAdet = secilenEmsaller.length - mahalleAdet;
  const minEmsal = mahalleAdet >= MIN_MAHALLE_BASELINE_SAMPLES ? MIN_MAHALLE_BASELINE_SAMPLES : MIN_ILCE_BASELINE_SAMPLES;

  const tazelikOzeti = secilenEmsaller.length > 0
    ? {
        havuzAdet: ilceyeUygunHamHavuz.length,
        tazeAdet: secilenEmsaller.length,
        stalAdet,
        son30Gun: secilenEmsaller.filter((a) => a.yasGun <= 30).length,
        son90Gun: secilenEmsaller.filter((a) => a.yasGun <= 90).length,
        ortalamaYasGun: Math.round(
          weightedAverage(secilenEmsaller.map((a) => ({ value: a.yasGun, weight: a.weight }))),
        ),
      }
    : null;

  if (secilenEmsaller.length >= minEmsal) {
    const fiyatlar = secilenEmsaller.map((a) => a.fiyatPerM2TL);
    const ilNormStr = normalizeYerAdi(parsel.ilAd ?? "");
    const kategoriStr = parsel.nitelik
      ? normalizeYerAdi(parsel.nitelik).split(" ")[0] ?? "arsa"
      : "arsa";
    const baglamsalOutlier = outlierTemizleBaglamsalAsimli(fiyatlar, ilNormStr, kategoriStr);
    const outlier = { temiz: baglamsalOutlier.temiz, cikarilan: [...baglamsalOutlier.mutlakAtilanlar, ...baglamsalOutlier.iqrAtilanlar] };
    const temizSet = new Set(outlier.temiz);
    const temizEmsaller =
      outlier.temiz.length >= Math.max(3, Math.ceil(secilenEmsaller.length / 2))
        ? secilenEmsaller.filter((a) => temizSet.has(a.fiyatPerM2TL))
        : secilenEmsaller;
    const weightedValues = temizEmsaller.map((a) => ({
      value: a.fiyatPerM2TL,
      weight: a.weight,
    }));
    const weightedAsk = Math.round(weightedMedian(weightedValues));
    const weightedMeanAsk = Math.round(weightedAverage(weightedValues));
    const ortalamaYasGun = Math.round(
      weightedAverage(temizEmsaller.map((a) => ({ value: a.yasGun, weight: a.weight }))),
    );
    const yerelBenzerlikSkoru = weightedAverage(
      temizEmsaller.map((a) => ({ value: a.weight, weight: a.weight })),
    );
    const alanBandUyumluAdet = temizEmsaller.filter((a) => a.bandScore >= 0.86).length;
    const mahalleOrani = temizEmsaller.length > 0 ? mahalleAdet / temizEmsaller.length : 0;
    const alanBandUyumOrani = temizEmsaller.length > 0 ? alanBandUyumluAdet / temizEmsaller.length : 0;
    const indirimModel = dinamikIndirimOrani(temizEmsaller.length, 0, {
      segment: isTarimsal ? "tarla" : "arsa",
      ortalamaYasGun,
      ayniMahalleOrani: mahalleOrani,
      alanUyumOrani: alanBandUyumOrani,
    });
    const hamYerelBaseline = Math.round(weightedAsk * (1 - indirimModel));
    const destekBaseline = await destekBaselineGetir(parsel, isTarimsal ? "tarla" : "arsa");
    const yerelAgirlik = yerelBaselineAgirligi({
      secilenAdet: temizEmsaller.length,
      ortalamaBenzerlik: yerelBenzerlikSkoru,
      ortalamaYasGun,
      mahalleOrani,
      alanBandUyumOrani,
    });
    const baselineHarman =
      destekBaseline && destekBaseline.baseline > 0
        ? Math.round(hamYerelBaseline * yerelAgirlik + destekBaseline.baseline * (1 - yerelAgirlik))
        : hamYerelBaseline;
    const indirim = dinamikIndirimOrani(temizEmsaller.length, 0);
    const baseline = baselineHarman;
    const ozet = bolgeFiyatOzetiHesapla(temizEmsaller.map((a) => a.fiyatPerM2TL));
    const dovizDonusturulenAdet = temizEmsaller.filter((a) => a.dovizDonusumYapildi).length;
    const ortalamaBenzerlik = weightedAverage(
      temizEmsaller.map((a) => ({ value: a.weight, weight: a.weight })),
    );
    const dogrulanabilirAdet = temizEmsaller.filter((a) => a.hasAdaParsel).length;
    const kaynak: FiyatTahmini["baselineKaynak"] =
      mahalleAdet >= MIN_MAHALLE_BASELINE_SAMPLES ? "ilanGozlem-mahalle" : "ilanGozlem-ilce";
    const alanUyumluAdet = temizEmsaller.filter((a) => a.areaScore >= 0.72).length;
    const imarUyumluAdet = temizEmsaller.filter((a) => a.imarScore >= 0.8).length;

    veriKalitesiNotlari.push(
      `${temizEmsaller.length} emsal seçildi: ${mahalleAdet} mahalle, ${ilceAdet} ilçe desteği.`,
    );
    veriKalitesiNotlari.push(
      `Ortalama benzerlik skoru %${Math.round(ortalamaBenzerlik * 100)}. Alan uyumlu emsal ${alanUyumluAdet}/${temizEmsaller.length}, imar uyumlu emsal ${imarUyumluAdet}/${temizEmsaller.length}.`,
    );
    if (dogrulanabilirAdet > 0) {
      veriKalitesiNotlari.push(
        `${dogrulanabilirAdet} emsalde ada/parsel bilgisi var; bu kayıtlar daha yüksek ağırlık aldı.`,
      );
    }
    if (outlier.cikarilan.length > 0) {
      veriKalitesiNotlari.push(
        `${outlier.cikarilan.length} aykırı emsal havuz dışına itildi (Tukey IQR).`,
      );
    }
    if (dovizDonusturulenAdet > 0) {
      veriKalitesiNotlari.push(
        `${dovizDonusturulenAdet} dövizli ilan (USD/EUR/GBP) güncel kurla TL'ye çevrildi.`,
      );
    }
    if (tazelikOzeti) {
      veriKalitesiNotlari.push(
        `Tazelik: ${tazelikOzeti.son30Gun} ilan son 30 gün, ${tazelikOzeti.son90Gun} ilan son 90 gün — ortalama yaş ${tazelikOzeti.ortalamaYasGun} gün.`,
      );
    }
    if (stalAdet > 0) {
      veriKalitesiNotlari.push(
        `${stalAdet} ilan ${MAX_ILAN_YASI_GUN}+ gün eski olduğu için havuza alınmadı (TR enflasyon koruması).`,
      );
    }

    return {
      baseline,
      kaynak,
      not:
        kaynak === "ilanGozlem-mahalle"
          ? `${temizEmsaller.length} ağırlıklı emsal (${parsel.mahalleAd}) — weighted median ${weightedAsk.toLocaleString("tr-TR")} TL/m², weighted mean ${weightedMeanAsk.toLocaleString("tr-TR")} TL/m², kapanış indirimi %${Math.round(indirim * 100)}`
          : `${temizEmsaller.length} ağırlıklı emsal (${parsel.ilceAd} ilçesi) — weighted median ${weightedAsk.toLocaleString("tr-TR")} TL/m², weighted mean ${weightedMeanAsk.toLocaleString("tr-TR")} TL/m², kapanış indirimi %${Math.round(indirim * 100)}`,
      guvenAdet: temizEmsaller.length,
      ozet,
      veriKalitesiNotlari,
      emsalOzeti: {
        secilenAdet: temizEmsaller.length,
        mahalleAdet,
        ilceAdet,
        dogrulanabilirAdet,
        ortalamaBenzerlik,
        weightedAsking: weightedAsk,
        outlierAdet: outlier.cikarilan.length,
        dovizDonusturulenAdet,
      },
      tazelikOzeti,
      kategori: isTarimsal ? "tarla" : "arsa",
      emsalListesi: temizEmsaller.map((e) => ({
        fiyatPerM2: e.fiyatPerM2TL,
        alan: e.kayit.m2 || 0,
        benzerlik: e.weight,
        tazelikGun: e.kayit.zaman ? Math.round((Date.now() - e.kayit.zaman) / GUN_MS) : 0,
        ilanNo: e.kayit.ilanNo || "—",
      })),
    };
  }

  if (emsalAdaylari.length > 0) {
    veriKalitesiNotlari.push(
      `İlçede ${emsalAdaylari.length} aday bulundu ama yeterli kalitede emsal havuzu oluşmadı.`,
    );
  }
  if (stalAdet > 0) {
    veriKalitesiNotlari.push(
      `${stalAdet} ilan ${MAX_ILAN_YASI_GUN}+ gün eski olduğu için filtrelendi — Sahibinden listesinden taze veri topla.`,
    );
  }

  const [apiSonuc, mahalleSonuc] = await Promise.all([
    parsel.ilAd && parsel.ilceAd && parsel.mahalleAd
      ? apiFiyatMahalleSorgula(parsel.ilAd, parsel.ilceAd, parsel.mahalleAd, isTarimsal ? "tarla" : "arsa")
      : Promise.resolve(null),
    mahalleBaselineGetirAsync(parsel.ilAd, parsel.ilceAd, parsel.mahalleAd, isTarimsal ? "tarla" : "arsa"),
  ]);

  const triKaynaklar: TriangulasyonKaynak[] = [];
  if (apiSonuc && apiSonuc.medyan > 0 && apiSonuc.kaynak === "ilan-istatistik") {
    triKaynaklar.push({
      fiyat: apiSonuc.medyan,
      guven: 90,
      ad: "api-mahalle",
    });
  }
  if (
    mahalleSonuc
    && mahalleSonuc.kaynak !== "ilce-only"
    && mahalleSonuc.kaynak !== "fallback"
    && mahalleSonuc.kaynak !== "ai"
  ) {
    const kaynakAd = mahalleSonuc.kaynak === "knn" ? "knn-smoothing" : "ilce-baseline";
    triKaynaklar.push({
      fiyat: mahalleSonuc.baseline,
      guven: Math.min(mahalleSonuc.guven, 55),
      ad: kaynakAd,
    });
  }

  if (triKaynaklar.length >= 2) {
    const tri = triangulateBaseline(triKaynaklar);
    if (tri) {
      const kaynakOzet = tri.kullanilanKaynaklar
        .map(k => `${k.ad}: ${k.fiyat.toLocaleString("tr-TR")}`)
        .join(", ");
      const uyumsuzlukYuzde = (tri.uyumsuzluk * 100).toFixed(0);
      const uyariNot = tri.manuelReviewGerek
        ? ` ⚠️ Yüksek uyumsuzluk (%${uyumsuzlukYuzde}) — kaynaklar arası tutarsızlık var.`
        : ` (uyumsuzluk %${uyumsuzlukYuzde})`;
      return {
        baseline: tri.fiyat,
        kaynak: "mahalle-baseline",
        not: `Multi-source triangulation (${tri.kaynakSayisi} kaynak) — ${kaynakOzet} → ${tri.fiyat.toLocaleString("tr-TR")} TL/m²${uyariNot}`,
        guvenAdet: tri.kaynakSayisi,
        veriKalitesiNotlari: [
          ...veriKalitesiNotlari,
          `${tri.kaynakSayisi} kaynaktan ağırlıklı medyan kullanıldı: ${kaynakOzet}.`,
          tri.outlierSayisi > 0 ? `${tri.outlierSayisi} aykırı kaynak (Tukey IQR) çıkarıldı.` : "",
          tri.manuelReviewGerek
            ? `⚠️ Kaynaklar arası varyans yüksek (CV %${uyumsuzlukYuzde}) — manuel doğrulama önerilir.`
            : "",
        ].filter(Boolean),
        emsalOzeti: null,
        tazelikOzeti: null,
        kategori: isTarimsal ? "tarla" : "arsa",
        emsalListesi: [],
        triUyumsuzluk: tri.uyumsuzluk,
        triManuelReview: tri.manuelReviewGerek,
      };
    }
  }

  if (apiSonuc && apiSonuc.medyan > 0 && apiSonuc.kaynak === "ilan-istatistik") {
    return {
      baseline: apiSonuc.medyan,
      kaynak: "mahalle-baseline",
      not: `Backend API (${apiSonuc.ilan_adet} ilan) — medyan ${apiSonuc.medyan.toLocaleString("tr-TR")} TL/m²`,
      guvenAdet: apiSonuc.ilan_adet ?? 0,
      veriKalitesiNotlari: [
        ...veriKalitesiNotlari,
        `Backend API'den ${apiSonuc.ilan_adet} ilan medyanı kullanıldı.`,
      ],
      emsalOzeti: null,
      tazelikOzeti: null,
      kategori: isTarimsal ? "tarla" : "arsa",
      emsalListesi: [],
    };
  }
  if (mahalleSonuc && mahalleSonuc.kaynak !== "ilce-only" && mahalleSonuc.kaynak !== "fallback") {
    return {
      baseline: mahalleSonuc.baseline,
      kaynak: "mahalle-baseline",
      not: mahalleSonuc.not,
      guvenAdet: 0,
      veriKalitesiNotlari: [
        ...veriKalitesiNotlari,
        `Mahalle baseline kullanıldı (${parsel.mahalleAd}) — kaynak: ${mahalleSonuc.kaynak}, güven: ${mahalleSonuc.guven}/100. ${mahalleSonuc.ilceFallback ? `İlçe ortalaması (${mahalleSonuc.ilceFallback.toLocaleString("tr-TR")} TL/m²) ile Bayesian shrinkage uygulandı.` : ""}`,
      ],
      emsalOzeti: null,
      tazelikOzeti: null,
      kategori: isTarimsal ? "tarla" : "arsa",
      emsalListesi: [],
    };
  }

  const ilceStatik = ilceBaselineGetir(
    parsel.ilAd ?? "",
    parsel.ilceAd ?? "",
    parsel.mahalleAd,
    isTarimsal ? "tarla" : "arsa",
  );
  if (ilceStatik) {
    return {
      baseline: ilceStatik.baseline,
      kaynak: ilceStatik.kaynak,
      not: ilceStatik.not,
      guvenAdet: 0,
      veriKalitesiNotlari: [
        ...veriKalitesiNotlari,
        ilceStatik.kaynak === "ilce-semt-baseline"
          ? `İlçe/semt statik baseline kullanıldı (${parsel.ilceAd} › ${parsel.mahalleAd ?? ""}) — canlı ilan birikmesiyle otomatik geçiş yapılır.`
          : `İlçe statik baseline kullanıldı (${parsel.ilceAd}) — mahalle bazlı ilan birikmesiyle otomatik geçiş yapılır.`,
      ],
      emsalOzeti: null,
      tazelikOzeti: null,
      kategori: isTarimsal ? "tarla" : "arsa",
      emsalListesi: [],
    };
  }

  if (isTarimsal) {
    const tarlaBaselineHam =
      IL_BASELINE_TARLA_TL_M2[parsel.ilAd] ?? FALLBACK_TARLA_BASELINE_TL_M2;
    const { guncelFiyat: tarlaBaseline, carpan: tarlaCarpan } = enflasyonDuzelt(tarlaBaselineHam);
    return {
      baseline: tarlaBaseline,
      kaynak: "il-baseline",
      not: `${parsel.ilAd} ili tarımsal arsa baseline (statik 2025-01, +%${Math.round((tarlaCarpan.gayrimenkulCarpan - 1) * 100)} enflasyon) — Sahibinden tarla ilanı ile gerçek veriye geç`,
      guvenAdet: 0,
      veriKalitesiNotlari: [
        ...veriKalitesiNotlari,
        `Canlı emsal yok; ${parsel.nitelik} için il tarla baseline (${tarlaCarpan.aciklama}).`,
      ],
      emsalOzeti: null,
      tazelikOzeti: null,
      kategori: "tarla",
      emsalListesi: [],
    };
  }

  const ilBaselineHam = IL_BASELINE_ARSA_TL_M2[parsel.ilAd];
  if (ilBaselineHam) {
    const { guncelFiyat: ilBaseline, carpan: ilCarpan } = enflasyonDuzelt(ilBaselineHam);
    return {
      baseline: ilBaseline,
      kaynak: "il-baseline",
      not: `${parsel.ilAd} ili arsa baseline (statik 2025-01, +%${Math.round((ilCarpan.gayrimenkulCarpan - 1) * 100)} enflasyon) — Sahibinden araması ile gerçek veriye geç`,
      guvenAdet: 0,
      veriKalitesiNotlari: [
        ...veriKalitesiNotlari,
        `Canlı emsal verisi yetersiz; il geneli baseline kullanıldı (${ilCarpan.aciklama}).`,
      ],
      emsalOzeti: null,
      tazelikOzeti: null,
      kategori: "arsa",
      emsalListesi: [],
    };
  }

  return {
    baseline: FALLBACK_BASELINE_TL_M2,
    kaynak: "fallback",
    not: `Veri yok — Sahibinden araması yaparak bu bölge için gerçek fiyat topla`,
    guvenAdet: 0,
    veriKalitesiNotlari: [
      ...veriKalitesiNotlari,
      "Bölgeye ait yeterli ilan bulunamadı; genel fallback baseline devrede.",
    ],
    emsalOzeti: null,
    tazelikOzeti: null,
    kategori: "arsa",
    emsalListesi: [],
  };
}