#!/usr/bin/env node
/**
 * Üretim D1'inden ÖZELLİKLİ ilanları backtest formatında dışa aktarır.
 *
 * NEDEN GEREKLİ: backtest yerel SQL dosyalarından besleniyor ama iki üretecin
 * hiçbiri özellik alanlarını taşımıyordu — emlakjet üreteci (emlakjet-lib.mjs)
 * imar/başlık/tapu yazmıyor, hepsiemlak çıktısı ise .gitignore'da. Sonuç:
 * backtest "imar durumu olan: 0" diyordu ve özellik derinliğinin doğruluğa
 * katkısı ÖLÇÜLEMİYORDU.
 *
 * Özellik alanları (imar_durumu, tapu_durumu, baslik) yalnızca üretimde,
 * zenginleştirme hattı ve hepsiemlak scraper'ı tarafından dolduruluyor.
 * Bu script onları backtest'in okuyabileceği SQL'e çevirir.
 *
 * Çıktı, backtest'in kolon-adı farkında parser'ı tarafından okunur
 * (test/backtest/real-engine.spec.ts) — kolon SIRASI değil ADI önemli.
 *
 * Kullanım:
 *   node scripts/ozellikli-ilan-disa-aktar.mjs > scripts/ozellikli-ilanlar.sql
 *
 * Not: bu dosya track EDİLMEZ (.gitignore). Backtest yokluğunda sessizce
 * atlıyor, yani CI tekrarlanabilirliği bozulmuyor.
 */
import { readFileSync } from "node:fs";

/**
 * Kullanım — wrangler çıktısı STDIN'den verilir:
 *
 *   cd backend/api && npx wrangler d1 execute cadastrum-db --remote --json  *     --command "SELECT kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm,
 *       fiyat_per_m2, m2, kategori, yakalanma_tarihi, baslik, imar_durumu,
 *       tapu_durumu, koord_kaynagi FROM ilanlar WHERE aktif=1
 *       AND kategori IN ('arsa','tarla')
 *       AND (imar_durumu IS NOT NULL OR baslik IS NOT NULL OR tapu_durumu IS NOT NULL)"  *   | node ../../scripts/ozellikli-ilan-disa-aktar.mjs > ../../scripts/ozellikli-ilanlar.sql
 *
 * NEDEN STDIN: wrangler'ı script içinden çağırmak iki duvara çarpıyor —
 * `--command` + execFileSync(shell:true) sorguyu boşluklardan bölüyor
 * (Windows), `--file` ise SELECT sonuçlarını değil yalnızca sorgu ÖZETİNİ
 * döndürüyor ("Rows read: 2"). Kabuktan çağırıp JSON'u boru ile vermek
 * ikisini de aşıyor ve script'i platformdan bağımsız kılıyor.
 */
const ham = readFileSync(0, "utf8");

// wrangler çıktısının başında ilerleme satırları olabiliyor — ilk '[' ten başla.
const jsonBas = ham.indexOf("[");
if (jsonBas === -1) throw new Error("wrangler çıktısında JSON bulunamadı");
const cevap = JSON.parse(ham.slice(jsonBas));
const satirlar = cevap[0]?.results ?? [];

if (satirlar.length === 0) {
  process.stderr.write("UYARI: hiç özellikli ilan yok — çıktı boş olacak.\n");
}

const q = (v) => (v == null || v === "" ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v == null || !Number.isFinite(Number(v)) ? "NULL" : String(v));

const KOLONLAR =
  "kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, m2, " +
  "kategori, para_birimi, yakalanma_tarihi, aktif, baslik, imar_durumu, " +
  "tapu_durumu, koord_kaynagi";

const degerler = satirlar.map((r) =>
  `(${q(r.kaynak)}, ${q(r.ilan_no)}, ${q(r.il_norm)}, ${q(r.ilce_norm)}, ` +
  `${q(r.mahalle_norm)}, ${n(r.fiyat_per_m2)}, ${n(r.m2)}, ${q(r.kategori)}, ` +
  `'TL', ${n(r.yakalanma_tarihi)}, 1, ${q(r.baslik)}, ${q(r.imar_durumu)}, ` +
  `${q(r.tapu_durumu)}, ${q(r.koord_kaynagi)})`,
);

const imarli = satirlar.filter((r) => r.imar_durumu).length;
const baslikli = satirlar.filter((r) => r.baslik).length;
const tapulu = satirlar.filter((r) => r.tapu_durumu).length;

const out = [
  "-- Otomatik üretildi: scripts/ozellikli-ilan-disa-aktar.mjs",
  `-- ${satirlar.length} ilan · imar ${imarli} · başlık ${baslikli} · tapu ${tapulu}`,
  `-- Kaynak: üretim D1 (${new Date().toISOString()})`,
  "",
];
const PARTI = 400;
for (let i = 0; i < degerler.length; i += PARTI) {
  out.push(
    `INSERT OR IGNORE INTO ilanlar (${KOLONLAR}) VALUES\n  ` +
      degerler.slice(i, i + PARTI).join(",\n  ") + ";",
  );
  out.push("");
}

process.stderr.write(
  `${satirlar.length} ilan · imar ${imarli} · başlık ${baslikli} · tapu ${tapulu}\n`,
);
process.stdout.write(out.join("\n"));
