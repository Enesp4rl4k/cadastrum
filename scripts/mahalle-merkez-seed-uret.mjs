#!/usr/bin/env node
/**
 * mahalle_merkez seed SQL üreteci (migration 0030).
 *
 * NEDEN: Worker scraper'larındaki koordinatAra() D1'deki `mahalle_merkez`
 * tablosuna SELECT atıyor ama o tablo hiçbir migration'da tanımlı değildi.
 * Sorgu try/catch içinde olduğu için hata yutuluyor ve fonksiyon HER ZAMAN
 * null dönüyordu — Worker hattından giren hiçbir ilan koordinat almıyor,
 * dolayısıyla spatial emsal motoru onları göremiyordu.
 *
 * Kaynak: src/lib/data/mahalle-merkezleri.ts
 *   MERKEZ_TUPLES: { "il__ilce__mahalle": [lat, lng, guven] }
 *
 * Kullanım:
 *   node scripts/mahalle-merkez-seed-uret.mjs > scripts/mahalle-merkez-seed.sql
 *   cd backend/api && npx wrangler d1 execute cadastrum-db --remote \
 *     --file ../../scripts/mahalle-merkez-seed.sql
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { objeyiCikar } = await import("./emlakjet-lib.mjs");

const MERKEZ = objeyiCikar(join(ROOT, "src/lib/data/mahalle-merkezleri.ts"), "MERKEZ_TUPLES");

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const satirlar = [];
let atlanan = 0;

for (const [anahtar, t] of Object.entries(MERKEZ)) {
  const p = anahtar.split("__");
  if (p.length !== 3 || !p[0] || !p[1] || !p[2]) { atlanan++; continue; }
  const [lat, lng, guven] = t;
  // Türkiye bbox — bozuk/ters koordinatı tabloya sokma.
  if (typeof lat !== "number" || typeof lng !== "number") { atlanan++; continue; }
  if (lat < 35 || lat > 43 || lng < 25 || lng > 45) { atlanan++; continue; }
  satirlar.push(
    `(${q(p[0])}, ${q(p[1])}, ${q(p[2])}, ${lat}, ${lng}, ${Number(guven) || 0.5})`,
  );
}

const out = [
  "-- Otomatik üretildi: scripts/mahalle-merkez-seed-uret.mjs",
  `-- ${satirlar.length} mahalle merkezi (${atlanan} atlandı: bozuk anahtar veya bbox dışı)`,
  "",
];
const PARTI = 500;
for (let i = 0; i < satirlar.length; i += PARTI) {
  out.push(
    "INSERT INTO mahalle_merkez (il_norm, ilce_norm, mahalle_norm, lat, lng, guven)\nVALUES\n  " +
      satirlar.slice(i, i + PARTI).join(",\n  ") +
      "\nON CONFLICT(il_norm, ilce_norm, mahalle_norm) DO UPDATE SET\n" +
      "  lat = excluded.lat, lng = excluded.lng, guven = excluded.guven;",
  );
  out.push("");
}

process.stderr.write(`${satirlar.length} satır (${atlanan} atlandı)\n`);
process.stdout.write(out.join("\n"));
