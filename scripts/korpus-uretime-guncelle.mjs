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
/**
 * `--sadece=baslik|koordinat` — alan bazında bölme.
 *
 * NEDEN GEREKLİ: ilan başına 2'ye kadar UPDATE çıkıyor ve toplam ifade
 * sayısı günlük yazma bütçesini (100.000) aşabiliyor. `--limit` ilan bazında
 * böldüğü için iki alanı da yarıda kesiyor; oysa alanların ACİLİYETİ farklı.
 *
 * Ölçülen durum (2026-09-08): üretimde başlık yalnızca 2.258 kayıtta dolu
 * (korpusta 39.577), koordinat ise 30.198 kayıtta dolu ve yalnızca 4.278
 * eksik. Yani başlık UPDATE'lerinin neredeyse tamamı gerçek yazma üretecek,
 * koordinat UPDATE'lerinin ise %93'ü 0 satır etkileyecek. Öncelik başlıkta.
 */
const sadece = args.find((a) => a.startsWith("--sadece="))?.split("=")[1] ?? null;
if (sadece && sadece !== "baslik" && sadece !== "koordinat") {
  console.error(`--sadece yalnızca "baslik" ya da "koordinat" olabilir (verilen: ${sadece})`);
  process.exit(1);
}

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

/**
 * UPDATE sayısı ilan sayısından FARKLI — her ilan iki alan doldurabiliyor
 * (başlık ve koordinat), yani ilan başına 2'ye kadar UPDATE çıkıyor.
 *
 * İlk yazımda rapor ilan sayısını "tahmini yazma" diye gösteriyordu: 64.551
 * diyordu, gerçekte 102.043 UPDATE üretilmişti. Bütçe kararı bu sayıya
 * dayandığı için yanlış rapor, bütçeyi sessizce aşmaya yol açardı.
 */
const baslikYaz = sadece !== "koordinat";
const koordYaz = sadece !== "baslik";
const baslikAdet = baslikYaz ? secilen.filter((k) => k.baslik).length : 0;
const koordAdet = koordYaz ? secilen.filter((k) => k.lat != null).length : 0;
const ifadeAdet = baslikAdet + koordAdet;

console.log(`\nGüncellenecek aday ilan: ${adaylar.length}${limit ? ` (limit ile ${secilen.length})` : ""}`);
console.log(`  başlık UPDATE   : ${baslikAdet}`);
console.log(`  koordinat UPDATE: ${koordAdet}`);
console.log(`  TOPLAM İFADE    : ${ifadeAdet}`);
console.log(
  `\nGERÇEK YAZMA bunun ALTINDA: her UPDATE "WHERE <alan> IS NULL" ile korunuyor;\n` +
  `üretimde o alan doluysa 0 satır etkiler ve D1 yazma saymaz.\n` +
  `Üst sınır ${ifadeAdet} · günlük ücretsiz bütçe 100.000.`,
);
if (ifadeAdet > 100_000) {
  console.warn(
    `\n! İfade sayısı bütçe üst sınırını aşıyor. Gerçek yazma muhtemelen çok\n` +
    `  daha düşük (dolu alanlar 0 satır etkiler) ama garanti değil.\n` +
    `  Bölerek çalıştırmak için: --limit=${Math.floor(secilen.length / 2)}`,
  );
}

if (!yaz) {
  console.log(`\n(kuru koşu — dosya yazılmadı. Uygulamak için: --yaz)`);
  process.exit(0);
}

const satirlar = [];
for (const k of secilen) {
  if (baslikYaz && k.baslik) {
    satirlar.push(
      `UPDATE ilanlar SET baslik='${esc(k.baslik)}' ` +
      `WHERE kaynak='emlakjet' AND ilan_no='ej_${esc(k.id)}' AND baslik IS NULL;`,
    );
  }
  if (koordYaz && k.lat != null) {
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
