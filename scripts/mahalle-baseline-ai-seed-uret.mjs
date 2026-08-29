#!/usr/bin/env node
/**
 * mahalle_baseline_ai seed SQL üreteci.
 *
 * NEDEN: `mahalle_baseline_ai` üretimde 0 satır. Tabloyu yalnızca
 * `routes/seed.ts` dolduruyor ve o endpoint hiç çalıştırılmamış. Sonuç olarak
 * dört ayrı fallback yolu ölü:
 *   routes/fiyat.ts:53   mahalle sorgusu — ilan yoksa 404 dönüyor
 *   routes/fiyat.ts:111  ilçe sorgusu    — ilçe ortalaması hesaplanamıyor
 *   routes/fiyat.ts:174, :234
 * Ayrıca index.ts:533 ve scraper.ts:205 "ilk run" ilçe seçimini bu tablodan
 * yapmaya çalışıyor.
 *
 * KAYNAK ve KALİTE UYARISI: veriler src/lib/data/mahalle-baseline.ts'ten
 * geliyor. O tablonun kendi başlığındaki dağılım: 65.925 mahallenin
 * 1.371'i gerçek scrape, 38.786'sı KNN interpolasyonu, 21.471'i kırsal
 * sezgisel. Yani çoğunluk ÖLÇÜM DEĞİL, TAHMİN. Bu yüzden:
 *   - her satır kendi `guven` değeriyle (0-100) yazılıyor, düzleştirilmiyor
 *   - `kaynak` alanı 'statik-baseline' olarak dürüstçe etiketleniyor
 *     ('ai' veya 'scrape' DEĞİL — tüketici ayırt edebilsin)
 * API bu tabloyu yalnızca gerçek ilan istatistiği YOKKEN kullanıyor, yani
 * alternatif 404. Extension zaten aynı tabloyu çevrimdışı kullanıyor;
 * bu seed siteye o pariteyi veriyor, üstelik güven etiketiyle.
 *
 * Kullanım:
 *   node scripts/mahalle-baseline-ai-seed-uret.mjs > scripts/mahalle-baseline-ai-seed.sql
 *   cd backend/api && npx wrangler d1 execute cadastrum-db --remote \
 *     --file ../../scripts/mahalle-baseline-ai-seed.sql
 *
 * UYGULAMA NOTU: dosya ~17MB ve wrangler bu boyutta ara sıra {"D1_RESET_DO"}
 * hatası veriyor. Parçalayarak uygularken DİKKAT: dosyanın ilk INSERT'ü baştaki
 * yorum bloğuyla aynı parçada olduğundan, statement'ları `startsWith('INSERT')`
 * ile filtrelemek ilk statement'ı (500 satır) sessizce düşürür. Bölerken
 * `indexOf('INSERT INTO')` ile başla. Seed idempotent (ON CONFLICT DO UPDATE),
 * şüphe hâlinde yeniden uygulanabilir; doğrulama için beklenen satır sayısı
 * script'in stderr çıktısında yazıyor.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KAYNAK = join(ROOT, "src/lib/data/mahalle-baseline.ts");

const metin = readFileSync(KAYNAK, "utf8");
const ISARET = "MAHALLE_BASELINE: Readonly<Record<string, MahalleBaselineTuple>> = ";
const basla = metin.indexOf(ISARET);
if (basla === -1) throw new Error("MAHALLE_BASELINE bulunamadı");
const govde = metin.slice(basla + ISARET.length);
// Nesne bildirimi `};` ile kapanıyor. lastIndexOf("}") KULLANMA — dosyada
// nesneden sonra yardımcı fonksiyonlar var ve onların kapanış parantezlerini
// yakalayıp JSON.parse'ı patlatıyor.
const son = govde.indexOf("};");
if (son === -1) throw new Error("MAHALLE_BASELINE nesnesinin sonu bulunamadı");
const tablo = JSON.parse(govde.slice(0, son + 1));

// Tuple: [arsaTlm2, arsaGuven, konutTlm2, konutGuven, tarlaTlm2, tarlaGuven]
const SEGMENTLER = [
  { kategori: "arsa", fiyatIdx: 0, guvenIdx: 1 },
  { kategori: "konut", fiyatIdx: 2, guvenIdx: 3 },
  { kategori: "tarla", fiyatIdx: 4, guvenIdx: 5 },
];

const PARTI = 500;
const YAKALANDI = Date.now();

const satirlar = [];
let atlanan = 0;
for (const [anahtar, tuple] of Object.entries(tablo)) {
  const parcalar = anahtar.split("__");
  if (parcalar.length !== 3) { atlanan++; continue; }
  const [il, ilce, mahalle] = parcalar;
  if (!il || !ilce || !mahalle) { atlanan++; continue; }

  for (const s of SEGMENTLER) {
    const tlm2 = tuple[s.fiyatIdx];
    const guven = tuple[s.guvenIdx];
    // 0 → "bu segment için veri yok" (tablonun kendi konvansiyonu).
    if (!tlm2 || tlm2 <= 0) continue;
    const q = (v) => String(v).replace(/'/g, "''");
    satirlar.push(
      `('${q(il)}', '${q(ilce)}', '${q(mahalle)}', '${s.kategori}', ` +
        `${Math.round(tlm2)}, ${Math.round(guven) || 0}, 'statik-baseline', ${YAKALANDI})`,
    );
  }
}

const out = [];
out.push("-- Otomatik üretildi: scripts/mahalle-baseline-ai-seed-uret.mjs");
out.push(`-- Kaynak: src/lib/data/mahalle-baseline.ts (${Object.keys(tablo).length} mahalle)`);
out.push(`-- ${satirlar.length} satır, ${atlanan} bozuk anahtar atlandı.`);
out.push("-- kaynak='statik-baseline' — çoğunluğu KNN/kırsal tahmin, ölçüm DEĞİL.");
out.push("");
for (let i = 0; i < satirlar.length; i += PARTI) {
  out.push(
    "INSERT INTO mahalle_baseline_ai\n" +
      "  (il_norm, ilce_norm, mahalle_norm, kategori, tlm2, guven, kaynak, yakalandi)\n" +
      "VALUES\n  " +
      satirlar.slice(i, i + PARTI).join(",\n  ") +
      "\nON CONFLICT(il_norm, ilce_norm, mahalle_norm, kategori) DO UPDATE SET\n" +
      "  tlm2 = excluded.tlm2, guven = excluded.guven,\n" +
      "  kaynak = excluded.kaynak, yakalandi = excluded.yakalandi;",
  );
  out.push("");
}

process.stderr.write(`${satirlar.length} satır üretildi (${atlanan} atlandı)\n`);
process.stdout.write(out.join("\n"));
