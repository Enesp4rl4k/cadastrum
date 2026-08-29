#!/usr/bin/env node
/**
 * scraper_ilce_durum seed SQL üreteci.
 *
 * NEDEN: Aylık emlakjet cron'u (backend/api/src/index.ts) tarama hedeflerini
 * `scraper_ilce_durum` tablosundan `ORDER BY son_tarama ASC NULLS FIRST` ile
 * seçiyor. Tabloyu ise scraper'ın KENDİSİ yazıyor (emlakjet-scraper.ts).
 * Tablo hiç seed edilmediği için kendi kendini besleyen kapalı bir döngü
 * oluşmuştu: taranmayan ilçe tabloya girmiyor, tabloya girmeyen ilçe
 * taranmıyor. Üretimde tabloda yalnızca 3 İstanbul ilçesi (beykoz, sile,
 * catalca) × 2 kategori = 6 satır vardı ve cron aylardır aynı 3 ilçeyi
 * yeniden tarıyordu.
 *
 * Rotasyon mantığının kendisi doğru — eksik olan tek şey seed'di. Bu script
 * 973 ilçenin tamamını (× arsa/tarla) `son_tarama = NULL` ile ekler; cron
 * NULLS FIRST sayesinde bunları en yüksek öncelikli sayar ve doğal olarak
 * rotasyona girer.
 *
 * ON CONFLICT DO NOTHING: hâlihazırda taranmış 6 satırın `son_tarama`
 * damgası korunur — onları NULL'a çevirmek taranmışları yeniden en öne
 * atardı.
 *
 * Kullanım:
 *   node scripts/scraper-ilce-seed-uret.mjs > scripts/scraper-ilce-seed.sql
 *   cd backend/api && npx wrangler d1 execute cadastrum-db --remote \
 *     --file ../../scripts/scraper-ilce-seed.sql
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KAYNAK = join(ROOT, "src/lib/data/ilce-listesi-bootstrap.ts");

// TS modülünü import etmek yerine JSON gövdesini parse ediyoruz — script'in
// bir TS derleyicisine ihtiyacı olmasın diye (aynı yaklaşım diğer
// scripts/*-uret.mjs dosyalarında da kullanılıyor).
const metin = readFileSync(KAYNAK, "utf8");
const ISARET = "BOOTSTRAP_ILCE_LISTESI: BootstrapIlce[] = [";
const basla = metin.indexOf(ISARET);
if (basla === -1) throw new Error("BOOTSTRAP_ILCE_LISTESI bulunamadı");
// Dizinin açılış köşeli parantezi işaretin SONUNDA — `BootstrapIlce[]`
// içindeki parantezi yakalamamak için işaretin uzunluğundan geri sayıyoruz.
const dizi = metin.slice(basla + ISARET.length - 1);
const son = dizi.indexOf("\n];");
if (son === -1) throw new Error("Dizi sonu bulunamadı");
const ilceler = JSON.parse(dizi.slice(0, son + 2));

const KATEGORILER = ["arsa", "tarla"];
const PARTI = 200; // D1 tek statement'ta çok uzun VALUES listesini sevmiyor

// Aynı (ilNorm, ilceNorm) çifti listede birden fazla geçebilir — PRIMARY KEY
// çakışmasını SQL'e bırakmak yerine burada tekilleştir.
const tekil = new Map();
for (const i of ilceler) {
  if (!i?.ilNorm || !i?.ilceNorm) continue;
  tekil.set(`${i.ilNorm}/${i.ilceNorm}`, i);
}

const satirlar = [];
for (const i of tekil.values()) {
  for (const k of KATEGORILER) {
    // Norm alanları üreteçten geliyor (a-z0-9-), yine de tırnak kaçışı yap.
    const il = String(i.ilNorm).replace(/'/g, "''");
    const ilce = String(i.ilceNorm).replace(/'/g, "''");
    satirlar.push(`('${il}', '${ilce}', '${k}', NULL, 0, NULL)`);
  }
}

const out = [];
out.push("-- Otomatik üretildi: scripts/scraper-ilce-seed-uret.mjs");
out.push(`-- ${tekil.size} ilçe × ${KATEGORILER.length} kategori = ${satirlar.length} satır`);
out.push("-- Mevcut satırlara DOKUNMAZ (ON CONFLICT DO NOTHING).");
out.push("");
for (let i = 0; i < satirlar.length; i += PARTI) {
  out.push(
    "INSERT INTO scraper_ilce_durum\n" +
      "  (il_norm, ilce_norm, kategori, son_tarama, son_insert_adet, son_durum)\n" +
      "VALUES\n  " +
      satirlar.slice(i, i + PARTI).join(",\n  ") +
      "\nON CONFLICT(il_norm, ilce_norm, kategori) DO NOTHING;",
  );
  out.push("");
}

process.stdout.write(out.join("\n"));
