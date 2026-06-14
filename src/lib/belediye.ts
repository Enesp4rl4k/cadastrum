/**
 * Belediye + imar sorgu deep-link tablosu.
 * Büyükşehirler ve önemli ilçeler için web/imar/e-belediye URL'leri.
 * Bilinmeyen ilçelerde fallback: Google search.
 */

export interface BelediyeBilgi {
  ilceAd: string;
  ilAd: string;
  webSitesi: string;
  imarSorguUrl?: string;
  acikVeriUrl?: string;
}

// Türkiye'nin 30 büyükşehri + bazı önemli ilçeler için deep-linkler.
// Liste zamanla genişletilebilir.
const BELEDIYELER: Record<string, Partial<BelediyeBilgi>> = {
  // İBB ve ilçeleri
  "istanbul:fatih": {
    webSitesi: "https://www.fatih.bel.tr",
    imarSorguUrl: "https://www.fatih.bel.tr/icerik/imar-durumu",
    acikVeriUrl: "https://data.ibb.gov.tr",
  },
  "istanbul:kadıköy": {
    webSitesi: "https://www.kadikoy.bel.tr",
    imarSorguUrl: "https://www.kadikoy.bel.tr/imar-durum-sorgu",
    acikVeriUrl: "https://data.ibb.gov.tr",
  },
  "istanbul:beşiktaş": {
    webSitesi: "https://www.besiktas.bel.tr",
    acikVeriUrl: "https://data.ibb.gov.tr",
  },
  "istanbul:üsküdar": {
    webSitesi: "https://www.uskudar.bel.tr",
    acikVeriUrl: "https://data.ibb.gov.tr",
  },
  "istanbul:şişli": {
    webSitesi: "https://www.sisli.bel.tr",
    acikVeriUrl: "https://data.ibb.gov.tr",
  },
  "istanbul:beyoğlu": {
    webSitesi: "https://www.beyoglu.bel.tr",
    acikVeriUrl: "https://data.ibb.gov.tr",
  },
  // İBB üst portali — il bazında fallback
  "istanbul:*": {
    webSitesi: "https://www.ibb.istanbul",
    imarSorguUrl: "https://sehirharitasi.ibb.gov.tr",
    acikVeriUrl: "https://data.ibb.gov.tr",
  },

  // Ankara
  "ankara:çankaya": {
    webSitesi: "https://www.cankaya.bel.tr",
  },
  "ankara:keçiören": {
    webSitesi: "https://www.kecioren.bel.tr",
  },
  "ankara:*": {
    webSitesi: "https://www.ankara.bel.tr",
    imarSorguUrl: "https://www.ankara.bel.tr/imar-durum-belgesi",
    acikVeriUrl: "https://acikveri.ankara.bel.tr",
  },

  // İzmir
  "izmir:konak": {
    webSitesi: "https://www.konak.bel.tr",
  },
  "izmir:bornova": {
    webSitesi: "https://www.bornova.bel.tr",
  },
  "izmir:karşıyaka": {
    webSitesi: "https://www.karsiyaka.bel.tr",
  },
  "izmir:*": {
    webSitesi: "https://www.izmir.bel.tr",
    imarSorguUrl: "https://kentrehberi.izmir.bel.tr",
    acikVeriUrl: "https://acikveri.bel.tr",
  },

  // Diğer büyükşehirler — il fallback
  "bursa:*": { webSitesi: "https://www.bursa.bel.tr" },
  "antalya:*": { webSitesi: "https://www.antalya.bel.tr" },
  "adana:*": { webSitesi: "https://www.adana.bel.tr" },
  "konya:*": { webSitesi: "https://www.konya.bel.tr" },
  "gaziantep:*": { webSitesi: "https://www.gaziantep.bel.tr" },
  "kayseri:*": { webSitesi: "https://www.kayseri.bel.tr" },
  "mersin:*": { webSitesi: "https://www.mersin.bel.tr" },
  "kocaeli:*": { webSitesi: "https://www.kocaeli.bel.tr" },
  "samsun:*": { webSitesi: "https://www.samsun.bel.tr" },
  "diyarbakır:*": { webSitesi: "https://www.diyarbakir.bel.tr" },
  "şanlıurfa:*": { webSitesi: "https://www.sanliurfa.bel.tr" },
  "trabzon:*": { webSitesi: "https://www.trabzon.bel.tr" },
  "eskişehir:*": { webSitesi: "https://www.eskisehir.bel.tr" },
  "denizli:*": { webSitesi: "https://www.denizli.bel.tr" },
  "balıkesir:*": { webSitesi: "https://www.balikesir.bel.tr" },
  "manisa:*": { webSitesi: "https://www.manisa.bel.tr" },
  "muğla:*": { webSitesi: "https://www.mugla.bel.tr" },
  "tekirdağ:*": { webSitesi: "https://www.tekirdag.bel.tr" },
  "sakarya:*": { webSitesi: "https://www.sakarya.bel.tr" },
  "hatay:*": { webSitesi: "https://www.hatay.bel.tr" },
  "kahramanmaraş:*": { webSitesi: "https://www.kahramanmaras.bel.tr" },
  "van:*": { webSitesi: "https://www.van.bel.tr" },
  "erzurum:*": { webSitesi: "https://www.erzurum.bel.tr" },
  "malatya:*": { webSitesi: "https://www.malatya.bel.tr" },
  "ordu:*": { webSitesi: "https://www.ordu.bel.tr" },
  "mardin:*": { webSitesi: "https://www.mardin.bel.tr" },
  "aydın:*": { webSitesi: "https://www.aydin.bel.tr" },
};

function normalize(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c)
    .trim();
}

export function belediyeBilgisiBul(ilAd: string, ilceAd: string): BelediyeBilgi {
  // Türkçe-normalize
  const ilN = normalize(ilAd);
  const ilceN = normalize(ilceAd);
  // Ana lookup tablosunda hem orijinal hem normalize edilmiş key'ler var
  const key1 = `${ilAd.toLocaleLowerCase("tr")}:${ilceAd.toLocaleLowerCase("tr")}`;
  const key2 = `${ilN}:${ilceN}`;
  const ilFallbackKey1 = `${ilAd.toLocaleLowerCase("tr")}:*`;
  const ilFallbackKey2 = `${ilN}:*`;

  const eslesme =
    BELEDIYELER[key1] ??
    BELEDIYELER[key2] ??
    BELEDIYELER[ilFallbackKey1] ??
    BELEDIYELER[ilFallbackKey2] ??
    null;

  if (eslesme) {
    return {
      ilAd,
      ilceAd,
      webSitesi: eslesme.webSitesi ?? googleSearchUrl(`${ilceAd} belediyesi`),
      imarSorguUrl: eslesme.imarSorguUrl,
      acikVeriUrl: eslesme.acikVeriUrl,
    };
  }

  // Fallback: Google search'a yönlendir
  return {
    ilAd,
    ilceAd,
    webSitesi: googleSearchUrl(`${ilceAd} ${ilAd} belediyesi`),
    imarSorguUrl: googleSearchUrl(`${ilceAd} belediyesi imar durum sorgu`),
  };
}

function googleSearchUrl(q: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
