/**
 * Fiyat verisini ÖNCE statik dosyadan, yoksa canlı API'den getirir.
 *
 * ── NEDEN (2026-09-13) ──────────────────────────────────────────────────────
 *
 * Veri sayfaları her ziyarette tarayıcıdan API'ye gidiyordu: ziyaretçi başına
 * bir Worker isteği + D1 okuması. Ücretsiz katman Worker 100k istek/gün, D1
 * 5M okuma/gün — trafik artınca site düşer. Build sırasında
 * (scripts/statik-veri-indir.mjs) her ilin tüm fiyat yanıtları
 * /veri-statik/v1/ altına yazılıyor; Pages statik dosyaları sınırsız sunuyor.
 *
 * ── KARAR KURALI ────────────────────────────────────────────────────────────
 *
 *  1. manifest.json yok ya da il manifestte yok → canlı API (eski davranış).
 *     Yerel geliştirme, CI ve paketi başarısız olan iller böyle çalışır.
 *  2. İl manifestte VAR → cevap statik dosyadan. İlçe/mahalle anahtarı
 *     dosyada yoksa bu KESİN 404: API'ye GİTMEZ. Aksi hâlde verisi olmayan
 *     her sayfa ziyareti yine D1'e giderdi — trafiğin büyük kısmı tam da o.
 *  3. Statik dosya ağ hatası verirse → canlı API (bozuk dağıtım siteyi
 *     düşürmesin).
 *
 * Statik yanıtlar backend'de canlı rotalarla AYNI fonksiyonlarla üretiliyor;
 * birebir eşitlik backend/api/test/statik-esdegerlik.spec.ts'de ölçülüyor.
 */

export const STATIK_KOK = "/veri-statik/v1";
const STATIK_KATEGORILER = new Set(["arsa", "tarla"]);

/**
 * Backend'deki `normalizeYerAdi` ile BİREBİR aynı (backend/api/src/lib/normalize.ts).
 * Canlı rota her parametreyi bundan geçiriyor; statik anahtar da aynı olmalı.
 * Ayrışırsa site/test/statik-veri.spec.ts kırılır.
 */
export function normalizeYerAdi(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" })[c] ?? c)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(mahallesi|mahalle|koyu|koy|beldesi|belde|mah|mh)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize ad → dosya adı. Normalize çıktıda tire olmadığı için geri çevrilebilir. */
export const dosyaAdi = (norm: string) => norm.replace(/ /g, "-");

export type FiyatIstegi =
  | { tur: "il"; kategori: string; il: string }
  | { tur: "ilce"; kategori: string; il: string; ilce: string }
  | { tur: "mahalle"; kategori: string; il: string; ilce: string; mahalle: string }
  | { tur: "trend"; kategori: string; il: string; ilce: string; mahalle: string }
  | { tur: "harita-ilce"; kategori: string; il: string };

/** API adresini çözer. Tanınmayan ya da statik karşılığı olmayan istek → null. */
export function fiyatIstegiCoz(apiUrl: string): FiyatIstegi | null {
  let u: URL;
  try {
    u = new URL(apiUrl, "https://x.invalid");
  } catch {
    return null;
  }
  const i = u.pathname.indexOf("/fiyat/");
  if (i < 0) return null;
  const hamParca = u.pathname.slice(i + "/fiyat/".length).split("/").filter(Boolean);
  // Uç adı (ilk parça) HAM kalır: normalizeYerAdi "mahalle" kelimesini siliyor
  // ("mahalle" → ""), "toplu-ilce-ozet"i de boşluklu yapıyor. Yalnızca yer adları
  // canlı rotadaki gibi normalize ediliyor.
  const tur = hamParca[0];
  const parca = [tur, ...hamParca.slice(1).map((p) => {
    try {
      return normalizeYerAdi(decodeURIComponent(p));
    } catch {
      // beklenen yokluk: bozuk %-kodlaması — canlı rota da bu adı çözemez;
      // boş ad aşağıda "statik karşılık yok" sayılıp API'ye bırakılıyor.
      return "";
    }
  })];
  const kategori = u.searchParams.get("kategori") ?? "arsa";
  if (!STATIK_KATEGORILER.has(kategori)) return null;
  const [, a, b, c] = parca;
  // Boş parça canlı rotada da boş ada normalize olur — o istekler statikte yok.
  const dolu = (...x: Array<string | undefined>) => x.every((v) => !!v);

  if (tur === "il" && parca.length === 2 && dolu(a)) return { tur: "il", kategori, il: a! };
  if (tur === "ilce" && parca.length === 3 && dolu(a, b)) return { tur: "ilce", kategori, il: a!, ilce: b! };
  if (tur === "mahalle" && parca.length === 4 && dolu(a, b, c)) return { tur: "mahalle", kategori, il: a!, ilce: b!, mahalle: c! };
  if (tur === "trend" && parca.length === 4 && dolu(a, b, c)) return { tur: "trend", kategori, il: a!, ilce: b!, mahalle: c! };
  if (tur === "toplu-ilce-ozet" && parca.length === 2 && dolu(a)) return { tur: "harita-ilce", kategori, il: a! };
  return null;
}

interface Manifest {
  surum: number;
  uretildi: number;
  iller: Record<string, string[]>;
}

type Getirici = (url: string) => Promise<Response>;

/** Test için değiştirilebilir; tarayıcıda global fetch. */
let getir: Getirici = (url) => fetch(url);
let manifestSozu: Promise<Manifest | null> | null = null;
const dosyaOnbellek = new Map<string, Promise<unknown | undefined>>();

export function _testIcinSifirla(yeniGetirici?: Getirici) {
  getir = yeniGetirici ?? ((url) => fetch(url));
  manifestSozu = null;
  dosyaOnbellek.clear();
}

function manifestGetir(): Promise<Manifest | null> {
  manifestSozu ??= getir(`${STATIK_KOK}/manifest.json`)
    .then(async (r) => (r.ok ? ((await r.json()) as Manifest) : null))
    .catch((e: unknown) => {
      // Görünür: manifest yoksa site canlı API'ye düşüyor; bu bir hata değil
      // ama neden API'ye gidildiği konsolda anlaşılabilsin.
      console.info("[statik-veri] manifest alınamadı, canlı API kullanılıyor:", e);
      return null;
    });
  return manifestSozu;
}

/**
 * Statik dosyayı getirir.
 *   undefined → dosya YOK (404) — il manifestteyse kesin yokluk
 *   throw     → ağ/bozuk dosya — çağıran API'ye düşer
 */
function dosyaGetir(yol: string): Promise<unknown | undefined> {
  let s = dosyaOnbellek.get(yol);
  if (!s) {
    s = getir(`${STATIK_KOK}/${yol}`).then(async (r) => {
      if (r.status === 404) return undefined;
      if (!r.ok) throw new Error(`statik ${yol}: HTTP ${r.status}`);
      return r.json();
    });
    // Başarısız söz önbellekte kalmasın — sonraki deneme API'ye değil yeniden dosyaya.
    s.catch(() => dosyaOnbellek.delete(yol));
    dosyaOnbellek.set(yol, s);
  }
  return s;
}

const VERI_YOK = { durum: 404, govde: { error: "Veri bulunamadı" } };
const TREND_YOK = { durum: 404, govde: { error: "Trend verisi yok" } };

/** Statik cevap; null → statik karşılık yok, API'ye düş. */
export async function statikCevap(istek: FiyatIstegi): Promise<{ durum: number; govde: unknown } | null> {
  const m = await manifestGetir();
  if (!m || !m.iller[istek.kategori]?.includes(istek.il)) return null;
  const kok = `${istek.kategori}`;

  switch (istek.tur) {
    case "il": {
      const d = (await dosyaGetir(`${kok}/il/${dosyaAdi(istek.il)}.json`)) as { durum: number; govde: unknown } | undefined;
      return d ?? VERI_YOK;
    }
    case "ilce": {
      const d = (await dosyaGetir(`${kok}/ilce/${dosyaAdi(istek.il)}.json`)) as Record<string, unknown> | undefined;
      const g = d?.[istek.ilce];
      return g ? { durum: 200, govde: g } : VERI_YOK;
    }
    case "harita-ilce": {
      const d = await dosyaGetir(`${kok}/harita-ilce/${dosyaAdi(istek.il)}.json`);
      return d ? { durum: 200, govde: d } : VERI_YOK;
    }
    case "mahalle":
    case "trend": {
      const d = (await dosyaGetir(`${kok}/mahalle/${dosyaAdi(istek.il)}/${dosyaAdi(istek.ilce)}.json`)) as
        | { mahalleler: Record<string, unknown>; trend: { mahalle: Record<string, unknown>; varsayilan: unknown } | null }
        | undefined;
      if (istek.tur === "mahalle") {
        const g = d?.mahalleler[istek.mahalle];
        return g ? { durum: 200, govde: g } : VERI_YOK;
      }
      const t = d?.trend ? (d.trend.mahalle[istek.mahalle] ?? d.trend.varsayilan) : null;
      return t ? { durum: 200, govde: t } : TREND_YOK;
    }
  }
}

/**
 * `fetch(apiUrl)` yerine geçer: aynı Response arayüzü (ok, status, json()).
 * Yanıtın nereden geldiği `X-Veri-Kaynagi` başlığında: statik | api.
 */
export async function veriFetch(apiUrl: string, init?: RequestInit): Promise<Response> {
  const istek = fiyatIstegiCoz(apiUrl);
  if (istek) {
    try {
      const c = await statikCevap(istek);
      if (c) {
        return new Response(JSON.stringify(c.govde), {
          status: c.durum,
          headers: { "Content-Type": "application/json", "X-Veri-Kaynagi": "statik" },
        });
      }
    } catch (e) {
      // Görünür fallback: bozuk/ulaşılamayan statik dosya siteyi düşürmesin.
      console.warn("[statik-veri] statik dosya okunamadı, canlı API'ye düşülüyor:", e);
    }
  }
  return fetch(apiUrl, init);
}
