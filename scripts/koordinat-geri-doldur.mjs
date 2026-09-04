#!/usr/bin/env node
/**
 * Korpustaki eksik koordinatları geri doldurur.
 *
 *   node scripts/koordinat-geri-doldur.mjs            # kuru koşum (yazmaz)
 *   node scripts/koordinat-geri-doldur.mjs --yaz      # dosyayı günceller
 *
 * NEDEN GEREKLİ: `sqlKayitlariYukle` (emlakjet-lib.mjs) resume sırasında
 * mevcut kayıtları okurken `lat: null, lng: null` yazıyordu ve regex'i o
 * kolonları hiç yakalamıyordu. Tarayıcının akışı yükle → ekle → DOSYANIN
 * TAMAMINI yeniden yaz olduğu için, her resume koşumu önceki koşumların
 * koordinatlarını siliyordu. Hiçbir hata verilmiyordu: dosya büyüyor, ilan
 * sayısı artıyor, yalnızca bir kolon sessizce boşalıyordu.
 *
 * Yükleyici düzeltildi (artık kolonları okuyor), ama diskteki 40 bin küsur
 * kayıt zaten boşalmış durumda. Tarama scriptini düzeltmek yalnızca GELECEK
 * ilanları kurtarır; bu script eldekini kurtarır.
 *
 * Koordinat mahalle merkezinden geliyor (`koord_kaynagi='mahalle-merkez'`),
 * gerçek parsel konumu değil. Bu ayrım korunuyor — parsel koordinatı yalnızca
 * backend zenginleştirme hattından gelir ve `koord_kaynagi='parsel'` olur.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  objeyiCikar,
  sqlKayitlariYukle,
  sqlYaz,
  merkezKoordinatBul,
} from "./emlakjet-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HEDEF = join(ROOT, "scripts", "emlakjet-data-turkiye.sql");
const YAZ = process.argv.includes("--yaz");

const MERKEZ = objeyiCikar(join(ROOT, "src/lib/data/mahalle-merkezleri.ts"), "MERKEZ_TUPLES");
const kayitlar = sqlKayitlariYukle(HEDEF);

let zatenVar = 0;
let dolduruldu = 0;
let cozulemedi = 0;
const cozulemeyenler = new Map();

for (const k of kayitlar) {
  if (k.lat != null && k.lng != null) { zatenVar++; continue; }
  const r = merkezKoordinatBul(MERKEZ, k.ilN, k.ilceN, k.mahN);
  if (r) {
    k.lat = r.lat;
    k.lng = r.lng;
    dolduruldu++;
  } else {
    cozulemedi++;
    const anahtar = `${k.ilN}__${k.ilceN}__${k.mahN ?? "(mahalle yok)"}`;
    cozulemeyenler.set(anahtar, (cozulemeyenler.get(anahtar) ?? 0) + 1);
  }
}

const toplam = kayitlar.length;
const sonKoordlu = zatenVar + dolduruldu;
console.log(`Korpus            : ${toplam} ilan`);
console.log(`Zaten koordinatlı : ${zatenVar} (%${((100 * zatenVar) / toplam).toFixed(1)})`);
console.log(`Geri dolduruldu   : ${dolduruldu} (%${((100 * dolduruldu) / toplam).toFixed(1)})`);
console.log(`Çözülemedi        : ${cozulemedi} (%${((100 * cozulemedi) / toplam).toFixed(1)})`);
console.log(`SONUÇ koordinatlı : ${sonKoordlu} (%${((100 * sonKoordlu) / toplam).toFixed(1)})`);

// Çözülemeyenler SESSİZCE yutulmuyor — en büyük 10'u raporlanıyor ki
// kalan boşluğun hangi mahallelerde olduğu görünsün.
if (cozulemeyenler.size > 0) {
  console.log(`\nÇözülemeyen mahalleler (en büyük 10, toplam ${cozulemeyenler.size} farklı):`);
  for (const [ad, n] of [...cozulemeyenler.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${String(n).padStart(4)}  ${ad}`);
  }
}

if (!YAZ) {
  console.log(`\n(kuru koşum — dosya değişmedi. Uygulamak için: --yaz)`);
} else {
  sqlYaz(kayitlar, HEDEF, "Emlakjet 973 ilçe — koordinat geri doldurma");
  console.log(`\n✓ ${HEDEF} güncellendi`);
}
