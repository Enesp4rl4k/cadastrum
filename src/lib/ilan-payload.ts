/**
 * Backend'e gönderilen ilan payload'ının TEK kurucusu.
 *
 * NEDEN VAR: bu iş iki ayrı yerde, birbirinden hafifçe farklı şekilde
 * yapılıyordu — `background/service-worker.ts` (tekil `/v1/ilan`) ve
 * `background/scraping-runtime.ts` (toplu `/v1/ilan/batch` · `/ilan/katki`).
 * İkisi de aynı alanları kuruyordu ama:
 *
 *   - service-worker koordinat yoksa MAHALLE MERKEZİNDEN çözüyordu,
 *   - scraping-runtime çözmüyordu; `lat: ilan.lat ?? undefined` deyip geçiyordu.
 *
 * Liste parser'ları (`content/sahibinden-liste.ts`, `content/hepsiemlak-liste.ts`)
 * koordinat HİÇ üretmiyor. Yani ana crowdsource hattından gelen ilanlar
 * `lat = NULL` yükleniyor ve `GET /v1/emsal/spatial` sonuçlarına asla giremiyor:
 * uzantı kendi topladığı veriyi göremiyor. Kopyalanan iki kurucudan yalnızca
 * birinin düzeltilmiş olması tam olarak backend'deki `koordinatAra()` hatasının
 * uzantı karşılığıydı — orada çözüm `lib/veri-katmani.ts` olmuştu, burada bu.
 *
 * KURAL: yeni bir gönderim yolu eklenirken payload BURADAN alınır; alan listesi,
 * kategori çıkarımı ve koordinat çözümlemesi kopyalanmaz.
 */

import type { IlanBilgisi } from "../types/ilan";
import { getMahalleMerkez } from "./data/mahalle-merkezleri";

/** Backend `IlanIngestSchema`'nın beklediği snake_case gövde. */
export interface IlanPayload {
  kaynak: "extension";
  ilan_no: string;
  il: string;
  ilce: string;
  mahalle?: string;
  fiyat_per_m2: number;
  m2: number;
  kategori: string;
  imar_durumu?: string;
  para_birimi: string;
  baslik?: string;
  tapu_durumu?: string;
  lat?: number;
  lng?: number;
  koord_kaynagi?: "dom" | "mahalle-merkez" | "manuel";
}

/** Fiyat/m² üst sınırı — üstü veri hatası kabul edilir. */
const MAX_TLM2 = 10_000_000;

/**
 * Başlıktan kategori çıkarımı.
 *
 * Backend'in `ilanlar.kategori` CHECK kısıtındaki değerleri üretir.
 *
 * SIRA, iki kopyadaki DAVRANIŞIN AYNISI bilerek korundu: tarla → bahçe →
 * zeytinlik → konut. "Zeytinlik tarla" bu sırada `tarla` çıkıyor; daha spesifik
 * olanı öne almak makul görünse de segment dağılımını sessizce kaydırırdı ve
 * bu birleştirmenin amacı koordinat kaybını gidermek, sınıflandırmayı
 * değiştirmek değil. Değişecekse ölçümle değişmeli (backtest A/B kolu var).
 *
 * İKİ KOPYA ARASINDAKİ FARKLAR (birleştirilirken karar verildi):
 *   - `kiraz` yalnızca service-worker kopyasındaydı. "Kiraz bahçesi" başlığını
 *     KONUT yapıyordu; açık bir yazım hatası, alınmadı.
 *   - Çıplak `ev` her iki kopyada da vardı ve alt dize eşleşiyordu:
 *     "devren", "seviye", "evrenseki" gibi başlıklar konut sayılıyordu.
 *     Kelime sınırına çekildi.
 */
export function kategoriCikar(baslik: string | null | undefined): string {
  const b = (baslik ?? "").toLocaleLowerCase("tr");
  if (/tarla/.test(b)) return "tarla";
  if (/bahçe|bahce/.test(b)) return "bahce";
  if (/zeytin/.test(b)) return "zeytinlik";
  if (/villa|müstakil|mustakil|daire|apartman|\bev(ler)?\b|konut/.test(b)) return "konut";
  return "arsa";
}

/**
 * Bir ilanı backend payload'ına çevirir.
 *
 * @returns Zorunlu alanlar eksikse ya da fiyat/m² mantıksızsa `null`.
 *   Çağıran bu kaydı ATLAMALI ama SAYMALI — sessizce yutulan kayıt,
 *   "veri yok" ile "gönderemedik"i karıştırır.
 */
export function ilanPayloadKur(ilan: IlanBilgisi): IlanPayload | null {
  if (!ilan.ilanNo || !ilan.il || !ilan.ilce || !ilan.fiyat || !ilan.m2) return null;

  // Kontrol YUVARLANMIŞ değer üzerinde: 1 TL/m²nin altındaki bir oran
  // `Math.round` ile 0'a düşüyor ve backend şeması `positive()` istediği için
  // kayıt 422 ile reddediliyor — yani "gönderdik ama yazılmadı" durumu. Burada
  // eleyip SAYMAK, orada sessizce hata sayacına düşmesinden iyi.
  const hamTlm2 = ilan.fiyat / ilan.m2;
  if (!Number.isFinite(hamTlm2)) return null;
  const fiyatPerM2 = Math.round(hamTlm2);
  if (fiyatPerM2 < 1 || fiyatPerM2 > MAX_TLM2) return null;

  // Koordinat çözümlemesi — DOM'dan gelen gerçek koordinat varsa o kullanılır,
  // yoksa mahalle merkezine düşülür. İki kaynak `koord_kaynagi` ile ayrılıyor:
  // spatial emsal motoru gerçek parsel koordinatı ile mahalle merkezini bu
  // alanla ayırt ediyor, aynı ağırlıkla kullanamaz.
  let lat = ilan.lat ?? undefined;
  let lng = ilan.lng ?? undefined;
  let koordKaynagi = (ilan.koordKaynagi ?? undefined) as IlanPayload["koord_kaynagi"];

  if (lat == null || lng == null) {
    const merkez = getMahalleMerkez(ilan.il, ilan.ilce, ilan.mahalle);
    if (merkez) {
      lat = merkez.lat;
      lng = merkez.lng;
      koordKaynagi = "mahalle-merkez";
    }
  }

  return {
    kaynak: "extension",
    ilan_no: ilan.ilanNo,
    il: ilan.il,
    ilce: ilan.ilce,
    mahalle: ilan.mahalle ?? undefined,
    fiyat_per_m2: fiyatPerM2,
    m2: ilan.m2,
    kategori: kategoriCikar(ilan.baslik),
    imar_durumu: ilan.imarDurumu ?? undefined,
    para_birimi: ilan.paraBirimi ?? "TL",
    // Başlık yerel olarak kategori çıkarımında kullanılıyordu ama payload'a
    // HİÇ konulmuyordu — üretimde 530 extension ilanının hiçbirinde başlık
    // yoktu. Rafinerinin hisseli/kooperatif tespiti bu metne bakıyor.
    baslik: ilan.baslik ?? undefined,
    tapu_durumu: ilan.tapuDurumu ?? undefined,
    lat,
    lng,
    koord_kaynagi: lat != null ? koordKaynagi : undefined,
  };
}

/** Çoklu ilan — kurulamayanlar sayılır, sessizce kaybolmaz. */
export function ilanPayloadlariKur(ilanlar: IlanBilgisi[]): {
  payloadlar: IlanPayload[];
  atlanan: number;
} {
  const payloadlar: IlanPayload[] = [];
  let atlanan = 0;
  for (const ilan of ilanlar) {
    const p = ilanPayloadKur(ilan);
    if (p) payloadlar.push(p);
    else atlanan++;
  }
  return { payloadlar, atlanan };
}
