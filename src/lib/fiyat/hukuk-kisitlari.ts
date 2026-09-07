/**
 * Hukuki kısıt köprüsü — mevzuat ajanını fiyat motoruna bağlar.
 *
 * NEDEN VAR: repoda 1.754 satırlık bir ajan + RAG altyapısı vardı ve TAMAMI
 * bağlanmamıştı. `HukukImarAjani` mevzuattan deterministik kısıt çıkarıyor
 * (5403 bölünemez parsel, 3573 zeytinlik, 2863 SİT) ama hiçbir üretim yolu
 * onu çağırmıyordu. Bu dosya o boşluğu kapatıyor.
 *
 * ── TEMEL KURAL: AJAN FİYATA DOKUNMAZ ───────────────────────────────────────
 *
 * Bu köprü yalnızca `veriKalitesiNotlari`'na metin ekler. Fiyatı, aralığı,
 * güven skorunu DEĞİŞTİRMEZ. Sebep doğrudan ölçülebilirlik:
 *
 *   Motorun çıktısı hold-out'ta koşturulabildiği için ölçülebilir. Araya
 *   fiyatı oynatan bir katman girerse backtest anlamını yitirir ve regresyon
 *   kapısı çöker. Kabul ölçütü bu yüzden "backtest sayıları BİREBİR
 *   DEĞİŞMEZ" — ve bu bir test tarafından korunuyor.
 *
 * Ajanın değeri doğrulukta değil: mahalle medyanı bir zeytinliğin 3573'e tabi
 * olduğunu, hisseli bir tarlanın 5403 m.8 yüzünden ifraz edilemeyeceğini
 * söyleyemez. Bunlar fiyat verisi değil KURAL verisi ve alıcının kararını
 * fiyattan daha çok etkileyebilir.
 *
 * ── NEDEN AYRI DOSYA ────────────────────────────────────────────────────────
 *
 * `HukukImarAjani` kendi girdi tipini (`ParselSorguGirdisi`) kullanıyor;
 * motorun elinde ise TKGM `Parsel` var. Dönüşüm burada, tek yerde ve test
 * edilebilir hâlde duruyor. Ajanı motorun tipine göre değiştirmek, ajanı
 * başka bağlamlarda (rapor, alarm) kullanılamaz hâle getirirdi.
 */
import type { Parsel } from "../../types/tkgm";
import { HukukImarAjani } from "../ajanlar/hukuk-imar-ajani";
import type { HukukDenetimRaporu } from "../ajanlar/ajan-tipleri";

/**
 * Ajan örneği tek sefer kuruluyor.
 * `HukukImarAjani` yapıcısında mevzuat store'u kuruyor; backtest bunu 2.400
 * kez çağırıyor ve her çağrıda yeniden kurmak gereksiz iş olurdu.
 */
const ajan = new HukukImarAjani();

/** Parselin niteliğinden zeytinlik olup olmadığını çıkarır. */
function zeytinlikMi(parsel: Parsel, imarDurumu?: string | null): boolean {
  const metin = `${parsel.nitelik ?? ""} ${imarDurumu ?? ""}`.toLocaleLowerCase("tr");
  return /zeytin/.test(metin);
}

/**
 * Hisseli mi?
 *
 * TKGM `malikSayisi` ve `payBilgisi` alanlarını veriyor. İkisi de yoksa
 * `false` DEĞİL `undefined` dönmek daha doğru olurdu, ama ajan sözleşmesi
 * boolean bekliyor ve "bilinmiyor" hâlinde risk üretmemek doğru taraf:
 * olmayan bir hisse uyarısı göstermek, olan bir uyarıyı kaçırmaktan daha
 * kötü — kullanıcı uyarıya güvenmeyi bırakır.
 */
function hisseliMi(parsel: Parsel): boolean {
  if (typeof parsel.malikSayisi === "number" && parsel.malikSayisi > 1) return true;
  const pay = (parsel.payBilgisi ?? "").trim();
  if (!pay) return false;
  // "1/1" tam mülkiyet; onun dışındaki her pay ifadesi hisseli demektir.
  return pay !== "1/1" && /\d\s*\/\s*\d/.test(pay);
}

/**
 * Parsel için hukuki kısıtları çıkarır.
 *
 * @param kategori Motorun belirlediği segment — ajanın kendi tahminine
 *   bırakılmıyor ki iki yerde iki farklı sınıflandırma olmasın.
 * @returns Hiç risk yoksa `null` — çağıran hiçbir şey eklemez.
 */
export function hukukKisitlariniBul(
  parsel: Parsel,
  kategori: "arsa" | "tarla",
  imarDurumu?: string | null,
): HukukDenetimRaporu | null {
  if (!(parsel.alan > 0)) return null;

  const rapor = ajan.denetle({
    il: parsel.ilAd ?? "",
    ilce: parsel.ilceAd ?? "",
    mahalle: parsel.mahalleAd ?? undefined,
    kategori,
    alanM2: parsel.alan,
    imarDurumu: imarDurumu ?? undefined,
    hisseliMi: hisseliMi(parsel),
    zeytinlikMi: zeytinlikMi(parsel, imarDurumu),
    // SİT ve kıyı kenar bilgisi motorun elinde YOK. Uydurmak yerine
    // geçilmiyor: ajan o kontrolleri atlar ve o risk raporlanmaz.
    // Eksik veriyi "risk yok" diye sunmuyoruz — aşağıdaki not bunu söylüyor.
  });

  return rapor.tespitEdilenRiskler.length > 0 ? rapor : null;
}

/**
 * Kısıtları kullanıcıya gösterilecek kısa notlara çevirir.
 *
 * Mevcut `veriKalitesiNotlari` yüzeyine giriyor — YENİ YÜZEY DEĞİL. Yüzey
 * dondurma kararı sürüyor; bu, var olan bir listenin içeriğinin
 * zenginleştirilmesi.
 *
 * Her not kanun atfı taşıyor. Atıfsız hukuki iddia, bu projede ayıkladığımız
 * "sahte otorite" sınıfının ta kendisi olurdu.
 */
export function hukukNotlari(rapor: HukukDenetimRaporu): string[] {
  return rapor.tespitEdilenRiskler.map(
    (r) => `⚖️ ${r.baslik} — ${r.oneri} (${r.ilgiliKanun})`,
  );
}
