#!/usr/bin/env node
/**
 * G3.3 — Gerçek satış hold-out ölçümü.
 *
 *   node scripts/gercek-satis-olcum.mjs                  # üretimden oku (wrangler)
 *   node scripts/gercek-satis-olcum.mjs --dosya=x.json   # dışa aktarılmış satırlardan
 *
 * ── SORU ────────────────────────────────────────────────────────────────────
 *
 * Projenin bütün doğruluk ölçümleri İLAN fiyatı üzerine. İlan fiyatı pazarlık
 * öncesi bir istek. Yedi bağımsız doğruluk denemesi düz çıktı ve ortak bir
 * açıklaması olabilir: ±%20 tavanının bir kısmı motorun hatası değil, HEDEFİN
 * gürültüsü. Bu betik onu sınıyor.
 *
 * ── KARAR KURALI — ÖLÇÜMDEN ÖNCE YAZILDI (GELISTIRME-PLANI-3 §G3) ───────────
 *
 *   n ≥ 200 gerçek satış (kategori başına) birikince ölçülür.
 *   "İlan-hedefli hata" = backtest'in ±%20 isabeti (ilan fiyatına karşı).
 *   "İşlem-hedefli hata" = motorun ±%20 isabeti (gerçek satışa karşı).
 *   Fark < 5 puan → "ilan fiyatı iyi bir vekil" yazılır ve konu KAPANIR.
 *   Fark ≥ 5 puan → HEDEF DEĞİŞMELİ.
 *
 * Kural bu betiği yazarken DEĞİŞTİRİLMEDİ. n < 200 iken betik bir karar
 * ÜRETMEZ — "yetersiz" yazar. Küçük örneklemde bir sayıya bakıp kural
 * uydurmak, bu projede kaçınmaya çalıştığımız şeyin ta kendisi.
 *
 * ── İKİNCİL ÖLÇÜM — KARARIN PARÇASI DEĞİL ───────────────────────────────────
 *
 * Motor kapanış fiyatını hedefliyor ve ilan→kapanış farkını
 * `dinamikIndirimOrani` ile %6-24 iskontoyla modelliyor. O model HİÇ
 * ÖLÇÜLMEDİ: backtest iskontoyu geri ekleyip ilanla kıyaslıyor. Gerçek satış
 * onu ilk kez sınamayı mümkün kılıyor: aynı satışlar hem iskontolu tahminle
 * hem ilan eşdeğeriyle (`tahmin / (1 − indirim)`) kıyaslanır. Hangisi gerçek
 * satışa daha yakınsa iskonto o yönde yanlıştır. Bu RAPORLANIR ama yukarıdaki
 * kararı etkilemez — o kural önceden yazıldı, bu bulgu bugün (2026-09-11) çıktı.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Önceden yazılmış karar kuralı — değiştirilmesi GEREKÇE ister. */
export const KARAR_KURALI = Object.freeze({ MIN_N: 200, ANLAMLI_FARK_PUAN: 5 });

/** Katman kırılımında gösterilmek için asgari örnek — altı gürültü. */
export const KATMAN_MIN_N = 20;

/**
 * P9 sızıntı sınırları. TEK KAYNAK `test/backtest/olcum-butunlugu.ts` —
 * orası TypeScript, bu betik bağımlılıksız .mjs olduğu için sayılar burada
 * tekrarlanıyor. Biri değişirse ikisi de değişmeli.
 */
const SIZINTI = Object.freeze({ MIN_N: 100, MEDYAN_APE_MIN: 5, WITHIN10_MAX: 50 });

const GERCEK_ISLEM = new Set(["satin-alindi", "satildi"]);

function medyan(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const yuvarla = (x, b = 1) => (x == null ? null : Math.round(x * 10 ** b) / 10 ** b);

/**
 * Tahmin–gerçek çiftlerinden metrik.
 *
 * ORTALAMA bias YOK — o ölçü asimetrik (100→500 +%400, tersi −%80) ve projede
 * bias diye kovalanan şeyin büyük ölçüde bu artefakt olduğu ölçüldü
 * (data/bias-metrigi-carpikligi.json). Medyan sapma var.
 */
export function metrik(ciftler) {
  const gecerli = ciftler.filter((c) => c.tahmin > 0 && c.gercek > 0);
  const n = gecerli.length;
  if (!n) return { n: 0, medyanApe: null, within10: null, within20: null, medyanSapma: null };
  const ape = gecerli.map((c) => Math.abs(c.tahmin - c.gercek) / c.gercek);
  const sapma = gecerli.map((c) => (c.tahmin - c.gercek) / c.gercek);
  return {
    n,
    medyanApe: yuvarla(medyan(ape) * 100),
    within10: yuvarla((100 * ape.filter((a) => a <= 0.1).length) / n),
    within20: yuvarla((100 * ape.filter((a) => a <= 0.2).length) / n),
    medyanSapma: yuvarla(medyan(sapma) * 100),
  };
}

/** P9 — mükemmel skor alarmdır. Hata FIRLATIR; sessizce rapora girmez. */
function sizintiDenetle(etiket, m) {
  if (m.n < SIZINTI.MIN_N) return;
  if (m.medyanApe < SIZINTI.MEDYAN_APE_MIN || m.within10 > SIZINTI.WITHIN10_MAX) {
    throw new Error(
      `SIZINTI ŞÜPHESİ — ${etiket} (n=${m.n}): medyanApe ${m.medyanApe}, within10 ${m.within10}. ` +
      `Gerçek satış tahminle bu kadar örtüşemez; gerçek kolon tahminden türetilmiş olabilir (P8).`,
    );
  }
}

/**
 * Satırlardan kategori bazında ölçüm.
 *
 * Yalnızca GERÇEK işlemler (`satin-alindi`, `satildi`). `bilgi` duyumdur;
 * kimin ne duyduğu motorun doğruluğunu ölçmez.
 */
export function olcumYap(satirlar) {
  const cikti = {};
  for (const kat of ["arsa", "tarla"]) {
    const s = satirlar.filter(
      (r) => r.kategori === kat && GERCEK_ISLEM.has(r.tip) && r.heuristic_per_m2 > 0,
    );

    const islemHedefli = metrik(s.map((r) => ({ tahmin: r.heuristic_per_m2, gercek: r.gercek_per_m2 })));
    sizintiDenetle(`${kat} işlem-hedefli`, islemHedefli);

    // İlan eşdeğeri: motorun iskontoyu UYGULAMADAN önceki tahmini.
    const indirimli = s.filter((r) => r.uygulanan_indirim != null && r.uygulanan_indirim < 1);
    const ilanEsdegeri = metrik(indirimli.map((r) => ({
      tahmin: r.heuristic_per_m2 / (1 - r.uygulanan_indirim),
      gercek: r.gercek_per_m2,
    })));
    const iskontoluAyniKume = metrik(indirimli.map((r) => ({
      tahmin: r.heuristic_per_m2, gercek: r.gercek_per_m2,
    })));

    const katmanlar = {};
    const gruplar = new Map();
    for (const r of s) {
      const k = r.baseline_kaynak ?? "(bilinmiyor)";
      if (!gruplar.has(k)) gruplar.set(k, []);
      gruplar.get(k).push({ tahmin: r.heuristic_per_m2, gercek: r.gercek_per_m2 });
    }
    let kucukKatman = 0;
    for (const [k, c] of gruplar) {
      if (c.length < KATMAN_MIN_N) { kucukKatman++; continue; }
      katmanlar[k] = metrik(c);
    }

    cikti[kat] = {
      islemHedefli,
      // İkincil: iskonto modelinin testi. AYNI kayıtlarda iki hedef (P5 —
      // kovaya düşme sebebini tahminciye mal etme): iskonto bilgisi olan
      // alt küme hem iskontolu hem iskontosuz ölçülüyor.
      iskontoTesti: { iskontolu: iskontoluAyniKume, ilanEsdegeri },
      katmanlar,
      gosterilmeyenKatman: kucukKatman,
    };
  }
  return cikti;
}

/**
 * Önceden yazılmış kuralı uygular. Kural BURADA değiştirilmez.
 *
 * @param islem   işlem-hedefli metrik (gerçek satışa karşı)
 * @param referansWithin20  backtest'in ilan-hedefli ±%20'si — dosyadan okunur
 */
export function karar(islem, referansWithin20) {
  if (!islem || islem.n < KARAR_KURALI.MIN_N) {
    return {
      durum: "YETERSIZ",
      gerekce: `n=${islem?.n ?? 0} < ${KARAR_KURALI.MIN_N}. Karar ÜRETİLMEDİ — ` +
        `küçük örneklemde bir sayıya bakıp sonuç çıkarmak kuralın kendisini delerdi.`,
    };
  }
  if (referansWithin20 == null) {
    return { durum: "REFERANS_YOK", gerekce: "Backtest eşik dosyasında bu kategori yok." };
  }
  const fark = yuvarla(islem.within20 - referansWithin20);
  if (Math.abs(fark) < KARAR_KURALI.ANLAMLI_FARK_PUAN) {
    return {
      durum: "VEKIL_IYI",
      fark,
      gerekce: `İşlem-hedefli ±%20 ${islem.within20} vs ilan-hedefli ${referansWithin20} ` +
        `(fark ${fark} puan < ${KARAR_KURALI.ANLAMLI_FARK_PUAN}). İlan fiyatı iyi bir vekil; ` +
        `tavanın sebebi hedefin gürültüsü DEĞİL. Konu kapanır.`,
    };
  }
  return {
    durum: "HEDEF_DEGISMELI",
    fark,
    gerekce: `İşlem-hedefli ±%20 ${islem.within20} vs ilan-hedefli ${referansWithin20} ` +
      `(fark ${fark} puan ≥ ${KARAR_KURALI.ANLAMLI_FARK_PUAN}). Ölçüm hedefi değişmeli.`,
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────
// Yalnızca doğrudan çağrıldığında çalışır: test dosyası bu modülü import
// ettiğinde üretime (wrangler) istek ATILMAMALI.

function satirlariOku(args) {
  const dosyaArg = args.find((a) => a.startsWith("--dosya="));
  if (dosyaArg) {
    return JSON.parse(readFileSync(dosyaArg.split("=")[1], "utf8"));
  }
  const sql =
    "SELECT kategori, tip, gercek_per_m2, heuristic_per_m2, baseline_kaynak, uygulanan_indirim " +
    "FROM gercek_satislar";
  let ham;
  try {
    ham = execSync(
      `npx wrangler d1 execute cadastrum-db --remote --json --command "${sql}"`,
      { cwd: join(ROOT, "backend/api"), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    const mesaj = String(e.stdout ?? "") + String(e.stderr ?? "");
    if (mesaj.includes("no such table")) {
      throw new Error("Üretimde gercek_satislar tablosu YOK — migration 0037 uygulanmamış.");
    }
    if (mesaj.includes("7500") || mesaj.includes("row read limit")) {
      throw new Error("D1 günlük okuma limiti dolu — gece yarısı (UTC) sonrası tekrar deneyin.");
    }
    throw new Error("wrangler sorgusu başarısız: " + mesaj.slice(0, 400));
  }
  return JSON.parse(ham)[0]?.results ?? [];
}

function main() {
  const satirlar = satirlariOku(process.argv.slice(2));
  const esikYolu = join(ROOT, "data/backtest-esik-real.json");
  const esikler = existsSync(esikYolu) ? JSON.parse(readFileSync(esikYolu, "utf8")).esikler : {};

  const olcum = olcumYap(satirlar);
  const sonuc = { olculdu: new Date().toISOString(), toplamSatir: satirlar.length, kural: KARAR_KURALI, kategoriler: {} };

  console.log(`Gerçek satış ölçümü — toplam ${satirlar.length} satır\n`);
  for (const kat of ["arsa", "tarla"]) {
    const o = olcum[kat];
    const ref = esikler?.[kat]?.baseline?.within20 ?? null;
    const k = karar(o.islemHedefli, ref);
    sonuc.kategoriler[kat] = { ...o, referansIlanWithin20: ref, karar: k };

    const m = o.islemHedefli;
    console.log(`${kat.toUpperCase()}  n=${m.n}  ±%20 ${m.within20 ?? "—"}  medyanApe ${m.medyanApe ?? "—"}  medyanSapma ${m.medyanSapma ?? "—"}`);
    console.log(`  referans (backtest, ilan-hedefli) ±%20: ${ref ?? "—"}`);
    console.log(`  KARAR: ${k.durum} — ${k.gerekce}`);
    const it = o.iskontoTesti;
    if (it.iskontolu.n > 0) {
      console.log(`  [ikincil] iskonto testi, aynı ${it.iskontolu.n} kayıt: ` +
        `iskontolu ±%20 ${it.iskontolu.within20} · ilan eşdeğeri ±%20 ${it.ilanEsdegeri.within20}`);
    }
    console.log("");
  }

  const cikti = join(ROOT, "data/gercek-satis-olcum.json");
  writeFileSync(cikti, JSON.stringify(sonuc, null, 2) + "\n", "utf8");
  console.log(`→ ${cikti}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.error(`HATA: ${e.message}`);
    process.exit(1);
  }
}
