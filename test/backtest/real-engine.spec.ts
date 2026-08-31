/**
 * Gerçek motor backtest'i — fiyatTahminEt()'i tracked emlakjet SQL'inden
 * kurulan hold-out (train/test) verisiyle çalıştırıp gerçek MAPE/within20 ölçer.
 *
 * NEDEN bu dosya var: scripts/backtest-baseline.mjs — ve onu CI'ya bağlayan,
 * 2026-08-31'de silinen scripts/backtest-guard.mjs — gerçek motoru
 * (fiyatTahminEt, bolgeBaseliniGetir) HİÇ çağırmıyordu; yalnızca
 * scripts/baseline-cekirdek.mjs'teki elle senkronize tutulan basit bir JS
 * kopyasını ("ilçe medyanı × özellik çarpanı × skew") ölçüyorlardı. Bu dosya,
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

/**
 * Veri kaynakları — sırayla okunur, hepsi tek havuzda birleşir.
 *
 * `zorunlu: false` olanlar yoksa SESSİZCE atlanır. Sebep: hepsiemlak çıktısı
 * .gitignore'da (üretecinden yeniden kurulur), dolayısıyla CI'da bulunmayabilir.
 * Backtest'in tekrarlanabilirliği bozulmasın diye eksikliği hata değil.
 */
const VERI_KAYNAKLARI: Array<{ yol: string; zorunlu: boolean }> = [
  { yol: join(ROOT, "scripts/emlakjet-data-turkiye.sql"), zorunlu: true },
  { yol: join(ROOT, "scripts/hepsiemlak-data.sql"), zorunlu: false },
  // Üretim D1'inden dışa aktarılan ÖZELLİKLİ ilanlar (imar/başlık/tapu).
  // Özellik alanları yalnızca üretimde doluyor — yerel üreteçlerin hiçbiri
  // onları yazmıyor. Bu dosya olmadan A/B ölçümünün deney kolu boş kalır.
  // Üret: scripts/ozellikli-ilan-disa-aktar.mjs (kullanım dosya başında)
  { yol: join(ROOT, "scripts/ozellikli-ilanlar.sql"), zorunlu: false },
];

const ESIK_YOLU = join(ROOT, "data/backtest-esik-real.json");
const MIN_TEST = 30;
const MAX_TEST_PER_SEGMENT = 1200; // CI suresini makul tut — deterministik orneklem
const MAPE_TOLERANS = 5.0;
const WITHIN_TOLERANS = 3.0;
const YAZ_MODU = process.env.BACKTEST_YAZ === "1";

/**
 * SLO — motorun "güvenilir" sayılabilmesi için ulaşması gereken seviye.
 *
 * Eşiklerden (mape_max/within20_min) FARKI önemli: eşik "dün ne kadardıysa
 * bugün daha kötü olmasın" der, yani regresyon kapısıdır ve motor berbatken
 * de yeşil yanar. SLO ise "ne zaman iyi olur"un tanımı — bugün ikisi de
 * karşılanmıyor, kasten. Mesafe her koşumda raporlanır ki ilerleme
 * ölçülebilsin ve "iyileşiyoruz" iddiası sayıya bağlansın.
 *
 * within20 ≥ %50: tahminlerin yarısı gerçek fiyatın ±%20'sinde.
 * |bias| ≤ %10  : sistematik olarak yüksek/düşük tahmin etmiyoruz.
 *
 * Assert EDİLMEZ — bugün kırmızı yanan bir kapı CI'yı kalıcı kırmızıya
 * çevirir, o da hiçbir şey ölçmez hâle gelir.
 */
const SLO = { within20_min: 50, bias_mutlak_max: 10 } as const;

// ── Ham SQL parse ────────────────────────────────────────────────────────────
interface HamKayit {
  ilanNo: string;
  kaynak: string;
  il: string;
  ilce: string;
  mahalle: string | null;
  tlm2: number;
  m2: number;
  kategori: string;
  tarihTs: number;
  /** Özellik alanları — kaynak taşımıyorsa null. Bkz. Faz 2 A/B ölçümü. */
  baslik: string | null;
  imarDurumu: string | null;
  tapuDurumu: string | null;
  koordKaynagi: string | null;
}

/**
 * Tek bir SQL VALUES satırını, kolon SIRASINA değil ADINA göre parçalar.
 *
 * NEDEN: eski parser sabit kolon sırasına dayalı tek bir regex'ti ve yalnızca
 * emlakjet üretecinin düzenini tanıyordu. hepsiemlak üreteci farklı bir kolon
 * seti yazıyor (baslik, imar_durumu, lat, lng, koord_kaynagi) — sıraya dayalı
 * parser onu SESSİZCE yanlış okurdu (fiyat yerine m2 vb.), ki bu bu oturumda
 * defalarca gördüğümüz "sessizce yanlış veri" sınıfının ta kendisi.
 */
function satirDegerleriniAyir(satir: string): string[] {
  const out: string[] = [];
  let cur = "";
  let tirnakta = false;
  for (let i = 0; i < satir.length; i++) {
    const c = satir[i]!;
    if (tirnakta) {
      // SQL'de kaçış '' ile yapılır
      if (c === "'" && satir[i + 1] === "'") { cur += "'"; i++; continue; }
      if (c === "'") { tirnakta = false; continue; }
      cur += c;
    } else if (c === "'") {
      tirnakta = true;
    } else if (c === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function dosyaParseEt(metin: string, out: HamKayit[]): void {
  // Her INSERT bloğu kendi kolon listesini taşıyor — onu okuyup eşleme kuruyoruz.
  const blokRegex = /INSERT OR IGNORE INTO ilanlar\s*\(([^)]*)\)\s*VALUES([^;]+);/gs;
  let blok: RegExpExecArray | null;
  while ((blok = blokRegex.exec(metin)) !== null) {
    const kolonlar = blok[1]!.split(",").map((k) => k.trim());
    const idx = (ad: string) => kolonlar.indexOf(ad);
    const iIlanNo = idx("ilan_no"), iKaynak = idx("kaynak");
    const iIl = idx("il_norm"), iIlce = idx("ilce_norm"), iMah = idx("mahalle_norm");
    const iFiyat = idx("fiyat_per_m2"), iM2 = idx("m2"), iKat = idx("kategori");
    const iTarih = idx("yakalanma_tarihi");
    const iBaslik = idx("baslik"), iImar = idx("imar_durumu");
    const iTapu = idx("tapu_durumu"), iKoordK = idx("koord_kaynagi");

    // Zorunlu kolonlardan biri yoksa blok tanınmıyor demektir — sessizce
    // yanlış okumaktansa atla.
    if (iIlanNo < 0 || iIl < 0 || iIlce < 0 || iFiyat < 0 || iM2 < 0 || iKat < 0) continue;

    for (const m of blok[2]!.matchAll(/\(([^()]*)\)/g)) {
      const v = satirDegerleriniAyir(m[1]!);
      if (v.length !== kolonlar.length) continue;
      const al = (i: number) => (i >= 0 && v[i] !== "NULL" ? v[i]! : null);

      const tlm2 = Math.round(parseFloat(v[iFiyat]!));
      const m2 = Math.round(parseFloat(v[iM2]!));
      if (!tlm2 || tlm2 < 100 || tlm2 > 5_000_000 || !m2 || m2 < 50) continue;
      const kategori = v[iKat]!;
      if (kategori !== "arsa" && kategori !== "tarla") continue;

      out.push({
        ilanNo: v[iIlanNo]!,
        kaynak: al(iKaynak) ?? "bilinmiyor",
        il: v[iIl]!,
        ilce: v[iIlce]!,
        mahalle: al(iMah),
        tlm2,
        m2,
        kategori,
        tarihTs: parseInt(al(iTarih) ?? "", 10) || Date.now(),
        baslik: al(iBaslik),
        imarDurumu: al(iImar),
        tapuDurumu: al(iTapu),
        koordKaynagi: al(iKoordK),
      });
    }
  }
}

function hamKayitlariParseEt(): HamKayit[] {
  const out: HamKayit[] = [];
  for (const { yol, zorunlu } of VERI_KAYNAKLARI) {
    if (!existsSync(yol)) {
      if (zorunlu) throw new Error(`Zorunlu backtest veri dosyası yok: ${yol}`);
      continue;
    }
    dosyaParseEt(readFileSync(yol, "utf8"), out);
  }

  // ── Kaynaklar arası tekilleştirme ──────────────────────────────────────────
  // İki site aynı fiziksel parseli farklı ilan_no ile listeleyebiliyor. Aynı
  // ilan hem train hem test'e düşerse ölçüm kendini doğrular hâle gelir.
  // Anahtar: konum + alan + birim fiyat. Çakışmada ÖZELLİK ALANI DOLU olan
  // kayıt tutulur — ölçmek istediğimiz şey tam olarak o alanlar.
  const secilen = new Map<string, HamKayit>();
  for (const k of out) {
    const anahtar = `${k.il}__${k.ilce}__${k.mahalle ?? ""}__${k.m2}__${k.tlm2}`;
    const mevcut = secilen.get(anahtar);
    if (!mevcut) { secilen.set(anahtar, k); continue; }
    const puan = (x: HamKayit) =>
      (x.imarDurumu ? 2 : 0) + (x.baslik ? 1 : 0) + (x.tapuDurumu ? 1 : 0);
    if (puan(k) > puan(mevcut)) secilen.set(anahtar, k);
  }
  return referansKalitesiSuz([...secilen.values()]);
}

/**
 * Referans veri kalitesi süzgeci — ölçümün kendisi kirliyken motoru
 * kalibre etmek, hataya doğru fit etmektir.
 *
 * Somut vaka (en kötü kayıt listesinden): istanbul/umraniye/esenkent,
 * 4.360 m² arsa, 161 TL/m². Toplam 702 bin TL. Ümraniye'de bu fiyat gerçek
 * olamaz — hisseli satış ya da parser hatası. Motor 20.500 TL/m² diyor ve
 * MUHTEMELEN HAKLI; buna "%12.633 hata" demek ölçüm aracının yalanı.
 *
 * Kural: kayıt, KENDİ ilçesinin medyanının 1/10'undan ucuz ya da 10 katından
 * pahalıysa düşer. Neden mutlak bir fiyat eşiği DEĞİL: Mardin köyünde 400
 * TL/m² tarla gerçek, Ümraniye'de 161 TL/m² arsa değil. Fark ilçenin kendi
 * seviyesinde — süzgeç de oraya bakıyor. Medyan yalnızca n>=20 ilçelerde
 * hesaplanır; daha azında hiçbir kayıt elenmez (dayanaksız eleme yapmamak
 * için).
 *
 * Elenen sayısı konsola YAZILIR. Sessizce veri atmak, tam da bu projede
 * yasakladığımız şey.
 */
function referansKalitesiSuz(kayitlar: HamKayit[]): HamKayit[] {
  const gruplar = new Map<string, number[]>();
  for (const k of kayitlar) {
    const g = `${k.il}__${k.ilce}__${k.kategori}`;
    (gruplar.get(g) ?? gruplar.set(g, []).get(g)!).push(k.tlm2);
  }
  const medyanlar = new Map<string, number>();
  for (const [g, liste] of gruplar) {
    if (liste.length < 20) continue;
    liste.sort((a, b) => a - b);
    medyanlar.set(g, liste[Math.floor(liste.length / 2)]!);
  }

  const kalan: HamKayit[] = [];
  const elenen: HamKayit[] = [];
  for (const k of kayitlar) {
    const med = medyanlar.get(`${k.il}__${k.ilce}__${k.kategori}`);
    if (med && (k.tlm2 < med / 10 || k.tlm2 > med * 10)) elenen.push(k);
    else kalan.push(k);
  }

  console.log(
    `[backtest] referans kalite süzgeci: ${elenen.length} kayıt elendi ` +
    `(%${((100 * elenen.length) / Math.max(1, kayitlar.length)).toFixed(2)}) — ` +
    `ilçe medyanının 10 katı dışında. Ölçülen küme: ${kalan.length}`,
  );
  for (const k of elenen.slice(0, 5)) {
    const med = medyanlar.get(`${k.il}__${k.ilce}__${k.kategori}`)!;
    console.log(`           örnek: ${k.il}/${k.ilce} ${k.tlm2} TL/m² (ilçe medyanı ${med})`);
  }
  return kalan;
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

// ── Kırılım (segment breakdown) ──────────────────────────────────────────────
/**
 * NEDEN: tek bir MAPE sayısı motorun NEREDE yanıldığını söylemiyor. İki rakip
 * hipotez var ve ikisi TAMAMEN FARKLI yatırım gerektiriyor:
 *
 *   H1 — KAPSAM:  hata, yakınında emsal olmayan mahallelerde yoğunlaşıyor.
 *                 Çare: tarama hacmi (mahalle başına ilan).
 *   H2 — ÖZELLİK: hata, parselin ne olduğunu bilmemekten geliyor.
 *                 Çare: zenginleştirme hattı (ilan başına imar/tapu).
 *
 * Ölçmeden birine yatırım yapmak, bu depoda tekrar tekrar düşülen tuzağın
 * aynısı olur. Kırılım bu ikisini ayırt etmek için var; ikincil eksenler
 * (alan/fiyat bandı) hatanın başka yerde yoğunlaşıp yoğunlaşmadığını gösterir.
 *
 * Kırılım bir EŞİK DEĞİL, rapor. Genel sayılar hesaplanış biçimini
 * değiştirmiyor — mevcut eşik kapısı aynen çalışmaya devam ediyor.
 */
interface KayitOlcum {
  ape: number;
  biasKatki: number;
  /** Tahmin anında train kümesinde bu mahalle için kaç kayıt vardı. */
  emsalAdet: number;
  imarVar: boolean;
  m2: number;
  tlm2: number;
  /**
   * Motorun hangi fallback basamagindan fiyat aldigi (mahalle → ilce → il →
   * sabit). emsalAdet'ten FARKI: emsalAdet backtest'in disaridan hesapladigi
   * bir sey, baselineKaynak ise motorun tahmin aninda KENDI bildigi deger.
   * Duzeltme ancak motorun bildigi bir anahtara baglanabilir — bu yuzden
   * kalibrasyonun ekseni bu.
   */
  baselineKaynak: string;
  /** Teshis icin — en kotu kayitlari elle inceleyebilmek. */
  etiket: string;
  tahmin: number;
}

/** Emsal yoğunluğu kovası — H1'in ölçüldüğü eksen. */
function yogunlukKovasi(adet: number): string {
  if (adet === 0) return "0 (emsal yok)";
  if (adet < 5) return "1-4";
  if (adet < 20) return "5-19";
  return "20+";
}

function alanKovasi(m2: number): string {
  if (m2 < 250) return "<250 m²";
  if (m2 < 1000) return "250-1k";
  if (m2 < 5000) return "1k-5k";
  return "5k+";
}

function fiyatKovasi(tlm2: number): string {
  if (tlm2 < 1000) return "<1k TL/m²";
  if (tlm2 < 5000) return "1k-5k";
  if (tlm2 < 20000) return "5k-20k";
  return "20k+";
}

/** Kayıtları bir eksene göre kovalara ayırıp her kova için ölçüm üretir. */
function kirilimHesapla(
  kayitlar: KayitOlcum[],
  kovala: (k: KayitOlcum) => string,
): Record<string, OlcumSonucu> {
  const kovalar = new Map<string, KayitOlcum[]>();
  for (const k of kayitlar) {
    const ad = kovala(k);
    if (!kovalar.has(ad)) kovalar.set(ad, []);
    kovalar.get(ad)!.push(k);
  }
  const cikti: Record<string, OlcumSonucu> = {};
  for (const [ad, grup] of kovalar) {
    // Küçük kovalar yanıltıcı: 3 kayıtlık bir kovanın MAPE'si gürültüdür.
    if (grup.length < 20) continue;
    cikti[ad] = olc(grup.map((g) => g.ape), grup.reduce((t, g) => t + g.biasKatki, 0));
  }
  return cikti;
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

// ── Sonuçlar ────────────────────────────────────────────────────────────────
// `sonuclar` eşik kapısının baktığı KONTROL kolu (özellikler kapalı) — bugünkü
// davranış, mevcut eşiklerle karşılaştırılabilir kalmalı.
// `deneySonuclari` özellikler açıkken; A/B farkı bu ikisinin arasında.
const sonuclar: Record<"arsa" | "tarla", OlcumSonucu | null> = { arsa: null, tarla: null };
const deneySonuclari: Record<"arsa" | "tarla", OlcumSonucu | null> = { arsa: null, tarla: null };
/** Deney kolunda özelliği olan test kaydı sayısı — katkı yorumlanırken şart. */
const ozellikliTestAdet: Record<"arsa" | "tarla", number> = { arsa: 0, tarla: 0 };

/** Kırılım raporu — DENEY kolundan (özellikler açık) toplanır. */
type KirilimRapor = Record<string, Record<string, OlcumSonucu>>;
const kirilimlar: Record<"arsa" | "tarla", KirilimRapor> = { arsa: {}, tarla: {} };
/**
 * En kötü 10 kayıt. Kova ortalaması "hata nerede yoğunlaşıyor" der; bu liste
 * "hangi kayıt" der. Ağır kuyruklu bir dağılımda (arsa: medyan %69, ortalama
 * %277) ikincisi olmadan düz bir çarpan yazmak yanlış tedavidir.
 */
const enKotular: Record<"arsa" | "tarla", KayitOlcum[]> = { arsa: [], tarla: [] };

/**
 * Tek bir kolu koşar.
 *
 * @param ozellikAc false → imar/başlık/tapu alanları null'lanır (kontrol).
 *   Aynı kayıtlar, aynı bölünme, aynı sıra kullanılır; TEK değişken budur.
 *   Böylece ölçülen fark özellik derinliğinin saf katkısı olur — hacim
 *   artışından ayrışmış hâlde.
 */
async function koluKostur(
  hamKayitlar: HamKayit[],
  ozellikAc: boolean,
  hedef: Record<"arsa" | "tarla", OlcumSonucu | null>,
): Promise<void> {
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
    baslik: ozellikAc ? k.baslik : null,
    ilAd: k.il,
    ilceAd: k.ilce,
    mahalleAd: k.mahalle,
    ilNorm: k.il,
    ilceNorm: k.ilce,
    mahalleNorm: k.mahalle,
    imarDurumu: ozellikAc ? k.imarDurumu : null,
    tapuDurumu: ozellikAc ? k.tapuDurumu : null,
    fiyat: k.tlm2 * k.m2,
    m2: k.m2,
    fiyatPerM2: k.tlm2,
    paraBirimi: "TL",
    adaNo: null,
    parselNo: null,
    zaman: k.tarihTs,
  }));

  vi.mocked(db.ilanGozlem.toArray).mockResolvedValue(trainIlanGozlem);

  // Mahalle başına train kayıt sayısı — emsal yoğunluğu ekseninin kaynağı.
  // `bolgeBaseliniGetir` bu havuz üzerinde çalışıyor, dolayısıyla bir tahminin
  // arkasında kaç emsal olduğunu birebir bu sayı veriyor.
  const trainYogunluk = new Map<string, number>();
  for (const k of train) {
    if (!k.mahalle) continue;
    const anahtar = `${k.il}__${k.ilce}__${k.mahalle}`;
    trainYogunluk.set(anahtar, (trainYogunluk.get(anahtar) ?? 0) + 1);
  }

  for (const segment of ["arsa", "tarla"] as const) {
    const segmentTest = test
      .filter((k) => k.kategori === segment && k.mahalle)
      .filter((k) => `${k.il}__${k.ilce}__${k.mahalle}` in MERKEZ_TUPLES)
      // Deterministik örneklem — hash sırasına göre ilk MAX_TEST_PER_SEGMENT kayıt
      .sort((a, b) => hash01(a.ilanNo) - hash01(b.ilanNo))
      .slice(0, MAX_TEST_PER_SEGMENT);

    if (segmentTest.length < MIN_TEST) continue;
    if (ozellikAc) {
      ozellikliTestAdet[segment] = segmentTest.filter((k) => k.imarDurumu).length;
    }

    const apeler: number[] = [];
    const kayitOlcumleri: KayitOlcum[] = [];
    let biasToplam = 0;
    for (const k of segmentTest) {
      const [lat, lng] = MERKEZ_TUPLES[`${k.il}__${k.ilce}__${k.mahalle}`]!;
      // SIZINTI KORUMASI: test parseline yalnızca alan/nitelik/konum veriliyor.
      // Kendi imar durumunu bilmek meşru (üretimde kullanıcı bilir) ama fiyat
      // türevi hiçbir alan geçmiyor — minimalParsel bunu yapısal olarak garanti
      // ediyor, `k.tlm2` oraya hiç ulaşmıyor.
      const parsel = minimalParsel(k, lat, lng);
      const tahmin = await fiyatTahminEt(parsel, null, null);

      // ELMAYLA ELMA: referans veri ASKING fiyatı, motorun hedefi ise KAPANIŞ
      // fiyatı — gerçek emsal havuzu kullanıldığında bilinçli bir asking→kapanış
      // iskontosu uygulanıyor (dinamikIndirimOrani, %6-24). İskontoyu geri
      // eklemeden karşılaştırmak, doğru çalışan motoru "hatalı" gösterip emsal
      // yolunu haksız yere cezalandırıyordu.
      const indirim = tahmin.uygulananIndirim ?? 0;
      const askingEsdeger =
        indirim > 0 && indirim < 1
          ? tahmin.beklenenPerM2 / (1 - indirim)
          : tahmin.beklenenPerM2;

      const ape = Math.abs(askingEsdeger - k.tlm2) / k.tlm2;
      const biasKatki = (askingEsdeger - k.tlm2) / k.tlm2;
      apeler.push(ape);
      biasToplam += biasKatki;
      kayitOlcumleri.push({
        ape,
        biasKatki,
        emsalAdet: trainYogunluk.get(`${k.il}__${k.ilce}__${k.mahalle}`) ?? 0,
        imarVar: !!k.imarDurumu,
        m2: k.m2,
        tlm2: k.tlm2,
        baselineKaynak: tahmin.baselineKaynak,
        etiket: `${k.il}/${k.ilce}/${k.mahalle ?? "-"}`,
        tahmin: Math.round(askingEsdeger),
      });
    }
    hedef[segment] = olc(apeler, biasToplam);

    // Kırılım yalnızca DENEY kolundan: özellikler açıkken imar ekseni anlamlı.
    if (ozellikAc) {
      enKotular[segment] = [...kayitOlcumleri].sort((a, b) => b.ape - a.ape).slice(0, 10);
      kirilimlar[segment] = {
        emsalYogunlugu: kirilimHesapla(kayitOlcumleri, (k) => yogunlukKovasi(k.emsalAdet)),
        imar: kirilimHesapla(kayitOlcumleri, (k) => (k.imarVar ? "imar biliniyor" : "imar yok")),
        alanBandi: kirilimHesapla(kayitOlcumleri, (k) => alanKovasi(k.m2)),
        fiyatBandi: kirilimHesapla(kayitOlcumleri, (k) => fiyatKovasi(k.tlm2)),
        baselineKaynak: kirilimHesapla(kayitOlcumleri, (k) => k.baselineKaynak),
      };
    }
  }
}

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("backtest: ağ erişimi devre dışı")),
  );

  const hamKayitlar = hamKayitlariParseEt();
  const ozellikliHam = hamKayitlar.filter((k) => k.imarDurumu).length;
  console.log(
    `[backtest] ${hamKayitlar.length} kayıt · imar durumu olan: ${ozellikliHam} ` +
    `(%${((100 * ozellikliHam) / Math.max(1, hamKayitlar.length)).toFixed(1)})`,
  );

  // KONTROL kolu önce — eşik kapısı buna bakıyor, mevcut davranışı temsil ediyor.
  await koluKostur(hamKayitlar, false, sonuclar);
  // DENEY kolu — aynı kayıtlar, aynı bölünme, özellikler açık.
  await koluKostur(hamKayitlar, true, deneySonuclari);

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
        {
          olusturuldu: new Date().toISOString(),
          tolerans: { mape: MAPE_TOLERANS, within20: WITHIN_TOLERANS },
          slo: {
            ...SLO,
            not: "Hedef seviye — regresyon eşiği DEĞİL, assert edilmez. Mesafe her koşumda raporlanır.",
          },
          esikler,
        },
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

  /**
   * A/B raporu — özellik derinliğinin (imar/başlık/tapu) saf katkısı.
   *
   * Bu bir EŞİK TESTİ DEĞİL, ölçüm çıktısıdır: iki kol da aynı kayıtlarla
   * çalıştığı için fark yalnızca özelliklerden gelir. Assert edilmemesinin
   * sebebi, özellik kapsamı düşükken farkın gürültü seviyesinde kalması —
   * eşiğe bağlamak yanıltıcı bir kapı yaratırdı.
   */
  it("özellik derinliği A/B farkını raporlar", () => {
    const satirlar: string[] = [];
    for (const segment of ["arsa", "tarla"] as const) {
      const k = sonuclar[segment];
      const d = deneySonuclari[segment];
      if (!k || !d) continue;
      const fark = (a: number, b: number) => {
        const f = b - a;
        return `${f >= 0 ? "+" : ""}${f.toFixed(2)}`;
      };
      satirlar.push(
        `  ${segment.padEnd(5)} n=${k.n} · özellikli test kaydı=${ozellikliTestAdet[segment]}\n` +
        `    MAPE    ${k.mape.toFixed(2)} → ${d.mape.toFixed(2)} (${fark(k.mape, d.mape)})\n` +
        `    medyan  ${k.medyanApe.toFixed(2)} → ${d.medyanApe.toFixed(2)} (${fark(k.medyanApe, d.medyanApe)})\n` +
        `    ±%20    ${k.within20.toFixed(1)} → ${d.within20.toFixed(1)} (${fark(k.within20, d.within20)})\n` +
        `    bias    ${k.bias.toFixed(2)} → ${d.bias.toFixed(2)} (${fark(k.bias, d.bias)})`,
      );
    }
    console.log("\n── ÖZELLİK DERİNLİĞİ A/B (kontrol → deney) ──\n" + satirlar.join("\n") + "\n");

    // Tek gerçek güvence: iki kol da hesaplanabilmiş olmalı. Aksi hâlde
    // ölçüm aracı bozuktur ve Faz 3 kalibrasyonu dayanaksız kalır.
    for (const segment of ["arsa", "tarla"] as const) {
      if (sonuclar[segment]) expect(deneySonuclari[segment]).not.toBeNull();
    }
  });

  /**
   * SLO MESAFESİ — "motor ne zaman güvenilir olur"un tek sayfalık cevabı.
   *
   * Eşik testi yeşil yanarken bu rapor kırmızı okunabilir; ikisi farklı soruyu
   * cevaplıyor. Eşik: "dünden kötü müyüz?". Bu: "hedeften ne kadar uzağız?".
   */
  it("SLO mesafesini raporlar", () => {
    const satirlar: string[] = [];
    for (const segment of ["arsa", "tarla"] as const) {
      const s = sonuclar[segment];
      if (!s) continue;
      const w = SLO.within20_min - s.within20;
      const b = Math.abs(s.bias) - SLO.bias_mutlak_max;
      satirlar.push(
        `  ${segment.padEnd(5)} ±%20 ${s.within20.toFixed(1)} / hedef ${SLO.within20_min}` +
        `  → ${w <= 0 ? "KARŞILANDI" : `${w.toFixed(1)} puan eksik`}\n` +
        `        |bias| ${Math.abs(s.bias).toFixed(2)} / hedef ≤${SLO.bias_mutlak_max}` +
        `  → ${b <= 0 ? "KARŞILANDI" : `${b.toFixed(2)} puan fazla`}`,
      );
    }
    console.log("\n── SLO MESAFESİ (hedef; kapı değil) ──\n" + satirlar.join("\n") + "\n");

    // Güvence: ölçüm var. SLO'nun kendisi assert edilmiyor (bkz. SLO yorumu).
    expect(satirlar.length).toBeGreaterThan(0);
  });

  /**
   * KIRILIM RAPORU — hatanın NEREDE yoğunlaştığı.
   *
   * Bu da bir eşik testi değil, teşhis çıktısıdır. Tek bir MAPE sayısı
   * "motor kötü" der ama ne yapılacağını söylemez. İki rakip hipotez ancak
   * kırılımla ayrışır:
   *
   *   emsalYogunlugu ekseninde hata düşük kovalarda toplanıyorsa → H1 (kapsam),
   *   imar ekseninde "imar yok" kovası belirgin kötüyse            → H2 (özellik).
   *
   * Yatırım kararı (tarama hacmi mi, zenginleştirme hattı mı) bu tabloya bakılarak
   * verilir. `data/backtest-kirilim.json` dosyası da yazılır ki değişim
   * koşumlar arasında karşılaştırılabilsin.
   */
  it("hatanın nerede yoğunlaştığını raporlar (kırılım)", () => {
    const satirlar: string[] = [];

    for (const segment of ["arsa", "tarla"] as const) {
      const kirilim = kirilimlar[segment];
      if (!kirilim || Object.keys(kirilim).length === 0) continue;

      satirlar.push(`\n  ${segment.toUpperCase()}`);
      for (const [eksen, kovalar] of Object.entries(kirilim)) {
        const adlar = Object.keys(kovalar);
        if (adlar.length === 0) continue;
        satirlar.push(`    ${eksen}:`);
        for (const ad of adlar) {
          const o = kovalar[ad]!;
          satirlar.push(
            `      ${ad.padEnd(16)} n=${String(o.n).padStart(5)}` +
            `  MAPE ${String(o.mape).padStart(7)}` +
            `  medyan ${String(o.medyanApe).padStart(6)}` +
            `  ±%20 ${String(o.within20).padStart(5)}` +
            `  bias ${String(o.bias).padStart(7)}`,
          );
        }
      }
    }

    const kotuSatirlar: string[] = [];
    for (const segment of ["arsa", "tarla"] as const) {
      const liste = enKotular[segment];
      if (liste.length === 0) continue;
      kotuSatirlar.push(`  ${segment.toUpperCase()}`);
      for (const k of liste) {
        kotuSatirlar.push(
          `    ${k.etiket.padEnd(42).slice(0, 42)} gerçek ${String(k.tlm2).padStart(7)}` +
          ` → tahmin ${String(k.tahmin).padStart(8)}  (%${(k.ape * 100).toFixed(0)})` +
          `  ${k.baselineKaynak}`,
        );
      }
    }
    console.log("\n── EN KÖTÜ 10 KAYIT (kuyruğun kimliği) ──\n" + kotuSatirlar.join("\n") + "\n");

    console.log(
      "\n── HATA KIRILIMI (deney kolu — özellikler açık) ──" +
      satirlar.join("\n") +
      "\n\n  Okuma: emsalYogunlugu'nda düşük kovalar belirgin kötüyse KAPSAM (H1)," +
      "\n         imar'da 'imar yok' belirgin kötüyse ÖZELLİK (H2) baskın.\n",
    );

    writeFileSync(
      join(ROOT, "data/backtest-kirilim.json"),
      JSON.stringify(
        {
          olusturuldu: new Date().toISOString(),
          not: "Teşhis raporu — eşik DEĞİL. Kovalar n<20 ise raporlanmaz (gürültü).",
          kirilimlar,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    // Güvence: en az bir eksende kova üretilmiş olmalı. Üretilmiyorsa ölçüm
    // aracı sessizce boş rapor veriyor demektir — tam da yasakladığımız şey.
    const toplamKova = (["arsa", "tarla"] as const)
      .flatMap((seg) => Object.values(kirilimlar[seg] ?? {}))
      .reduce((t, kovalar) => t + Object.keys(kovalar).length, 0);
    expect(toplamKova).toBeGreaterThan(0);
  });
});
