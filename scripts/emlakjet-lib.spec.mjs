/**
 * Unit testler — emlakjet-lib.mjs saf fonksiyonları
 * Çalıştır: npx vitest run scripts/emlakjet-lib.spec.mjs
 */
import { test } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  normalizeTr,
  normalizeYerAdi,
  listeLinkleri,
  listeJsonLdParse,
  sqlEsc,
  sqlIdleriYukle,
} from "./emlakjet-lib.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? "assert failed");
}

function assertEqual(a, b) {
  const as = JSON.stringify(a), bs = JSON.stringify(b);
  if (as !== bs) throw new Error(`Expected ${bs}\n    Got     ${as}`);
}

// ---------------------------------------------------------------------------
// Mock veriler
// ---------------------------------------------------------------------------

const MOCK_LISTE_HTML = `
<html><body>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "RealEstateListing",
      "url": "https://www.emlakjet.com/ilan/satilik-arsa-12345678",
      "offers": { "price": 2500000 },
      "additionalProperty": [
        { "name": "Metrekare", "value": "500 m²" },
        { "name": "Konum", "value": "Yalı Mahallesi, Bandırma" },
        { "name": "İlan Tipi", "value": "Satılık Arsa" }
      ]
    },
    {
      "@type": "RealEstateListing",
      "url": "https://www.emlakjet.com/ilan/satilik-tarla-99887766",
      "offers": { "price": 800000 },
      "additionalProperty": [
        { "name": "Metrekare", "value": "2.000 m²" },
        { "name": "Konum", "value": "Köy Mahallesi, Bandırma" },
        { "name": "İlan Tipi", "value": "Satılık Tarla" }
      ]
    }
  ]
}
</script>
</body></html>
`;

// Alan field adı kullanan varyant
const MOCK_ALAN_HTML = `
<html><body>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "RealEstateListing",
      "url": "https://www.emlakjet.com/ilan/satilik-arsa-11112222",
      "offers": { "price": 1000000 },
      "additionalProperty": [
        { "name": "Alan", "value": "250 m²" },
        { "name": "Konum", "value": "Merkez Mahallesi, Balıkesir" },
        { "name": "İlan Tipi", "value": "Satılık Arsa" }
      ]
    }
  ]
}
</script>
</body></html>
`;

// Konum alanı eksik — atlanmalı
const MOCK_EKSIK_KONUM_HTML = `
<html><body>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "RealEstateListing",
      "url": "https://www.emlakjet.com/ilan/satilik-arsa-55556666",
      "offers": { "price": 500000 },
      "additionalProperty": [
        { "name": "Metrekare", "value": "100 m²" },
        { "name": "İlan Tipi", "value": "Satılık Arsa" }
      ]
    }
  ]
}
</script>
</body></html>
`;

// Fiyat eksik — atlanmalı
const MOCK_EKSIK_FIYAT_HTML = `
<html><body>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "RealEstateListing",
      "url": "https://www.emlakjet.com/ilan/satilik-arsa-77778888",
      "additionalProperty": [
        { "name": "Metrekare", "value": "200 m²" },
        { "name": "Konum", "value": "Test Mahallesi, Bandırma" },
        { "name": "İlan Tipi", "value": "Satılık Arsa" }
      ]
    }
  ]
}
</script>
</body></html>
`;

// JSON-LD yok — boş dönmeli
const MOCK_JSONLD_YOK_HTML = `<html><body><p>İlan bulunamadı</p></body></html>`;

const MOCK_MERKEZ = {
  "balikesir__bandirma__yali": [40.3512, 27.9756],
  "balikesir__bandirma__koy": [40.3400, 27.9500],
  "balikesir__balikesir__merkez": [39.6484, 27.8826],
};

// ---------------------------------------------------------------------------
// normalizeTr testleri
// ---------------------------------------------------------------------------

test("küçük harfe çevirir", () => {
  assertEqual(normalizeTr("ANKARA"), "ankara");
});

test("Türkçe karakterleri dönüştürür — ç→c ğ→g ı→i ö→o ş→s ü→u", () => {
  assertEqual(normalizeTr("çğıöşü"), "cgiosu");
});

test("büyük Türkçe karakterler", () => {
  // Türkçe locale'de: Ç→ç→c, Ğ→ğ→g, İ→i→i, Ö→ö→o, Ş→ş→s, Ü→ü→u (6 karakter → 6)
  assertEqual(normalizeTr("ÇĞİÖŞÜ"), "cgiosu");
});

test("özel karakterleri boşluğa çevirir", () => {
  assertEqual(normalizeTr("hello-world!"), "hello world");
});

test("çoklu boşlukları teke indirir", () => {
  assertEqual(normalizeTr("  merhaba   dünya  "), "merhaba dunya");
});

test("rakamları korur", () => {
  assertEqual(normalizeTr("ilan123"), "ilan123");
});

test("boş string", () => {
  assertEqual(normalizeTr(""), "");
});

test("düzeltme şapkalı harfleri (â/î/û) dönüştürür — Elazığ/Hakkâri/Kâhta/Balâ bug'ı", () => {
  assertEqual(normalizeTr("Elâzığ"), "elazig");
  assertEqual(normalizeTr("Hakkâri"), "hakkari");
  assertEqual(normalizeTr("Kâhta"), "kahta");
  assertEqual(normalizeTr("Balâ"), "bala");
  assertEqual(normalizeTr("Kâğıthane"), "kagithane");
});

// ---------------------------------------------------------------------------
// normalizeYerAdi testleri
// ---------------------------------------------------------------------------

test("'Mahallesi' suffix'ini kaldırır", () => {
  assertEqual(normalizeYerAdi("Yalı Mahallesi"), "yali");
});

test("'Köyü' suffix'ini kaldırır", () => {
  assertEqual(normalizeYerAdi("Çayır Köyü"), "cayir");
});

test("'Beldesi' suffix'ini kaldırır", () => {
  assertEqual(normalizeYerAdi("Akçay Beldesi"), "akcay");
});

test("'Mah' kısaltmasını kaldırır", () => {
  assertEqual(normalizeYerAdi("Merkez Mah"), "merkez");
});

test("'Mh' kısaltmasını kaldırır", () => {
  assertEqual(normalizeYerAdi("Yeni Mh"), "yeni");
});

test("suffix yoksa sadece normalize eder", () => {
  assertEqual(normalizeYerAdi("Bandırma"), "bandirma");
});

test("Türkçe normalize de yapar", () => {
  assertEqual(normalizeYerAdi("Çiftlik Köyü"), "ciftlik");
});

// ---------------------------------------------------------------------------
// listeLinkleri testleri
// ---------------------------------------------------------------------------

test("ilan linklerini çıkarır", () => {
  const html = `
    <a href="/ilan/satilik-arsa-12345678">İlan 1</a>
    <a href="/ilan/satilik-tarla-99887766">İlan 2</a>
  `;
  const links = listeLinkleri(html);
  assertEqual(links.length, 2);
  assert(links.includes("/ilan/satilik-arsa-12345678"));
  assert(links.includes("/ilan/satilik-tarla-99887766"));
});

test("duplicate linkleri tekleştirir", () => {
  const html = `
    <a href="/ilan/satilik-arsa-12345678">İlan 1</a>
    <a href="/ilan/satilik-arsa-12345678">İlan 1 tekrar</a>
    <a href="/ilan/satilik-tarla-99887766">İlan 2</a>
  `;
  const links = listeLinkleri(html);
  assertEqual(links.length, 2);
});

test("7 haneden az ID'li linkleri atlar", () => {
  const html = `<a href="/ilan/satilik-arsa-123">Kısa ID</a>`;
  const links = listeLinkleri(html);
  assertEqual(links.length, 0);
});

test("ilan olmayan linkler atlanır", () => {
  const html = `
    <a href="/kategori/arsa">Kategori</a>
    <a href="/ilan/satilik-arsa-12345678">İlan</a>
  `;
  const links = listeLinkleri(html);
  assertEqual(links.length, 1);
});

test("HTML yoksa boş dizi döner", () => {
  assertEqual(listeLinkleri(""), []);
});

test("tam URL içinde de yakalar", () => {
  const html = `href="https://www.emlakjet.com/ilan/satilik-arsa-12345678"`;
  const links = listeLinkleri(html);
  assertEqual(links.length, 1);
  assertEqual(links[0], "/ilan/satilik-arsa-12345678");
});

// ---------------------------------------------------------------------------
// listeJsonLdParse testleri
// ---------------------------------------------------------------------------

test("iki ilanı parse eder", () => {
  const ilanlar = listeJsonLdParse(MOCK_LISTE_HTML, "arsa", MOCK_MERKEZ);
  assertEqual(ilanlar.length, 2);
});

test("ilk ilanın ID'si doğru", () => {
  const ilanlar = listeJsonLdParse(MOCK_LISTE_HTML, "arsa", MOCK_MERKEZ);
  assertEqual(ilanlar[0].id, "12345678");
});

test("fiyat/m2 hesabı doğru — 2500000/500=5000", () => {
  const ilanlar = listeJsonLdParse(MOCK_LISTE_HTML, "arsa", MOCK_MERKEZ);
  assertEqual(ilanlar[0].tlm2, 5000);
});

test("noktalı m2 parse — '2.000 m²' → 2000", () => {
  const ilanlar = listeJsonLdParse(MOCK_LISTE_HTML, "arsa", MOCK_MERKEZ);
  assertEqual(ilanlar[1].m2, 2000);
});

test("kategori 'tarla' doğru atanır", () => {
  const ilanlar = listeJsonLdParse(MOCK_LISTE_HTML, "arsa", MOCK_MERKEZ);
  assertEqual(ilanlar[1].kategori, "tarla");
});

test("kategori 'arsa' doğru atanır", () => {
  const ilanlar = listeJsonLdParse(MOCK_LISTE_HTML, "arsa", MOCK_MERKEZ);
  assertEqual(ilanlar[0].kategori, "arsa");
});

test("MERKEZ'den il bulur — balikesir", () => {
  const ilanlar = listeJsonLdParse(MOCK_LISTE_HTML, "arsa", MOCK_MERKEZ);
  assertEqual(ilanlar[0].ilN, "balikesir");
});

test("MERKEZ'den koordinat bulur", () => {
  const ilanlar = listeJsonLdParse(MOCK_LISTE_HTML, "arsa", MOCK_MERKEZ);
  assertEqual(ilanlar[0].lat, 40.3512);
  assertEqual(ilanlar[0].lng, 27.9756);
});

test("mahalle normalize edilmiş", () => {
  const ilanlar = listeJsonLdParse(MOCK_LISTE_HTML, "arsa", MOCK_MERKEZ);
  // "Yalı Mahallesi" → "yali"
  assertEqual(ilanlar[0].mahN, "yali");
});

test("Alan field adını da kabul eder", () => {
  const MERKEZ2 = { "balikesir__balikesir__merkez": [39.6484, 27.8826] };
  const ilanlar = listeJsonLdParse(MOCK_ALAN_HTML, "arsa", MERKEZ2);
  assertEqual(ilanlar.length, 1);
  assertEqual(ilanlar[0].m2, 250);
});

test("Konum eksikse ilan atlanır", () => {
  const ilanlar = listeJsonLdParse(MOCK_EKSIK_KONUM_HTML, "arsa", MOCK_MERKEZ);
  assertEqual(ilanlar.length, 0);
});

test("Fiyat eksikse ilan atlanır", () => {
  const ilanlar = listeJsonLdParse(MOCK_EKSIK_FIYAT_HTML, "arsa", MOCK_MERKEZ);
  assertEqual(ilanlar.length, 0);
});

test("MERKEZ'de il bulunamazsa ilan atlanır", () => {
  const ilanlar = listeJsonLdParse(MOCK_LISTE_HTML, "arsa", {}); // boş MERKEZ
  assertEqual(ilanlar.length, 0);
});

test("JSON-LD yoksa boş dizi döner", () => {
  const ilanlar = listeJsonLdParse(MOCK_JSONLD_YOK_HTML, "arsa", MOCK_MERKEZ);
  assertEqual(ilanlar.length, 0);
});

test("bozuk JSON atlanır, geçerli parse edilir", () => {
  const html = `
    <script type="application/ld+json">{ BOZUK JSON !!!</script>
    ${MOCK_LISTE_HTML}
  `;
  const ilanlar = listeJsonLdParse(html, "arsa", MOCK_MERKEZ);
  assertEqual(ilanlar.length, 2);
});

// ---------------------------------------------------------------------------
// sqlEsc testleri
// ---------------------------------------------------------------------------

test("tek tırnak escape edilir", () => {
  assertEqual(sqlEsc("O'Brien"), "O''Brien");
});

test("çift tek tırnak — her biri escape edilir", () => {
  assertEqual(sqlEsc("it's a 'test'"), "it''s a ''test''");
});

test("tırnak içermeyen string değişmez", () => {
  assertEqual(sqlEsc("istanbul"), "istanbul");
});

test("sayıyı stringe çevirir", () => {
  assertEqual(sqlEsc(42), "42");
});

test("boş string", () => {
  assertEqual(sqlEsc(""), "");
});

// ---------------------------------------------------------------------------
// sqlIdleriYukle testleri
// ---------------------------------------------------------------------------

const TMP1 = join(tmpdir(), "_test_emlakjet_ids1.sql");
const TMP2 = join(tmpdir(), "_test_emlakjet_ids2.sql");

test("SQL dosyasından ID'leri okur", () => {
  writeFileSync(TMP1, `
INSERT OR IGNORE INTO ilanlar VALUES
('emlakjet','ej_12345678','balikesir','bandirma','yali',5000,500,'arsa','TL',1234,40.35,27.97,'mahalle-merkez',1),
('emlakjet','ej_99887766','balikesir','bandirma','koy',400,2000,'tarla','TL',1234,40.34,27.95,'mahalle-merkez',1);
  `, "utf8");
  const ids = sqlIdleriYukle(TMP1);
  assert(ids.has("12345678"), "12345678 bulunmalı");
  assert(ids.has("99887766"), "99887766 bulunmalı");
  assertEqual(ids.size, 2);
});

test("birden fazla dosyadan merge eder", () => {
  writeFileSync(TMP2, `
INSERT OR IGNORE INTO ilanlar VALUES
('emlakjet','ej_11112222','balikesir','balikesir','merkez',4000,250,'arsa','TL',1234,39.64,27.88,'mahalle-merkez',1);
  `, "utf8");
  const ids = sqlIdleriYukle(TMP1, TMP2);
  assertEqual(ids.size, 3);
  assert(ids.has("11112222"));
});

test("var olmayan dosyayı sessizce atlar", () => {
  const ids = sqlIdleriYukle("/tmp/yok_dosya_12345.sql", TMP1);
  assertEqual(ids.size, 2);
});

test("boş dosya ile çağrılırsa boş set döner", () => {
  const ids = sqlIdleriYukle("/tmp/yok_12345_yok.sql");
  assertEqual(ids.size, 0);
});

test("temp dosyaları temizle", () => {
  try { unlinkSync(TMP1); } catch {}
  try { unlinkSync(TMP2); } catch {}
});
