/**
 * Agent Guardrail Katmanı
 *
 * Hem giriş (input) hem çıkış (output) için güvenlik filtresi.
 *
 * Kontroller:
 *   INPUT:
 *     - Prompt injection tespiti (rolü değiştirmeye çalışan ifadeler)
 *     - PII tespiti (TC kimlik, telefon, IBAN, kredi kartı)
 *     - Konu dışı içerik (gayrimenkul dışı konular)
 *     - Aşırı uzun input (DoS koruması)
 *
 *   OUTPUT:
 *     - Sayısal tutarlılık (alt ≤ beklenen ≤ üst)
 *     - Hallüsinasyon işareti (uydurma kaynak/tarih kalıpları)
 *     - Disclaimer varlığı kontrolü
 *     - PII sızması kontrolü (AI yanlışlıkla PII tekrarlıyor mu)
 */

// ── Tipler ────────────────────────────────────────────────────────────────────

export type GuardrailSeverity = "block" | "warn" | "ok";

export interface GuardrailSonuc {
  gecti: boolean;
  severity: GuardrailSeverity;
  nedenler: string[];
  /** Temizlenmiş metin (PII maskelenmiş, injection kaldırılmış) */
  temizMetin: string;
}

// ── Sabitler ──────────────────────────────────────────────────────────────────

/** Prompt injection kalıpları */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /forget\s+(everything|all|your|the)\s+(above|previous|instructions?)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /\bDAN\b/,                              // "Do Anything Now" jailbreak
  /\bact\s+as\s+(a|an)\b/i,
  /sistem\s+prompt[u']?[nu]?\s+(unut|değiştir|ignore)/i,
  /önceki\s+(tüm\s+)?(talimatları|promptu)\s+(unut|görmezden)/i,
  /roleplay|rol\s+yap/i,
  /<\s*script\s*>/i,
  /```\s*system/i,
  /\[INST\]|\[\/INST\]/,                  // Llama format injection
];

/** PII kalıpları */
const PII_PATTERNS: Array<{ re: RegExp; etiket: string; mask: string }> = [
  { re: /\b[1-9]\d{10}\b/g,                                    etiket: "TC kimlik", mask: "[TC-KİMLİK]" },
  { re: /\b(0[2-9]\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})\b/g, etiket: "Telefon",   mask: "[TELEFON]" },
  { re: /\bTR\d{2}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{4}[\s]?\d{2}\b/gi, etiket: "IBAN", mask: "[IBAN]" },
  { re: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,        etiket: "Kart No",   mask: "[KART-NO]" },
  { re: /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/g,                      etiket: "E-posta",   mask: "[E-POSTA]" },
];

/** Konu dışı tetikleyiciler — bu kelimeleri içeren mesajlar uyarı alır */
const KONU_DISI_PATTERNS = [
  /\b(hava durumu|tarif|yemek|film|müzik|şarkı|oyun|spor|siyaset|seçim|cumhurbaşkan)\b/i,
  /\b(write\s+(me\s+)?a\s+(poem|story|code)|tell\s+me\s+a\s+joke)\b/i,
  /\b(kod\s+yaz|program\s+yaz|şiir\s+yaz|hikaye\s+anlat)\b/i,
];

/** Output hallüsinasyon işaretleri */
const HALLUSINASYON_PATTERNS = [
  /kaynak:\s*(https?:\/\/[^\s]+)/gi,      // Uydurma URL kaynak
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,       // ISO tarih (AI bazen uydurur)
  /\bResmi Gazete\b.*\bsayı\b.*\d{4,}/i, // Uydurma resmi gazete referansı
  /\bTCMB karar\b.*\b\d{4}\b/i,
];

// ── Input guardrail ───────────────────────────────────────────────────────────

/**
 * Kullanıcı girdisini tarar.
 * @returns gecti=false → isteği reddet; gecti=true → devam et (temizMetin ile)
 */
export function inputGuardrail(mesaj: string): GuardrailSonuc {
  const nedenler: string[] = [];
  let temizMetin = mesaj;

  // 1. Aşırı uzun mesaj (DoS)
  if (mesaj.length > 2000) {
    return {
      gecti: false,
      severity: "block",
      nedenler: ["Mesaj çok uzun (max 2000 karakter)"],
      temizMetin: mesaj.slice(0, 2000),
    };
  }

  // 2. Prompt injection
  for (const re of INJECTION_PATTERNS) {
    if (re.test(mesaj)) {
      return {
        gecti: false,
        severity: "block",
        nedenler: [`Prompt injection denemesi tespit edildi (kalıp: ${re.source.slice(0, 30)})`],
        temizMetin: "",
      };
    }
  }

  // 3. PII maskeleme (block değil, warn — sadece temizle)
  for (const { re, etiket, mask } of PII_PATTERNS) {
    if (re.test(temizMetin)) {
      temizMetin = temizMetin.replace(re, mask);
      nedenler.push(`PII tespit edildi ve maskelendi: ${etiket}`);
    }
  }

  // 4. Konu dışı (warn — engellemez, ama sistem promptuna not düşer)
  let konuDisi = false;
  for (const re of KONU_DISI_PATTERNS) {
    if (re.test(mesaj)) {
      konuDisi = true;
      nedenler.push("Konu dışı içerik tespit edildi — danışman yönlendirme yapacak");
      break;
    }
  }

  const severity: GuardrailSeverity = nedenler.length > 0 ? "warn" : "ok";
  return { gecti: true, severity, nedenler, temizMetin };
}

// ── Output guardrail ──────────────────────────────────────────────────────────

export interface OutputGuardrailSonuc {
  gecti: boolean;
  severity: GuardrailSeverity;
  nedenler: string[];
  /** Düzeltilmiş yanıt (disclaimer eklendiyse) */
  temizYanit: string;
}

/**
 * AI çıktısını tarar.
 * Sayısal tutarlılık kontrolü fiyat tahminleri için kritik.
 */
export function outputGuardrail(
  yanit: string,
  opts: {
    /** Yanıtta bulunması beklenen sayısal değer aralıkları */
    beklenenAralik?: { alt: number; beklenen: number; ust: number };
  } = {},
): OutputGuardrailSonuc {
  const nedenler: string[] = [];
  let temizYanit = yanit;

  // 1. Boş yanıt
  if (!yanit || yanit.trim().length < 10) {
    return {
      gecti: false,
      severity: "block",
      nedenler: ["AI boş veya çok kısa yanıt döndürdü"],
      temizYanit: "",
    };
  }

  // 2. PII sızması kontrolü
  for (const { re, etiket, mask } of PII_PATTERNS) {
    if (re.test(temizYanit)) {
      temizYanit = temizYanit.replace(re, mask);
      nedenler.push(`Output PII içeriyordu ve maskelendi: ${etiket}`);
    }
  }

  // 3. Hallüsinasyon işaretleri
  for (const re of HALLUSINASYON_PATTERNS) {
    if (re.test(yanit)) {
      nedenler.push(`Potansiyel hallüsinasyon işareti (kalıp: ${re.source.slice(0, 40)})`);
    }
  }

  // 4. Sayısal tutarlılık (fiyat tahmini için)
  if (opts.beklenenAralik) {
    const { alt, beklenen, ust } = opts.beklenenAralik;
    if (alt > beklenen || beklenen > ust) {
      nedenler.push(
        `Sayısal tutarsızlık: alt(${alt}) > beklenen(${beklenen}) veya beklenen(${beklenen}) > üst(${ust})`,
      );
    }
    // Aşırı sapma kontrolü (%300'den fazla)
    if (ust > alt * 4) {
      nedenler.push("Fiyat aralığı çok geniş (%300+) — güven düşük");
    }
  }

  // 5. Disclaimer varlığı — yatırım tavsiyesi içeriyorsa uyar
  const TAVSIYE_KALIPLARI = /\b(kesinlikle\s+al|şimdi\s+sat|garantili\s+getiri|risksiz\s+yatırım)\b/i;
  if (TAVSIYE_KALIPLARI.test(yanit)) {
    nedenler.push("Kesin yatırım tavsiyesi içeriyor — yanıta disclaimer eklendi");
    if (!yanit.includes("yatırım tavsiyesi değildir")) {
      temizYanit += "\n\n*Bu analiz bilgilendirme amaçlıdır; yatırım tavsiyesi değildir.*";
    }
  }

  // 6. Disclaimer yoksa ekle
  if (!temizYanit.includes("yatırım tavsiyesi değildir") &&
      !temizYanit.includes("bilgilendirme amaçlı")) {
    temizYanit += "\n\n*Bu analiz bilgilendirme amaçlıdır; yatırım tavsiyesi değildir.*";
  }

  const severity: GuardrailSeverity = nedenler.some(n => n.includes("hallüsinasyon"))
    ? "warn"
    : nedenler.length > 0
      ? "warn"
      : "ok";

  return { gecti: true, severity, nedenler, temizYanit };
}
