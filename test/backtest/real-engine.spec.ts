/**
 * Gerçek motor backtest'i — fiyatTahminEt()'i tracked emlakjet SQL'inden
 * kurulan hold-out (train/test) verisiyle çalıştırıp gerçek MAPE/within20 ölçer.
 *
 * NEDEN bu dosya var: scripts/backtest-baseline.mjs ve scripts/backtest-guard.mjs
 * gerçek motoru (fiyatTahminEt, bolgeBaseliniGetir) HİÇ çağırmıyor — yalnızca
 * scripts/baseline-cekirdek.mjs'teki elle senkronize tutulan basit bir JS
 * kopyasını ("ilçe medyanı × özellik çarpanı × skew") ölçüyorlar. Bu dosya,
 * motora yapılan gerçek doğruluk iyileştirmelerinin (emsal ağırlıklandırma,
 * enflasyon endeksleme, rafineri, triangülasyon, spatial-emsal, log-hedonic
 * damping…) görünür olmasını sağlar.
 *
 * Çalıştırma: `npm run backtest:real` (assert modu) veya
 * `npm run backtest:real:yaz` (eşik dosyasını yeniden yazar).
 * Ayrı vitest.backtest.config.ts ile çalışır — normal `npm test`'e karışmaz.
 *
 * Yöntem:
 * 1. Tracked scripts/emlakjet-data-turkiye.sql'den ham ilanları parse et.
 * 2. Deterministik %80/20 train/test böl (hash01 — aynı seed her koşuda aynı sonuç).
 * 3. TRAIN kayıtlarını IlanGozlem şekline çevirip db.ilanGozlem.toArray()'i
 *    bunu döndürecek şekilde mock'la — bolgeBaseliniGetir bunun üzerinde çalışır.
 * 4. Her TEST kaydı için mahalle merkezinden centroid bulup minimal bir Parsel
 *    kurup fiyatTahminEt(parsel, null, null) çağır, beklenenPerM2 ile gerçek
 *    tlm2'yi karşılaştır.
 * 5. Segment (arsa/tarla) bazlı MAPE/within20 hesaplayıp data/backtest-esik-real.json
 *    karşısında assert et (veya BACKTEST_YAZ=1 ise dosyayı yeniden yaz).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { db } from "../../src/lib/db";
import { fiyatTahminEt } from "../../src/lib/fiyat-tahmin";
import { MERKEZ_TUPLES } from "../../src/lib/data/mahalle-merkezleri";
import type { Parsel } from "../../src/types/tkgm";
import type { IlanGozlem } from "../../src/lib/db";

const ROOT = join(__dirname, "..", "..");
const SQL_YOLU = join(ROOT, "scripts/emlakjet-data-turkiye.sql");
const ESIK_YOLU = join(ROOT, "data/backtest-esik-real.json");
const MIN_TEST = 30;
const MAX_TEST_PER_SEGMENT = 400; // CI süresini makul tut — deterministik örneklem
const MAPE_TOLERANS = 5.0;
const WITHIN_TOLERANS = 3.0;
const YAZ_MODU = process.env.BACKTEST_YAZ === "1";

// ── Ham SQL parse — aynı satır formatı scripts/veri-rafine-pipeline.mjs ile ──
interface HamKayit {
  ilanNo: string;
  il: string;
  ilce: string;
  mahalle: string | null;
  tlm2: number;
  m2: number;
  kategori: string;
  tarihTs: number;
}

function hamKayitlariParseEt(): HamKayit[] {
  const metin = readFileSync(SQL_YOLU, "utf8");
  const blokRegex = /INSERT OR IGNORE INTO ilanlar[^;]+;/gs;
  const satirRegex =
    /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(?:'([^']*)'|NULL),\s*([0-9.]+),\s*([0-9.]+),\s*'([^']+)',\s*'([^']+)',\s*([0-9]+)/g;
  const out: HamKayit[] = [];
  for (const blok of metin.match(blokRegex) || []) {
    satirRegex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = satirRegex.exec(blok)) !== null) {
      const tlm2 = Math.round(parseFloat(m[6]!));
      const m2 = Math.round(parseFloat(m[7]!));
      if (!tlm2 || tlm2 < 100 || tlm2 > 5_000_000 || !m2 || m2 < 50) continue;
      const kategori = m[8]!;
      if (kategori !== "arsa" && kategori !== "tarla") continue;
      out.push({
        ilanNo: m[2]!,
        il: m[3]!,
        ilce: m[4]!,
        mahalle: m[5] || null,
        tlm2,
        m2,
        kategori,
        tarihTs: parseInt(m[10]!, 10) || Date.now(),
      });
    }
  }
  return out;
}

/** Deterministik hash → [0,1) — scripts/baseline-cekirdek.mjs:hash01 ile aynı. */
function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

interface OlcumSonucu {
  n: number;
  mape: number;
  medyanApe: number;
  p90Ape: number;
  bias: number;
  within10: number;
  within20: number;
}

function olc(apeler: number[], biasToplam: number): OlcumSonucu {
  const sirali = [...apeler].sort((a, b) => a - b);
  const n = sirali.length;
  const mape = sirali.reduce((s, v) => s + v, 0) / n;
  return {
    n,
    mape: +(mape * 100).toFixed(2),
    medyanApe: +(sirali[Math.floor(n * 0.5)]! * 100).toFixed(2),
    p90Ape: +(sirali[Math.floor(n * 0.9)]! * 100).toFixed(2),
    bias: +((biasToplam / n) * 100).toFixed(2),
    within10: +((sirali.filter((v) => v <= 0.10).length / n) * 100).toFixed(1),
    within20: +((sirali.filter((v) => v <= 0.20).length / n) * 100).toFixed(1),
  };
}

function minimalParsel(k: HamKayit, lat: number, lng: number): Parsel {
  return {
    mahalleKodu: null,
    ilKodu: null,
    ilceKodu: null,
    adaNo: 0,
    parselNo: 0,
    alan: k.m2,
    nitelik: k.kategori === "tarla" ? "Tarla" : "Arsa",
    pafta: "",
    ilAd: k.il,
    ilceAd: k.ilce,
    mahalleAd: k.mahalle ?? "",
    durum: "",
    gittigiParseller: [],
    geometri: {
      type: "Polygon",
      coordinates: [[[lng, lat], [lng + 0.0001, lat], [lng + 0.0001, lat + 0.0001], [lng, lat + 0.0001], [lng, lat]]],
    },
    merkezNokta: { lat, lng },
    koordinatlar: [],
    malikSayisi: null,
    payBilgisi: null,
  };
}

// ── Sonuçlar — beforeAll'da bir kere hesaplanır, tüm it()'ler bunu okur ──
const sonuclar: Record<"arsa" | "tarla", OlcumSonucu | null> = { arsa: null, tarla: null };

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("backtest: ağ erişimi devre dışı")),
  );

  const hamKayitlar = hamKayitlariParseEt();

  const train: HamKayit[] = [];
  const test: HamKayit[] = [];
  for (const k of hamKayitlar) {
    (hash01(k.ilanNo) < 0.8 ? train : test).push(k);
  }

  const trainIlanGozlem: IlanGozlem[] = train.map((k, i) => ({
    id: i,
    kaynak: "emlakjet",
    ilanNo: k.ilanNo,
    url: "",
    baslik: null,
    ilAd: k.il,
    ilceAd: k.ilce,
    mahalleAd: k.mahalle,
    ilNorm: k.il,
    ilceNorm: k.ilce,
    mahalleNorm: k.mahalle,
    imarDurumu: null,
    fiyat: k.tlm2 * k.m2,
    m2: k.m2,
    fiyatPerM2: k.tlm2,
    paraBirimi: "TL",
    adaNo: null,
    parselNo: null,
    zaman: k.tarihTs,
  }));

  vi.mocked(db.ilanGozlem.toArray).mockResolvedValue(trainIlanGozlem);

  for (const segment of ["arsa", "tarla"] as const) {
    const segmentTest = test
      .filter((k) => k.kategori === segment && k.mahalle)
      .filter((k) => `${k.il}__${k.ilce}__${k.mahalle}` in MERKEZ_TUPLES)
      // Deterministik örneklem — hash sırasına göre ilk MAX_TEST_PER_SEGMENT kayıt
      .sort((a, b) => hash01(a.ilanNo) - hash01(b.ilanNo))
      .slice(0, MAX_TEST_PER_SEGMENT);

    if (segmentTest.length < MIN_TEST) continue;

    const apeler: number[] = [];
    let biasToplam = 0;
    for (const k of segmentTest) {
      const [lat, lng] = MERKEZ_TUPLES[`${k.il}__${k.ilce}__${k.mahalle}`]!;
      const parsel = minimalParsel(k, lat, lng);
      const tahmin = await fiyatTahminEt(parsel, null, null);
      const ape = Math.abs(tahmin.beklenenPerM2 - k.tlm2) / k.tlm2;
      apeler.push(ape);
      biasToplam += (tahmin.beklenenPerM2 - k.tlm2) / k.tlm2;
    }
    sonuclar[segment] = olc(apeler, biasToplam);
  }

  if (YAZ_MODU) {
    const esikler: Record<string, unknown> = {};
    for (const segment of ["arsa", "tarla"] as const) {
      const s = sonuclar[segment];
      if (!s) continue;
      esikler[segment] = {
        baseline: s,
        mape_max: +(s.mape + MAPE_TOLERANS).toFixed(2),
        within20_min: +(s.within20 - WITHIN_TOLERANS).toFixed(1),
      };
    }
    writeFileSync(
      ESIK_YOLU,
      JSON.stringify(
        { olusturuldu: new Date().toISOString(), tolerans: { mape: MAPE_TOLERANS, within20: WITHIN_TOLERANS }, esikler },
        null,
        2,
      ),
      "utf8",
    );
    console.log("✅ Gerçek motor eşik dosyası yazıldı: data/backtest-esik-real.json");
    for (const segment of ["arsa", "tarla"] as const) {
      const s = sonuclar[segment];
      if (s) console.log(`   ${segment}: MAPE ${s.mape} · ±%20 ${s.within20} · n=${s.n}`);
    }
  }
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("Gerçek motor backtest (fiyatTahminEt)", () => {
  it.each(["arsa", "tarla"] as const)("%s segmenti eşik içinde kalır", (segment) => {
    const s = sonuclar[segment];
    if (!s) {
      console.warn(`⚠ ${segment}: yeterli test verisi yok (n < ${MIN_TEST}), atlanıyor.`);
      return;
    }
    if (YAZ_MODU) {
      // Yaz modunda eşik zaten güncel ölçümle yazıldı — assert anlamsız.
      expect(s.n).toBeGreaterThanOrEqual(MIN_TEST);
      return;
    }
    if (!existsSync(ESIK_YOLU)) {
      throw new Error("data/backtest-esik-real.json yok. Önce: npm run backtest:real:yaz");
    }
    const { esikler } = JSON.parse(readFileSync(ESIK_YOLU, "utf8"));
    const esik = esikler[segment];
    if (!esik) {
      console.warn(`⚠ ${segment}: eşik dosyasında kayıt yok, atlanıyor.`);
      return;
    }
    expect(s.mape, `${segment} MAPE regresyonu`).toBeLessThanOrEqual(esik.mape_max);
    expect(s.within20, `${segment} within±20% regresyonu`).toBeGreaterThanOrEqual(esik.within20_min);
  });
});
