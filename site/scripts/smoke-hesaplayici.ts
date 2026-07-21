/**
 * Smoke: fizibilite + kat karşılığı + ters fizibilite + yatırım skoru.
 * Çalıştır: npx --yes tsx scripts/smoke-hesaplayici.ts
 */
import { fizibiliteHesapla, tersFizibiliteHesapla, senaryoKarsilastir } from "../src/lib/fizibilite.ts";
import { katKarsiligiHesapla } from "../src/lib/kat-karsiligi.ts";
import { yatirimSkoruHesapla } from "../src/lib/yatirim-skoru.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const f = fizibiliteHesapla({
  parselM2: 1000,
  taks: 0.3,
  kaks: 1.5,
  arsaMaliyeti: 15_000_000,
  insaatBirimMaliyet: 18_000,
  satisBirimFiyat: 60_000,
});
assert(f.tabanAlani === 300, `taban ${f.tabanAlani}`);
assert(f.toplamInsaatAlani === 1500, `insaat ${f.toplamInsaatAlani}`);
assert(f.daireAdedi > 0, "daire");
assert(typeof f.karlilikYuzde === "number", "kar");

const t = tersFizibiliteHesapla({
  parselM2: 1000,
  taks: 0.3,
  arsaMaliyeti: 15_000_000,
  insaatBirimMaliyet: 18_000,
  satisBirimFiyat: 60_000,
  hedefKarlilikYuzde: 25,
  mevcutKaks: 1.5,
  hedefDaireAdedi: 8,
});
assert(t.minEmsal != null && t.minEmsal > 0, "min emsal");
assert(t.maxArsaMaliyeti != null, "max arsa");
assert(t.minEmsalDaireIcin != null && t.minEmsalDaireIcin > 0, "min emsal daire");

const kk = katKarsiligiHesapla({
  parselM2: 1000,
  kaks: 1.5,
  muteahhitPayYuzde: 50,
  insaatBirimMaliyet: 18_000,
  satisBirimFiyat: 60_000,
});
assert(kk.malikPayYuzde === 50, `malik pay ${kk.malikPayYuzde}`);
assert(kk.malikAlanM2 + kk.muteahhitAlanM2 === kk.satilabilirAlan, "alan toplam");

const s = senaryoKarsilastir(
  { parselM2: 1000, taks: 0.3, kaks: 1.2, arsaMaliyeti: 10_000_000, insaatBirimMaliyet: 18_000, satisBirimFiyat: 55_000 },
  { parselM2: 1000, taks: 0.4, kaks: 2.0, arsaMaliyeti: 10_000_000, insaatBirimMaliyet: 18_000, satisBirimFiyat: 55_000 },
);
assert(s.b.daireAdedi >= s.a.daireAdedi, "B daha çok daire");
assert(["A", "B", "berabere"].includes(s.kazanan), "kazanan");

const ysGuclu = yatirimSkoruHesapla({
  guvenSkoru: 88,
  kaynak: "spatial-radius",
  emsalAdet: 18,
  imarTipi: "konut",
  emsal: 1.5,
  taks: 0.35,
  toplamCarpan: 1.15,
  altTlm2: 12_000,
  ustTlm2: 16_000,
  medyanTlm2: 14_000,
  trendDegisimYuzde: 10,
});
assert(ysGuclu.skor >= 65, `güçlü skor ${ysGuclu.skor}`);
assert(ysGuclu.bilesenler.length === 4, "4 bileşen");

const ysZayif = yatirimSkoruHesapla({
  guvenSkoru: 30,
  kaynak: "il-fallback",
  emsalAdet: 0,
  imarTipi: "belirsiz",
  emsal: null,
  taks: null,
  toplamCarpan: 1,
  altTlm2: 5_000,
  ustTlm2: 20_000,
  medyanTlm2: 10_000,
});
assert(ysZayif.skor < ysGuclu.skor, "zayıf < güçlü");
assert(["Zayıf", "Temkinli"].includes(ysZayif.etiket), `etiket ${ysZayif.etiket}`);

console.log("OK smoke-hesaplayici", {
  karlilik: f.karlilikYuzde,
  minEmsal: t.minEmsal,
  malikDaire: kk.malikDaire,
  senaryo: s.kazanan,
  yatirimSkor: ysGuclu.skor,
  yatirimZayif: ysZayif.skor,
});
