#!/usr/bin/env node
/**
 * site/public/geo/otoyollar.geojson üreteci.
 *
 * NEDEN: harita sayfasındaki "🛣️ Otoyol & D-yol" düğmesi bu dosyayı çekiyor
 * (`site/src/scripts/harita-init.ts`) ama dosya depoda HİÇ YOKTU. Canlıda istek
 * 200 dönüyordu — çünkü Cloudflare Pages eşleşmeyen yola anasayfayı sunuyordu —
 * ve `res.json()` HTML'i ayrıştıramayıp patlıyordu. Kullanıcıya çıkan mesaj
 * (`durumGuncelle("Otoyol verisi alınamadı")`) hemen ardından gelen
 * `finally { durumGuncelle("") }` ile ANINDA siliniyordu: düğmeye basılıyor,
 * hiçbir şey olmuyor, hiçbir yerde iz kalmıyor.
 *
 * Veri zaten depoda: `src/lib/data/otoyollar.ts` (OSM'den üretilmiş 12.087
 * nokta). Uzantı paketine ait olduğu için siteye kopyalanıyor — aynı gerekçe
 * `site-ilce-listesi-uret.mjs`teki gibi.
 *
 * Yenile:
 *   node scripts/site-otoyol-geojson-uret.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const KAYNAK = join(KOK, "src", "lib", "data", "otoyollar.ts");
const HEDEF = join(KOK, "site", "public", "geo", "otoyollar.geojson");

const ham = readFileSync(KAYNAK, "utf8");

const esitlik = ham.indexOf("=", ham.indexOf("OTOYOL_NOKTALARI"));
const basla = ham.indexOf("[", esitlik);
if (basla === -1) throw new Error("otoyollar.ts biçimi tanınmadı — üreteç güncellenmeli");

let derinlik = 0;
let bit = -1;
for (let i = basla; i < ham.length; i++) {
  if (ham[i] === "[") derinlik++;
  else if (ham[i] === "]") {
    derinlik--;
    if (derinlik === 0) { bit = i; break; }
  }
}
if (bit === -1) throw new Error("Dizi kapanışı bulunamadı");

/** @type {Array<{tip: "motorway"|"trunk"; ad: string; lat: number; lng: number}>} */
const noktalar = JSON.parse(ham.slice(basla, bit + 1));
if (!Array.isArray(noktalar) || noktalar.length < 5000) {
  throw new Error(`Beklenen ~12.000 nokta, ${noktalar?.length} bulundu — üretim durduruldu`);
}

// Harita katmanı `tip` ile filtreliyor, `ad` ile etiketliyor
// (harita-init.ts: filter ["==", ["get","tip"], "motorway"]).
const features = noktalar.map((n) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [n.lng, n.lat] },
  properties: { tip: n.tip, ad: n.ad },
}));

const geojson = {
  type: "FeatureCollection",
  metadata: {
    kaynak: "OpenStreetMap (ODbL) — src/lib/data/otoyollar.ts",
    uretim: "node scripts/site-otoyol-geojson-uret.mjs",
    nokta_sayisi: features.length,
  },
  features,
};

mkdirSync(dirname(HEDEF), { recursive: true });
writeFileSync(HEDEF, JSON.stringify(geojson), "utf8");

const motorway = features.filter((f) => f.properties.tip === "motorway").length;
console.log(
  `site/public/geo/otoyollar.geojson yazıldı — ${features.length} nokta ` +
  `(${motorway} motorway, ${features.length - motorway} trunk)`,
);
