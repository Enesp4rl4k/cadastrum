#!/usr/bin/env node
/**
 * scripts/tucbs-tile-seed.mjs
 *
 * TUCBS ÇDP imar tile'larını TKGM'in kendi sunucusundan (Cloudflare Worker
 * DEĞİL — Worker'ın outbound IP'si TUCBS tarafından engelleniyor/yavaşlatılıyor,
 * 522 timeout alıyor) doğrudan çekip Cloudflare R2'ye yükler.
 *
 * Worker'daki /v1/proxy/tucbs/tile/:wms/:z/:x/:y route'u önce R2'ye bakıyor;
 * burada seed edilen tile'lar canlı isteklerde TUCBS'e hiç gitmeden servis edilir.
 *
 * Kullanım:
 *   node scripts/tucbs-tile-seed.mjs --slug csb_cdp_im_wms --minlat 40.0 --maxlat 41.6 --minlng 26.0 --maxlng 29.5 --minzoom 7 --maxzoom 10
 *
 * Gereksinim: wrangler login yapılmış olmalı (backend/api'den r2 object put çalıştırılıyor).
 */
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

const SLUG = getArg("slug", "csb_cdp_im_wms");
const MIN_LAT = Number(getArg("minlat", "40.0"));
const MAX_LAT = Number(getArg("maxlat", "41.6"));
const MIN_LNG = Number(getArg("minlng", "26.0"));
const MAX_LNG = Number(getArg("maxlng", "29.5"));
const MIN_ZOOM = Number(getArg("minzoom", "7"));
const MAX_ZOOM = Number(getArg("maxzoom", "10"));
const BUCKET = "cadastrum-tucbs-tiles";
const R2_ACCOUNT_ID = "8b2a9815c019505c8df47539cd0e332e"; // eparlak996

function lngLatToTile(lng, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return [x, y];
}

function tileListUret(z) {
  const [xMin, yMax] = lngLatToTile(MIN_LNG, MIN_LAT, z);
  const [xMax, yMin] = lngLatToTile(MAX_LNG, MAX_LAT, z);
  const liste = [];
  for (let x = Math.min(xMin, xMax); x <= Math.max(xMin, xMax); x++) {
    for (let y = Math.min(yMin, yMax); y <= Math.max(yMin, yMax); y++) {
      liste.push([z, x, y]);
    }
  }
  return liste;
}

async function tileGetir(z, x, y) {
  const WORLD = 20037508.342789244;
  const tileSize = (WORLD * 2) / 2 ** z;
  const minX = -WORLD + x * tileSize;
  const maxX = minX + tileSize;
  const maxY = WORLD - y * tileSize;
  const minY = maxY - tileSize;
  const bbox = `${minX},${minY},${maxX},${maxY}`;

  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    FORMAT: "image/png",
    TRANSPARENT: "true",
    LAYERS: "2",
    CRS: "EPSG:3857",
    STYLES: "",
    WIDTH: "256",
    HEIGHT: "256",
    BBOX: bbox,
  });
  const url = `https://tucbs-public-api.csb.gov.tr/${SLUG}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Cadastrum/1.0)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  console.log(`\n=== TUCBS Tile Seed — ${SLUG} ===`);
  console.log(`Bölge: lat ${MIN_LAT}-${MAX_LAT}, lng ${MIN_LNG}-${MAX_LNG}, zoom ${MIN_ZOOM}-${MAX_ZOOM}`);

  const tmpDir = mkdtempSync(join(tmpdir(), "tucbs-tile-"));
  let toplam = 0;
  let basarili = 0;
  let hata = 0;
  let bosSayfa = 0;

  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const tiles = tileListUret(z);
    console.log(`\nZoom ${z}: ${tiles.length} tile`);

    for (const [zz, x, y] of tiles) {
      toplam++;
      const r2Key = `${SLUG}/${zz}/${x}/${y}.png`;
      try {
        const buf = await tileGetir(zz, x, y);
        // TUCBS boş/şeffaf tile'ları da 200 döner — çok küçükse (< 200 byte)
        // muhtemelen boş, yine de yükle (R2'de "veri yok" olarak cache'lenmiş olur,
        // ileride canlı isteklerin TUCBS'e tekrar gitmesini önler).
        const tmpFile = join(tmpDir, "tile.png");
        writeFileSync(tmpFile, buf);
        execSync(
          `npx wrangler r2 object put ${BUCKET}/${r2Key} --file="${tmpFile}" --content-type=image/png --remote`,
          { cwd: "backend/api", stdio: "pipe", env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: R2_ACCOUNT_ID } },
        );
        unlinkSync(tmpFile);
        basarili++;
        if (buf.length < 200) bosSayfa++;
        process.stdout.write(`  ✅ z${zz}/${x}/${y} (${buf.length}b)\n`);
      } catch (e) {
        hata++;
        process.stdout.write(`  ❌ z${zz}/${x}/${y} — ${e instanceof Error ? e.message : e}\n`);
      }
      // TUCBS'i yormamak için küçük bekleme
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  console.log(`\n=== Tamamlandı ===`);
  console.log(`Toplam: ${toplam} | Başarılı: ${basarili} | Hata: ${hata} | Boş/şeffaf: ${bosSayfa}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
