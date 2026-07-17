/**
 * ilTara / ilceTara mantık testleri — HTTP yok, mock pipeline
 * Çalıştır: npx vitest run scripts/emlakjet-iltara.spec.mjs
 *
 * Yaklaşım:
 *   ilTara/ilceTara içindeki getir() çağrısını mock'layamayız (modül scope'unda kapalı).
 *   Bunun yerine:
 *     1) ilTara'nın yaptığı işi (HTML al → listeLinkleri/listeJsonLdParse → duplicate filtre)
 *        adım adım simüle ederek pipeline doğruluyoruz.
 *     2) sqlKayitlariYukle parse doğruluğunu geçici SQL dosyalarıyla test ediyoruz.
 *     3) gorulenler Set ile duplicate önleme mantığını test ediyoruz.
 *     4) ilceTara URL suffix seçim mantığını (sayfa > 1 koşulu) doğruluyoruz.
 */
import { test } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  listeLinkleri,
  listeJsonLdParse,
  sqlKayitlariYukle,
} from "./emlakjet-lib.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? "assert failed");
}

function assertEqual(a, b) {
  const as = JSON.stringify(a), bs = JSON.stringify(b);
  if (as !== bs) throw new Error(`Expected ${bs}\n    Got     ${as}`);
}

// ---------------------------------------------------------------------------
// Mock HTML — gerçek emlakjet liste sayfası yapısını taklit eder
// ---------------------------------------------------------------------------

function buildListeHtml(ilanlar) {
  const graph = ilanlar.map((ilan) => ({
    "@type": "RealEstateListing",
    url: `https://www.emlakjet.com/ilan/satilik-${ilan.kategori}-${ilan.id}`,
    offers: { price: ilan.fiyat },
    additionalProperty: [
      { name: "Metrekare", value: `${ilan.m2} m²` },
      { name: "Konum", value: `${ilan.mahRaw}, ${ilan.ilceRaw}` },
      { name: "İlan Tipi", value: ilan.kategori === "arsa" ? "Satılık Arsa" : "Satılık Tarla" },
    ],
  }));

  return `<html><body>
<script type="application/ld+json">
${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}
</script>
</body></html>`;
}

// Eski detay-sayfası yöntemi link listesi içeren HTML
function buildLinkHtml(ids) {
  return ids.map((id) => `<a href="/ilan/satilik-arsa-${id}">İlan ${id}</a>`).join("\n");
}

const MERKEZ = {
  "balikesir__bandirma__yali":   [40.3512, 27.9756],
  "balikesir__bandirma__merkez": [40.3600, 27.9800],
  "balikesir__bandirma__koy":    [40.3400, 27.9500],
  "balikesir__balikesir__merkez":[39.6484, 27.8826],
};

// ---------------------------------------------------------------------------
// 1) Ham HTML → listeLinkleri → ID çıkarma pipeline (ilTara fallback yolu)
// ---------------------------------------------------------------------------

test("tek sayfalık link HTML'den ID'leri çıkarır", () => {
  const html = buildLinkHtml(["12345678", "99887766", "11112222"]);
  const links = listeLinkleri(html);
  assertEqual(links.length, 3);
  assert(links.some((l) => l.includes("12345678")));
  assert(links.some((l) => l.includes("99887766")));
});

test("duplicate link HTML'de set tekleştirir", () => {
  const html = buildLinkHtml(["12345678", "12345678", "99887766"]);
  const links = listeLinkleri(html);
  assertEqual(links.length, 2);
});

test("link yoksa boş dizi — sayfa geçişi durur", () => {
  const links = listeLinkleri("<html><body>Sonuç yok</body></html>");
  assertEqual(links.length, 0);
});

// ---------------------------------------------------------------------------
// 2) JSON-LD pipeline (ilTara primary yolu)
// ---------------------------------------------------------------------------

test("bir sayfalık JSON-LD parse — 3 ilan", () => {
  const html = buildListeHtml([
    { id: "12345678", kategori: "arsa", fiyat: 2500000, m2: 500, mahRaw: "Yalı Mahallesi", ilceRaw: "Bandırma" },
    { id: "99887766", kategori: "tarla", fiyat: 800000, m2: 2000, mahRaw: "Köy Mahallesi", ilceRaw: "Bandırma" },
    { id: "11112222", kategori: "arsa", fiyat: 1000000, m2: 250, mahRaw: "Merkez Mahallesi", ilceRaw: "Bandırma" },
  ]);
  const ilanlar = listeJsonLdParse(html, "arsa", MERKEZ);
  assertEqual(ilanlar.length, 3);
});

test("parse edilen ilanların tlm2 hesabı doğru", () => {
  const html = buildListeHtml([
    { id: "12345678", kategori: "arsa", fiyat: 2500000, m2: 500, mahRaw: "Yalı Mahallesi", ilceRaw: "Bandırma" },
  ]);
  const ilanlar = listeJsonLdParse(html, "arsa", MERKEZ);
  assertEqual(ilanlar[0].tlm2, 5000); // 2500000/500
});

test("MERKEZ'de olmayan ilçe — ilan atlanır", () => {
  const html = buildListeHtml([
    { id: "55556666", kategori: "arsa", fiyat: 500000, m2: 100, mahRaw: "Test Mahallesi", ilceRaw: "Bilinmeyen" },
  ]);
  const ilanlar = listeJsonLdParse(html, "arsa", MERKEZ);
  assertEqual(ilanlar.length, 0);
});

// ---------------------------------------------------------------------------
// 3) Duplicate önleme (gorulenler Set) — ilTara mantığını simüle et
// ---------------------------------------------------------------------------

/**
 * ilTara'nın duplicate önleme mantığını simüle eder:
 *   - listeJsonLdParse → ilanlar
 *   - gorulenler.has(id) kontrolü
 *   - yeni ilan ise kayıtlara ekle, gorulenler'a ekle
 */
function simuleIlTaraSayfasi(html, kategori, merkez, gorulenler, kayitlar) {
  const ilanlar = listeJsonLdParse(html, kategori, merkez);
  let yeniBuSayfa = 0;
  for (const ilan of ilanlar) {
    if (gorulenler.has(ilan.id)) continue;
    gorulenler.add(ilan.id);
    kayitlar.push(ilan);
    yeniBuSayfa++;
  }
  return yeniBuSayfa;
}

test("ilk sayfada tüm ilanlar eklenir", () => {
  const gorulenler = new Set();
  const kayitlar = [];
  const html = buildListeHtml([
    { id: "12345678", kategori: "arsa", fiyat: 2500000, m2: 500, mahRaw: "Yalı Mahallesi", ilceRaw: "Bandırma" },
    { id: "99887766", kategori: "tarla", fiyat: 800000, m2: 2000, mahRaw: "Köy Mahallesi", ilceRaw: "Bandırma" },
  ]);
  const yeni = simuleIlTaraSayfasi(html, "arsa", MERKEZ, gorulenler, kayitlar);
  assertEqual(yeni, 2);
  assertEqual(kayitlar.length, 2);
  assertEqual(gorulenler.size, 2);
});

test("ikinci sayfada aynı ilanlar tekrar gelirse eklenmez (son sayfa tespiti)", () => {
  const gorulenler = new Set();
  const kayitlar = [];
  const html = buildListeHtml([
    { id: "12345678", kategori: "arsa", fiyat: 2500000, m2: 500, mahRaw: "Yalı Mahallesi", ilceRaw: "Bandırma" },
  ]);
  simuleIlTaraSayfasi(html, "arsa", MERKEZ, gorulenler, kayitlar); // sayfa 1
  const yeni2 = simuleIlTaraSayfasi(html, "arsa", MERKEZ, gorulenler, kayitlar); // sayfa 2 (aynı içerik)
  assertEqual(yeni2, 0); // → ilTara "break" koşulunu tetikler
  assertEqual(kayitlar.length, 1); // sadece bir kayıt
});

test("farklı sayfalardan gelen ilanlar birikiyor", () => {
  const gorulenler = new Set();
  const kayitlar = [];
  const html1 = buildListeHtml([
    { id: "12345678", kategori: "arsa", fiyat: 2500000, m2: 500, mahRaw: "Yalı Mahallesi", ilceRaw: "Bandırma" },
  ]);
  const html2 = buildListeHtml([
    { id: "99887766", kategori: "tarla", fiyat: 800000, m2: 2000, mahRaw: "Köy Mahallesi", ilceRaw: "Bandırma" },
  ]);
  simuleIlTaraSayfasi(html1, "arsa", MERKEZ, gorulenler, kayitlar);
  simuleIlTaraSayfasi(html2, "arsa", MERKEZ, gorulenler, kayitlar);
  assertEqual(kayitlar.length, 2);
  assertEqual(gorulenler.size, 2);
});

test("aynı ID iki farklı sayfada varsa ikincisi eklenmez", () => {
  const gorulenler = new Set();
  const kayitlar = [];
  const ilanDef = { id: "12345678", kategori: "arsa", fiyat: 2500000, m2: 500, mahRaw: "Yalı Mahallesi", ilceRaw: "Bandırma" };
  const html1 = buildListeHtml([ilanDef]);
  const html2 = buildListeHtml([
    ilanDef, // aynı ID tekrar
    { id: "99887766", kategori: "tarla", fiyat: 800000, m2: 2000, mahRaw: "Köy Mahallesi", ilceRaw: "Bandırma" },
  ]);
  simuleIlTaraSayfasi(html1, "arsa", MERKEZ, gorulenler, kayitlar);
  simuleIlTaraSayfasi(html2, "arsa", MERKEZ, gorulenler, kayitlar);
  assertEqual(kayitlar.length, 2); // 12345678 bir kez, 99887766 bir kez
  assertEqual(gorulenler.size, 2);
});

// ---------------------------------------------------------------------------
// 4) ilceTara URL suffix mantığı
// ---------------------------------------------------------------------------

/**
 * ilceTara'nın suffix hesaplama mantığını izole test eder.
 * Düzeltilen kod: sayfa > 1 ? `?sayfa=${sayfa}` : ""
 */
function hesaplaSuffix(sayfa) {
  return sayfa > 1 ? `?sayfa=${sayfa}` : "";
}

test("sayfa 1 için suffix boş string", () => {
  assertEqual(hesaplaSuffix(1), "");
});

test("sayfa 2 için suffix '?sayfa=2'", () => {
  assertEqual(hesaplaSuffix(2), "?sayfa=2");
});

test("sayfa 3 için suffix '?sayfa=3'", () => {
  assertEqual(hesaplaSuffix(3), "?sayfa=3");
});

test("sayfa 10 için suffix '?sayfa=10'", () => {
  assertEqual(hesaplaSuffix(10), "?sayfa=10");
});

test("URL pattern 1 doğru oluşur", () => {
  const ilNorm = "balikesir", ilceNorm = "bandirma", kategori = "arsa";
  const url = (s) => `https://www.emlakjet.com/satilik-${kategori}/${ilNorm}-${ilceNorm}${s}`;
  assertEqual(url(hesaplaSuffix(1)), "https://www.emlakjet.com/satilik-arsa/balikesir-bandirma");
  assertEqual(url(hesaplaSuffix(2)), "https://www.emlakjet.com/satilik-arsa/balikesir-bandirma?sayfa=2");
});

test("URL pattern 2 (fallback) doğru oluşur", () => {
  const ilceNorm = "bandirma", kategori = "arsa";
  const url = (s) => `https://www.emlakjet.com/satilik-${kategori}/${ilceNorm}${s}`;
  assertEqual(url(hesaplaSuffix(1)), "https://www.emlakjet.com/satilik-arsa/bandirma");
  assertEqual(url(hesaplaSuffix(3)), "https://www.emlakjet.com/satilik-arsa/bandirma?sayfa=3");
});

// ---------------------------------------------------------------------------
// 5) sqlKayitlariYukle testleri
// ---------------------------------------------------------------------------

const TMP_SQL = join(tmpdir(), "_test_iltara_kayitlar.sql");

const SAMPLE_SQL = `-- Emlakjet — 3 ilan — 2024-01-01T00:00:00.000Z

INSERT OR IGNORE INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, m2, kategori, para_birimi, yakalanma_tarihi, lat, lng, koord_kaynagi, aktif) VALUES
('emlakjet','ej_12345678','balikesir','bandirma','yali',5000,500,'arsa','TL',1700000000000,40.3512,27.9756,'mahalle-merkez',1),
('emlakjet','ej_99887766','balikesir','bandirma','koy',400,2000,'tarla','TL',1700000000000,40.34,27.95,'mahalle-merkez',1),
('emlakjet','ej_11112222','balikesir','balikesir',NULL,4000,250,'arsa','TL',1700000000000,NULL,NULL,NULL,1);
`;

test("3 kaydı parse eder", () => {
  writeFileSync(TMP_SQL, SAMPLE_SQL, "utf8");
  const kayitlar = sqlKayitlariYukle(TMP_SQL);
  assertEqual(kayitlar.length, 3);
});

test("id doğru parse edilir", () => {
  const kayitlar = sqlKayitlariYukle(TMP_SQL);
  assert(kayitlar.some((k) => k.id === "12345678"), "12345678 bulunmalı");
  assert(kayitlar.some((k) => k.id === "99887766"), "99887766 bulunmalı");
  assert(kayitlar.some((k) => k.id === "11112222"), "11112222 bulunmalı");
});

test("il_norm doğru parse edilir", () => {
  const kayitlar = sqlKayitlariYukle(TMP_SQL);
  const k = kayitlar.find((k) => k.id === "12345678");
  assertEqual(k.ilN, "balikesir");
});

test("ilce_norm doğru parse edilir", () => {
  const kayitlar = sqlKayitlariYukle(TMP_SQL);
  const k = kayitlar.find((k) => k.id === "12345678");
  assertEqual(k.ilceN, "bandirma");
});

test("mahalle_norm doğru parse edilir", () => {
  const kayitlar = sqlKayitlariYukle(TMP_SQL);
  const k = kayitlar.find((k) => k.id === "12345678");
  assertEqual(k.mahN, "yali");
});

test("NULL mahalle null olarak gelir", () => {
  const kayitlar = sqlKayitlariYukle(TMP_SQL);
  const k = kayitlar.find((k) => k.id === "11112222");
  assertEqual(k.mahN, null);
});

test("fiyat_per_m2 integer olarak parse edilir", () => {
  const kayitlar = sqlKayitlariYukle(TMP_SQL);
  const k = kayitlar.find((k) => k.id === "12345678");
  assertEqual(k.tlm2, 5000);
  assert(typeof k.tlm2 === "number", "tlm2 number olmalı");
});

test("m2 integer olarak parse edilir", () => {
  const kayitlar = sqlKayitlariYukle(TMP_SQL);
  const k = kayitlar.find((k) => k.id === "12345678");
  assertEqual(k.m2, 500);
});

test("kategori doğru parse edilir", () => {
  const kayitlar = sqlKayitlariYukle(TMP_SQL);
  const tarla = kayitlar.find((k) => k.id === "99887766");
  assertEqual(tarla.kategori, "tarla");
});

test("duplicate ID — son gelen kazanır (Map semantiği)", () => {
  const dupSql = SAMPLE_SQL + `
INSERT OR IGNORE INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, m2, kategori, para_birimi, yakalanma_tarihi, lat, lng, koord_kaynagi, aktif) VALUES
('emlakjet','ej_12345678','balikesir','bandirma','merkez',9999,600,'arsa','TL',1700000000001,40.36,27.98,'mahalle-merkez',1);
`;
  const tmpDup = join(tmpdir(), "_test_iltara_dup.sql");
  writeFileSync(tmpDup, dupSql, "utf8");
  const kayitlar = sqlKayitlariYukle(tmpDup);
  // 3 unique ID (12345678 iki kez yazılmış, Map'te son kazanır)
  assertEqual(kayitlar.length, 3);
  const k = kayitlar.find((k) => k.id === "12345678");
  assertEqual(k.tlm2, 9999); // güncel değer
  try { unlinkSync(tmpDup); } catch {}
});

test("var olmayan dosya sessizce atlanır", () => {
  const kayitlar = sqlKayitlariYukle("/tmp/yok_iltara_9999.sql");
  assertEqual(kayitlar.length, 0);
});

test("birden fazla dosyadan birleştirir", () => {
  const tmp2 = join(tmpdir(), "_test_iltara_kayitlar2.sql");
  writeFileSync(tmp2, `
INSERT OR IGNORE INTO ilanlar (kaynak, ilan_no, il_norm, ilce_norm, mahalle_norm, fiyat_per_m2, m2, kategori, para_birimi, yakalanma_tarihi, lat, lng, koord_kaynagi, aktif) VALUES
('emlakjet','ej_55556666','balikesir','balikesir','merkez',4500,300,'arsa','TL',1700000000000,39.64,27.88,'mahalle-merkez',1);
`, "utf8");
  const kayitlar = sqlKayitlariYukle(TMP_SQL, tmp2);
  assertEqual(kayitlar.length, 4);
  try { unlinkSync(tmp2); } catch {}
});

test("temp dosyayı temizle", () => {
  try { unlinkSync(TMP_SQL); } catch {}
});

// ---------------------------------------------------------------------------
// 6) ilTara JSON-LD + gorulenler entegre pipeline testi
// ---------------------------------------------------------------------------

test("3 sayfa, her sayfada yeni ilanlar — toplam 6 ilan birikir", () => {
  const gorulenler = new Set();
  const kayitlar = [];
  const sayfalar = [
    buildListeHtml([
      { id: "10000001", kategori: "arsa", fiyat: 1000000, m2: 200, mahRaw: "Yalı Mahallesi", ilceRaw: "Bandırma" },
      { id: "10000002", kategori: "arsa", fiyat: 1200000, m2: 300, mahRaw: "Merkez Mahallesi", ilceRaw: "Bandırma" },
    ]),
    buildListeHtml([
      { id: "10000003", kategori: "tarla", fiyat: 500000, m2: 1000, mahRaw: "Köy Mahallesi", ilceRaw: "Bandırma" },
      { id: "10000004", kategori: "tarla", fiyat: 600000, m2: 1200, mahRaw: "Yalı Mahallesi", ilceRaw: "Bandırma" },
    ]),
    buildListeHtml([
      { id: "10000005", kategori: "arsa", fiyat: 800000, m2: 160, mahRaw: "Merkez Mahallesi", ilceRaw: "Bandırma" },
      { id: "10000006", kategori: "arsa", fiyat: 900000, m2: 180, mahRaw: "Köy Mahallesi", ilceRaw: "Bandırma" },
    ]),
  ];

  for (const html of sayfalar) {
    simuleIlTaraSayfasi(html, "arsa", MERKEZ, gorulenler, kayitlar);
  }

  assertEqual(kayitlar.length, 6);
  assertEqual(gorulenler.size, 6);
});

test("son sayfa boş gelirse döngü durur (yeni=0 simülasyonu)", () => {
  const gorulenler = new Set();
  const kayitlar = [];
  const sayfa1 = buildListeHtml([
    { id: "20000001", kategori: "arsa", fiyat: 1000000, m2: 200, mahRaw: "Yalı Mahallesi", ilceRaw: "Bandırma" },
  ]);
  const sayfaSon = "<html><body>Sonuç yok</body></html>"; // JSON-LD yok

  const yeni1 = simuleIlTaraSayfasi(sayfa1, "arsa", MERKEZ, gorulenler, kayitlar);
  const ilanlarSon = listeJsonLdParse(sayfaSon, "arsa", MERKEZ);
  assert(yeni1 > 0, "sayfa1'de yeni ilan olmalı");
  assertEqual(ilanlarSon.length, 0); // → ilTara "break" koşulunu tetikler
});

test("maxSayfa sınırı — N sayfadan fazlası işlenmez", () => {
  const maxSayfa = 2;
  const gorulenler = new Set();
  const kayitlar = [];
  const tumSayfalar = [
    buildListeHtml([{ id: "30000001", kategori: "arsa", fiyat: 1000000, m2: 200, mahRaw: "Yalı Mahallesi", ilceRaw: "Bandırma" }]),
    buildListeHtml([{ id: "30000002", kategori: "arsa", fiyat: 1200000, m2: 300, mahRaw: "Merkez Mahallesi", ilceRaw: "Bandırma" }]),
    buildListeHtml([{ id: "30000003", kategori: "tarla", fiyat: 500000, m2: 1000, mahRaw: "Köy Mahallesi", ilceRaw: "Bandırma" }]),
  ];

  // maxSayfa kadar işle
  for (let i = 0; i < maxSayfa && i < tumSayfalar.length; i++) {
    simuleIlTaraSayfasi(tumSayfalar[i], "arsa", MERKEZ, gorulenler, kayitlar);
  }

  assertEqual(kayitlar.length, 2); // sadece ilk 2 sayfa
  assert(!gorulenler.has("30000003"), "3. sayfa işlenmemiş olmalı");
});
