#!/usr/bin/env node
/**
 * Korpustaki BOŞ ALANLARI üretime taşı — yalnızca doldurma, asla ezme.
 *
 *   node scripts/korpus-uretime-guncelle.mjs            # rapor (dosya yazmaz)
 *   node scripts/korpus-uretime-guncelle.mjs --yaz      # SQL üret
 *
 * NEDEN AYRI BİR SCRIPT
 * `emlakjet-data-turkiye.sql` iki işi birden görüyor: üretime seed ve
 * backtest/kapsam raporunun okuduğu korpus. İkincisi `INSERT OR IGNORE ...
 * VALUES` biçimine bağlı. Ama `INSERT OR IGNORE` MEVCUT satırları hiç
 * güncellemiyor — üretimdeki ilanların neredeyse tamamı zaten kayıtlı
 * olduğundan, korpusa sonradan eklenen her kolon üretime ASLA ulaşmıyor.
 * Ölçüldü: korpusta 61.813 koordinat ve on binlerce başlık varken üretimde
 * başlık 2.258'de kalmıştı.
 *
 * Seed dosyasını `ON CONFLICT DO UPDATE`'e çevirmek denendi ve GERİ ALINDI:
 * `COALESCE(ilanlar.lat, excluded.lat)` içindeki parantezler, okuyucuların
 * satır ayrıştırıcısına sahte satır gibi görünüyor. Ölçüm hattı sessizce
 * bozulurdu. Bu yüzden güncelleme ayrı bir dosyaya çıkıyor.
 *
 * YÖN KURALI — ÜRETİM KAZANIR
 * Her UPDATE `WHERE <alan> IS NULL` ile korunuyor. Üretimde zenginleştirme
 * hattının bulduğu GERÇEK parsel koordinatı ya da detay sayfasından gelen
 * başlık, korpusun daha zayıf değeriyle (mahalle merkezi, liste başlığı)
 * EZİLMEMELİ. Bu script yalnızca boşluk dolduruyor.
 *
 * YAZMA BÜTÇESİ
 * Cloudflare ücretsiz katman: 100.000 satır yazma/gün. Script kaç satır
 * yazacağını ÖNCE söylüyor; bütçeyi aşacaksa bölerek çalıştırın
 * (--limit=N ile).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sqlKayitlariYukle } from "./emlakjet-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KORPUS = join(ROOT, "scripts/emlakjet-data-turkiye.sql");
const CIKTI = join(ROOT, "scripts/korpus-guncelle.sql");

const args = process.argv.slice(2);
const yaz = args.includes("--yaz");
const limit = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0") || null;

/** SQL string kaçışı — kesme işareti başlıklarda çok yaygın. */
const esc = (s) => String(s).replace(/'/g, "''");

if (!existsSync(KORPUS)) {
  console.error(`Korpus yok: ${KORPUS}`);
  process.exit(1);
}

const kayitlar = sqlKayitlariYukle(KORPUS);
const baslikli = kayitlar.filter((k) => k.baslik);
const koordlu = kayitlar.filter((k) => k.lat != null);

console.log(`Korpus: ${kayitlar.length} ilan`);
console.log(`  başlıklı  : ${baslikli.length} (%${((100 * baslikli.length) / kayitlar.length).toFixed(1)})`);
console.log(`  koordinatlı: ${koordlu.length} (%${((100 * koordlu.length) / kayitlar.length).toFixed(1)})`);

/**
 * Yazılacak satırlar: en az bir doldurulabilir alanı olanlar.
 *
 * Üretimde o alanın dolu olup olmadığını BURADAN bilemiyoruz (D1 sorgusu
 * okuma bütçesi yer). Bunun yerine koruma SQL'in kendisinde: `WHERE ... IS
 * NULL`. Yani gereksiz UPDATE'ler 0 satır etkiler, yazma sayılmaz.
 */
const adaylar = kayitlar.filter((k) => k.baslik || k.lat != null);
const secilen = limit ? adaylar.slice(0, limit) : adaylar;

console.log(`\nGüncellenecek aday: ${adaylar.length}${limit ? ` (limit ile ${secilen.length})` : ""}`);
console.log(`Üst sınır tahmini yazma: ${secilen.length} satır (günlük ücretsiz bütçe 100.000)`);
if (secilen.length > 100_000) {
  console.warn(`⚠ Bütçeyi aşıyor. --limit=100000 ile bölerek çalıştırın.`);
}

if (!yaz) {
  console.log(`\n(kuru koşu — dosya yazılmadı. Uygulamak için: --yaz)`);
  process.exit(0);
}

const satirlar = [];
for (const k of secilen) {
  if (k.baslik) {
    satirlar.push(
      `UPDATE ilanlar SET baslik='${esc(k.baslik)}' ` +
      `WHERE kaynak='emlakjet' AND ilan_no='ej_${esc(k.id)}' AND baslik IS NULL;`,
    );
  }
  if (k.lat != null) {
    satirlar.push(
      `UPDATE ilanlar SET lat=${k.lat}, lng=${k.lng}, koord_kaynagi='mahalle-merkez' ` +
      `WHERE kaynak='emlakjet' AND ilan_no='ej_${esc(k.id)}' AND lat IS NULL;`,
    );
  }
}

const sql =
  `-- Korpus → üretim boşluk doldurma — ${new Date().toISOString()}\n` +
  `-- ${satirlar.length} UPDATE. Her biri "WHERE <alan> IS NULL" ile korunuyor:\n` +
  `-- üretimde dolu olan hiçbir alan EZİLMEZ.\n\n` +
  satirlar.join("\n") + "\n";

writeFileSync(CIKTI, sql, "utf8");
console.log(`\n✅ ${satirlar.length} UPDATE → ${CIKTI}`);
console.log(`   Uygula: cd backend/api && npx wrangler d1 execute cadastrum-db --remote --file=../../scripts/korpus-guncelle.sql`);
