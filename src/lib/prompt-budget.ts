/**
 * Prompt Token Budget Yöneticisi
 *
 * Gemini 2.5 Flash context window: 1,048,576 token
 * Güvenli çalışma penceresi: 100,000 token (gerçekte 8-10K yeterli)
 *
 * Hedef: Prompt hiçbir zaman MODEL_LIMIT'i aşmasın.
 * Strateji:
 *   1. Sabit bölümler (sistem promptu, parsel verisi) önce ayrılır → REZERV
 *   2. Dinamik bölümler (emsal listesi, geçmiş) kalan bütçeye sığdırılır
 *   3. Sığmayanlar öncelik sırasına göre kırpılır (en pahalı önce)
 *
 * Token tahmini: tiktoken olmadan yaklaşık hesap.
 *   Türkçe metin için 1 token ≈ 3.5 karakter (GPT/Gemini tokenizer ortalaması)
 *   Güvenli taraf → 3 karakter/token kullan (hafif aşım payı)
 *
 * Kullanım:
 *   const budget = new PromptBudget(MAX_TOKENS);
 *   budget.rezervEt("sistem", sistem.length);
 *   budget.rezervEt("parsel", parselBlok.length);
 *   const kesik = budget.kirp(emsalListesi, (e) => e.satir, MAX_EMSAL);
 *   const finalPrompt = [sistem, parselBlok, kesik.join("\n")].join("\n\n");
 */

// ── Sabitler ──────────────────────────────────────────────────────────────────

/** Kullanılan modellerin minimum context window'u (Gemini 2.5 Flash = 1M, Groq Llama = 128K) */
export const MODEL_TOKEN_LIMIT = 100_000;

/** Güvenlik payı — tahmin hatası + sistem overhead için */
const GUVENLIK_PAYI = 500;

/** Türkçe metin için karakter/token oranı (tutucu tahmin) */
const KARAKTER_PER_TOKEN = 3;

// ── Yardımcılar ───────────────────────────────────────────────────────────────

/** Metin uzunluğundan yaklaşık token sayısı tahmin eder */
export function tokenTahmin(metin: string): number {
  return Math.ceil(metin.length / KARAKTER_PER_TOKEN);
}

/** Token sayısından yaklaşık karakter sınırı */
export function tokendenKarakter(token: number): number {
  return token * KARAKTER_PER_TOKEN;
}

// ── PromptBudget sınıfı ───────────────────────────────────────────────────────

export class PromptBudget {
  private toplam: number;
  private kullanilan = 0;

  constructor(tokenLimit = MODEL_TOKEN_LIMIT) {
    this.toplam = tokenLimit - GUVENLIK_PAYI;
  }

  /** Sabit bir bölüm için token ayır. Bütçe aşılırsa hata fırlatır. */
  rezervEt(etiket: string, metin: string): void {
    const token = tokenTahmin(metin);
    if (this.kullanilan + token > this.toplam) {
      throw new Error(
        `PromptBudget: "${etiket}" için yeterli bütçe yok ` +
        `(gerekli=${token}, kalan=${this.kalan()})`,
      );
    }
    this.kullanilan += token;
  }

  /** Kalan token bütçesi */
  kalan(): number {
    return Math.max(0, this.toplam - this.kullanilan);
  }

  /** Kalan bütçe yüzdesi (0-100) */
  kalanYuzde(): number {
    return Math.round((this.kalan() / this.toplam) * 100);
  }

  /**
   * Dinamik bir liste öğelerini bütçeye sığacak kadar kırpar.
   *
   * @param ogeler      Kırpılacak öğe listesi
   * @param metinAl     Öğeyi string'e çeviren fonksiyon
   * @param maxAdet     Mutlak maksimum öğe sayısı (bütçeden bağımsız üst limit)
   * @returns           Sığan öğeler (önce gelenler öncelikli)
   */
  kirp<T>(
    ogeler: T[],
    metinAl: (o: T) => string,
    maxAdet = Infinity,
  ): T[] {
    const sonuc: T[] = [];
    let tokenHarcanan = 0;
    const limit = Math.min(ogeler.length, maxAdet);

    for (let i = 0; i < limit; i++) {
      const metin = metinAl(ogeler[i]!);
      const token = tokenTahmin(metin) + 2; // +2 newline separator
      if (tokenHarcanan + token > this.kalan()) break;
      sonuc.push(ogeler[i]!);
      tokenHarcanan += token;
    }

    this.kullanilan += tokenHarcanan;
    return sonuc;
  }

  /**
   * Bir metni kalan bütçeye göre kırpar.
   * Sonunda "… (kısaltıldı)" ekler.
   */
  kirpMetin(metin: string, ayrac = "\n… (kısaltıldı)"): string {
    const limitKarakter = tokendenKarakter(this.kalan()) - ayrac.length;
    if (metin.length <= limitKarakter) {
      this.kullanilan += tokenTahmin(metin);
      return metin;
    }
    const kesik = metin.slice(0, Math.max(0, limitKarakter)) + ayrac;
    this.kullanilan += tokenTahmin(kesik);
    return kesik;
  }
}

// ── Sohbet geçmişi sliding window ────────────────────────────────────────────

export interface SohbetMesaj {
  rol: "kullanici" | "asistan" | "sistem";
  icerik: string;
}

/**
 * Sohbet geçmişini token bütçesine sığacak şekilde kırpar.
 *
 * Strateji:
 *   - En son mesajlar korunur (LIFO — son konuşma en kritik)
 *   - Sistem mesajı her zaman korunur (ilk mesaj = sistem promptu)
 *   - Aradaki eski mesajlar atılır
 *
 * @param gecmis        Tüm sohbet geçmişi (kronolojik sıra)
 * @param tokenBudget   Geçmişe ayrılabilen maksimum token
 * @param sistemPrompt  Sistem promptu metni (her zaman korunur)
 * @returns             Token sınırına sığan kısaltılmış geçmiş
 */
export function gecmisKirp(
  gecmis: SohbetMesaj[],
  tokenBudget: number,
  sistemPrompt = "",
): SohbetMesaj[] {
  if (gecmis.length === 0) return [];

  const sistemToken = tokenTahmin(sistemPrompt);
  let kalanBudget = tokenBudget - sistemToken - GUVENLIK_PAYI;
  if (kalanBudget <= 0) return [];

  // Sistem mesajlarını ayır
  const sistemMesajlar = gecmis.filter((m) => m.rol === "sistem");
  const normal = gecmis.filter((m) => m.rol !== "sistem");

  // Sistem mesajlarını dahil et (her zaman)
  const sonuc: SohbetMesaj[] = [...sistemMesajlar];
  for (const m of sistemMesajlar) {
    kalanBudget -= tokenTahmin(m.icerik);
  }

  // En son mesajdan geriye doğru ekle
  const secilen: SohbetMesaj[] = [];
  for (let i = normal.length - 1; i >= 0; i--) {
    const m = normal[i]!;
    const token = tokenTahmin(m.icerik) + 5; // role overhead
    if (kalanBudget - token < 0) break;
    secilen.unshift(m);
    kalanBudget -= token;
  }

  return [...sonuc, ...secilen];
}

// ── Emsal listesi formatlayıcı ────────────────────────────────────────────────

export interface EmsalSatir {
  fiyatPerM2: number;
  alan: number;
  benzerlik: number;
  tazelikGun: number;
  ilanNo: string | number;
}

/**
 * Emsal listesini token bütçesine sığacak şekilde formatlar.
 * Budget yoksa boş string döner.
 */
export function emsalleriBudgetlaFormatla(
  emsaller: EmsalSatir[],
  budget: PromptBudget,
  maxAdet = 10,
): string {
  if (emsaller.length === 0) return "Bölgede taze emsal bulunamadı.";

  const satirUret = (e: EmsalSatir, i: number) =>
    `${i + 1}. ${e.fiyatPerM2.toLocaleString("tr-TR")} TL/m² | ` +
    `Alan: ${e.alan}m² | ` +
    `Benzerlik: %${Math.round(e.benzerlik * 100)} | ` +
    `Yaş: ${e.tazelikGun} gün | ` +
    `No: ${e.ilanNo}`;

  const secilen = budget.kirp(
    emsaller.slice(0, maxAdet),
    (e) => satirUret(e, 0), // boyut tahmini için
    maxAdet,
  );

  if (secilen.length === 0) return "Token bütçesi doldu — emsal gösterilemiyor.";
  if (secilen.length < emsaller.length) {
    return secilen.map((e, i) => satirUret(e, i)).join("\n") +
      `\n… (${emsaller.length - secilen.length} emsal token sınırı nedeniyle atlandı)`;
  }

  return secilen.map((e, i) => satirUret(e, i)).join("\n");
}
