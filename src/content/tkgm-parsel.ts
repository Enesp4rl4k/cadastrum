/**
 * TKGM Parsel Sorgu — Tapu Kısıt Content Script
 *
 * parselsorgu.tkgm.gov.tr sayfasında çalışır.
 * Kullanıcı parsel detayını görüntülediğinde DOM'dan şerh, beyan,
 * ipotek, haciz ve takyidat bilgilerini parse edip chrome.storage.local'a yazar.
 *
 * Side panel bu veriyi okuyarak risk uyarısı üretir.
 *
 * TKGM'nin parsel detay sayfası SPA benzeri — URL hash değişimiyle
 * yeniden render oluyor. MutationObserver ile her render'da yeniden parse ederiz.
 */

export const TKGM_KISIT_STORAGE_KEY = "tkgmKisitSonuc";

export interface TkgmKisitVerisi {
  /** parsel kimliği — mahalle:ada:parsel */
  parselKey: string;
  /** Şerh listesi */
  serhler: KisitKaydi[];
  /** Beyan listesi */
  beyanlar: KisitKaydi[];
  /** İpotek listesi */
  ipotekler: KisitKaydi[];
  /** Haciz listesi */
  hacizler: KisitKaydi[];
  /** Diğer takyidatlar */
  digerTakyidatlar: KisitKaydi[];
  /** Herhangi bir kısıt var mı (özet) */
  kisitVar: boolean;
  /** Kritik kısıt var mı (haciz veya kritik şerh) */
  kritikKisitVar: boolean;
  /** Yakalanma zamanı */
  yakalandiAt: number;
  /** Kaynak URL */
  kaynakUrl: string;
}

export interface KisitKaydi {
  tip: "serh" | "beyan" | "ipotek" | "haciz" | "diger";
  aciklama: string;
  tarih?: string | null;
  alacakli?: string | null;
  miktar?: string | null;
}

// Kritik şerh anahtar kelimeleri — bu şerhler "kritik" olarak işaretlenir
const KRITIK_SERH_ANAHTARLAR = [
  "kamulaştırma", "kamusaltirma",
  "haciz", "tedbir",
  "orman", "2b",
  "iflas", "konkordato",
  "sit alanı", "sit alani",
  "kıyı kenar", "kiyi kenar",
  "askeri", "yasak bölge",
];

function metinTemizle(el: Element | null): string {
  return el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function kritikMi(aciklama: string): boolean {
  const lower = aciklama.toLocaleLowerCase("tr");
  return KRITIK_SERH_ANAHTARLAR.some((k) => lower.includes(k));
}

/**
 * Parsel kimliğini URL hash'inden çıkar.
 * parselsorgu.tkgm.gov.tr/#ara/123456/789/10 → "123456:789:10"
 */
function parselKeyFromHash(): string {
  const hash = window.location.hash;
  const m = hash.match(/#ara\/(\d+)\/(\d+)\/(\d+)/);
  if (m) return `${m[1]}:${m[2]}:${m[3]}`;
  return hash.replace(/^#/, "").replace(/\//g, ":") || "bilinmiyor";
}

/**
 * Bir tablo bölümünden kısıt kayıtlarını parse eder.
 * TKGM sayfası genellikle:
 *   <table> <tr><th>Açıklama</th><th>Tarih</th>... </tr> <tr><td>...</td>... </tr> </table>
 */
function tabloKisitlariParse(
  basliklar: string[],
  tip: KisitKaydi["tip"],
): KisitKaydi[] {
  const lower = basliklar.map((b) => b.toLocaleLowerCase("tr"));
  const sonuclar: KisitKaydi[] = [];

  // Tüm tabloları tara — başlık satırı eşleşen tabloyu bul
  const tablolar = Array.from(document.querySelectorAll("table, .table, [class*='table']"));

  for (const tablo of tablolar) {
    const thler = Array.from(tablo.querySelectorAll("th, thead td"));
    if (thler.length === 0) continue;

    const thMetinler = thler.map((th) => metinTemizle(th).toLocaleLowerCase("tr"));
    const eslesen = lower.some((b) =>
      thMetinler.some((th) => th.includes(b))
    );
    if (!eslesen) continue;

    // Başlık indekslerini bul
    const aciklamaIdx = thMetinler.findIndex((t) =>
      t.includes("açıklama") || t.includes("aciklama") || t.includes("şerh") || t.includes("beyan")
    );
    const tarihIdx = thMetinler.findIndex((t) => t.includes("tarih"));
    const alacakliIdx = thMetinler.findIndex((t) =>
      t.includes("alacaklı") || t.includes("alacakli") || t.includes("taraf")
    );
    const miktarIdx = thMetinler.findIndex((t) =>
      t.includes("miktar") || t.includes("tutar") || t.includes("bedel")
    );

    const satirlar = Array.from(tablo.querySelectorAll("tbody tr, tr:not(:first-child)"));
    for (const satir of satirlar) {
      const tdler = Array.from(satir.querySelectorAll("td"));
      if (tdler.length === 0) continue;

      const aciklama = aciklamaIdx >= 0
        ? metinTemizle(tdler[aciklamaIdx] ?? null)
        : metinTemizle(tdler[0] ?? null);

      if (!aciklama || aciklama === "—" || aciklama === "-") continue;

      sonuclar.push({
        tip,
        aciklama,
        tarih: tarihIdx >= 0 ? metinTemizle(tdler[tarihIdx] ?? null) || null : null,
        alacakli: alacakliIdx >= 0 ? metinTemizle(tdler[alacakliIdx] ?? null) || null : null,
        miktar: miktarIdx >= 0 ? metinTemizle(tdler[miktarIdx] ?? null) || null : null,
      });
    }

    if (sonuclar.length > 0) break; // İlk eşleşen tablodan al
  }

  return sonuclar;
}

/**
 * Başlık arama ile sekme/bölüm bazlı parse — bazı TKGM sayfaları tab yapısı kullanıyor
 */
function bolumKisitlariParse(
  bolumAnahtar: string,
  tip: KisitKaydi["tip"],
): KisitKaydi[] {
  const tumMetin = document.body.innerText;
  if (!tumMetin.toLocaleLowerCase("tr").includes(bolumAnahtar.toLocaleLowerCase("tr"))) {
    return [];
  }

  // Alternatif — div/section içindeki metin listelerini tara
  const kisitElemanlari = Array.from(
    document.querySelectorAll("[class*='kisit'], [class*='takyidat'], [class*='serh'], [class*='haciz'], [class*='ipotek'], [class*='beyan']")
  );

  const sonuclar: KisitKaydi[] = [];
  for (const el of kisitElemanlari) {
    const metin = metinTemizle(el);
    if (!metin || metin.length < 5) continue;
    sonuclar.push({ tip, aciklama: metin });
  }
  return sonuclar;
}

function parseTkgmKisitlar(): TkgmKisitVerisi | null {
  // Parsel detay sayfasında mıyız? URL veya sayfa içeriği ile kontrol et
  const sayfaMetni = document.body.innerText.toLocaleLowerCase("tr");
  const kisitliGorunum =
    sayfaMetni.includes("takyidat") ||
    sayfaMetni.includes("şerh") ||
    sayfaMetni.includes("beyan") ||
    sayfaMetni.includes("haciz") ||
    sayfaMetni.includes("ipotek") ||
    sayfaMetni.includes("parsel bilgileri") ||
    sayfaMetni.includes("parsel detay");

  if (!kisitliGorunum) return null;

  // Farklı parse stratejilerini dene
  const serhler: KisitKaydi[] = [
    ...tabloKisitlariParse(["şerh", "serh"], "serh"),
    ...bolumKisitlariParse("şerh", "serh"),
  ].filter((v, i, arr) => arr.findIndex((x) => x.aciklama === v.aciklama) === i);

  const beyanlar: KisitKaydi[] = [
    ...tabloKisitlariParse(["beyan"], "beyan"),
    ...bolumKisitlariParse("beyan", "beyan"),
  ].filter((v, i, arr) => arr.findIndex((x) => x.aciklama === v.aciklama) === i);

  const ipotekler: KisitKaydi[] = [
    ...tabloKisitlariParse(["ipotek", "alacaklı"], "ipotek"),
    ...bolumKisitlariParse("ipotek", "ipotek"),
  ].filter((v, i, arr) => arr.findIndex((x) => x.aciklama === v.aciklama) === i);

  const hacizler: KisitKaydi[] = [
    ...tabloKisitlariParse(["haciz", "tedbir"], "haciz"),
    ...bolumKisitlariParse("haciz", "haciz"),
  ].filter((v, i, arr) => arr.findIndex((x) => x.aciklama === v.aciklama) === i);

  const digerTakyidatlar: KisitKaydi[] = [
    ...tabloKisitlariParse(["takyidat", "diğer", "kısıtlama"], "diger"),
  ].filter((v, i, arr) => arr.findIndex((x) => x.aciklama === v.aciklama) === i);

  const tumKisitlar = [...serhler, ...beyanlar, ...ipotekler, ...hacizler, ...digerTakyidatlar];
  const kisitVar = tumKisitlar.length > 0;
  const kritikKisitVar =
    hacizler.length > 0 ||
    serhler.some((s) => kritikMi(s.aciklama)) ||
    beyanlar.some((b) => kritikMi(b.aciklama));

  // Herhangi bir anlamlı veri yoksa null dön — boş sayfa parse'ı önle
  if (!kisitVar && !sayfaMetni.includes("parsel bilgileri") && !sayfaMetni.includes("ada no")) {
    return null;
  }

  return {
    parselKey: parselKeyFromHash(),
    serhler,
    beyanlar,
    ipotekler,
    hacizler,
    digerTakyidatlar,
    kisitVar,
    kritikKisitVar,
    yakalandiAt: Date.now(),
    kaynakUrl: window.location.href,
  };
}

let sonHash = "";

async function yakalaVeKaydet() {
  const veri = parseTkgmKisitlar();
  if (!veri) return;

  const hash = JSON.stringify({
    parselKey: veri.parselKey,
    kisitVar: veri.kisitVar,
    kritik: veri.kritikKisitVar,
    sayilar: [
      veri.serhler.length,
      veri.beyanlar.length,
      veri.ipotekler.length,
      veri.hacizler.length,
    ],
  });

  if (hash === sonHash) return;
  sonHash = hash;

  await chrome.storage.local.set({ [TKGM_KISIT_STORAGE_KEY]: veri });
  console.log("[arsa:tkgm-parsel] tapu kısıt verisi yakalandı", {
    parselKey: veri.parselKey,
    kisitVar: veri.kisitVar,
    kritikKisitVar: veri.kritikKisitVar,
    serhSayisi: veri.serhler.length,
    beyanSayisi: veri.beyanlar.length,
    ipotekSayisi: veri.ipotekler.length,
    hacizSayisi: veri.hacizler.length,
  });
}

// Debounce — DOM güncellemeleri batch'lenir
const debounced = (() => {
  let timer: number | null = null;
  return () => {
    if (timer != null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void yakalaVeKaydet();
    }, 800); // eplan.ts'ten biraz daha uzun — TKGM SPA daha yavaş render
  };
})();

// İlk yükleme
debounced();

// Hash değişimi — SPA navigasyonu
window.addEventListener("hashchange", () => {
  sonHash = ""; // parsel değişti, sıfırla
  debounced();
});

// DOM mutasyon izleme — dinamik içerik yüklemesi için
new MutationObserver(() => debounced()).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
