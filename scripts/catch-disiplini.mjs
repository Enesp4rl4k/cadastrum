#!/usr/bin/env node
/**
 * catch disiplini — sessiz hata yasağı (Roadmap Sprint B.1)
 *
 * Boş ya da yalnızca yorum içeren `catch` bloğu yasak. Bu oturumda bulunan 13
 * hatanın en büyük grubu (A sınıfı) tam olarak buydu: istisna yutuluyor, çağıran
 * `null` görüyor ve bunu "veri yok" diye raporluyordu. `mahalle_merkez` tablosunun
 * hiç var olmaması aylarca böyle gizlendi; hepsiemlak'ın HTTP 429'u da öyle.
 *
 * Bir `catch` üçünden biri olmalı:
 *   1. GÖRÜNÜR FALLBACK — blokta gerçek kod var (dönüş, sayaç, alternatif yol).
 *   2. KAYIT — `hataKaydet(...)` çağrısı (backend `lib/hata-kaydet.ts`).
 *   3. İŞARETLİ YOKLUK — `// beklenen yokluk: <sebep>` yorumu. Sebep zorunlu:
 *      yokluğun neden alarm DEĞİL geçerli bir durum olduğu yazılmalı.
 *
 * Kural geriye dönük uygulanmıyor. `catch-disiplini-baseline.json` bugünkü ihlal
 * sayısını dosya bazında dondurur; sayı ARTAMAZ. Bir dosyadaki ihlal azaldığında
 * kazanç sabitlensin diye baseline'ın güncellenmesi istenir:
 *
 *     node scripts/catch-disiplini.mjs --guncelle
 *
 * Kullanım:
 *     node scripts/catch-disiplini.mjs            # denetle (CI)
 *     node scripts/catch-disiplini.mjs --kok DIZIN # başka bir ağacı tara (test)
 *     node scripts/catch-disiplini.mjs --liste    # tüm ihlalleri dosya:satır bas
 *     node scripts/catch-disiplini.mjs --guncelle # baseline'ı yeniden yaz
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Varsayılan kök: deponun kendisi (aracın konumundan türetilir, çağıran dizinden
 * bağımsız). `--kok <dizin>` yalnızca aracın kendi testi için — bkz.
 * test/catch-disiplini.spec.ts.
 */
const kokArg = process.argv.indexOf("--kok");
const KOK = kokArg !== -1 && process.argv[kokArg + 1]
  ? resolve(process.argv[kokArg + 1])
  : join(fileURLToPath(new URL(".", import.meta.url)), "..");
const BASELINE_YOL = join(KOK, "scripts", "catch-disiplini-baseline.json");

/** Taranan kaynak ağaçları — üretim koduna giden her şey. */
const TARANAN = ["src", "backend/api/src", "site/src", "scripts", "packages"];
const UZANTI = [".ts", ".tsx", ".mjs", ".js"];
const ATLA = new Set(["node_modules", "dist", "build", ".astro", "coverage", ".git"]);

/** Test dosyaları kapsam dışı: orada yutulan istisna üretim verisini bozmuyor. */
const TEST_DESEN = /\.(spec|test)\.(ts|tsx|mjs|js)$/;

const ISARET = /beklenen yokluk\s*:\s*\S/i;
const KAYIT = /\bhataKaydet\s*\(/;

// ── Kaynak maskeleme ─────────────────────────────────────────────────────────

/**
 * Dize, şablon dizesi, yorum ve REGEX literal'lerini aynı uzunlukta boşlukla
 * değiştirir. Süslü parantez eşlemesi maskelenmiş metin üzerinde yapılır —
 * böylece bir dizenin içindeki `}` blok sonu sanılmaz.
 *
 * Regex maskeleme şart: `/\d{7,}/` gibi bir desendeki `{` süslü parantez
 * sayımını kaydırır ve dosyanın geri kalanındaki catch blokları YANLIŞ NEGATİF
 * olur — kural sessizce uygulanmaz hâle gelir. Aracın ilk sürümünde tam olarak
 * bu oldu: scraper dosyaları "temiz" göründü, oysa ihlaller görülmemişti.
 * (Sessiz hata yasağı koyan aracın kendisinin sessizce bozulması.)
 */
function maskele(s) {
  const out = s.split("");
  let i = 0;
  const n = s.length;
  const bosalt = (a, b) => {
    for (let k = a; k < b && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  /** Son anlamlı karakter — `/` bölme mi regex başlangıcı mı, buna bakılır. */
  let sonAnlamli = "";
  /** Regex'ten hemen önce gelebilen anahtar kelimeler (`return /re/.test(x)`). */
  const REGEX_ONCESI_KELIME =
    /\b(return|typeof|case|in|of|delete|void|instanceof|new|do|else|yield|await)\s*$/;

  while (i < n) {
    const c = s[i];
    const d = s[i + 1];

    if (
      c === "/" && d !== "/" && d !== "*" &&
      (sonAnlamli === "" ||
        "(,=:[!&|?{};+-*%~^<>".includes(sonAnlamli) ||
        REGEX_ONCESI_KELIME.test(s.slice(Math.max(0, i - 14), i)))
    ) {
      // Regex literal: kapanış `/`'ına kadar. Karakter sınıfı ([...]) içindeki
      // `/` kapanış sayılmaz; kaçışlı karakterler atlanır.
      let j = i + 1;
      let sinifta = false;
      let kapandi = false;
      while (j < n && s[j] !== "\n") {
        const k = s[j];
        if (k === "\\") { j += 2; continue; }
        if (k === "[") sinifta = true;
        else if (k === "]") sinifta = false;
        else if (k === "/" && !sinifta) { kapandi = true; break; }
        j++;
      }
      if (kapandi) {
        while (j + 1 < n && /[a-z]/.test(s[j + 1])) j++;   // bayraklar (g, i, s…)
        bosalt(i, j + 1);
        i = j + 1;
        sonAnlamli = "x";   // regex bir değerdir; sonrasındaki `/` bölmedir
        continue;
      }
      // Kapanmadıysa regex değildi (bölme işlemi) — normal akışa düş.
    }

    if (c === "/" && d === "/") {
      let j = s.indexOf("\n", i);
      if (j === -1) j = n;
      bosalt(i, j);
      i = j;
    } else if (c === "/" && d === "*") {
      const j = s.indexOf("*/", i + 2);
      const son = j === -1 ? n : j + 2;
      bosalt(i, son);
      i = son;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) {
        if (s[j] === "\\") { j += 2; continue; }
        if (s[j] === c) break;
        j++;
      }
      bosalt(i, Math.min(j + 1, n));
      i = Math.min(j + 1, n);
    } else {
      if (!/\s/.test(c)) sonAnlamli = c;
      i++;
    }
  }
  return out.join("");
}

// ── catch bloklarını bul ─────────────────────────────────────────────────────

/**
 * @returns {{satir:number, govde:string}[]} — her catch bloğunun gövdesi (orijinal metin)
 */
function catchBloklari(kaynak) {
  const maske = maskele(kaynak);
  const bulunan = [];
  const re = /\bcatch\b/g;
  let m;
  while ((m = re.exec(maske)) !== null) {
    // `catch` sonrası isteğe bağlı (e) parametresi, sonra `{`
    let i = m.index + 5;
    while (i < maske.length && /\s/.test(maske[i])) i++;
    if (maske[i] === "(") {
      let derinlik = 1;
      i++;
      while (i < maske.length && derinlik > 0) {
        if (maske[i] === "(") derinlik++;
        else if (maske[i] === ")") derinlik--;
        i++;
      }
      while (i < maske.length && /\s/.test(maske[i])) i++;
    }
    if (maske[i] !== "{") continue; // `catch` bir tanımlayıcı parçasıysa atla
    const basla = i + 1;
    let derinlik = 1;
    i++;
    while (i < maske.length && derinlik > 0) {
      if (maske[i] === "{") derinlik++;
      else if (maske[i] === "}") derinlik--;
      i++;
    }
    if (derinlik !== 0) continue;
    bulunan.push({
      satir: kaynak.slice(0, m.index).split("\n").length,
      govde: kaynak.slice(basla, i - 1),
      govdeMaske: maske.slice(basla, i - 1),
    });
  }
  return bulunan;
}

/** Bir catch bloğu ihlal mi? */
function ihlal(blok) {
  // Maskede yorum ve dizeler boşaltılmış — geriye kalan varsa gerçek kod var.
  if (blok.govdeMaske.trim() !== "") return false;
  if (ISARET.test(blok.govde)) return false;
  if (KAYIT.test(blok.govde)) return false; // yalnızca yorumda geçse bile kayıt niyeti açık
  return true;
}

// ── Dosya gezintisi ──────────────────────────────────────────────────────────

function* dosyalar(dizin) {
  let girdiler;
  try {
    girdiler = readdirSync(dizin);
  } catch {
    // beklenen yokluk: taranan ağaçlardan biri bu checkout'ta yok (ör. packages)
    return;
  }
  for (const ad of girdiler) {
    if (ATLA.has(ad)) continue;
    const tam = join(dizin, ad);
    const st = statSync(tam);
    if (st.isDirectory()) yield* dosyalar(tam);
    else if (UZANTI.some((u) => ad.endsWith(u)) && !TEST_DESEN.test(ad)) yield tam;
  }
}

function tara() {
  /** @type {Map<string, {satir:number, ozet:string}[]>} */
  const sonuc = new Map();
  for (const kok of TARANAN) {
    for (const dosya of dosyalar(join(KOK, kok))) {
      const yol = relative(KOK, dosya).split(sep).join("/");
      const kaynak = readFileSync(dosya, "utf8");
      if (!kaynak.includes("catch")) continue;
      const ihlaller = catchBloklari(kaynak)
        .filter(ihlal)
        .map((b) => ({ satir: b.satir, ozet: b.govde.replace(/\s+/g, " ").trim().slice(0, 60) }));
      if (ihlaller.length) sonuc.set(yol, ihlaller);
    }
  }
  return sonuc;
}

function baselineOku() {
  try {
    return JSON.parse(readFileSync(BASELINE_YOL, "utf8")).dosyalar ?? {};
  } catch {
    // beklenen yokluk: baseline ilk kez üretiliyor — --guncelle bunu yazacak
    return {};
  }
}

// ── Ana akış ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const sonuc = tara();
const toplam = [...sonuc.values()].reduce((t, v) => t + v.length, 0);

if (argv.includes("--liste")) {
  for (const [yol, ihlaller] of [...sonuc].sort()) {
    for (const i of ihlaller) console.log(`${yol}:${i.satir}  {${i.ozet}}`);
  }
  console.log(`\n${toplam} ihlal / ${sonuc.size} dosya`);
  process.exit(0);
}

if (argv.includes("--guncelle")) {
  const dosyalarObj = {};
  for (const [yol, ihlaller] of [...sonuc].sort()) dosyalarObj[yol] = ihlaller.length;
  writeFileSync(
    BASELINE_YOL,
    JSON.stringify(
      {
        _aciklama:
          "Sprint B.1 catch disiplini — dosya başına DEVRALINAN ihlal sayısı. " +
          "Bu sayılar artamaz. Yeni kod yazarken catch bloğu ya görünür bir fallback'e " +
          "geçmeli, ya hataKaydet() çağırmalı, ya da `// beklenen yokluk: <sebep>` ile işaretlenmeli.",
        _uretim: "node scripts/catch-disiplini.mjs --guncelle",
        toplam,
        dosyalar: dosyalarObj,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(`baseline yazıldı: ${toplam} ihlal / ${sonuc.size} dosya`);
  process.exit(0);
}

const baseline = baselineOku();
const artan = [];
const azalan = [];
for (const [yol, ihlaller] of sonuc) {
  const izin = baseline[yol] ?? 0;
  if (ihlaller.length > izin) artan.push({ yol, izin, simdi: ihlaller.length, ihlaller });
}
for (const [yol, izin] of Object.entries(baseline)) {
  const simdi = sonuc.get(yol)?.length ?? 0;
  if (simdi < izin) azalan.push({ yol, izin, simdi });
}

if (artan.length === 0 && azalan.length === 0) {
  console.log(`catch disiplini ✓ — ${toplam} devralınan ihlal, yeni ihlal yok`);
  process.exit(0);
}

if (artan.length) {
  console.error("\ncatch disiplini ✗ — YENİ sessiz catch bloğu:\n");
  for (const a of artan) {
    console.error(`  ${a.yol}  (devralınan ${a.izin}, şimdi ${a.simdi})`);
    for (const i of a.ihlaller) console.error(`    satır ${i.satir}: catch {${i.ozet}}`);
  }
  console.error(
    "\nBir catch bloğu üçünden biri olmalı:\n" +
      "  1. görünür fallback (blokta gerçek kod)\n" +
      "  2. hataKaydet(...) ile kayıt\n" +
      "  3. `// beklenen yokluk: <sebep>` işareti — sebep zorunlu\n",
  );
}

if (azalan.length) {
  console.error(
    (artan.length ? "" : "\n") + "catch disiplini — kazanç sabitlenmemiş:\n",
  );
  for (const a of azalan) console.error(`  ${a.yol}  (baseline ${a.izin}, şimdi ${a.simdi})`);
  console.error("\nÇalıştır: node scripts/catch-disiplini.mjs --guncelle\n");
}

process.exit(1);
