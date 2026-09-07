/**
 * AJAN & RAG ENVANTERİ — hangi modül bağlı, hangisi değil.
 *
 * NEDEN BU TEST VAR: repoda 1.754 satırlık bir ajan + RAG altyapısı sessizce
 * büyüdü ve TAMAMI bağlanmamıştı. Testleri vardı, üretimde sıfır çağrısı.
 * Kimse fark etmedi çünkü ölü kod hata vermez — sadece bakım borcu ve
 * "sistemimiz var" yanılsaması üretir.
 *
 * Bu test bir DURUM KAYDIDIR, kalite kapısı değil. Bir modülün bağlılık
 * durumu değişince kırılır ve o an bilinçli bir karar verilmesini zorlar:
 *   - Yeni modül bağlandı  → listeyi güncelle, güzel
 *   - Bağlı modül koptu    → regresyon, incele
 *   - Yeni ölü modül geldi → gerçekten gerekli mi?
 *
 * "Bağlı" tanımı: `src/` altında, ajan/rag klasörleri DIŞINDAN import
 * ediliyor ve o import zinciri bir üretim yüzeyine ulaşıyor. Yalnızca
 * testlerden import edilmek BAĞLI SAYILMAZ — test, kodu canlı tutmaz.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
/**
 * Yol ayiricisi. Regex ile normalize etmek denendi ve arac zincirinde kacis
 * belirsizligi uretti (ters bolu, heredoc ve TS arasinda uc kez cozuluyor) —
 * split/join belirsizlik birakmiyor.
 */
const SEP = "\\";

/**
 * 2026-09-07 kararı. Her satır bir modülün DURUMU ve gerekçesi.
 *
 * bagli:  üretim yolundan çağrılıyor
 * beklet: bağlanabilir ama önce bir şey gerekiyor — sebep yazılı
 */
const DURUM: Record<string, { durum: "bagli" | "beklet"; neden: string }> = {
  // ── Bağlı ────────────────────────────────────────────────────────────────
  "ajanlar/hukuk-imar-ajani": {
    durum: "bagli",
    neden: "fiyat/hukuk-kisitlari.ts üzerinden fiyatTahminEt'e bağlandı (A2). " +
      "Deterministik, mevzuat atıflı, fiyata dokunmuyor.",
  },
  "rag/mevzuat-knowledge-base": {
    durum: "bagli",
    neden: "hukuk-imar-ajani'nin bilgi tabanı. 7 madde — genişletilmesi R2.",
  },
  "rag/types": {
    durum: "bagli",
    neden: "Mevzuat ve ajan sözleşmelerinin tip tanımları; hukuk zinciri üzerinden motora bağlı.",
  },
  "ajanlar/ajan-tipleri": {
    durum: "bagli",
    neden: "Hukuk ajanının girdi/çıktı sözleşmesi; köprü bu tipleri kullanıyor.",
  },

  // ── Beklet ───────────────────────────────────────────────────────────────
  "ajanlar/firsat-avcisi-ajani": {
    durum: "beklet",
    neden: "İlan fiyatı ile motor tahminini kıyaslıyor. Motorun elinde ilan " +
      "fiyatı YOK (kullanıcı parsele bakıyor). Uzantının ilan sayfası " +
      "bağlamında anlamlı — o yüzey açılınca bağlanır.",
  },
  "ajanlar/kullanici-firsat-tarayici": {
    durum: "beklet",
    neden: "firsat-alarm-motoru ve kurumsal rapor kullanıyor ama o ikisi de " +
      "hiçbir yerden çağrılmıyor. Zincirin tamamı bildirim yüzeyine bağlı.",
  },
  "ajanlar/multi-agent-orkestrator": {
    durum: "beklet",
    neden: "Ajanları birleştirip sentez üretiyor. Tek bağlı ajan varken " +
      "orkestrasyon erken — ikinci ajan bağlanınca değerlenir.",
  },
  "ajanlar/debate-protokolu": {
    durum: "beklet",
    neden: "Ajanlar arası çelişki çözümü. Orkestratöre bağlı.",
  },
  "ajanlar/teyit-asistani": {
    durum: "beklet",
    neden: "Kullanıcı teyidi akışı; karşılık gelen yüzey yok.",
  },
  "rag/citation-grounding": {
    durum: "beklet",
    neden: "Atıf doğrulama. LLM sentezi (A4) devreye girmeden gereksiz — " +
      "deterministik ajan zaten kanun numarasını kendi taşıyor.",
  },
  "rag/spatial-rag": {
    durum: "bagli",
    neden: "BEKLENMEDİK — `mevzuat-knowledge-base` store'unu SpatialRagStore " +
      "üzerine kuruyor, dolayısıyla hukuk zinciriyle birlikte motora bağlı. " +
      "Bu testin ilk koşumunda ortaya çıktı; 'ölü' varsayımım yanlıştı. " +
      "Not: ölçüldü, RAG'in fiyat TAHMİNİNE katkısı yok; buradaki rolü " +
      "mevzuat maddelerinin aranması.",
  },
  "rag/embedding-service": {
    durum: "bagli",
    neden: "spatial-rag'in bağımlılığı olduğu için o zincirle birlikte canlı. " +
      "DİKKAT: yerel hash embedding semantik değil, karakter n-gram " +
      "benzerliği. 7 maddelik bir KB'de yeterli; KB büyürse (R2) gerçek " +
      "embedding'e geçilmeli ve bu geri çağırma isabetiyle ölçülmeli (R3).",
  },
  "rag/corrective-rag": {
    durum: "beklet",
    neden: "spatial-rag zincirine bağlı; o devreye girmeden tek başına anlamsız.",
  },
  "rag/knowledge-graph": {
    durum: "beklet",
    neden: "Hiçbir yerden çağrılmıyor ve hangi soruyu cevapladığı belirsiz — bağlamadan önce kullanım senaryosu yazılmalı.",
  },
  "rag/semantic-cache": {
    durum: "beklet",
    neden: "LLM çağrısı olmadan önbelleklenecek bir şey yok. A4 ile anlamlanır.",
  },
};

/**
 * "BAĞLI" TANIMI — fiyat motorundan TRANSİTİF olarak ulaşılabilir olmak.
 *
 * İlk yazımda tanım "src/ altından import ediliyor" idi ve iki yönden
 * yanlıştı:
 *   - `mevzuat-knowledge-base` yalnızca `hukuk-imar-ajani`den import ediliyor
 *     (aynı ada içinde) ama o ajan motora bağlı — yani DOLAYLI bağlı.
 *   - `kullanici-firsat-tarayici` src/ altından import ediliyor ama import
 *     edenler (`firsat-alarm-motoru`, `kurumsal-ekspertiz-raporu`) da ölü.
 *     Ölü koddan import edilmek, canlı olmak değildir.
 *
 * Doğru tanım: canlı bir kökten başlayan import kapanışında olmak. Kök
 * `fiyat-tahmin.ts` — motorun giriş noktası, üretimde kesinlikle çalışıyor.
 *
 * KAPSAM SINIRI, dürüstçe: bu test yalnızca FİYAT MOTORU zincirini ölçüyor.
 * Bir modül mount edilmiş bir UI'dan çağrılıyor ama motordan çağrılmıyorsa
 * burada "bağlı değil" görünür. Şu an mount edilmiş hiçbir ajan/RAG UI'ı
 * olmadığı için fark yok; olursa bu tanım genişletilmeli.
 */
const KOK = "src/lib/fiyat-tahmin.ts";

function importlariCikar(icerik: string): string[] {
  const yollar: string[] = [];
  for (const m of icerik.matchAll(/from\s+["']([^"']+)["']/g)) yollar.push(m[1]!);
  return yollar;
}

/** Göreli import yolunu repo köküne göre normalize eder. */
function cozumle(kaynakDosya: string, importYolu: string): string | null {
  if (!importYolu.startsWith(".")) return null;
  const parcalar = kaynakDosya.split("/").slice(0, -1);
  for (const p of importYolu.split("/")) {
    if (p === ".") continue;
    else if (p === "..") parcalar.pop();
    else parcalar.push(p);
  }
  return parcalar.join("/");
}

/** Kökten ulaşılabilir tüm src/ modüllerinin kümesi. */
function canliKapanis(): Set<string> {
  const gorulen = new Set<string>();
  const kuyruk = [KOK];
  while (kuyruk.length > 0) {
    const dosya = kuyruk.pop()!;
    if (gorulen.has(dosya)) continue;
    gorulen.add(dosya);
    for (const uzanti of ["", ".ts", ".tsx", "/index.ts"]) {
      const tam = join(ROOT, dosya + uzanti);
      let icerik: string;
      try { icerik = readFileSync(tam, "utf8"); } catch { continue; }
      for (const imp of importlariCikar(icerik)) {
        const c = cozumle(dosya + uzanti, imp);
        if (c && c.startsWith("src/")) kuyruk.push(c);
      }
      break;
    }
  }
  return gorulen;
}

const KAPANIS = canliKapanis();

function uretimdenImportEdiliyorMu(modul: string): boolean {
  return KAPANIS.has(`src/lib/${modul}`);
}

describe("ajan & RAG envanteri", () => {
  it("her modülün bir durum kaydı var — sessizce yeni ölü kod eklenemez", () => {
    const modules: string[] = [];
    for (const klasor of ["ajanlar", "rag"]) {
      for (const dosya of readdirSync(join(ROOT, "src/lib", klasor))) {
        if (dosya.endsWith(".ts")) modules.push(`${klasor}/${dosya.replace(/\.ts$/, "")}`);
      }
    }
    for (const m of modules) {
      expect(DURUM[m], `${m} için durum kaydı yok — AJAN-RAG-DURUMU'na ekleyin`).toBeDefined();
    }
  });

  it("'bagli' işaretli modüller GERÇEKTEN üretimden çağrılıyor", () => {
    for (const [m, k] of Object.entries(DURUM)) {
      if (k.durum !== "bagli") continue;
      expect(uretimdenImportEdiliyorMu(m), `${m} 'bagli' işaretli ama üretimden import edilmiyor`).toBe(true);
    }
  });

  /**
   * Bu testin ASIL değeri burada: bir "beklet" modülü sessizce bağlanırsa
   * (ya da tersi) kırılır ve kararın güncellenmesini zorlar.
   */
  it("'beklet' işaretli modüller hâlâ bağlı değil", () => {
    for (const [m, k] of Object.entries(DURUM)) {
      if (k.durum !== "beklet") continue;
      expect(
        uretimdenImportEdiliyorMu(m),
        `${m} artık üretimden import ediliyor — durumu 'bagli' yapın ve gerekçeyi güncelleyin`,
      ).toBe(false);
    }
  });

  it("her 'beklet' kaydının gerekçesi var — 'sonra bakarız' yasak", () => {
    for (const [m, k] of Object.entries(DURUM)) {
      expect(k.neden.length, `${m} gerekçesi çok kısa`).toBeGreaterThan(40);
    }
  });
});
