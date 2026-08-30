#!/usr/bin/env node
/**
 * site/src/data/ilceler.ts üreteci.
 *
 * NEDEN: site `/veri/{il}/{ilce}` sayfalarını `getStaticPaths` ile üretiyor ve
 * bunun için ilçe listesine ihtiyacı var. Liste zaten depoda var
 * (`src/lib/data/ilce-listesi-bootstrap.ts`, 973 ilçe) ama o dosya uzantı
 * paketine ait — site ayrı bir npm paketi, oradan import etmek kırılgan.
 *
 * Alternatif "build sırasında API'den çek" yolu bilinçli olarak seçilmedi:
 * API o an erişilemezse sayfa üretimi SESSİZCE sıfıra düşer ve kimse fark etmez.
 * Statik liste, üretimin ağdan bağımsız ve tekrarlanabilir olmasını sağlar.
 *
 * Yenile:
 *   node scripts/site-ilce-listesi-uret.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const KOK = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const KAYNAK = join(KOK, "src", "lib", "data", "ilce-listesi-bootstrap.ts");
const HEDEF = join(KOK, "site", "src", "data", "ilceler.ts");

const ham = readFileSync(KAYNAK, "utf8");

// Dosya `export const BOOTSTRAP_ILCE_LISTESI: BootstrapIlce[] = [ ... ];`
// Dikkat: ilk `[` tip anotasyonunun (`BootstrapIlce[]`) parçası — dizi `=`den sonra başlıyor.
const esitlik = ham.indexOf("=", ham.indexOf("BOOTSTRAP_ILCE_LISTESI"));
const basla = ham.indexOf("[", esitlik);
if (basla === -1) {
  throw new Error("ilce-listesi-bootstrap.ts biçimi tanınmadı — üreteç güncellenmeli");
}
// Köşeli parantez eşlemesi: dosyada dizinin ARDINDAN da kod var, `lastIndexOf("]")`
// yanlış yeri bulur. (Veri dosyasında dize içinde `[`/`]` geçmiyor.)
let derinlik = 0;
let bit = -1;
for (let i = basla; i < ham.length; i++) {
  if (ham[i] === "[") derinlik++;
  else if (ham[i] === "]") {
    derinlik--;
    if (derinlik === 0) { bit = i; break; }
  }
}
if (bit === -1) throw new Error("Dizi kapanışı bulunamadı — üreteç güncellenmeli");

/** @type {Array<{il:string; ilce:string; ilNorm:string; ilceNorm:string}>} */
const liste = JSON.parse(ham.slice(basla, bit + 1));
if (!Array.isArray(liste) || liste.length < 900) {
  throw new Error(`Beklenen ~973 ilçe, ${liste?.length} bulundu — üretim durduruldu`);
}

/**
 * Kaynak listedeki ilçe adını URL slug'ına çevirir.
 *
 * İKİ AYRI ADLANDIRMA VAR ve karıştırılırsa sayfa üretilir ama veri gelmez:
 *
 *   bootstrap listesi (idari ad) │ D1 `ilce_norm` (ilandan gelen)
 *   ─────────────────────────────┼──────────────────────────────
 *   "adiyaman merkez"            │ "merkez"
 *   "19 mayis"                   │ "19 mayis"
 *
 * Ölçüldü: 973 ilçenin 52'sinde boşluk var; 51'i `{il} merkez` kalıbı, 1'i
 * gerçek çok kelimeli ad (Samsun / 19 Mayıs). Site'ın kendi ilçe bağlantıları
 * API'den üretiliyor (`veri/[il].astro` → `ic.ilce_norm.replace(/\s+/g,"-")`),
 * yani KANONİK URL'i API belirliyor. Bu yüzden il ön eki atılıyor ve boşluklar
 * tireye çevriliyor:
 *
 *   "adiyaman merkez" → /veri/adiyaman/merkez     (bağlantılarla birebir)
 *   "19 mayis"        → /veri/samsun/19-mayis
 *
 * `apiNorm` geri dönüşüm: D1'deki `ilce_norm` asla tire içermez (normalizeYerAdi
 * tire dışındaki her şeyi boşluğa çevirir), dolayısıyla tire→boşluk dönüşümü
 * belirsizlik yaratmaz.
 */
function slugYap(ilNorm, ilceNorm) {
  const onekSiz = ilceNorm.startsWith(ilNorm + " ")
    ? ilceNorm.slice(ilNorm.length + 1)
    : ilceNorm;
  return onekSiz.replace(/\s+/g, "-");
}

// il_norm → [{slug, apiNorm, ad}] — getStaticPaths, API sorgusu ve başlık için
/** @type {Record<string, Array<{norm: string; apiNorm: string; ad: string}>>} */
const ilBazli = {};
for (const k of liste) {
  if (!k.ilNorm || !k.ilceNorm) continue;
  const slug = slugYap(k.ilNorm, k.ilceNorm);
  (ilBazli[k.ilNorm] ??= []).push({
    norm: slug,
    apiNorm: slug.replace(/-/g, " "),
    ad: k.ilce,
  });
}
for (const il of Object.keys(ilBazli)) {
  ilBazli[il].sort((a, b) => a.norm.localeCompare(b.norm, "tr"));
}

// Slug çakışması olursa iki ilçe aynı sayfaya düşer — sessizce birini kaybederiz.
for (const [il, kayitlar] of Object.entries(ilBazli)) {
  const gorulen = new Set();
  for (const k of kayitlar) {
    if (gorulen.has(k.norm)) {
      throw new Error(`Slug çakışması: ${il}/${k.norm} — slugYap kuralı gözden geçirilmeli`);
    }
    gorulen.add(k.norm);
  }
}

const ilSayisi = Object.keys(ilBazli).length;
const ilceSayisi = Object.values(ilBazli).reduce((t, v) => t + v.length, 0);

const cikti = `/**
 * Otomatik üretildi — ELLE DÜZENLEME.
 * Kaynak: src/lib/data/ilce-listesi-bootstrap.ts
 * Yenile: node scripts/site-ilce-listesi-uret.mjs
 *
 * ${ilSayisi} il · ${ilceSayisi} ilçe.
 *
 * Kullanım: /veri/{il}/{ilce} sayfalarının getStaticPaths'i. Bu liste boşsa
 * ilçe sayfaları hiç üretilmez ve sitemap'in vaat ettiği URL'ler 404 olur —
 * bu yüzden site/test/veri-rotalari.spec.ts kapsamı sabitliyor.
 */

export interface IlceKaydi {
  /** URL slug'ı — /veri/{il}/{norm} (ör. "catalca", "merkez", "19-mayis"). */
  norm: string;
  /** API'ye gönderilecek biçim: tireler boşluğa döner (ör. "19 mayis"). */
  apiNorm: string;
  /** Görünen ad (ör. "Çatalca", "Adıyaman Merkez"). */
  ad: string;
}

export const ILCELER: Record<string, IlceKaydi[]> = ${JSON.stringify(ilBazli, null, 2)};

/** Tüm il/ilçe çiftleri — getStaticPaths için düz liste. */
export function tumIlceler(): Array<{ il: string; ilce: string; ad: string }> {
  const out: Array<{ il: string; ilce: string; ad: string }> = [];
  for (const [il, kayitlar] of Object.entries(ILCELER)) {
    for (const k of kayitlar) out.push({ il, ilce: k.norm, ad: k.ad });
  }
  return out;
}

/** Bir ilçenin görünen adı; bilinmiyorsa slug'ı başlıklandırır. */
export function ilceAdi(il: string, ilce: string): string {
  const bulunan = ILCELER[il]?.find((k) => k.norm === ilce);
  if (bulunan) return bulunan.ad;
  return ilce.split("-").map((w) => w.charAt(0).toLocaleUpperCase("tr") + w.slice(1)).join(" ");
}
`;

writeFileSync(HEDEF, cikti, "utf8");
console.log(`site/src/data/ilceler.ts yazıldı — ${ilSayisi} il, ${ilceSayisi} ilçe`);
