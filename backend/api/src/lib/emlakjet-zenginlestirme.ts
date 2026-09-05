/**
 * Emlakjet İlan Zenginleştirme — detay sayfasından özellik derinliği çeker.
 *
 * NEDEN: Hold-out backtest, fiyat tahminindeki kalan hatanın veri HACMİNDEN
 * değil ÖZELLİK DERİNLİĞİNDEN kaynaklandığını gösterdi. Aynı mahalle içinde
 * fiyat dağılımı ±%90 ve bunun sadece %39.5'ini m² açıklıyor; kalan %60.5
 * imar durumu / tapu durumu / parselin mahalle içindeki tam konumu gibi
 * elimizde olmayan özelliklerden geliyor. Mahalle kapsamını artırmak bu
 * tavanı yükseltmiyor — "mükemmel mahalle medyanı" bile ±%20 içinde ancak
 * %27 tutturuyor. Bu modül o tavanı yükseltmek için var.
 *
 * Liste sayfası JSON-LD'si imar/koordinat vermiyor (sadece İlan Tipi, Konum,
 * Metrekare, İlan Etiketi). Detay sayfası ise üçünü de yapısal olarak veriyor:
 *   JSON-LD PropertyValue "İmar Durumu" → imar_durumu
 *   Gömülü JSON geometry.coordinates    → GERÇEK parsel poligonu (centroid'i alınır)
 *   HTML "Tapu Durumu" bloğu            → tapu_durumu (Hisseli/Müstakil)
 *
 * Bu, mevcut lat/lng'den niteliksel olarak farklı: şu ana kadar dolu olan
 * koordinatların tamamı MAHALLE MERKEZİ'ydi (koord_kaynagi='mahalle-merkez'),
 * yani bir mahalledeki tüm ilanlar aynı noktadaydı ve spatial emsal motoru
 * fiilen atıldı. Parsel poligonundan gelen koordinat gerçek konumdur.
 *
 * Hız/nezaket: her ilan için 1 istek gerekiyor (liste sayfası 30 ilanı tek
 * istekte veriyordu). Bu yüzden ana scraper'a eklenmedi — ayrı, küçük
 * partiler hâlinde çalışan kademeli bir backfill kuyruğu olarak tasarlandı.
 * robots.txt: /ilan/* yasak değil (yasaklılar /listings/*, /get_detail/*).
 */

import type { D1Database } from "@cloudflare/workers-types";

const EMLAKJET_BASE = "https://www.emlakjet.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";

/** İstekler arası bekleme — kaynağa yük bindirmemek için. */
const ISTEK_ARASI_MS = 350;

export interface DetayZenginlik {
  imarDurumu: string | null;
  tapuDurumu: string | null;
  baslik: string | null;
  lat: number | null;
  lng: number | null;
}

/** HTML varlıklarını çöz — başlıklarda &#x27; (kesme işareti) yaygın. */
function htmlCoz(s: string): string {
  return s
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * İlan başlığını çıkarır.
 *
 * NEDEN ÖNEMLİ: `baslik` üretimde 34.246 satırda boştu. Veri rafinerisinin
 * NLP'si (hisseli tapu / kooperatif / hobi bahçesi tespiti) ve `segmentBul()`
 * bu metne bakıyor — ikisi de sinyalsiz çalışıyordu.
 *
 * <h1> SATICININ KENDİ BAŞLIĞI ("Değirmenköy'de 220 M² Yatırım Fırsatı"),
 * <title> ise SEO için üretilmiş kalıp metin (ofis adı + konum + fiyat).
 * Rafinerinin aradığı sinyaller satıcının kendi ifadesinde olduğu için <h1>
 * tercih ediliyor; og:title yedek.
 *
 * Ek istek maliyeti YOK — detay sayfası zaten imar/koordinat/tapu için
 * çekiliyor.
 */
export function baslikCikar(html: string): string | null {
  const h1 = html.match(/<h1[^>]*>([^<]{8,300})<\/h1>/);
  if (h1?.[1]) {
    const t = htmlCoz(h1[1]);
    if (t.length >= 8) return t.slice(0, 300);
  }
  const og = html.match(/property="og:title"\s+content="([^"]{8,300})"/);
  if (og?.[1]) {
    const t = htmlCoz(og[1]);
    if (t.length >= 8) return t.slice(0, 300);
  }
  return null;
}

/**
 * JSON string kaçışlarını çözer.
 *
 * NEDEN AYRI BİR ADIM: değeri JSON.parse ile değil regex ile çekiyoruz (blob
 * Next.js `__NEXT_DATA__` içinde ve tamamını ayrıştırmak pahalı), dolayısıyla
 * JSON'un kendi `\uXXXX` kaçışları OLDUĞU GİBİ kalıyordu.
 *
 * ÖLÇÜLEN ZARAR (2026-09-05, üretim): "Bağ & Bahçe" iki ayrı imar sınıfına
 * bölünmüştü — 104 kayıt doğru yazımla, 70 kayıt ham kaçış hâliyle. İkisinin
 * medyanı bile farklıydı (1.478 ve 985 TL/m²), yani bölünme kozmetik değil:
 * emsal havuzu `imarUyumu` üzerinden eşleştiği için aynı imar sınıfındaki
 * ilanlar birbirine emsal sayılmıyordu.
 */
export function jsonKacisCoz(s: string): string {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/**
 * JSON-LD PropertyValue listesinden "İmar Durumu" değerini çıkarır.
 * Detay sayfasında `{"@type":"PropertyValue","name":"İmar Durumu","value":"Tarla"}`
 * biçiminde geliyor.
 */
export function imarDurumuCikar(html: string): string | null {
  const m = html.match(/"name"\s*:\s*"İmar Durumu"\s*,\s*"value"\s*:\s*"([^"]{1,60})"/);
  const deger = jsonKacisCoz(m?.[1] ?? "").trim();
  if (!deger || deger === "Bilinmiyor" || deger === "-") return null;
  return deger;
}

/**
 * "Tapu Durumu" etiketinin yanındaki değeri çıkarır.
 * HTML'de değer ÖNCE, etiket SONRA geliyor:
 *   <p ...>Hisseli Tapu</p><p ...>Tapu Durumu</p>
 */
export function tapuDurumuCikar(html: string): string | null {
  const m = html.match(/>([^<>]{2,40})<\/p>\s*<p[^>]*>\s*Tapu Durumu\s*<\/p>/);
  const deger = m?.[1]?.trim();
  if (!deger || deger === "Bilinmiyor" || deger === "-") return null;
  return deger;
}

/**
 * Gömülü JSON'daki parsel poligonundan temsilî bir nokta (centroid) üretir.
 *
 * Kaynak biçimi (script içinde, kaçışlı):
 *   \"geometry\":{\"coordinates\":[[[28.02112,41.1186],[28.02127,41.11853],...]]}
 * GeoJSON sırası [lng, lat].
 */
export function parselKoordinatCikar(html: string): { lat: number; lng: number } | null {
  // Hem kaçışlı (\") hem düz (") biçimi destekle.
  const m = html.match(/\\?"geometry\\?"\s*:\s*\{\s*\\?"coordinates\\?"\s*:\s*(\[\[\[[^\]]*(?:\][^\]]*)*?\]\]\])/);
  if (!m) return null;
  let ham = m[1].replace(/\\"/g, '"');
  let nokta: unknown;
  try { nokta = JSON.parse(ham); } catch { return null; }

  // [[[lng,lat],...]] — ilk halkayı al
  const halka = (nokta as number[][][])?.[0];
  if (!Array.isArray(halka) || halka.length === 0) return null;

  let lngT = 0, latT = 0, adet = 0;
  for (const c of halka) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const [lng, lat] = c;
    if (typeof lng !== "number" || typeof lat !== "number") continue;
    // Türkiye bbox — hatalı/ters sıralı veriyi ele
    if (lat < 35 || lat > 43 || lng < 25 || lng > 45) continue;
    lngT += lng; latT += lat; adet++;
  }
  if (adet === 0) return null;
  return {
    lat: Number((latT / adet).toFixed(6)),
    lng: Number((lngT / adet).toFixed(6)),
  };
}

/** Bir detay sayfası HTML'inden tüm zenginlik alanlarını çıkarır. */
export function detaySayfasiParse(html: string): DetayZenginlik {
  const koord = parselKoordinatCikar(html);
  return {
    imarDurumu: imarDurumuCikar(html),
    tapuDurumu: tapuDurumuCikar(html),
    baslik: baslikCikar(html),
    lat: koord?.lat ?? null,
    lng: koord?.lng ?? null,
  };
}

/**
 * Sayfa cekme sonucu — HATA TURU ile birlikte.
 *
 * NEDEN TUR ONEMLI: eski hali `string | null` donuyordu ve cagiran, null
 * gorunce ilani KALICI olarak "zenginlestirildi" damgaliyordu. 404 (ilan
 * silinmis) ile 429 (hiz limiti) ayni muameleyi goruyordu. Kaynak bir saat
 * boyunca 429 verirse o turdaki 120 ilanin tamami kalici olarak yaniyor ve
 * bir daha ASLA denenmiyordu.
 *
 * Uretimde imar kapsaminin %1,9'da takili kalmasinin en olasi aciklamasi bu.
 * Ve kod bunu kendi kendine tespit edemiyordu: sonuc objesi yalnizca
 * console.log'a gidiyor, pipeline-health'te imar doluluk kontrolu yok.
 */
type CekmeSonucu =
  | { durum: "ok"; html: string }
  /** Kalici: ilan gercekten yok. Damgalanabilir. */
  | { durum: "kalici"; kod: number }
  /** Gecici: kaynak bizi kisitliyor ya da ag sorunu. Damgalanmamali. */
  | { durum: "gecici"; kod: number; sebep: string };

async function sayfaCek(url: string, timeoutMs = 15_000): Promise<CekmeSonucu> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "tr-TR,tr;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return { durum: "ok", html: await res.text() };
    // 404/410 → ilan kaldirilmis, tekrar denemenin anlami yok.
    if (res.status === 404 || res.status === 410) return { durum: "kalici", kod: res.status };
    // 403/429/5xx → kaynak tarafli, gecici kabul edilir.
    return { durum: "gecici", kod: res.status, sebep: `HTTP ${res.status}` };
  } catch (e) {
    // Timeout / ag hatasi — her zaman gecici.
    return { durum: "gecici", kod: 0, sebep: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Bir mahallede kaç ilanı zenginleştirdikten sonra sıradaki mahalleye geçilir.
 *
 * NEDEN kota var: emsal havuzunun bir mahallede iş görebilmesi için orada
 * BİRDEN FAZLA gerçek koordinat gerekiyor (spatial motor tek noktadan medyan
 * üretemez). Kotasız "en büyük mahalleden başla" stratejisi tek bir yoğun
 * mahallede günlerce takılabilirdi. 25, sağlam bir medyan + outlier payı için
 * yeterli; veri setinde mahalle başına ortalama ~2.9 ilan (33.716 ilan /
 * 11.519 mahalle) olduğundan ve en yoğun mahallede 67 ilan bulunduğundan
 * pratikte yalnızca en yoğun birkaç mahallede devreye giriyor — asıl işlevi
 * emniyet supabı.
 */
const MAHALLE_KOTA = 25;

/**
 * Kuyruk satiri. Mahalle alanlari yalnizca V2'de dolu — tur sonunda
 * `zenginlestirme_kuyruk` sayacini hangi mahalle icin ilerletecegimizi
 * bilmek icin tasiniyor.
 */
interface KuyrukSatiri {
  id: number;
  ilan_no: string;
  il_norm?: string;
  ilce_norm?: string;
  mahalle_norm?: string;
}

/**
 * Gecici hata sonrasi kac kez daha denenir.
 *
 * 3: kaynak bir saatlik bir dalgalanma yasarsa kayit kurtulur; kalici bir
 * engelde de kuyruk sonsuza kadar ayni kayitlari denemez.
 */
const MAKS_DENEME = 3;

export interface ZenginlestirmeSonuc {
  denenen: number;
  /** 404/410 — ilan gercekten yok, kalici damgalandi. */
  kaliciHata: number;
  /** 403/429/5xx/timeout — deneme sayaci artti, damgalanmadi. */
  geciciHata: number;
  zenginlesen: number;
  imarBulunan: number;
  koordBulunan: number;
  tapuBulunan: number;
  baslikBulunan: number;
  hata: number;
  sure_ms: number;
}

/**
 * Zenginleştirme kuyruğunu getirir — mahalle-öncelikli sırayla.
 *
 * NEDEN tarih sırası değil: kuyruk `yakalanma_tarihi DESC` ile alındığında
 * işlenen 240 ilan 90 ayrı mahalleye dağılmıştı (mahalle başına ~2.7). Emsal
 * havuzu bu dağılımda hiçbir mahallede eşiği aşamıyor, yani harcanan istekler
 * kullanılabilir emsal üretmiyordu. İlan sayısı en yüksek mahalleden başlayıp
 * mahalleyi (kotaya kadar) bitirerek ilerlemek, aynı istek bütçesiyle ilk
 * turlardan itibaren gerçek emsal havuzu oluşturuyor.
 *
 * Mahalle anahtarı (il_norm, ilce_norm, mahalle_norm) ÜÇLÜSÜ — `mahalle_norm`
 * tek başına benzersiz değil ("cumhuriyet" onlarca ilçede geçiyor, tek başına
 * gruplanınca 181 ilanlık sahte bir mahalle üretiyor).
 *
 * Kota yaklaşık uygulanır: bir parti mahalleyi birkaç kayıt aşabilir. Zararsız,
 * ve her satır için ayrı sayaç sorgusu yapmaktan çok daha ucuz.
 */
/**
 * V2 kuyruk — önden hesaplanmış `zenginlestirme_kuyruk` tablosundan okur.
 *
 * NEDEN: v1 (aşağıda) her SAATLİK turda `ilanlar` üzerinde iki ayrı GROUP BY
 * TAM TARAMA yapıp ikisini JOIN'liyordu. Günde 24 tur × 3 tarama, ve
 * 2026-09-04'te ücretsiz katmanın 5M/gün okuma limiti doldu — sistemin hiç
 * kullanıcısı olmadığı hâlde.
 *
 * Aynı bilgi artık günlük cron'da bir kez hesaplanıp küçük bir tabloya
 * yazılıyor (lib/ozet-tablolari.ts). Burada yalnızca indeksli bir
 * `LIMIT`'li seçim ve ardından mahalle başına id çekme kalıyor.
 *
 * Seçim mantığı v1 ile AYNI: kotası dolmamış mahalleler arasından en çok
 * ilanı olandan başla. Değişen tek şey o mahallelerin nasıl bulunduğu.
 */
async function kuyrukGetirV2(
  db: D1Database,
  limit: number,
): Promise<KuyrukSatiri[]> {
  const mahalleler = await db
    .prepare(
      `SELECT il_norm, ilce_norm, mahalle_norm, toplam, islenen
       FROM zenginlestirme_kuyruk
       WHERE islenen < ?
       ORDER BY toplam DESC
       LIMIT 5`,
    )
    .bind(MAHALLE_KOTA)
    .all<{ il_norm: string; ilce_norm: string; mahalle_norm: string; toplam: number; islenen: number }>();

  const secilen: KuyrukSatiri[] = [];
  for (const m of (mahalleler.results ?? [])) {
    if (secilen.length >= limit) break;
    const kalanKota = Math.max(0, MAHALLE_KOTA - m.islenen);
    const alinacak = Math.min(limit - secilen.length, kalanKota);
    if (alinacak <= 0) continue;

    const r = await db
      .prepare(
        `SELECT id, ilan_no FROM ilanlar
         WHERE kaynak = 'emlakjet' AND aktif = 1 AND zenginlestirildi IS NULL
           AND il_norm = ? AND ilce_norm = ? AND mahalle_norm = ?
         ORDER BY yakalanma_tarihi DESC
         LIMIT ?`,
      )
      .bind(m.il_norm, m.ilce_norm, m.mahalle_norm, alinacak)
      .all<{ id: number; ilan_no: string }>();
    for (const satir of (r.results ?? [])) {
      secilen.push({ ...satir, il_norm: m.il_norm, ilce_norm: m.ilce_norm, mahalle_norm: m.mahalle_norm });
    }
  }

  // Kuyruk boşsa (tüm mahalleler kotasını doldurmuş) kotasız ikinci geçiş —
  // v1'deki davranış korunuyor, kuyruk hiç durmasın.
  if (secilen.length === 0) {
    const kalan = await db
      .prepare(
        `SELECT id, ilan_no FROM ilanlar
         WHERE kaynak = 'emlakjet' AND zenginlestirildi IS NULL AND aktif = 1
         ORDER BY yakalanma_tarihi DESC
         LIMIT ?`,
      )
      .bind(limit)
      .all<{ id: number; ilan_no: string }>();
    return kalan.results ?? [];
  }
  return secilen;
}

/** Bir tur sonunda kuyruk sayaçlarını ilerlet — günlük rebuild'e kadar senkron kalsın. */
async function kuyrukSayacIlerlet(
  db: D1Database,
  islenenler: Array<{ il_norm: string; ilce_norm: string; mahalle_norm: string }>,
): Promise<void> {
  const sayim = new Map<string, { il: string; ilce: string; mah: string; n: number }>();
  for (const k of islenenler) {
    if (!k.il_norm || !k.ilce_norm || !k.mahalle_norm) continue;
    const anahtar = `${k.il_norm}__${k.ilce_norm}__${k.mahalle_norm}`;
    const mevcut = sayim.get(anahtar);
    if (mevcut) mevcut.n++;
    else sayim.set(anahtar, { il: k.il_norm, ilce: k.ilce_norm, mah: k.mahalle_norm, n: 1 });
  }
  if (sayim.size === 0) return;
  await db.batch(
    [...sayim.values()].map((v) =>
      db.prepare(
        `UPDATE zenginlestirme_kuyruk SET islenen = islenen + ?, guncellendi = ?
         WHERE il_norm = ? AND ilce_norm = ? AND mahalle_norm = ?`,
      ).bind(v.n, Date.now(), v.il, v.ilce, v.mah),
    ),
  );
}

async function kuyrukGetir(
  db: D1Database,
  limit: number,
): Promise<KuyrukSatiri[]> {
  const oncelikli = await db
    .prepare(
      `WITH islenen AS (
         SELECT il_norm, ilce_norm, mahalle_norm, COUNT(*) AS z FROM ilanlar
         WHERE kaynak = 'emlakjet' AND zenginlestirildi IS NOT NULL
         GROUP BY il_norm, ilce_norm, mahalle_norm
       ),
       toplam AS (
         SELECT il_norm, ilce_norm, mahalle_norm, COUNT(*) AS n FROM ilanlar
         WHERE kaynak = 'emlakjet' AND aktif = 1
         GROUP BY il_norm, ilce_norm, mahalle_norm
       )
       SELECT i.id, i.ilan_no
       FROM ilanlar i
       JOIN toplam t
         ON t.il_norm = i.il_norm AND t.ilce_norm = i.ilce_norm
        AND t.mahalle_norm = i.mahalle_norm
       LEFT JOIN islenen z
         ON z.il_norm = i.il_norm AND z.ilce_norm = i.ilce_norm
        AND z.mahalle_norm = i.mahalle_norm
       WHERE i.kaynak = 'emlakjet' AND i.aktif = 1
         AND i.zenginlestirildi IS NULL
         AND COALESCE(z.z, 0) < ?
       ORDER BY t.n DESC, i.il_norm, i.ilce_norm, i.mahalle_norm,
                i.yakalanma_tarihi DESC
       LIMIT ?`,
    )
    .bind(MAHALLE_KOTA, limit)
    .all<{ id: number; ilan_no: string }>();

  const satirlar = oncelikli.results ?? [];
  if (satirlar.length > 0) return satirlar;

  // Kotası dolmamış mahalle kalmadı (ya da mahalle_norm NULL olan kayıtlar
  // JOIN'e takıldı) — kotasız ikinci geçişe düş, böylece kuyruk hiç durmaz.
  const kalan = await db
    .prepare(
      `SELECT id, ilan_no FROM ilanlar
       WHERE kaynak = 'emlakjet' AND zenginlestirildi IS NULL AND aktif = 1
       ORDER BY yakalanma_tarihi DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{ id: number; ilan_no: string }>();
  return kalan.results ?? [];
}

/**
 * Zenginleştirme kuyruğunu bir tur işler.
 *
 * `zenginlestirildi IS NULL` olan emlakjet ilanlarını sırayla alır, detay
 * sayfasını çeker, bulunan alanları yazar. Alan bulunamasa bile
 * `zenginlestirildi` damgalanır — böylece aynı ilan sonsuza kadar yeniden
 * denenmez (ilan silinmiş/yapı değişmiş olabilir).
 *
 * @param limit Bu turda işlenecek ilan sayısı. Workers CPU bütçesine göre
 *   küçük tutulmalı: her ilan 1 fetch + ISTEK_ARASI_MS bekleme demek.
 */
export async function emlakjetZenginlestirmeTuru(
  db: D1Database,
  limit = 40,
  /**
   * Kuyruk sürümü. V2 önden hesaplanmış tabloyu okur (ucuz); v1 her turda
   * `ilanlar`'ı iki kez tam tarar (pahalı — 5M/gün okuma limitini eritti).
   * Bayrak, v2'de beklenmeyen bir davranış çıkarsa tek env değişikliğiyle
   * geri dönebilmek için var; `zenginlestirme_kuyruk` boşsa (henüz ilk günlük
   * cron koşmadıysa) v2 zaten kotasız ikinci geçişe düşüyor.
   */
  kuyrukV2 = true,
): Promise<ZenginlestirmeSonuc> {
  const basladi = Date.now();
  const sonuc: ZenginlestirmeSonuc = {
    denenen: 0, zenginlesen: 0, imarBulunan: 0,
    koordBulunan: 0, tapuBulunan: 0, baslikBulunan: 0, hata: 0,
    kaliciHata: 0, geciciHata: 0, sure_ms: 0,
  };

  const kuyruk = kuyrukV2
    ? await kuyrukGetirV2(db, limit)
    : await kuyrukGetir(db, limit);

  for (const satir of kuyruk) {
    sonuc.denenen++;
    // ilan_no "ej_19780846" biçiminde saklanıyor — sayısal kısmı URL'de kullanılır.
    const ejId = satir.ilan_no.replace(/^ej_/, "");
    if (!/^\d{7,}$/.test(ejId)) {
      // Beklenmeyen biçim — tekrar denememek için damgala.
      await db.prepare(`UPDATE ilanlar SET zenginlestirildi = ? WHERE id = ?`)
        .bind(Date.now(), satir.id).run().catch(() => {});
      continue;
    }

    // Emlakjet detay URL'i slug içeriyor ama ID ile de çözülüyor (redirect).
    const cekme = await sayfaCek(`${EMLAKJET_BASE}/ilan/${ejId}`);

    if (cekme.durum !== "ok") {
      sonuc.hata++;
      if (cekme.durum === "kalici") {
        // İlan gerçekten yok (404/410) — bir daha denemenin anlamı yok.
        sonuc.kaliciHata++;
        await db.prepare(`UPDATE ilanlar SET zenginlestirildi = ? WHERE id = ?`)
          .bind(Date.now(), satir.id).run().catch(() => {});
      } else {
        // GEÇİCİ hata (403/429/5xx/timeout). Eskiden bunlar da kalıcı
        // damgalanıyordu: kaynak bir saat 429 verirse o turdaki 120 ilan
        // sonsuza kadar yanıyordu. Artık deneme sayacı artıyor ve ancak
        // MAKS_DENEME'den sonra vazgeçiliyor.
        sonuc.geciciHata++;
        await db.prepare(
          `UPDATE ilanlar SET
             zenginlestirme_deneme = COALESCE(zenginlestirme_deneme, 0) + 1,
             zenginlestirme_son_deneme = ?,
             zenginlestirildi = CASE
               WHEN COALESCE(zenginlestirme_deneme, 0) + 1 >= ? THEN ?
               ELSE zenginlestirildi END
           WHERE id = ?`,
        ).bind(Date.now(), MAKS_DENEME, Date.now(), satir.id).run().catch(() => {});
      }
      await new Promise((r) => setTimeout(r, ISTEK_ARASI_MS));
      continue;
    }

    const z = detaySayfasiParse(cekme.html);
    if (z.imarDurumu) sonuc.imarBulunan++;
    if (z.tapuDurumu) sonuc.tapuBulunan++;
    if (z.baslik) sonuc.baslikBulunan++;
    if (z.lat != null) sonuc.koordBulunan++;
    if (z.imarDurumu || z.tapuDurumu || z.baslik || z.lat != null) sonuc.zenginlesen++;

    try {
      // COALESCE: sadece yeni değer varsa üzerine yaz, yoksa mevcudu koru.
      // Koordinat için koord_kaynagi da güncelleniyor — 'parsel' değeri,
      // eski 'mahalle-merkez' kayıtlarından ayırt etmeyi sağlar (spatial
      // motorun gerçek konumu olanlara güvenebilmesi için kritik).
      await db
        .prepare(
          `UPDATE ilanlar SET
             imar_durumu   = COALESCE(?, imar_durumu),
             tapu_durumu   = COALESCE(?, tapu_durumu),
             baslik        = COALESCE(?, baslik),
             lat           = COALESCE(?, lat),
             lng           = COALESCE(?, lng),
             koord_kaynagi = CASE WHEN ? IS NOT NULL THEN 'parsel' ELSE koord_kaynagi END,
             zenginlestirildi = ?
           WHERE id = ?`,
        )
        .bind(z.imarDurumu, z.tapuDurumu, z.baslik, z.lat, z.lng, z.lat,
              Date.now(), satir.id)
        .run();
    } catch {
      sonuc.hata++;
    }

    await new Promise((r) => setTimeout(r, ISTEK_ARASI_MS));
  }

  // Kuyruk sayaclarini ilerlet — gunluk yeniden kuruluma kadar senkron kalsin.
  // Denenen HER kayit sayilir (basarisiz olan da damgalandi, yani tekrar
  // secilmeyecek); aksi halde kuyruk ayni mahalleyi sonsuza kadar secerdi.
  if (kuyrukV2) {
    try {
      await kuyrukSayacIlerlet(
        db,
        kuyruk.filter((k): k is Required<KuyrukSatiri> =>
          !!k.il_norm && !!k.ilce_norm && !!k.mahalle_norm),
      );
    } catch (e) {
      // Sayac ilerlemezse tur yine de basarili sayilir; gunluk rebuild duzeltir.
      console.error("[zenginlestirme] kuyruk sayaci ilerletilemedi:", e);
    }
  }

  sonuc.sure_ms = Date.now() - basladi;

  // Turu kayda gec — eskiden sonuc yalnizca console.log'a gidiyordu ve
  // Cloudflare log saklama suresi dolunca kayboluyordu. "Bu hat calisiyor mu"
  // sorusu hicbir yerden cevaplanamiyordu; %1,9 imar kapsami rakami da elle
  // atilmis tek seferlik bir sorgudan geliyordu.
  try {
    await db.prepare(
      `INSERT INTO zenginlestirme_log
         (calisti, denenen, zenginlesen, imar_bulunan, tapu_bulunan,
          koord_bulunan, baslik_bulunan, kalici_hata, gecici_hata, sure_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      Date.now(), sonuc.denenen, sonuc.zenginlesen, sonuc.imarBulunan,
      sonuc.tapuBulunan, sonuc.koordBulunan, sonuc.baslikBulunan,
      sonuc.kaliciHata, sonuc.geciciHata, sonuc.sure_ms,
    ).run();
  } catch (e) {
    console.error("[zenginlestirme] log yazilamadi:", e);
  }

  return sonuc;
}
