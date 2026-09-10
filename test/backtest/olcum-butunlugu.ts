/**
 * Ölçüm bütünlüğü kapıları — P8, P9, P11.
 *
 * ── NEDEN AYRI BİR MODÜL ────────────────────────────────────────────────────
 *
 * Bu projede en pahalıya mal olan hata sınıfı "yanlış tahmin" değil,
 * **doğru görünen yanlış ölçüm**. Üç kez yakalandı:
 *
 *   1. `mahalle_baseline_ai` "AI baseline" diye anılıyordu; AI değildi.
 *   2. `imar-json-kacis.spec.ts` tautolojikti — TypeScript kaçışı derleme
 *      anında çözdüğü için düzeltme geri alınsa bile test geçiyordu.
 *   3. `konut-engine.spec.ts` (2026-09-10) konut doğruluğunu ±%20 = 66,4
 *      raporluyordu; ölçtüğü veri `kaynak='knn-smoothing'` etiketli TÜRETİLMİŞ
 *      tablonun kendisiydi. Yani AI tablosunun ilçe medyanıyla aynı AI
 *      tablosunun mahalle değeri tahmin ediliyordu.
 *
 * Üçüncüsü doğruluk kapısının İÇİNDEYDİ ve yeşil geçiyordu. Kapının kendisi
 * bu sınıfı yakalayamıyorsa kapı değil, dekordur. Bu modül o kontrolleri
 * tek yere koyuyor ki her yeni backtest onlardan geçmek zorunda kalsın.
 */

/**
 * Bir ölçümün "gerçek" tarafının nereden geldiği.
 *
 * - `ilan`         : ilan fiyatı — dış dünyadan gelen gözlem
 * - `gercek-satis` : kullanıcının girdiği gerçekleşmiş işlem fiyatı
 * - `turetilmis`   : model / tablo / başka bir tahminci çıktısı
 *
 * `turetilmis` bir ölçüm YAPILABİLİR (tablo iç tutarlılığını görmek meşru bir
 * iştir) ama **doğruluk diye raporlanamaz ve eşik dosyasına yazılamaz.**
 */
export type GercekKaynagi = "ilan" | "gercek-satis" | "turetilmis";

/** Eşik dosyasına yazılmasına izin verilen kaynaklar (P8). */
export const OLCULEBILIR_KAYNAKLAR: readonly GercekKaynagi[] = ["ilan", "gercek-satis"];

/**
 * P9 sınırları — bunların ötesi sonuç değil, alarmdır.
 *
 * Emlak fiyat tahmininde bu aralıklar fiziksel olarak erişilemez: aynı
 * mahallede aynı gün iki benzer parsel %20-30 farkla satılıyor. Bir ölçüm
 * "tahminlerin yarısı tam isabet" diyorsa, ölçtüğü şey piyasa değildir.
 *
 * Bugünkü gerçek sayılar bu sınırların çok uzağında — yani kapı yanlış alarm
 * vermez: arsa medyanApe 39,5 · tarla 27,8; en iyi alt kova 16,0 (tarla,
 * "emsal yok", n=181); en yüksek within10 23,1.
 */
export const SIZINTI_SINIRLARI = {
  /** Bu n'in altında istatistik gürültülü; kapı çalışmaz. */
  MIN_N: 100,
  /** Medyan APE bunun altındaysa sızıntı şüphesi. */
  MEDYAN_APE_MIN: 5,
  /** ±%10 isabeti bunun üstündeyse sızıntı şüphesi. */
  WITHIN10_MAX: 50,
} as const;

/** `sizintiDenetle`'nin okuduğu asgari şekil — çağıranın tipi daha geniş olabilir. */
export interface DenetlenebilirOlcum {
  n: number;
  medyanApe: number;
  within10: number;
}

/**
 * P9 — mükemmel skor kutlanmaz, durdurulur.
 *
 * @param etiket hangi ölçüm olduğu (hata mesajında görünür)
 * @throws sızıntı şüphesi varsa
 */
export function sizintiDenetle(etiket: string, o: DenetlenebilirOlcum): void {
  if (o.n < SIZINTI_SINIRLARI.MIN_N) return;

  const sebepler: string[] = [];
  if (o.medyanApe < SIZINTI_SINIRLARI.MEDYAN_APE_MIN) {
    sebepler.push(
      `medyan APE ${o.medyanApe} < ${SIZINTI_SINIRLARI.MEDYAN_APE_MIN} ` +
      `(tahminlerin yarısı neredeyse tam isabet)`,
    );
  }
  if (o.within10 > SIZINTI_SINIRLARI.WITHIN10_MAX) {
    sebepler.push(
      `±%10 isabeti ${o.within10} > ${SIZINTI_SINIRLARI.WITHIN10_MAX}`,
    );
  }
  if (!sebepler.length) return;

  throw new Error(
    `SIZINTI ŞÜPHESİ — "${etiket}" (n=${o.n}): ${sebepler.join(", ")}.\n` +
    `Emlak fiyat tahmininde bu seviye erişilemez. Muhtemel sebep: ölçümün\n` +
    `"gerçek" tarafı bir GÖZLEM değil, modelden/tablodan TÜRETİLMİŞ değer.\n` +
    `Kontrol et: hold-out'un gerçek kolonu hangi dosyadan geliyor ve o dosyanın\n` +
    `\`kaynak\` etiketi ne? 'knn-smoothing' / 'statik-baseline' ise ölçüm\n` +
    `kendi kendini ölçüyordur (P8).\n` +
    `Sızıntı olmadığına eminsen sınırı gevşetme — ölçümü \`turetilmis\` diye\n` +
    `beyan et; o zaman eşik dosyasına yazılmaz ama rapor edilebilir.`,
  );
}

/** Eşik dosyasındaki bir segment girdisinin taşıması gereken künye (P11). */
export interface EsikKunyesi {
  gercek_kaynagi: GercekKaynagi;
  olculdu: string;
  n: number;
}

/**
 * P8 + P11 — eşik dosyasına yazılan her girdi kaynağını taşır ve o kaynak
 * ölçülebilir olmalıdır.
 *
 * NEDEN: 2026-09-10'da eşik dosyasında `konut` girdisi vardı (±%20 = 66,4) ve
 * dosyadan o sayının neyi ölçtüğü ANLAŞILMIYORDU. Künye zorunlu olsaydı
 * `gercek_kaynagi: "turetilmis"` yazılmak zorunda kalınacak ve kapı
 * reddedecekti.
 *
 * @throws künye eksikse ya da kaynak `turetilmis` ise
 */
export function esikGirdisiDogrula(segment: string, kunye: Partial<EsikKunyesi>): void {
  if (!kunye.gercek_kaynagi) {
    throw new Error(
      `EŞİK KÜNYESİZ — "${segment}" girdisinde \`gercek_kaynagi\` yok (P11).\n` +
      `Her eşik, hangi veriden çıktığını taşımak zorunda.`,
    );
  }
  if (!OLCULEBILIR_KAYNAKLAR.includes(kunye.gercek_kaynagi)) {
    throw new Error(
      `TÜRETİLMİŞ VERİ EŞİĞE YAZILAMAZ — "${segment}" ` +
      `\`gercek_kaynagi: "${kunye.gercek_kaynagi}"\` (P8).\n` +
      `Hold-out'un gerçek tarafı bir gözlem olmalı; model/tablo çıktısı\n` +
      `gerçek yerine geçemez. Ölçüm yapılabilir ama doğruluk diye\n` +
      `raporlanamaz ve regresyon kapısı olamaz.`,
    );
  }
}
