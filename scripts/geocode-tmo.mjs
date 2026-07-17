#!/usr/bin/env node
/**
 * TMO (Toprak Mahsulleri Ofisi) Alım Merkezi Geocoder
 *
 * TMO'nun kamuya açık alım merkezi listesini Nominatim ile geocode eder.
 * Çıktı: src/lib/data/lisansli-depolar.ts
 *
 * Çalıştırma:
 *   node scripts/geocode-tmo.mjs
 *
 * Gereksinim: İnternet bağlantısı (Nominatim API)
 * Süre: ~5-10 dakika (rate limit: 1 istek/sn)
 *
 * Kaynak: TMO resmi listesi + TÜRKTOB verileri
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ÇIKTI = `${__dirname}/../src/lib/data/lisansli-depolar.ts`;

// Nominatim rate limit: 1 istek / saniye (politika gereği)
const RATE_LIMIT_MS = 1100;

// TMO alım merkezleri — il/ilçe/ad formatında
// Kaynak: TMO web sitesi + TMO Faaliyet Raporları 2023
const TMO_MERKEZLER = [
  // ── Marmara ─────────────────────────────────────────────────────────────
  { il: "İstanbul", ilce: "Silivri", ad: "TMO Silivri Alım Merkezi", tip: "tmo" },
  { il: "Tekirdağ", ilce: "Çorlu", ad: "TMO Çorlu Alım Merkezi", tip: "tmo" },
  { il: "Tekirdağ", ilce: "Hayrabolu", ad: "TMO Hayrabolu Alım Merkezi", tip: "tmo" },
  { il: "Tekirdağ", ilce: "Malkara", ad: "TMO Malkara Alım Merkezi", tip: "tmo" },
  { il: "Tekirdağ", ilce: "Muratlı", ad: "TMO Muratlı Alım Merkezi", tip: "tmo" },
  { il: "Edirne", ilce: "Merkez", ad: "TMO Edirne Alım Merkezi", tip: "tmo" },
  { il: "Edirne", ilce: "Keşan", ad: "TMO Keşan Alım Merkezi", tip: "tmo" },
  { il: "Edirne", ilce: "Uzunköprü", ad: "TMO Uzunköprü Alım Merkezi", tip: "tmo" },
  { il: "Kırklareli", ilce: "Merkez", ad: "TMO Kırklareli Alım Merkezi", tip: "tmo" },
  { il: "Kırklareli", ilce: "Lüleburgaz", ad: "TMO Lüleburgaz Alım Merkezi", tip: "tmo" },
  { il: "Kırklareli", ilce: "Babaeski", ad: "TMO Babaeski Alım Merkezi", tip: "tmo" },
  { il: "Bursa", ilce: "Merkez", ad: "TMO Bursa Alım Merkezi", tip: "tmo" },
  { il: "Bursa", ilce: "İnegöl", ad: "TMO İnegöl Alım Merkezi", tip: "tmo" },
  { il: "Bursa", ilce: "Karacabey", ad: "TMO Karacabey Alım Merkezi", tip: "tmo" },
  { il: "Balıkesir", ilce: "Merkez", ad: "TMO Balıkesir Alım Merkezi", tip: "tmo" },
  { il: "Balıkesir", ilce: "Bandırma", ad: "TMO Bandırma Alım Merkezi", tip: "tmo" },
  { il: "Balıkesir", ilce: "Gönen", ad: "TMO Gönen Alım Merkezi", tip: "tmo" },
  { il: "Balıkesir", ilce: "Susurluk", ad: "TMO Susurluk Alım Merkezi", tip: "tmo" },
  { il: "Çanakkale", ilce: "Merkez", ad: "TMO Çanakkale Alım Merkezi", tip: "tmo" },
  { il: "Çanakkale", ilce: "Biga", ad: "TMO Biga Alım Merkezi", tip: "tmo" },
  // ── Ege ─────────────────────────────────────────────────────────────────
  { il: "İzmir", ilce: "Torbalı", ad: "TMO Torbalı Alım Merkezi", tip: "tmo" },
  { il: "Manisa", ilce: "Merkez", ad: "TMO Manisa Alım Merkezi", tip: "tmo" },
  { il: "Manisa", ilce: "Akhisar", ad: "TMO Akhisar Alım Merkezi", tip: "tmo" },
  { il: "Manisa", ilce: "Turgutlu", ad: "TMO Turgutlu Alım Merkezi", tip: "tmo" },
  { il: "Manisa", ilce: "Salihli", ad: "TMO Salihli Alım Merkezi", tip: "tmo" },
  { il: "Denizli", ilce: "Merkez", ad: "TMO Denizli Alım Merkezi", tip: "tmo" },
  { il: "Denizli", ilce: "Çivril", ad: "TMO Çivril Alım Merkezi", tip: "tmo" },
  { il: "Aydın", ilce: "Merkez", ad: "TMO Aydın Alım Merkezi", tip: "tmo" },
  { il: "Uşak", ilce: "Merkez", ad: "TMO Uşak Alım Merkezi", tip: "tmo" },
  { il: "Afyonkarahisar", ilce: "Merkez", ad: "TMO Afyon Alım Merkezi", tip: "tmo" },
  { il: "Afyonkarahisar", ilce: "Bolvadin", ad: "TMO Bolvadin Alım Merkezi", tip: "tmo" },
  { il: "Afyonkarahisar", ilce: "Dinar", ad: "TMO Dinar Alım Merkezi", tip: "tmo" },
  { il: "Kütahya", ilce: "Merkez", ad: "TMO Kütahya Alım Merkezi", tip: "tmo" },
  { il: "Kütahya", ilce: "Gediz", ad: "TMO Gediz Alım Merkezi", tip: "tmo" },
  { il: "Kütahya", ilce: "Tavşanlı", ad: "TMO Tavşanlı Alım Merkezi", tip: "tmo" },
  { il: "Eskişehir", ilce: "Merkez", ad: "TMO Eskişehir Alım Merkezi", tip: "tmo" },
  { il: "Eskişehir", ilce: "Sivrihisar", ad: "TMO Sivrihisar Alım Merkezi", tip: "tmo" },
  // ── Akdeniz ──────────────────────────────────────────────────────────────
  { il: "Antalya", ilce: "Merkez", ad: "TMO Antalya Alım Merkezi", tip: "tmo" },
  { il: "Isparta", ilce: "Merkez", ad: "TMO Isparta Alım Merkezi", tip: "tmo" },
  { il: "Isparta", ilce: "Yalvaç", ad: "TMO Yalvaç Alım Merkezi", tip: "tmo" },
  { il: "Burdur", ilce: "Merkez", ad: "TMO Burdur Alım Merkezi", tip: "tmo" },
  { il: "Adana", ilce: "Merkez", ad: "TMO Adana Alım Merkezi", tip: "tmo" },
  { il: "Adana", ilce: "Ceyhan", ad: "TMO Ceyhan Alım Merkezi", tip: "tmo" },
  { il: "Adana", ilce: "Kozan", ad: "TMO Kozan Alım Merkezi", tip: "tmo" },
  { il: "Mersin", ilce: "Tarsus", ad: "TMO Tarsus Alım Merkezi", tip: "tmo" },
  { il: "Mersin", ilce: "Silifke", ad: "TMO Silifke Alım Merkezi", tip: "tmo" },
  { il: "Hatay", ilce: "İskenderun", ad: "TMO İskenderun Alım Merkezi", tip: "tmo" },
  { il: "Kahramanmaraş", ilce: "Merkez", ad: "TMO Kahramanmaraş Alım Merkezi", tip: "tmo" },
  { il: "Kahramanmaraş", ilce: "Elbistan", ad: "TMO Elbistan Alım Merkezi", tip: "tmo" },
  { il: "Osmaniye", ilce: "Merkez", ad: "TMO Osmaniye Alım Merkezi", tip: "tmo" },
  // ── İç Anadolu ───────────────────────────────────────────────────────────
  { il: "Ankara", ilce: "Polatlı", ad: "TMO Polatlı Alım Merkezi", tip: "tmo" },
  { il: "Ankara", ilce: "Haymana", ad: "TMO Haymana Alım Merkezi", tip: "tmo" },
  { il: "Ankara", ilce: "Beypazarı", ad: "TMO Beypazarı Alım Merkezi", tip: "tmo" },
  { il: "Ankara", ilce: "Çubuk", ad: "TMO Çubuk Alım Merkezi", tip: "tmo" },
  { il: "Konya", ilce: "Merkez", ad: "TMO Konya Alım Merkezi", tip: "tmo" },
  { il: "Konya", ilce: "Ereğli", ad: "TMO Ereğli Alım Merkezi", tip: "tmo" },
  { il: "Konya", ilce: "Akşehir", ad: "TMO Akşehir Alım Merkezi", tip: "tmo" },
  { il: "Konya", ilce: "Karapınar", ad: "TMO Karapınar Alım Merkezi", tip: "tmo" },
  { il: "Konya", ilce: "Çumra", ad: "TMO Çumra Alım Merkezi", tip: "tmo" },
  { il: "Konya", ilce: "Ilgın", ad: "TMO Ilgın Alım Merkezi", tip: "tmo" },
  { il: "Kayseri", ilce: "Merkez", ad: "TMO Kayseri Alım Merkezi", tip: "tmo" },
  { il: "Kayseri", ilce: "Develi", ad: "TMO Develi Alım Merkezi", tip: "tmo" },
  { il: "Sivas", ilce: "Merkez", ad: "TMO Sivas Alım Merkezi", tip: "tmo" },
  { il: "Sivas", ilce: "Şarkışla", ad: "TMO Şarkışla Alım Merkezi", tip: "tmo" },
  { il: "Sivas", ilce: "Gemerek", ad: "TMO Gemerek Alım Merkezi", tip: "tmo" },
  { il: "Yozgat", ilce: "Merkez", ad: "TMO Yozgat Alım Merkezi", tip: "tmo" },
  { il: "Yozgat", ilce: "Sorgun", ad: "TMO Sorgun Alım Merkezi", tip: "tmo" },
  { il: "Yozgat", ilce: "Boğazlıyan", ad: "TMO Boğazlıyan Alım Merkezi", tip: "tmo" },
  { il: "Aksaray", ilce: "Merkez", ad: "TMO Aksaray Alım Merkezi", tip: "tmo" },
  { il: "Niğde", ilce: "Merkez", ad: "TMO Niğde Alım Merkezi", tip: "tmo" },
  { il: "Niğde", ilce: "Bor", ad: "TMO Bor Alım Merkezi", tip: "tmo" },
  { il: "Nevşehir", ilce: "Merkez", ad: "TMO Nevşehir Alım Merkezi", tip: "tmo" },
  { il: "Kırşehir", ilce: "Merkez", ad: "TMO Kırşehir Alım Merkezi", tip: "tmo" },
  { il: "Kırıkkale", ilce: "Merkez", ad: "TMO Kırıkkale Alım Merkezi", tip: "tmo" },
  { il: "Çankırı", ilce: "Merkez", ad: "TMO Çankırı Alım Merkezi", tip: "tmo" },
  { il: "Karaman", ilce: "Merkez", ad: "TMO Karaman Alım Merkezi", tip: "tmo" },
  // ── Karadeniz ────────────────────────────────────────────────────────────
  { il: "Samsun", ilce: "Merkez", ad: "TMO Samsun Alım Merkezi", tip: "tmo" },
  { il: "Samsun", ilce: "Bafra", ad: "TMO Bafra Alım Merkezi", tip: "tmo" },
  { il: "Samsun", ilce: "Vezirköprü", ad: "TMO Vezirköprü Alım Merkezi", tip: "tmo" },
  { il: "Tokat", ilce: "Merkez", ad: "TMO Tokat Alım Merkezi", tip: "tmo" },
  { il: "Tokat", ilce: "Turhal", ad: "TMO Turhal Alım Merkezi", tip: "tmo" },
  { il: "Tokat", ilce: "Erbaa", ad: "TMO Erbaa Alım Merkezi", tip: "tmo" },
  { il: "Amasya", ilce: "Merkez", ad: "TMO Amasya Alım Merkezi", tip: "tmo" },
  { il: "Amasya", ilce: "Merzifon", ad: "TMO Merzifon Alım Merkezi", tip: "tmo" },
  { il: "Çorum", ilce: "Merkez", ad: "TMO Çorum Alım Merkezi", tip: "tmo" },
  { il: "Çorum", ilce: "Osmancık", ad: "TMO Osmancık Alım Merkezi", tip: "tmo" },
  { il: "Çorum", ilce: "Alaca", ad: "TMO Alaca Alım Merkezi", tip: "tmo" },
  { il: "Kastamonu", ilce: "Merkez", ad: "TMO Kastamonu Alım Merkezi", tip: "tmo" },
  { il: "Kastamonu", ilce: "Tosya", ad: "TMO Tosya Alım Merkezi", tip: "tmo" },
  { il: "Sinop", ilce: "Merkez", ad: "TMO Sinop Alım Merkezi", tip: "tmo" },
  { il: "Bolu", ilce: "Merkez", ad: "TMO Bolu Alım Merkezi", tip: "tmo" },
  { il: "Düzce", ilce: "Merkez", ad: "TMO Düzce Alım Merkezi", tip: "tmo" },
  { il: "Zonguldak", ilce: "Merkez", ad: "TMO Zonguldak Alım Merkezi", tip: "tmo" },
  { il: "Karabük", ilce: "Merkez", ad: "TMO Karabük Alım Merkezi", tip: "tmo" },
  { il: "Bartın", ilce: "Merkez", ad: "TMO Bartın Alım Merkezi", tip: "tmo" },
  { il: "Ordu", ilce: "Merkez", ad: "TMO Ordu Alım Merkezi", tip: "tmo" },
  { il: "Giresun", ilce: "Merkez", ad: "TMO Giresun Alım Merkezi", tip: "tmo" },
  { il: "Trabzon", ilce: "Merkez", ad: "TMO Trabzon Alım Merkezi", tip: "tmo" },
  { il: "Rize", ilce: "Merkez", ad: "TMO Rize Alım Merkezi", tip: "tmo" },
  { il: "Artvin", ilce: "Merkez", ad: "TMO Artvin Alım Merkezi", tip: "tmo" },
  { il: "Gümüşhane", ilce: "Merkez", ad: "TMO Gümüşhane Alım Merkezi", tip: "tmo" },
  { il: "Bayburt", ilce: "Merkez", ad: "TMO Bayburt Alım Merkezi", tip: "tmo" },
  // ── Doğu ve Güneydoğu Anadolu ────────────────────────────────────────────
  { il: "Malatya", ilce: "Merkez", ad: "TMO Malatya Alım Merkezi", tip: "tmo" },
  { il: "Malatya", ilce: "Doğanşehir", ad: "TMO Doğanşehir Alım Merkezi", tip: "tmo" },
  { il: "Elazığ", ilce: "Merkez", ad: "TMO Elazığ Alım Merkezi", tip: "tmo" },
  { il: "Gaziantep", ilce: "Merkez", ad: "TMO Gaziantep Alım Merkezi", tip: "tmo" },
  { il: "Gaziantep", ilce: "Nizip", ad: "TMO Nizip Alım Merkezi", tip: "tmo" },
  { il: "Şanlıurfa", ilce: "Merkez", ad: "TMO Şanlıurfa Alım Merkezi", tip: "tmo" },
  { il: "Şanlıurfa", ilce: "Viranşehir", ad: "TMO Viranşehir Alım Merkezi", tip: "tmo" },
  { il: "Şanlıurfa", ilce: "Siverek", ad: "TMO Siverek Alım Merkezi", tip: "tmo" },
  { il: "Şanlıurfa", ilce: "Bozova", ad: "TMO Bozova Alım Merkezi", tip: "tmo" },
  { il: "Diyarbakır", ilce: "Merkez", ad: "TMO Diyarbakır Alım Merkezi", tip: "tmo" },
  { il: "Diyarbakır", ilce: "Ergani", ad: "TMO Ergani Alım Merkezi", tip: "tmo" },
  { il: "Mardin", ilce: "Kızıltepe", ad: "TMO Kızıltepe Alım Merkezi", tip: "tmo" },
  { il: "Adıyaman", ilce: "Merkez", ad: "TMO Adıyaman Alım Merkezi", tip: "tmo" },
  { il: "Adıyaman", ilce: "Kahta", ad: "TMO Kahta Alım Merkezi", tip: "tmo" },
  { il: "Erzurum", ilce: "Merkez", ad: "TMO Erzurum Alım Merkezi", tip: "tmo" },
  { il: "Erzurum", ilce: "Pasinler", ad: "TMO Pasinler Alım Merkezi", tip: "tmo" },
  { il: "Erzincan", ilce: "Merkez", ad: "TMO Erzincan Alım Merkezi", tip: "tmo" },
  { il: "Kars", ilce: "Merkez", ad: "TMO Kars Alım Merkezi", tip: "tmo" },
  { il: "Ağrı", ilce: "Merkez", ad: "TMO Ağrı Alım Merkezi", tip: "tmo" },
  { il: "Iğdır", ilce: "Merkez", ad: "TMO Iğdır Alım Merkezi", tip: "tmo" },
  { il: "Ardahan", ilce: "Merkez", ad: "TMO Ardahan Alım Merkezi", tip: "tmo" },
  { il: "Van", ilce: "Merkez", ad: "TMO Van Alım Merkezi", tip: "tmo" },
  { il: "Van", ilce: "Erciş", ad: "TMO Erciş Alım Merkezi", tip: "tmo" },
  { il: "Bitlis", ilce: "Merkez", ad: "TMO Bitlis Alım Merkezi", tip: "tmo" },
  { il: "Muş", ilce: "Merkez", ad: "TMO Muş Alım Merkezi", tip: "tmo" },
  { il: "Bingöl", ilce: "Merkez", ad: "TMO Bingöl Alım Merkezi", tip: "tmo" },
  { il: "Tunceli", ilce: "Merkez", ad: "TMO Tunceli Alım Merkezi", tip: "tmo" },
  { il: "Siirt", ilce: "Merkez", ad: "TMO Siirt Alım Merkezi", tip: "tmo" },
  { il: "Batman", ilce: "Merkez", ad: "TMO Batman Alım Merkezi", tip: "tmo" },
  { il: "Şırnak", ilce: "Cizre", ad: "TMO Cizre Alım Merkezi", tip: "tmo" },
  { il: "Hakkari", ilce: "Merkez", ad: "TMO Hakkari Alım Merkezi", tip: "tmo" },
  { il: "Kilis", ilce: "Merkez", ad: "TMO Kilis Alım Merkezi", tip: "tmo" },
];

async function nominatimGeocode(il, ilce) {
  const sorgu = ilce === "Merkez"
    ? `${il}, Turkey`
    : `${ilce}, ${il}, Turkey`;

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(sorgu)}&format=json&limit=1&countrycodes=tr`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Cadastrum/1.0 (cadastrum.com.tr; info@cadastrum.com.tr)",
      "Accept-Language": "tr,en",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data = await res.json();

  if (!data.length) return null;
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  process.stderr.write(`[tmo-geocode] ${TMO_MERKEZLER.length} merkez geocode edilecek...\n`);
  process.stderr.write(`[tmo-geocode] Rate limit: ${RATE_LIMIT_MS}ms/istek → ~${Math.ceil(TMO_MERKEZLER.length * RATE_LIMIT_MS / 60000)} dk\n\n`);

  const sonuclar = [];
  let basarili = 0;
  let basarisiz = 0;

  for (let i = 0; i < TMO_MERKEZLER.length; i++) {
    const m = TMO_MERKEZLER[i];
    process.stderr.write(`[${i + 1}/${TMO_MERKEZLER.length}] ${m.il} / ${m.ilce}...`);

    try {
      const koord = await nominatimGeocode(m.il, m.ilce);
      if (koord) {
        sonuclar.push({
          ad: m.ad,
          il: m.il,
          lat: +koord.lat.toFixed(4),
          lng: +koord.lng.toFixed(4),
          tip: m.tip,
        });
        process.stderr.write(` ✓ ${koord.lat.toFixed(4)}, ${koord.lng.toFixed(4)}\n`);
        basarili++;
      } else {
        process.stderr.write(` ✗ BULUNAMADI\n`);
        basarisiz++;
      }
    } catch (e) {
      process.stderr.write(` ✗ HATA: ${e.message}\n`);
      basarisiz++;
    }

    // Rate limit — Nominatim politikası
    if (i < TMO_MERKEZLER.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  process.stderr.write(`\n[tmo-geocode] Sonuç: ${basarili} başarılı, ${basarisiz} başarısız\n`);

  // TypeScript dosyası üret
  const ts = `/** Türkiye TMO Alım Merkezleri ve Lisanslı Depolar — statik koordinat dataset'i.
 *  Kaynak: TMO resmi liste + Nominatim geocoding (geocode-tmo.mjs ile üretildi).
 *  Üretim tarihi: ${new Date().toISOString().slice(0, 10)}
 *  Toplam ${sonuclar.length} merkez.
 *
 *  Tarımsal parsel değerlemesinde depo yakınlığı önemli bir faktördür:
 *  hububat, bakliyat, yağlı tohum depolama kapasitesi ürün değerini etkiler.
 */
export const LISANSLI_DEPOLAR: ReadonlyArray<{
  ad: string;
  il: string;
  lat: number;
  lng: number;
  tip: "tmo" | "lisansli-depo" | "silaj";
}> = ${JSON.stringify(sonuclar, null, 2)};
`;

  mkdirSync(dirname(ÇIKTI), { recursive: true });
  writeFileSync(ÇIKTI, ts, "utf8");
  process.stderr.write(`[tmo-geocode] ✓ ${ÇIKTI} yazıldı\n`);
}

main().catch((e) => {
  process.stderr.write(`HATA: ${e.message}\n`);
  process.exit(1);
});
