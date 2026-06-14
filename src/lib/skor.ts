import type { Analiz } from "./analiz";
import type { CevreAnalizi } from "./osm";
import type { EgimAnalizi } from "./elevation";

export interface SkorBilesen {
  ad: string;
  puan: number;
  agirlik: number;
  not: string;
}

export interface Skor {
  toplam: number;
  bilesenler: SkorBilesen[];
  aciklama: string;
}

export interface SkorBilinmiyor {
  toplam: null;
  aciklama: string;
}

export interface TumSkorlar {
  lojistik: Skor | SkorBilinmiyor;
  fiziksel: Skor | SkorBilinmiyor;
  erisim: Skor | SkorBilinmiyor;
  altyapi: Skor | SkorBilinmiyor;
}

export function tumSkorlariHesapla(
  analiz: Analiz,
  cevre: CevreAnalizi | null,
  egim: EgimAnalizi | null,
): TumSkorlar {
  // OSM verisi yetersiz mi? <5 element = bölgede tag'li POI/yol yok demek
  const osmYetersiz = cevre != null && cevre.elementSayisi < 5;
  const yetersizMesaj = (kategori: string) =>
    `OSM verisi yetersiz (sadece ${cevre?.elementSayisi ?? 0} element). Bu bölgede ${kategori} skoru güvenilir hesaplanamaz — kırsal Türkiye'de OSM kapsama seyrek olabilir.`;

  return {
    lojistik: cevre
      ? lojistikSkor(cevre)
      : bilinmiyor("Çevreyi analiz et — Overpass verisi gerekli."),
    fiziksel: egim
      ? fizikselSkor(analiz, egim)
      : bilinmiyor("Eğim verisi için Open-Meteo çağrısı gerekli."),
    erisim: cevre
      ? osmYetersiz
        ? bilinmiyor(yetersizMesaj("erişim"))
        : erisimSkor(cevre)
      : bilinmiyor("Çevreyi analiz et — POI yoğunluğu için Overpass gerekli."),
    altyapi: cevre
      ? osmYetersiz
        ? bilinmiyor(yetersizMesaj("altyapı"))
        : altyapiSkor(cevre)
      : bilinmiyor("Çevreyi analiz et — altyapı mesafeleri için Overpass gerekli."),
  };
}

function bilinmiyor(neden: string): SkorBilinmiyor {
  return { toplam: null, aciklama: neden };
}

// ---- Lojistik (uzun mesafe ulaşım) ----------------------------------------

function lojistikSkor(cevre: CevreAnalizi): Skor {
  // Veri yetersizliği eşiği: en az 2 anlamlı veri noktası lazım
  const otoyolM = enYakin(cevre, "motorway");
  // Türkiye'de devlet yolları OSM'de hem 'trunk' hem 'primary' olarak işaretlenebilir
  // (örn. D330, D750). İkisinin minimum mesafesini al.
  const trunkRaw = enYakin(cevre, "trunk");
  const primaryRaw = enYakin(cevre, "primary");
  const trunkM = trunkRaw != null && primaryRaw != null
    ? Math.min(trunkRaw, primaryRaw)
    : (trunkRaw ?? primaryRaw);
  const havaM = enYakin(cevre, "airport");
  const limanM = enYakin(cevre, "port");
  const osbM = enYakin(cevre, "osb");
  const veriSayisi = [otoyolM, trunkM, havaM, limanM, osbM].filter((v) => v != null).length;

  // Sadece 1 veri noktası varsa ve OSM elementSayisi de düşükse → "veri yetersiz"
  if (veriSayisi < 2 && cevre.elementSayisi < 10) {
    return {
      toplam: null as unknown as number,
      bilesenler: [
        { ad: "Otoyol", puan: 0, agirlik: 0.3, not: otoyolM != null ? km(otoyolM) : "yakında işaretli yok" },
        { ad: "Devlet yolu", puan: 0, agirlik: 0.15, not: trunkM != null ? km(trunkM) : "yakında işaretli yok" },
        { ad: "OSB/Sanayi", puan: 0, agirlik: 0.25, not: osbM != null ? km(osbM) : "yakında işaretli yok" },
        { ad: "Havaalanı", puan: 0, agirlik: 0.2, not: havaM != null ? km(havaM) : "yakında işaretli yok" },
        { ad: "Liman", puan: 0, agirlik: 0.1, not: limanM != null ? km(limanM) : "yakında işaretli yok" },
      ],
      aciklama: "Bu bölgede otomatik lojistik analizi için yeterli veri yok.",
    } as Skor;
  }

  // Veri yeterli — null değerleri uzak (50km+) kabul et ama not'ta belirt
  const bilesenler: SkorBilesen[] = [
    { ad: "Otoyol", puan: mesafePuan(otoyolM ?? 50000, 500, 5000), agirlik: 0.3, not: otoyolM != null ? km(otoyolM) : "yakında yok (>50km)" },
    { ad: "Devlet yolu / Anayol", puan: mesafePuan(trunkM ?? 50000, 300, 3000), agirlik: 0.15, not: trunkM != null ? km(trunkM) : "yakında yok" },
    { ad: "OSB/Sanayi", puan: mesafePuan(osbM ?? 50000, 1000, 20000), agirlik: 0.25, not: osbM != null ? km(osbM) : "yakında yok" },
    { ad: "Havaalanı", puan: mesafePuan(havaM ?? 100000, 5000, 50000), agirlik: 0.2, not: havaM != null ? km(havaM) : "yakında yok" },
    { ad: "Liman", puan: mesafePuan(limanM ?? 200000, 10000, 100000), agirlik: 0.1, not: limanM != null ? km(limanM) : "yakında yok" },
  ];

  const toplam = puanTopla(bilesenler);

  // Aciklama: toplam düşükse bile güçlü bileşenleri vurgula —
  // "liman dibinde olan ama otoyolu uzak Bandırma" tipi vakalarda
  // "sapa konum" demek yanıltıcı.
  const guclu: string[] = [];
  if ((havaM ?? Infinity) <= 15000) guclu.push("havalimanı yakın");
  if ((limanM ?? Infinity) <= 20000) guclu.push("liman yakın");
  if ((osbM ?? Infinity) <= 5000) guclu.push("OSB yakın");
  if ((otoyolM ?? Infinity) <= 2000) guclu.push("otoyol yakın");

  let aciklama: string;
  if (toplam >= 75) {
    aciklama = "Çok güçlü lojistik — depo/üretim için ideal.";
  } else if (toplam >= 50) {
    aciklama = "Orta lojistik — temel bağlantı var, ağır taşımacılık karışık.";
  } else if (guclu.length > 0) {
    // Toplam düşük ama belirgin bir avantaj var → onu söyle
    aciklama = `${guclu.join(", ")}; ancak diğer bileşenler uzak — toplam ortalamayı düşürüyor.`;
  } else {
    aciklama = "Zayıf lojistik — sapa konum.";
  }

  return { toplam, bilesenler, aciklama };
}

// ---- Fiziksel (eğim + şekil + güneşlenme) ---------------------------------

function fizikselSkor(analiz: Analiz, egim: EgimAnalizi): Skor {
  const egimP = Math.max(0, Math.round(100 - egim.ortEgimYuzde * 5));
  const sekilP = Math.round(analiz.boyut.kompaktlik * 100);
  const oran = analiz.boyut.enBoyOrani;
  const oranP = oran <= 1.5 ? 100 : oran >= 5 ? 20 : Math.round(100 - (oran - 1.5) * 20);
  const bakiP = egim.bakiYonu.startsWith("Güney")
    ? 100
    : egim.bakiYonu.startsWith("Karışık")
      ? 70
      : 40;
  const boyutP =
    analiz.boyut.alanKategori === "orta"
      ? 100
      : analiz.boyut.alanKategori === "buyuk"
        ? 90
        : analiz.boyut.alanKategori === "kucuk"
          ? 70
          : analiz.boyut.alanKategori === "cok-buyuk"
            ? 80
            : 40;

  const bilesenler: SkorBilesen[] = [
    { ad: "Eğim", puan: egimP, agirlik: 0.35, not: `%${egim.ortEgimYuzde}` },
    { ad: "Şekil", puan: sekilP, agirlik: 0.2, not: analiz.boyut.sekilNotu },
    { ad: "En/boy", puan: oranP, agirlik: 0.15, not: `${oran}:1` },
    { ad: "Güneşlenme", puan: bakiP, agirlik: 0.15, not: egim.bakiYonu },
    {
      ad: "Büyüklük",
      puan: boyutP,
      agirlik: 0.15,
      not: analiz.boyut.alanLabel.split(" · ")[1] ?? "",
    },
  ];

  const toplam = puanTopla(bilesenler);

  return {
    toplam,
    bilesenler,
    aciklama:
      toplam >= 75
        ? "Yüksek inşaat uygunluğu — düz, düzgün şekilli, güneşli."
        : toplam >= 50
          ? "Orta uygunluk — dezavantajları çözülebilir."
          : "Zorlu fiziksel koşullar — maliyetleri %30+ artırabilir.",
  };
}

// ---- Erişim (POI yoğunluğu, yerleşim) -------------------------------------

function erisimSkor(cevre: CevreAnalizi): Skor {
  const p = cevre.poi;
  // 500m içinde tip başına ~3 adet → 100 puan, 0 → 0 puan (lineer)
  const norm = (n: number, hedef: number) => Math.min(100, Math.round((n / hedef) * 100));

  const bilesenler: SkorBilesen[] = [
    { ad: "Eğitim (okul/ünv)", puan: norm(p.okul, 2), agirlik: 0.35, not: `${p.okul} adet` },
    { ad: "Sağlık (hastane/klinik)", puan: norm(p.hastane, 1), agirlik: 0.3, not: `${p.hastane} adet` },
    { ad: "Toplu ulaşım", puan: norm(p.duraklar, 3), agirlik: 0.35, not: `${p.duraklar} durak` },
  ];

  const toplam = puanTopla(bilesenler);

  return {
    toplam,
    bilesenler,
    aciklama:
      toplam >= 75
        ? "Çok yüksek erişilebilirlik — gelişmiş yerleşim."
        : toplam >= 50
          ? "Makul erişim — temel ihtiyaçlar yakında."
          : toplam >= 25
            ? "Düşük erişim — gelişmekte olan / banliyö bölge."
            : "Çok sapa — temel hizmetler uzakta.",
  };
}

// ---- Altyapı (elektrik/su/demiryolu) --------------------------------------

function altyapiSkor(cevre: CevreAnalizi): Skor {
  const elek = cevre.altyapi.elektrikHattiM;
  const su = cevre.altyapi.suBoruM;
  const demir = cevre.altyapi.demiryoluM;

  // Smart fallback: yapı yoğunluğu altyapı sinyali — yapı varsa altyapı muhtemelen var
  const yapiSinyali = cevre.poi.okul + cevre.poi.hastane > 0
    || cevre.elementSayisi > 30; // 30+ OSM element = yerleşim bölgesi

  // Hiç OSM altyapı işareti yok ve yapı sinyali de yok → açık veri yetersizliği
  if (elek == null && su == null && !yapiSinyali) {
    return {
      toplam: null as unknown as number,
      bilesenler: [
        { ad: "Elektrik hattı", puan: 0, agirlik: 0.4, not: "yakında işaretli yok" },
        { ad: "Su altyapısı", puan: 0, agirlik: 0.4, not: "yakında işaretli yok" },
        { ad: "Demiryolu", puan: 0, agirlik: 0.2, not: demir != null ? km(demir) : "yakın yok" },
      ],
      aciklama: "Bu bölgede otomatik altyapı analizi için yeterli veri yok.",
    } as Skor;
  }

  // Yapı sinyali var ama hat işareti yoksa "muhtemelen mevcut" varsayımı
  const elekVar = elek != null;
  const suVar = su != null;

  const bilesenler: SkorBilesen[] = [
    {
      ad: "Elektrik hattı",
      puan: elekVar ? mesafePuan(elek, 100, 2000) : (yapiSinyali ? 60 : 0),
      agirlik: 0.4,
      not: elekVar
        ? km(elek)
        : (yapiSinyali ? "yakın yapılaşma → muhtemelen mevcut" : "işaretli yok"),
    },
    {
      ad: "Su altyapısı",
      puan: suVar ? mesafePuan(su, 100, 2000) : (yapiSinyali ? 50 : 0),
      agirlik: 0.4,
      not: suVar
        ? km(su)
        : (yapiSinyali ? "yakın yapılaşma → muhtemelen mevcut" : "işaretli yok"),
    },
    {
      ad: "Demiryolu",
      puan: mesafePuan(demir ?? 50000, 1000, 20000),
      agirlik: 0.2,
      not: demir != null ? km(demir) : "yakın demiryolu yok",
    },
  ];

  const toplam = puanTopla(bilesenler);

  return {
    toplam,
    bilesenler,
    aciklama:
      toplam >= 75
        ? "Altyapı tam — bağlantı maliyeti düşük."
        : toplam >= 50
          ? "Orta altyapı — su/elektrik bağlantısı için ek hat çekilebilir."
          : "Eksik altyapı — bağlantı maliyetleri ciddi olabilir.",
  };
}

// ---- Yardımcılar ----------------------------------------------------------

function enYakin(cevre: CevreAnalizi, tip: string): number | null {
  return cevre.enYakinlar.find((y) => y.tip === tip)?.mesafeM ?? null;
}

function km(m: number): string {
  if (m >= 50000) return "uzak (>50km)";
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${m} m`;
}

function mesafePuan(m: number, eniyi: number, enkotu: number): number {
  if (m <= eniyi) return 100;
  if (m >= enkotu) return 0;
  return Math.round(100 * (1 - (m - eniyi) / (enkotu - eniyi)));
}

function puanTopla(bilesenler: SkorBilesen[]): number {
  return Math.round(bilesenler.reduce((s, b) => s + b.puan * b.agirlik, 0));
}
