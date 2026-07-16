import { haversineM } from "./analiz";
import { statikLojistikZenginleştir } from "./statik-lojistik";
import { db } from "./db";

// Overpass: birkaç güvenilir mirror sırayla denenir.
// overpass.osm.ch ve lz4 main mirror'lar genelde stabil.
const OVERPASS_HOSTS = [
  // NOT: overpass.osm.ch şu an degrade — İstanbul için bile 200+0 element dönüyor.
  // Bu yüzden sona alındı; retry-on-empty mantığı yine de her mirror'ı deniyor.
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];
const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";

export interface PoiSayilari {
  okul: number;
  hastane: number;
  duraklar: number; // bus_stop + tram_stop + station
  /** En yakın okul'un mesafesi (m) — POI 0 ise bile 5km'ye kadar tarama */
  okulMinM: number | null;
  hastaneMinM: number | null;
  durakMinM: number | null;
}

export interface YakinNoktaMesafesi {
  tip: string; // 'motorway', 'osb', 'airport', 'port', 'railway', 'okul', 'market' vs
  ad: string;
  mesafeM: number;
  lat: number;
  lng: number;
  ikon?: string; // 🚚, 🏫, 🏥 vb
}

export interface AltyapiBilgisi {
  elektrikHattiM: number | null; // en yakın power=line mesafesi
  suBoruM: number | null; // man_made=pipeline + substance=water
  demiryoluM: number | null;
  /** En yakın trafo / yüksek gerilim direği — power=substation|tower */
  trafoM?: number | null;
  /** En yakın akaryakıt istasyonu — amenity=fuel */
  akaryakitM?: number | null;
}

/**
 * Çoklu yarıçapta POI sayımı — Faz 1 ROADMAP gereği 1/5/15 km bantları.
 * Tek Overpass çağrısından (radius=15km) üretilir, ek network maliyeti yok.
 */
export interface MultiRadiusSayim {
  /** Eğitim — okul + üniversite */
  okul: { r1km: number; r5km: number; r15km: number };
  /** Sağlık — hospital + clinic */
  saglik: { r1km: number; r5km: number; r15km: number };
  /** Toplu taşıma — bus_stop + railway station/halt/tram_stop */
  durak: { r1km: number; r5km: number; r15km: number };
  /** Akaryakıt — amenity=fuel */
  akaryakit: { r1km: number; r5km: number; r15km: number };
}

export interface KirsalAnaliz {
  yolaCepheM: number | null; // track, unclassified, vb. mesafesi
  suKaynagiM: number | null; // river, water, reservoir
  koyMerkeziM: number | null; // village, hamlet
}

export interface CevreAnalizi {
  poi: PoiSayilari;
  enYakinlar: YakinNoktaMesafesi[];
  altyapi: AltyapiBilgisi;
  kirsal: KirsalAnaliz;
  adres: string | null;
  /** Overpass'tan dönen toplam element sayısı (debug için) */
  elementSayisi: number;
  /** 1/5/15 km bantlarında POI yoğunluğu — opsiyonel (eski cache verisi olmayabilir) */
  multiRadius?: MultiRadiusSayim;
}

interface OverpassEl {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassEl[];
  /** Overpass timeout/rate-limit'te 200 döner ama buraya hata yazar. */
  remark?: string;
}

const OSM_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün

// Cache sürümü — artırınca eski kayıtlar geçersiz olur. v2: bozuk osm.ch mirror'ının
// cache'lediği "0 element" boş sonuçlarını temizlemek için (retry-on-empty fix'i sonrası).
const OSM_CACHE_VER = "v2";
function osmCacheKey(lat: number, lng: number): string {
  // 0.001° ≈ 110m — aynı parselde aynı cache
  return `${OSM_CACHE_VER}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
}

/**
 * Tek bir Overpass sorgusu ile tüm çevre verisini çeker.
 * Yarıçap: POI 15km (multi-radius bant sayımı için genişletildi) +
 * altyapı 3km + lojistik 30km.
 *
 * Dexie cache'lidir (7 gün) — aynı parsel için tekrar Overpass çağrısı yapma.
 */
export async function cevreAnaliziGetir(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<CevreAnalizi> {
  const key = osmCacheKey(lat, lng);
  // Cache hit
  try {
    const hit = await db.osmCevreCache.get(key);
    if (hit && Date.now() - hit.fetchedAt < OSM_CACHE_TTL_MS) {
      return hit.cevre;
    }
  } catch {
    // Dexie test env'da yoksa devam
  }

  // POI yarıçapı 15km'ye genişletildi (multi-radius bantları için);
  // tag setine `amenity=fuel` ve `power=substation|tower` eklendi.
  const query = `[out:json][timeout:30];(nwr["amenity"~"^(school|hospital|clinic|university|fuel)$"](around:15000,${lat},${lng});node["highway"="bus_stop"](around:15000,${lat},${lng});node["railway"~"^(station|tram_stop|halt)$"](around:15000,${lat},${lng});way["highway"~"^(motorway|trunk|motorway_link|trunk_link)$"](around:30000,${lat},${lng});way["highway"~"^(primary|secondary|primary_link|secondary_link|tertiary)$"](around:10000,${lat},${lng});way["power"~"^(line|cable|minor_line)$"](around:3000,${lat},${lng});nwr["power"~"^(substation|tower|generator)$"](around:3000,${lat},${lng});way["man_made"~"^(pipeline|water_well|water_works)$"](around:3000,${lat},${lng});way["railway"~"^(rail|light_rail|subway)$"](around:3000,${lat},${lng});way["landuse"="industrial"](around:30000,${lat},${lng});nwr["aeroway"="aerodrome"](around:30000,${lat},${lng});nwr["amenity"="ferry_terminal"](around:30000,${lat},${lng});nwr["harbour"="yes"](around:30000,${lat},${lng});nwr["waterway"~"^(river|stream|canal)$"](around:1000,${lat},${lng});nwr["natural"="water"](around:1000,${lat},${lng});nwr["landuse"="reservoir"](around:1000,${lat},${lng});way["highway"~"^(track|unclassified|tertiary|residential|path)$"](around:1000,${lat},${lng});node["place"~"^(village|hamlet)$"](around:5000,${lat},${lng}););out tags center;`;

  // Birden fazla mirror dene — biri 406/timeout dönerse diğerine geç.
  // KRİTİK: Overpass aşırı yüklüyken "200 OK + boş elements + remark(timeout)" döner.
  // Bunu başarı sayıp durursak, dolu bir bölgede (örn. Ayvalık) "0 element = veri yok"
  // yanılgısı oluşur. Bu yüzden boş/remark yanıtını da BAŞARISIZLIK sayıp sıradaki
  // mirror'a geçiyoruz; sadece tüm mirror'lar boş dönerse gerçekten boş kabul ediyoruz.
  let lastError: string = "";
  let data: OverpassResponse | null = null;
  let bosData: OverpassResponse | null = null; // tüm mirror'lar boşsa fallback
  for (const host of OVERPASS_HOSTS) {
    try {
      // Per-mirror fail-fast timeout (12sn) — asılan/yavaş mirror'ı bekleme, sıradakine geç.
      // Dış signal ile birleştir (kullanıcı iptal ederse yine durur).
      const mirrorTimeout = AbortSignal.timeout(12_000);
      const birlesikSignal = signal ? AbortSignal.any([signal, mirrorTimeout]) : mirrorTimeout;
      const result = await proxyFetch(host, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: birlesikSignal,
      });
      if (!result.ok) {
        lastError = `${new URL(host).host} → HTTP ${result.status}`;
        continue;
      }
      let parsed: OverpassResponse;
      try {
        parsed = JSON.parse(result.text);
      } catch {
        lastError = `${new URL(host).host} → invalid JSON`;
        continue;
      }
      const bosVeyaHata =
        (parsed.remark && /timed out|error|rate|limit/i.test(parsed.remark)) ||
        !parsed.elements ||
        parsed.elements.length === 0;
      if (bosVeyaHata) {
        // Timeout/rate-limit muhtemel — bir sonraki mirror'ı dene, ama sakla
        lastError = `${new URL(host).host} → ${parsed.remark ? "remark: " + parsed.remark : "0 element (muhtemel timeout)"}`;
        if (parsed.elements) bosData = parsed;
        continue;
      }
      data = parsed;
      break;
    } catch (e) {
      lastError = `${new URL(host).host} → ${e instanceof Error ? e.message : "fetch failed"}`;
    }
  }
  // Hiç dolu yanıt gelmedi: bir mirror boş döndüyse (gerçekten sapa bölge) onu kullan,
  // hiçbiri yanıt vermediyse hata fırlat.
  if (!data) {
    if (bosData) {
      data = bosData;
      console.warn(`[arsa-overpass] tüm mirror'lar boş döndü — bölge gerçekten seyrek olabilir (${lastError})`);
    } else {
      throw new Error(`Overpass servisleri yanıt vermiyor (${lastError})`);
    }
  }
  console.log(
    `[arsa-overpass] ✓ ${(data as { elements?: unknown[] }).elements?.length ?? 0} element bulundu (lat=${lat}, lng=${lng})`,
  );

  const elements = (data as { elements: OverpassEl[] }).elements ?? [];
  const sonuc = classifyOverpass(elements, lat, lng);
  const zenginlestirilmis = statikLojistikZenginleştir(sonuc, lat, lng);

  try {
    await db.osmCevreCache.put({ key, cevre: zenginlestirilmis, fetchedAt: Date.now() });
  } catch (e) {
    console.debug("[arsa-osm] osmCevreCache yazma hatası (kota/izin):", e);
  }
  return zenginlestirilmis;
}

function classifyOverpass(
  els: OverpassEl[],
  lat: number,
  lng: number,
): CevreAnalizi {
  const poi: PoiSayilari = {
    okul: 0,
    hastane: 0,
    duraklar: 0,
    okulMinM: null,
    hastaneMinM: null,
    durakMinM: null,
  };
  // 1.5km dahilinde POI sayar, 5km'ye kadar ise en yakın mesafeyi tutar
  const POI_SAYIM_YARICAP = 1500;
  const enYakinlar: YakinNoktaMesafesi[] = [];
  const altyapi: AltyapiBilgisi = {
    elektrikHattiM: null,
    suBoruM: null,
    demiryoluM: null,
    trafoM: null,
    akaryakitM: null,
  };
  const multiRadius: MultiRadiusSayim = {
    okul: { r1km: 0, r5km: 0, r15km: 0 },
    saglik: { r1km: 0, r5km: 0, r15km: 0 },
    durak: { r1km: 0, r5km: 0, r15km: 0 },
    akaryakit: { r1km: 0, r5km: 0, r15km: 0 },
  };
  const sayBant = (kat: keyof MultiRadiusSayim, d: number) => {
    if (d <= 15000) multiRadius[kat].r15km++;
    if (d <= 5000) multiRadius[kat].r5km++;
    if (d <= 1000) multiRadius[kat].r1km++;
  };
  const kirsal: KirsalAnaliz = {
    yolaCepheM: null,
    suKaynagiM: null,
    koyMerkeziM: null,
  };
  const enYakin = new Map<
    string,
    { ad: string; mesafe: number; lat: number; lng: number; ikon: string }
  >();
  // Tüm bulunan POI'leri ayrı bir liste olarak da topla (ada/parsele en yakın 20)
  const tumPoiler: YakinNoktaMesafesi[] = [];

  for (const el of els) {
    const t = el.tags ?? {};
    const p = el.lat != null && el.lon != null
      ? { lat: el.lat, lng: el.lon }
      : el.center
        ? { lat: el.center.lat, lng: el.center.lon }
        : null;
    if (!p) continue;
    const d = haversineM(lat, lng, p.lat, p.lng);

    // POI tipine göre ikon ve etiket eşleştir
    let poiIkon = "";
    let poiTip = "";
    let poiAd = t["name"] ?? "";

    if (t["amenity"] === "school" || t["amenity"] === "university") {
      if (d <= POI_SAYIM_YARICAP) poi.okul++;
      if (poi.okulMinM == null || d < poi.okulMinM) poi.okulMinM = Math.round(d);
      sayBant("okul", d);
      poiIkon = "🏫";
      poiTip = "okul";
      poiAd = poiAd || (t["amenity"] === "university" ? "Üniversite" : "Okul");
    } else if (t["amenity"] === "hospital" || t["amenity"] === "clinic") {
      if (d <= POI_SAYIM_YARICAP) poi.hastane++;
      if (poi.hastaneMinM == null || d < poi.hastaneMinM) poi.hastaneMinM = Math.round(d);
      sayBant("saglik", d);
      poiIkon = "🏥";
      poiTip = "saglik";
      poiAd = poiAd || (t["amenity"] === "hospital" ? "Hastane" : "Klinik");
    } else if (
      t["highway"] === "bus_stop" ||
      t["railway"] === "station" ||
      t["railway"] === "tram_stop" ||
      t["railway"] === "halt"
    ) {
      if (d <= POI_SAYIM_YARICAP) poi.duraklar++;
      if (poi.durakMinM == null || d < poi.durakMinM) poi.durakMinM = Math.round(d);
      sayBant("durak", d);
      poiIkon = t["railway"] === "station" ? "🚉" : "🚏";
      poiTip = "durak";
      poiAd = poiAd || (t["railway"] ? "İstasyon" : "Otobüs durağı");
    } else if (t["amenity"] === "fuel") {
      sayBant("akaryakit", d);
      if (altyapi.akaryakitM == null || d < altyapi.akaryakitM) altyapi.akaryakitM = d;
      poiIkon = "⛽";
      poiTip = "akaryakit";
      poiAd = poiAd || "Akaryakıt";
    }

    if (poiTip && p) {
      tumPoiler.push({
        tip: poiTip,
        ad: poiAd,
        mesafeM: Math.round(d),
        lat: p.lat,
        lng: p.lng,
        ikon: poiIkon,
      });
    }

    // En yakınlar (her tip için minimum) — lat/lng + ikon ile
    const update = (key: string, ad: string, ikon: string) => {
      const cur = enYakin.get(key);
      if (!cur || d < cur.mesafe)
        enYakin.set(key, { ad, mesafe: d, lat: p?.lat ?? 0, lng: p?.lng ?? 0, ikon });
    };

    const hwy = t["highway"];
    if (hwy === "motorway" || hwy === "motorway_link") {
      update("motorway", t["ref"] ?? t["name"] ?? (hwy === "motorway_link" ? "Otoyol Bağlantısı" : "Otoyol"), "🛣️");
    } else if (hwy === "trunk" || hwy === "trunk_link") {
      update("trunk", t["ref"] ?? t["name"] ?? (hwy === "trunk_link" ? "Devlet Yolu Bağlantısı" : "Devlet yolu"), "🛤️");
    } else if (hwy === "primary" || hwy === "primary_link") {
      update("primary", t["ref"] ?? t["name"] ?? (hwy === "primary_link" ? "Anayol Bağlantısı" : "Anayol"), "🛣");
    } else if (hwy === "secondary" || hwy === "secondary_link") {
      update("secondary", t["ref"] ?? t["name"] ?? "İkincil yol", "🛤");
    } else if (hwy === "tertiary") {
      update("tertiary", t["ref"] ?? t["name"] ?? "Üçüncü yol", "🛤");
    }

    if (t["landuse"] === "industrial") update("osb", t["name"] ?? "Sanayi bölgesi", "🏭");
    if (t["aeroway"] === "aerodrome") update("airport", t["name"] ?? "Havaalanı", "✈️");
    if (t["amenity"] === "ferry_terminal" || t["harbour"] === "yes")
      update("port", t["name"] ?? "Liman", "⚓");

    // Altyapı — ham mesafe
    if (t["power"] === "line") {
      if (altyapi.elektrikHattiM == null || d < altyapi.elektrikHattiM)
        altyapi.elektrikHattiM = d;
    }
    if (t["power"] === "substation" || t["power"] === "tower") {
      if (altyapi.trafoM == null || d < altyapi.trafoM) altyapi.trafoM = d;
    }
    if (t["man_made"] === "pipeline" && t["substance"] === "water") {
      if (altyapi.suBoruM == null || d < altyapi.suBoruM) altyapi.suBoruM = d;
    }
    if (
      t["railway"] === "rail" ||
      t["railway"] === "light_rail" ||
      t["railway"] === "subway"
    ) {
      if (altyapi.demiryoluM == null || d < altyapi.demiryoluM)
        altyapi.demiryoluM = d;
      update("railway", t["name"] ?? t["ref"] ?? "Demiryolu", "🚄");
    }

    // Kırsal Analiz — Su, Yol, Köy
    if (t["waterway"] || t["natural"] === "water" || t["landuse"] === "reservoir") {
      if (kirsal.suKaynagiM == null || d < kirsal.suKaynagiM) kirsal.suKaynagiM = d;
    }
    if (t["place"] === "village" || t["place"] === "hamlet") {
      if (kirsal.koyMerkeziM == null || d < kirsal.koyMerkeziM) kirsal.koyMerkeziM = d;
      update("village", t["name"] ?? "Köy Merkezi", "🏘️");
    }
    if (
      hwy === "track" || hwy === "unclassified" || hwy === "tertiary" ||
      hwy === "residential" || hwy === "path"
    ) {
      if (kirsal.yolaCepheM == null || d < kirsal.yolaCepheM) kirsal.yolaCepheM = d;
    }
  }

  for (const [tip, v] of enYakin) {
    enYakinlar.push({
      tip,
      ad: v.ad,
      mesafeM: Math.round(v.mesafe),
      lat: v.lat,
      lng: v.lng,
      ikon: v.ikon,
    });
  }
  enYakinlar.sort((a, b) => a.mesafeM - b.mesafeM);

  // POI'leri de ekle — en yakın 20'sini
  tumPoiler.sort((a, b) => a.mesafeM - b.mesafeM);
  for (const p of tumPoiler.slice(0, 20)) enYakinlar.push(p);

  return {
    poi,
    enYakinlar,
    altyapi,
    kirsal,
    adres: null,
    elementSayisi: els.length,
    multiRadius,
  };
}

export async function adresGetir(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const url = `${NOMINATIM}?format=json&lat=${lat}&lon=${lng}&accept-language=tr&zoom=18`;
  try {
    const result = await proxyFetch(url, {
      headers: { "User-Agent": "Arsa-TKGM-Extension/0.1 (eparlak996@gmail.com)" },
      signal,
    });
    if (!result.ok) return null;
    const data = JSON.parse(result.text) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}

/**
 * Overpass POST isteklerini SW üzerinden gönderir — DNR rules Origin header'ını strip eder.
 * Side panel'den direkt POST yapıldığında Overpass "Origin: chrome-extension://" görüp 406 döner.
 * SW üzerinden gönderildiğinde DNR rules header'ı temizler, istek normal görünür.
 *
 * Nominatim ve diğer GET istekleri için direkt fetch yeterli (DNR rules GET'te çalışır).
 */
async function proxyFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal } = {},
): Promise<{ ok: boolean; status: number; text: string }> {
  const isPost = (init.method ?? "GET").toUpperCase() === "POST";

  // POST isteklerini (Overpass) SW üzerinden proxy et
  if (isPost && typeof chrome !== "undefined" && chrome?.runtime?.sendMessage) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { tip: "overpass-proxy", url, body: init.body ?? "" },
        (resp: { ok: boolean; status: number; text: string } | undefined) => {
          if (chrome.runtime.lastError || !resp) {
            // SW yanıt vermezse direkt fetch'e düş
            fetch(url, { method: "POST", headers: init.headers, body: init.body, signal: init.signal })
              .then(async (r) => resolve({ ok: r.ok, status: r.status, text: await r.text() }))
              .catch(() => resolve({ ok: false, status: 0, text: "" }));
          } else {
            resolve(resp);
          }
        },
      );
    });
  }

  // GET istekleri (Nominatim vb.) — direkt fetch, DNR rules zaten çalışır
  const res = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: init.signal,
  });
  return { ok: res.ok, status: res.status, text: await res.text() };
}
