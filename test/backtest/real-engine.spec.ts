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
import { kanonikAnahtar } from "../../src/lib/data/mahalle-kanonik";
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
const GUN_MS = 24 * 60 * 60 * 1000;

/**
 * SLO — motorun "guvenilir" sayilabilmesi icin ulasmasi gereken seviye.
 *
 * Esiklerden (mape_max/within20_min) FARKI onemli: esik "dun ne kadardiysa
 * bugun daha kotu olmasin" der, yani regresyon kapisidir ve motor berbatken
 * de yesil yanar. SLO ise "ne zaman iyi olur"un tanimi.
 *
 * ±%20 >= %50 HEDEFI NEREDE DURUYOR — her kosumda olculuyor.
 *
 * Asagida NAIF TABAN hesaplaniyor: ayni hold-out, ayni orneklem, her test
 * kaydi kendi mahallesinin train medyaniyla tahmin ediliyor. Hicbir carpan,
 * baseline, shrinkage yok. Motorun tum zincirinin ne kazandirdigi bu farkta.
 *
 * 2026-09-06 olcumu:
 *   arsa  motor 27,1 · naif taban 25,3  → zincirin katkisi +1,8 puan
 *   tarla motor 44,0 · naif taban 24,8  → zincirin katkisi +19,2 puan
 *
 * DUZELTME: bir onceki degerlendirmede "mahalle duzeyinin tavani ~30, motor
 * ona carpmis" denmisti. YANLISTI — o sayi yalnizca >=5 ilanli mahallelerde
 * ve hedef kaydin komsulari dahil edilerek olculmustu, yani kolay bir alt
 * kume. Adil kiyasta motor naif tabani ASIYOR. Ortada carpilmis bir tavan yok.
 *
 * ASIL BULGU ASIMETRI: tarlada zincir +19,2 puan kazandiriyor, arsada +1,8.
 * Sebebi olculdu — tarla ici homojen (tum tarla ilanlarinin imari 'Tarla',
 * ilce-ici varyansta R2=0), arsa ici degil: imar_durumu ilce-ici arsa fiyat
 * varyansinin %60,8'ini acikliyor ve "arsa" kategorisi icinde 7-10 kat fark
 * tasiyor (Konut Imarli 7.876 vs Zeytinlik 1.213 TL/m2). Motor bu farki
 * goremiyor cunku alan ilanlarin %92,8'inde bos — mekanizma emsal-havuzu.ts'te
 * (imarUyumu) ZATEN var, veri yok. Ayrinti: data/dogruluk-tavani-olcum.json.
 *
 * Bu yuzden SLO dusurulmuyor. Ona giden yol katsayi ayari ya da kapsam
 * buyutmesi degil: data/faz4-kapsam-negatif-sonuc.json — korpus %57 buyudu,
 * havuzlu mahalle ikiye katlandi, arsa ±%20 1,7 puan artti.
 *
 * Assert EDILMEZ — bugun kirmizi yanan bir kapi CI'yi kalici kirmiziya cevirir.
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
/** Hangi alanın kaç kayıtta dolu olduğu — katkının kaynağını ayırt etmek için. */
const ozellikDagilimi: Record<"arsa" | "tarla", { imar: number; baslik: number; tapu: number }> = {
  arsa: { imar: 0, baslik: 0, tapu: 0 },
  tarla: { imar: 0, baslik: 0, tapu: 0 },
};

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
 * KONTROL kolunun ham tahmin/gerçek çiftleri — kalibrasyon süpürmesi için.
 * Kırılım raporları özet veriyor; kalibrasyon sorusu ("tahminleri sabit bir
 * katsayıyla ölçeklesek ne olurdu") ham çiftler olmadan cevaplanamıyor.
 */
const tumOlcumler: Record<"arsa" | "tarla", KayitOlcum[]> = { arsa: [], tarla: [] };
/** Ham korpus — hedonik prototip kendi train/test bölünmesini kurmak için okuyor. */
let hamKayitlarGlobal: HamKayit[] = [];

/**
 * NAIF TABAN — "sadece mahalle medyani al" tahmincisinin ayni hold-out'taki
 * sonucu.
 *
 * NE ISE YARAR: motorun tum carpan/baseline/shrinkage zincirinin, en basit
 * makul alternatife gore NE KAZANDIRDIGINI soyler. Kazanc yoksa o zincir
 * karmasiklik borcudur.
 *
 * Neden sabit sayi degil de her kosumda hesap: korpus buyudukce taban da
 * degisir. Elle yazilmis bir sayi sessizce eskir ve "ilerledik" iddiasini
 * olcumden kopartir.
 *
 * ADIL KIYAS SARTI — motorun olctugu KAYITLARIN AYNISI kullanilmali.
 * Ilk yazimda taban tum test kayitlarindan hesaplaniyordu (n=7.987) ama motor
 * deterministik bir orneklemle olculuyor (n<=1.200) ve mahallesinde train
 * kaydi olmayanlar taban tarafinda atlaniyordu. Iki farkli kume karsilastirmak
 * "doluluk %100" gibi anlamsiz bir sayi uretti. Simdi ayni filtre zinciri,
 * ayni siralama, ayni kesme uygulaniyor.
 *
 * FALLBACK: mahallesinde train kaydi olmayan test kaydinda ilce, o da yoksa
 * il medyanina dusuluyor — motor da o kayitlari tahmin etmek zorunda oldugu
 * icin tabanin onlari atlamasi haksiz avantaj olurdu.
 */
function naifTabaniOlc(
  hamKayitlar: HamKayit[],
  segment: "arsa" | "tarla",
): OlcumSonucu | null {
  const train: HamKayit[] = [];
  const test: HamKayit[] = [];
  for (const k of hamKayitlar) {
    (hash01(k.ilanNo) < 0.8 ? train : test).push(k);
  }

  const topla = (anahtar: (k: HamKayit) => string): Map<string, number[]> => {
    const m = new Map<string, number[]>();
    for (const k of train) {
      if (k.kategori !== segment || !k.mahalle) continue;
      const a = anahtar(k);
      const liste = m.get(a);
      if (liste) liste.push(k.tlm2);
      else m.set(a, [k.tlm2]);
    }
    return m;
  };
  const mahalleHavuz = topla((k) => `${k.il}__${k.ilce}__${k.mahalle}`);
  const ilceHavuz = topla((k) => `${k.il}__${k.ilce}`);
  const ilHavuz = topla((k) => k.il);

  const medyan = (a: number[]): number => {
    const x = [...a].sort((p, q) => p - q);
    const i = x.length >> 1;
    return x.length % 2 ? x[i]! : (x[i - 1]! + x[i]!) / 2;
  };

  // Motorun kullandigi filtre zincirinin BIREBIR aynisi.
  const segmentTest = test
    .filter((k) => k.kategori === segment && k.mahalle)
    .filter((k) => kanonikAnahtar(k.il, k.ilce, k.mahalle)! in MERKEZ_TUPLES)
    .sort((a, b) => hash01(a.ilanNo) - hash01(b.ilanNo))
    .slice(0, MAX_TEST_PER_SEGMENT);

  const apeler: number[] = [];
  let biasToplam = 0;
  for (const k of segmentTest) {
    const havuz =
      mahalleHavuz.get(`${k.il}__${k.ilce}__${k.mahalle}`) ??
      ilceHavuz.get(`${k.il}__${k.ilce}`) ??
      ilHavuz.get(k.il);
    if (!havuz || havuz.length === 0) continue;
    const tahmin = medyan(havuz);
    apeler.push(Math.abs(tahmin - k.tlm2) / k.tlm2);
    biasToplam += (tahmin - k.tlm2) / k.tlm2;
  }
  return apeler.length > 0 ? olc(apeler, biasToplam) : null;
}

const naifTabanlar: Record<"arsa" | "tarla", OlcumSonucu | null> = { arsa: null, tarla: null };

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
      // Kanonik cozum: kaynak sitenin bitisik yazdigi bilesik adlar
      // ("yenikonacik") MERKEZ_TUPLES'ta bosluklu duruyor. Cozmeden filtreleyince
      // o kayitlar olcumun disinda kaliyordu — korpusun %12,9'u.
      .filter((k) => kanonikAnahtar(k.il, k.ilce, k.mahalle)! in MERKEZ_TUPLES)
      // Deterministik örneklem — hash sırasına göre ilk MAX_TEST_PER_SEGMENT kayıt
      .sort((a, b) => hash01(a.ilanNo) - hash01(b.ilanNo))
      .slice(0, MAX_TEST_PER_SEGMENT);

    if (segmentTest.length < MIN_TEST) continue;
    if (ozellikAc) {
      /**
       * ALAN BAZINDA AYRI SAYILIYOR — eskiden yalnızca `imarDurumu`.
       *
       * Korpus imar taşımadığı için sayaç 17 gösteriyordu; oysa deney kolunda
       * 313 başlıklı test kaydı vardı. "Özellik yok gibi" okunuyordu ve
       * başlığın ZARARI tam da bu sayaç düzeltilince görülebildi. Katkının
       * hangi alandan geldiğini bilmeden A/B farkı yorumlanamaz.
       */
      ozellikliTestAdet[segment] = segmentTest.filter(
        (k) => k.imarDurumu || k.baslik || k.tapuDurumu,
      ).length;
      ozellikDagilimi[segment] = {
        imar: segmentTest.filter((k) => k.imarDurumu).length,
        baslik: segmentTest.filter((k) => k.baslik).length,
        tapu: segmentTest.filter((k) => k.tapuDurumu).length,
      };
    }

    const apeler: number[] = [];
    const kayitOlcumleri: KayitOlcum[] = [];
    let biasToplam = 0;
    for (const k of segmentTest) {
      const [lat, lng] = MERKEZ_TUPLES[kanonikAnahtar(k.il, k.ilce, k.mahalle)!]!;
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

    // Kalibrasyon KONTROL kolundan: eşiğin ve üretimin temsil ettiği davranış bu.
    if (!ozellikAc) tumOlcumler[segment] = kayitOlcumleri;

    // Kırılım yalnızca DENEY kolundan: özellikler açıkken imar ekseni anlamlı.
    if (ozellikAc) {
      enKotular[segment] = [...kayitOlcumleri].sort((a, b) => b.ape - a.ape).slice(0, 10);
      kirilimlar[segment] = {
        emsalYogunlugu: kirilimHesapla(kayitOlcumleri, (k) => yogunlukKovasi(k.emsalAdet)),
        imar: kirilimHesapla(kayitOlcumleri, (k) => (k.imarVar ? "imar biliniyor" : "imar yok")),
        alanBandi: kirilimHesapla(kayitOlcumleri, (k) => alanKovasi(k.m2)),
        fiyatBandi: kirilimHesapla(kayitOlcumleri, (k) => fiyatKovasi(k.tlm2)),
        /**
         * TAHMIN BANDI — fiyatBandi'nin metodolojik esi.
         *
         * fiyatBandi kayitlari GERCEK fiyata gore kovaliyor. Bu eksen tek
         * basina okunursa yaniltir: kusursuz ama gurultulu bir tahminci bile,
         * gercege gore kovalandiginda ucuz kovada pozitif, pahali kovada
         * negatif bias gosterir — kosullama artefakti (ortalamaya regresyon).
         *
         * Gercek model sikismasini ayirt etmenin yolu TAHMINE gore kovalamak.
         * Desen orada da suruyorsa model gercekten ortaya sikistiriyordur;
         * kayboluyorsa fiyatBandi'ndaki desen olcum artefaktiydi.
         */
        tahminBandi: kirilimHesapla(kayitOlcumleri, (k) => fiyatKovasi(k.tahmin)),
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
  hamKayitlarGlobal = hamKayitlar;

  /**
   * SAATİ DONDUR — yoksa ölçüm her gün başka sonuç verir.
   *
   * Motor emsal ağırlığını tazeliğe göre veriyor (emsal-havuzu.ts, 30/60/90/120
   * gün eşikleri) ve enflasyon düzeltmesini `bugün`e göre yapıyor. İkisi de
   * `Date.now()` okuyor. Aynı kodla arka arkaya koşulan iki ölçüm arasında
   * arsa ±%20 24,8 → 25,5 oynaması bu yüzden görüldü: gün dönünce bir grup
   * ilan tazelik eşiğini atladı.
   *
   * Dalgalanma küçük ama zararı büyük: "düzeltme işe yaradı mı" sorusunun
   * cevabı gürültünün içinde kaybolur. Sabit tarih, veri kümesinin EN YENİ
   * kaydından türetiliyor — böylece veri büyüdükçe referans da ilerler, ama
   * takvim tek başına ölçümü değiştiremez.
   */
  const enYeniKayit = hamKayitlar.reduce((m, k) => Math.max(m, k.tarihTs), 0);
  const olcumAni = enYeniKayit > 0 ? enYeniKayit + GUN_MS : Date.UTC(2026, 8, 1);
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(olcumAni);
  console.log(
    `[backtest] ölçüm saati donduruldu: ${new Date(olcumAni).toISOString().slice(0, 10)} ` +
    `(en yeni kayıt + 1 gün) — sonuçlar takvimden bağımsız.`,
  );
  const ozellikliHam = hamKayitlar.filter((k) => k.imarDurumu).length;
  console.log(
    `[backtest] ${hamKayitlar.length} kayıt · imar durumu olan: ${ozellikliHam} ` +
    `(%${((100 * ozellikliHam) / Math.max(1, hamKayitlar.length)).toFixed(1)})`,
  );

  // NAIF TABAN — motordan ONCE, cunku "zincir ne kazandiriyor"un paydasi bu.
  for (const segment of ["arsa", "tarla"] as const) {
    naifTabanlar[segment] = naifTabaniOlc(hamKayitlar, segment);
  }

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
  vi.useRealTimers();
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
        `  ${segment.padEnd(5)} n=${k.n} · özellikli test kaydı=${ozellikliTestAdet[segment]}` +
        ` (imar ${ozellikDagilimi[segment].imar}, başlık ${ozellikDagilimi[segment].baslik}` +
        `, tapu ${ozellikDagilimi[segment].tapu})\n` +
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
  /**
   * KALİBRASYON SÜPÜRMESİ — "bias'ı sıfırlasak ±%20 ne olurdu?"
   *
   * NEDEN BU SORU: arsa bias +19. Tahminler sistematik olarak %19 yüksekse,
   * dağılımın büyük kısmı ±%20 bandının ÜST kenarından taşar — yani ±%20
   * skoru, motorun ayırt etme gücünden bağımsız olarak baskılanır. Mimari
   * değişikliğe girişmeden önce bilinmesi gereken şey: bu kaybın ne kadarı
   * KALİBRASYON (ucuz), ne kadarı AYIRT ETME (pahalı).
   *
   * YÖNTEM: tahminleri sabit bir katsayıyla ölçekleyip metrikleri yeniden
   * hesaplıyoruz. Bu bir "katsayı süpürmesi" DEĞİL — mahalleye/segmente göre
   * değişen bir çarpan aranmıyor, tek bir global ölçek deneniyor ve amacı
   * iyileştirme değil TEŞHİS: eğri düz çıkarsa hata kalibrasyonda değildir.
   *
   * Kaynak bazlı süpürme de var, çünkü fallback katmanlarının bias'ı çok
   * farklı (ölçüldü: ilanGozlem-mahalle +11, ilanGozlem-ilce +22,
   * mahalle-baseline +145). Tek global katsayı bu üçünü aynı anda düzeltemez.
   *
   * ASSERT EDİLMEZ — teşhis çıktısı.
   */
  /**
   * HEDONİK REGRESYON PROTOTİPİ — "elle yazılmış zincir mi, öğrenilmiş katsayı mı?"
   *
   * NEDEN BU DENEY: üç ölçüm arka arkaya aynı yere işaret etti —
   *   1. Kapsam büyütmek tükendi (korpus +%57 → arsa ±%20 +1,7)
   *   2. Kalibrasyon tükendi (en iyi global ölçek +0,1)
   *   3. Özellik eklemek işe yaramadı (başlık geldi, motor kullanamadı;
   *      hatta ELEME olarak kullanıp zarar verdi)
   * Üçü birlikte "veri yetmiyor" demiyor, "motor veriyi katsayıya çeviremiyor"
   * diyor. Bu hipotez ancak katsayıları VERİDEN ÖĞRENEN bir alternatifle
   * sınanabilir.
   *
   * MODEL — kasten en basit hâli, çünkü soru "en iyi model hangisi" değil,
   * "öğrenmek elle yazmaktan iyi mi":
   *   log(TL/m² ÷ bölge medyanı) = a + b·log(m²) + segment katsayıları
   *
   * Bölge medyanı REGRESÖR DEĞİL OFFSET. İlk kurulumda regresör yapılmıştı ve
   * katsayısı 0,833 çıktı — yani model bölge etkisini büzüyor, ucuz mahalleleri
   * yukarı itiyordu (bias +44, motordan çok kötü). Offset kurulumu bölge
   * medyanını olduğu gibi kabul edip yalnızca ondan SAPMAYI öğreniyor; sorulan
   * soru zaten bu.
   * Bölge medyanı: mahalle → ilçe → il, TRAIN'den. Segment: ilan başlığından.
   * OLS, normal denklemler, Gauss eliminasyonu. Bağımlılık yok.
   *
   * SIZINTI KORUMASI: katsayılar YALNIZCA train'e fit ediliyor, bölge
   * medyanları da train'den. Test kaydından yalnızca m² ve segment okunuyor —
   * ikisi de üretimde parselin kendi bilgisi (TKGM alan + nitelik).
   *
   * ASSERT EDİLMEZ — bu bir teşhis. Motoru değiştirmiyor, yanına koyuyor.
   */
  /**
   * KATMAN SEÇİMİ — "mahalle emsaline inmek her zaman iyi mi?"
   *
   * NEDEN: kalibrasyon süpürmesi tarlada ters bir şey gösterdi —
   *   ilanGozlem-ilce    n=481 → ±%20 49,3
   *   ilanGozlem-mahalle n=662 → ±%20 39,4
   * Motor her iki kategoride de mahalleyi tercih ediyor; tarlada bu 10 puan
   * kaybettiriyor gibi görünüyor.
   *
   * AMA O KIYAS GEÇERSİZ: iki satır FARKLI kayıtları ölçüyor. Mahalle
   * katmanına düşenler zaten mahalle emsali olan (daha yoğun, muhtemelen daha
   * kentsel) kayıtlar. Kovaları karşılaştırmak, kovaya düşme sebebini
   * tahminciye mal etmek olur — bu oturumda birkaç kez yaptığımız hata.
   *
   * BU RAPOR AYNI KAYITLARDA ÖLÇÜYOR: mahalle emsali OLAN her test kaydı için
   * hem mahalle train medyanı hem ilçe train medyanı hesaplanıyor, ikisi de
   * aynı kümede puanlanıyor. Emsal adedine göre kırılıyor — çünkü asıl soru
   * "mahalle mi ilçe mi" değil, "KAÇ emsalden sonra mahalle ilçeyi geçiyor".
   * O eşik, shrinkage'ın nereye ayarlanması gerektiğini söyler.
   *
   * ASSERT EDİLMEZ — teşhis.
   */
  it("katman seçimini (mahalle vs ilçe) aynı kayıtlarda raporlar", () => {
    const medyan = (a: number[]): number => {
      const x = [...a].sort((p, q) => p - q);
      const i = x.length >> 1;
      return x.length % 2 ? x[i]! : (x[i - 1]! + x[i]!) / 2;
    };
    const puanla = (ciftler: Array<[number, number]>) => {
      let icinde = 0, apeT = 0, biasT = 0;
      for (const [t, g] of ciftler) {
        const ape = Math.abs(t - g) / g;
        if (ape <= 0.20) icinde++;
        apeT += ape; biasT += (t - g) / g;
      }
      const n = ciftler.length || 1;
      return { n: ciftler.length, within20: (icinde / n) * 100, mape: (apeT / n) * 100, bias: (biasT / n) * 100 };
    };

    const satirlar: string[] = [];
    for (const segment of ["arsa", "tarla"] as const) {
      const train: HamKayit[] = [];
      const test: HamKayit[] = [];
      for (const k of hamKayitlarGlobal) {
        if (k.kategori !== segment || !k.mahalle) continue;
        (hash01(k.ilanNo) < 0.8 ? train : test).push(k);
      }
      const mahHavuz = new Map<string, number[]>();
      const ilceHavuz = new Map<string, number[]>();
      for (const k of train) {
        const mk = `${k.il}__${k.ilce}__${k.mahalle}`;
        const ik = `${k.il}__${k.ilce}`;
        (mahHavuz.get(mk) ?? mahHavuz.set(mk, []).get(mk)!).push(k.tlm2);
        (ilceHavuz.get(ik) ?? ilceHavuz.set(ik, []).get(ik)!).push(k.tlm2);
      }

      const testOrneklem = test
        .filter((k) => kanonikAnahtar(k.il, k.ilce, k.mahalle)! in MERKEZ_TUPLES)
        .sort((a, b) => hash01(a.ilanNo) - hash01(b.ilanNo))
        .slice(0, MAX_TEST_PER_SEGMENT);

      /** Emsal adedi kovası → [mahalle çiftleri, ilçe çiftleri] */
      const kovalar = new Map<string, { mah: Array<[number, number]>; ilce: Array<[number, number]> }>();
      const kovaAdi = (n: number) => (n < 3 ? "1-2" : n < 5 ? "3-4" : n < 10 ? "5-9" : n < 20 ? "10-19" : "20+");
      for (const k of testOrneklem) {
        const mh = mahHavuz.get(`${k.il}__${k.ilce}__${k.mahalle}`);
        const ih = ilceHavuz.get(`${k.il}__${k.ilce}`);
        if (!mh || mh.length === 0 || !ih || ih.length === 0) continue;
        const ad = kovaAdi(mh.length);
        const kova = kovalar.get(ad) ?? { mah: [], ilce: [] };
        kova.mah.push([medyan(mh), k.tlm2]);
        kova.ilce.push([medyan(ih), k.tlm2]);
        kovalar.set(ad, kova);
      }

      const sira = ["1-2", "3-4", "5-9", "10-19", "20+"];
      const govde = sira
        .filter((ad) => kovalar.has(ad))
        .map((ad) => {
          const { mah, ilce } = kovalar.get(ad)!;
          const m = puanla(mah), i = puanla(ilce);
          const kazanan = m.within20 > i.within20 ? "MAHALLE" : "İLÇE";
          return `      emsal ${ad.padEnd(6)} n=${String(m.n).padStart(4)}` +
            ` · mahalle ±%20 ${m.within20.toFixed(1).padStart(5)} (bias ${m.bias.toFixed(1).padStart(6)})` +
            ` · ilçe ±%20 ${i.within20.toFixed(1).padStart(5)} (bias ${i.bias.toFixed(1).padStart(6)})` +
            ` → ${kazanan}`;
        });
      const tumMah = [...kovalar.values()].flatMap((k) => k.mah);
      const tumIlce = [...kovalar.values()].flatMap((k) => k.ilce);
      const tm = puanla(tumMah), ti = puanla(tumIlce);
      satirlar.push(
        `  ${segment} · aynı kayıtlarda: mahalle ±%20 ${tm.within20.toFixed(1)} · ilçe ±%20 ${ti.within20.toFixed(1)}\n` +
        govde.join("\n"),
      );
    }
    console.log("\n── KATMAN SEÇİMİ (aynı kayıtlarda, teşhis) ──\n" + satirlar.join("\n") + "\n");
    expect(satirlar.length).toBeGreaterThan(0);
  });

  it("hedonik regresyon prototipini raporlar", () => {
    /** Ax=b çöz (Gauss, kısmi pivotlama). Tekil matriste null. */
    const cozGauss = (A: number[][], b: number[]): number[] | null => {
      const n = b.length;
      const M = A.map((satir, i) => [...satir, b[i]!]);
      for (let k = 0; k < n; k++) {
        let pivot = k;
        for (let i = k + 1; i < n; i++) {
          if (Math.abs(M[i]![k]!) > Math.abs(M[pivot]![k]!)) pivot = i;
        }
        if (Math.abs(M[pivot]![k]!) < 1e-10) return null;
        [M[k], M[pivot]] = [M[pivot]!, M[k]!];
        for (let i = k + 1; i < n; i++) {
          const f = M[i]![k]! / M[k]![k]!;
          for (let j = k; j <= n; j++) M[i]![j]! -= f * M[k]![j]!;
        }
      }
      const x = new Array<number>(n).fill(0);
      for (let i = n - 1; i >= 0; i--) {
        let t = M[i]![n]!;
        for (let j = i + 1; j < n; j++) t -= M[i]![j]! * x[j]!;
        x[i] = t / M[i]![i]!;
      }
      return x;
    };

    const SEGMENTLER = ["tarla", "bahce", "bag", "zeytinlik"] as const;
    const segmentiBul = (metin: string): string => {
      const t = metin.toLocaleLowerCase("tr");
      if (/zeytin/.test(t)) return "zeytinlik";
      if (/bahçe|bahce/.test(t)) return "bahce";
      if (/bağ|bag/.test(t)) return "bag";
      if (/tarla/.test(t)) return "tarla";
      return "arsa"; // referans kategori
    };

    const satirlar: string[] = [];
    for (const segment of ["arsa", "tarla"] as const) {
      const train: HamKayit[] = [];
      const test: HamKayit[] = [];
      for (const k of hamKayitlarGlobal) {
        if (k.kategori !== segment || !k.mahalle) continue;
        (hash01(k.ilanNo) < 0.8 ? train : test).push(k);
      }
      const medyan = (a: number[]): number => {
        const x = [...a].sort((p, q) => p - q);
        const i = x.length >> 1;
        return x.length % 2 ? x[i]! : (x[i - 1]! + x[i]!) / 2;
      };
      const havuzKur = (anahtar: (k: HamKayit) => string) => {
        const m = new Map<string, number[]>();
        for (const k of train) {
          const a = anahtar(k);
          const l = m.get(a);
          if (l) l.push(k.tlm2); else m.set(a, [k.tlm2]);
        }
        return new Map([...m].map(([a, v]) => [a, medyan(v)]));
      };
      const mahH = havuzKur((k) => `${k.il}__${k.ilce}__${k.mahalle}`);
      const ilceH = havuzKur((k) => `${k.il}__${k.ilce}`);
      const ilH = havuzKur((k) => k.il);
      const bolgeMedyani = (k: HamKayit): number | null =>
        mahH.get(`${k.il}__${k.ilce}__${k.mahalle}`) ??
        ilceH.get(`${k.il}__${k.ilce}`) ?? ilH.get(k.il) ?? null;

      /** Tasarım satırı: [1, log(bölge), log(m2), ...segment dummy] */
      const satirKur = (k: HamKayit): number[] | null => {
        const bolge = bolgeMedyani(k);
        if (!bolge || bolge <= 0 || !(k.m2 > 0)) return null;
        const seg = segmentiBul(`${k.baslik ?? ""} ${k.imarDurumu ?? ""}`);
        return [1, Math.log(k.m2), ...SEGMENTLER.map((x) => (seg === x ? 1 : 0))];
      };

      const X: number[][] = [];
      const y: number[] = [];
      for (const k of train) {
        const satir = satirKur(k);
        if (satir) { X.push(satir); y.push(Math.log(k.tlm2) - Math.log(bolgeMedyani(k)!)); }
      }
      if (X.length < 100) continue;

      const p = X[0]!.length;
      const XtX = Array.from({ length: p }, () => new Array<number>(p).fill(0));
      const Xty = new Array<number>(p).fill(0);
      for (let r = 0; r < X.length; r++) {
        const xr = X[r]!;
        for (let i = 0; i < p; i++) {
          Xty[i]! += xr[i]! * y[r]!;
          for (let j = 0; j < p; j++) XtX[i]![j]! += xr[i]! * xr[j]!;
        }
      }
      // Ridge: küçük köşegen ekleme — segment dummy'leri seyrek olabiliyor.
      for (let i = 0; i < p; i++) XtX[i]![i]! += 1e-6;
      const beta = cozGauss(XtX, Xty);
      if (!beta) continue;

      // Motorun ölçtüğü ÖRNEKLEMİN AYNISI — adil kıyas şartı.
      const testOrneklem = test
        .filter((k) => kanonikAnahtar(k.il, k.ilce, k.mahalle)! in MERKEZ_TUPLES)
        .sort((a, b) => hash01(a.ilanNo) - hash01(b.ilanNo))
        .slice(0, MAX_TEST_PER_SEGMENT);

      let icinde = 0, apeT = 0, biasT = 0, n = 0;
      for (const k of testOrneklem) {
        const satir = satirKur(k);
        if (!satir) continue;
        let lp = 0;
        for (let i = 0; i < p; i++) lp += beta[i]! * satir[i]!;
        const tahmin = Math.exp(lp) * bolgeMedyani(k)!;
        if (!(tahmin > 0) || !Number.isFinite(tahmin)) continue;
        const ape = Math.abs(tahmin - k.tlm2) / k.tlm2;
        if (ape <= 0.20) icinde++;
        apeT += ape; biasT += (tahmin - k.tlm2) / k.tlm2; n++;
      }
      if (n === 0) continue;
      const motor = sonuclar[segment];
      satirlar.push(
        `  ${segment} n=${n}
` +
        `    hedonik  ±%20 ${((icinde / n) * 100).toFixed(1)} · MAPE ${((apeT / n) * 100).toFixed(1)}` +
        ` · bias ${((biasT / n) * 100).toFixed(2)}
` +
        `    motor    ±%20 ${motor?.within20.toFixed(1) ?? "?"} · MAPE ${motor?.mape.toFixed(1) ?? "?"}` +
        ` · bias ${motor?.bias.toFixed(2) ?? "?"}
` +
        `    katsayı: log(m²) ${beta[1]!.toFixed(3)} · ` +
        SEGMENTLER.map((sg, i) => `${sg} ${Math.exp(beta[2 + i]!).toFixed(3)}×`).join(" · "),
      );
    }
    console.log("\n── HEDONİK REGRESYON PROTOTİPİ (teşhis) ──\n" + satirlar.join("\n") + "\n");
    expect(satirlar.length).toBeGreaterThan(0);
  });

  it("kalibrasyon süpürmesini raporlar", () => {
    const olcuOlcekli = (kayitlar: KayitOlcum[], olcek: number) => {
      let icinde = 0, biasT = 0, apeT = 0;
      for (const k of kayitlar) {
        const t = k.tahmin * olcek;
        const ape = Math.abs(t - k.tlm2) / k.tlm2;
        if (ape <= 0.20) icinde++;
        apeT += ape;
        biasT += (t - k.tlm2) / k.tlm2;
      }
      const n = kayitlar.length || 1;
      return {
        within20: (icinde / n) * 100,
        mape: (apeT / n) * 100,
        bias: (biasT / n) * 100,
      };
    };

    const satirlar: string[] = [];
    for (const segment of ["arsa", "tarla"] as const) {
      const kayitlar = tumOlcumler[segment];
      if (!kayitlar || kayitlar.length === 0) continue;

      // GLOBAL süpürme
      let enIyi = { olcek: 1, within20: -1, mape: 0, bias: 0 };
      const izler: string[] = [];
      for (let o = 0.50; o <= 1.21; o += 0.05) {
        const r = olcuOlcekli(kayitlar, o);
        izler.push(`${o.toFixed(2)}→${r.within20.toFixed(1)}`);
        if (r.within20 > enIyi.within20) enIyi = { olcek: o, ...r };
      }
      const taban = olcuOlcekli(kayitlar, 1);
      satirlar.push(
        `  ${segment} · şu an ±%20 ${taban.within20.toFixed(1)} · bias ${taban.bias.toFixed(2)}
` +
        `    global en iyi ölçek ${enIyi.olcek.toFixed(2)} → ±%20 ${enIyi.within20.toFixed(1)}` +
        ` (${(enIyi.within20 - taban.within20 >= 0 ? "+" : "")}${(enIyi.within20 - taban.within20).toFixed(1)})` +
        ` · MAPE ${enIyi.mape.toFixed(1)} · bias ${enIyi.bias.toFixed(2)}
` +
        `    eğri: ${izler.join(" ")}`,
      );

      // KAYNAK BAZLI süpürme — her fallback katmanı kendi ölçeğiyle
      const kaynaklar = new Map<string, KayitOlcum[]>();
      for (const k of kayitlar) {
        const liste = kaynaklar.get(k.baselineKaynak);
        if (liste) liste.push(k); else kaynaklar.set(k.baselineKaynak, [k]);
      }
      let toplamIcinde = 0;
      const kaynakSatir: string[] = [];
      for (const [kaynak, grup] of [...kaynaklar].sort((a, b) => b[1].length - a[1].length)) {
        let en = { olcek: 1, within20: -1 };
        for (let o = 0.30; o <= 1.51; o += 0.05) {
          const r = olcuOlcekli(grup, o);
          if (r.within20 > en.within20) en = { olcek: o, within20: r.within20 };
        }
        const t = olcuOlcekli(grup, 1);
        toplamIcinde += (en.within20 / 100) * grup.length;
        kaynakSatir.push(
          `      ${kaynak.padEnd(20)} n=${String(grup.length).padStart(4)}` +
          ` bias ${t.bias.toFixed(1).padStart(7)} · ölçek ${en.olcek.toFixed(2)}` +
          ` → ±%20 ${t.within20.toFixed(1)} → ${en.within20.toFixed(1)}`,
        );
      }
      satirlar.push(
        `    kaynak bazlı kalibrasyon → ±%20 ${((toplamIcinde / kayitlar.length) * 100).toFixed(1)}\n` +
        kaynakSatir.join("\n"),
      );
    }
    console.log("\n── KALİBRASYON SÜPÜRMESİ (teşhis) ──\n" + satirlar.join("\n") + "\n");
    expect(satirlar.length).toBeGreaterThan(0);
  });

  it("SLO mesafesini raporlar", () => {
    const satirlar: string[] = [];
    for (const segment of ["arsa", "tarla"] as const) {
      const s = sonuclar[segment];
      if (!s) continue;
      const w = SLO.within20_min - s.within20;
      const b = Math.abs(s.bias) - SLO.bias_mutlak_max;
      const t = naifTabanlar[segment];
      /**
       * ZİNCİRİN KATKISI — asıl ilerleme göstergesi.
       *
       * "Hedeften 22,9 puan uzağız" tek başına bir şey söylemiyor. Motorun
       * tüm çarpan/baseline/shrinkage zinciri, "sadece mahalle medyanını al"
       * demeye göre ne kazandırıyor? Kazanç küçülüyorsa zincire yatırım
       * yapmanın getirisi bitmiş, parsel düzeyinde özelliğe geçmenin vakti
       * gelmiş demektir.
       */
      const tabanSatiri = t
        ? `\n        naif taban ±%20 ${t.within20.toFixed(1)} (mahalle medyanı, n=${t.n})` +
          `  → zincirin katkısı ${s.within20 - t.within20 >= 0 ? "+" : ""}` +
          `${(s.within20 - t.within20).toFixed(1)} puan` +
          (s.within20 <= t.within20 ? "  ⚠ ZİNCİR KAZANDIRMIYOR" : "")
        : "";
      satirlar.push(
        `  ${segment.padEnd(5)} ±%20 ${s.within20.toFixed(1)} / hedef ${SLO.within20_min}` +
        `  → ${w <= 0 ? "KARŞILANDI" : `${w.toFixed(1)} puan eksik`}\n` +
        `        |bias| ${Math.abs(s.bias).toFixed(2)} / hedef ≤${SLO.bias_mutlak_max}` +
        `  → ${b <= 0 ? "KARŞILANDI" : `${b.toFixed(2)} puan fazla`}` +
        tabanSatiri,
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
