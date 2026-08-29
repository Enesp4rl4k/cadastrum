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
  lat: number | null;
  lng: number | null;
}

/**
 * JSON-LD PropertyValue listesinden "İmar Durumu" değerini çıkarır.
 * Detay sayfasında `{"@type":"PropertyValue","name":"İmar Durumu","value":"Tarla"}`
 * biçiminde geliyor.
 */
export function imarDurumuCikar(html: string): string | null {
  const m = html.match(/"name"\s*:\s*"İmar Durumu"\s*,\s*"value"\s*:\s*"([^"]{1,60})"/);
  const deger = m?.[1]?.trim();
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
    lat: koord?.lat ?? null,
    lng: koord?.lng ?? null,
  };
}

async function sayfaCek(url: string, timeoutMs = 15_000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "tr-TR,tr;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
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

export interface ZenginlestirmeSonuc {
  denenen: number;
  zenginlesen: number;
  imarBulunan: number;
  koordBulunan: number;
  tapuBulunan: number;
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
async function kuyrukGetir(
  db: D1Database,
  limit: number,
): Promise<Array<{ id: number; ilan_no: string }>> {
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
): Promise<ZenginlestirmeSonuc> {
  const basladi = Date.now();
  const sonuc: ZenginlestirmeSonuc = {
    denenen: 0, zenginlesen: 0, imarBulunan: 0,
    koordBulunan: 0, tapuBulunan: 0, hata: 0, sure_ms: 0,
  };

  const kuyruk = await kuyrukGetir(db, limit);

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
    const html = await sayfaCek(`${EMLAKJET_BASE}/ilan/${ejId}`);
    if (!html) {
      sonuc.hata++;
      await db.prepare(`UPDATE ilanlar SET zenginlestirildi = ? WHERE id = ?`)
        .bind(Date.now(), satir.id).run().catch(() => {});
      await new Promise((r) => setTimeout(r, ISTEK_ARASI_MS));
      continue;
    }

    const z = detaySayfasiParse(html);
    if (z.imarDurumu) sonuc.imarBulunan++;
    if (z.tapuDurumu) sonuc.tapuBulunan++;
    if (z.lat != null) sonuc.koordBulunan++;
    if (z.imarDurumu || z.tapuDurumu || z.lat != null) sonuc.zenginlesen++;

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
             lat           = COALESCE(?, lat),
             lng           = COALESCE(?, lng),
             koord_kaynagi = CASE WHEN ? IS NOT NULL THEN 'parsel' ELSE koord_kaynagi END,
             zenginlestirildi = ?
           WHERE id = ?`,
        )
        .bind(z.imarDurumu, z.tapuDurumu, z.lat, z.lng, z.lat, Date.now(), satir.id)
        .run();
    } catch {
      sonuc.hata++;
    }

    await new Promise((r) => setTimeout(r, ISTEK_ARASI_MS));
  }

  sonuc.sure_ms = Date.now() - basladi;
  return sonuc;
}
