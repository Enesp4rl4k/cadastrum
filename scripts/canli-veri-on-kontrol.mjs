#!/usr/bin/env node
/**
 * Bootstrap canlı veri çekme öncesi pre-flight kontrol.
 *
 * Kontrol eder:
 *   1. Backend `/v1/health` 200 OK
 *   2. Yeni Faz 2/4/5 endpoint'leri canlı mı (404 değil)
 *   3. D1 schema migration'ları uygulanmış mı (sample query)
 *   4. (varsa) Admin token decode + admin=1 doğrulaması
 *
 * Kullanım:
 *   node scripts/canli-veri-on-kontrol.mjs
 *   node scripts/canli-veri-on-kontrol.mjs --token=<JWT>
 *   API_BASE=https://api.cadastrum.com.tr/v1 node scripts/canli-veri-on-kontrol.mjs
 */

const API_BASE = process.env.API_BASE || "https://api.cadastrum.com.tr/v1";
const tokenArg = process.argv.find((a) => a.startsWith("--token="));
const token = tokenArg ? tokenArg.split("=")[1] : null;

const HATA = "\x1b[31m✗\x1b[0m";
const OK = "\x1b[32m✓\x1b[0m";
const WARN = "\x1b[33m⚠\x1b[0m";
const INFO = "\x1b[36mi\x1b[0m";

const sonuc = { gecen: 0, kalan: 0, uyari: 0 };

function gecen(mesaj) {
  console.log(`${OK} ${mesaj}`);
  sonuc.gecen++;
}
function basarisiz(mesaj) {
  console.log(`${HATA} ${mesaj}`);
  sonuc.kalan++;
}
function uyari(mesaj) {
  console.log(`${WARN} ${mesaj}`);
  sonuc.uyari++;
}
function bilgi(mesaj) {
  console.log(`${INFO} ${mesaj}`);
}

async function fetchTimeout(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function decodeJwt(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(parts[1].length + ((4 - (parts[1].length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function main() {
  bilgi(`Hedef API: ${API_BASE}`);
  console.log("");

  // 1. Health check
  try {
    const r = await fetchTimeout(`${API_BASE}/health`);
    if (r.ok) {
      const data = await r.json();
      gecen(`Backend canlı (env=${data.env})`);
    } else {
      basarisiz(`/health HTTP ${r.status}`);
    }
  } catch (e) {
    basarisiz(`/health unreachable: ${e.message}`);
    bilgi("Backend deploy edilmemiş olabilir. Çalıştır: cd backend/api && wrangler deploy");
    process.exit(1);
  }

  // 2. Yeni endpoint'lerin varlığı (auth gerektirenler 401, public'ler 200/400)
  const endpointTestleri = [
    {
      ad: "Faz 2 /emsal/spatial",
      url: `${API_BASE}/emsal/spatial?lat=41.08&lng=29.05&radius_km=3&kategori=arsa`,
      kabul: [200],
    },
    {
      ad: "Faz 4 /sorgu (rate limit kabul)",
      url: `${API_BASE}/sorgu`,
      method: "POST",
      body: JSON.stringify({ lat: 41.08, lng: 29.05, kategori: "arsa" }),
      kabul: [200, 400, 429],
    },
    {
      ad: "Faz 4 /bildirim/list (401 beklenir)",
      url: `${API_BASE}/bildirim/list`,
      kabul: [401],
    },
    {
      ad: "Faz 5 /crm/musteri (401/403 beklenir)",
      url: `${API_BASE}/crm/musteri`,
      kabul: [401, 403],
    },
    {
      ad: "Faz 5 /api/health (X-API-Key gerektirir, 401 beklenir)",
      url: `${API_BASE}/api/health`,
      kabul: [401],
    },
  ];

  for (const t of endpointTestleri) {
    try {
      const opts = { method: t.method || "GET" };
      if (t.body) {
        opts.headers = { "Content-Type": "application/json" };
        opts.body = t.body;
      }
      const r = await fetchTimeout(t.url, opts);
      if (t.kabul.includes(r.status)) {
        gecen(`${t.ad} → HTTP ${r.status}`);
      } else if (r.status === 404) {
        basarisiz(`${t.ad} → 404 (endpoint deploy edilmemiş — wrangler deploy?)`);
      } else {
        uyari(`${t.ad} → HTTP ${r.status} (beklenen: ${t.kabul.join("/")})`);
      }
    } catch (e) {
      basarisiz(`${t.ad} hata: ${e.message}`);
    }
  }

  // 3. Spatial endpoint cevabı parse edebiliyor muyuz (schema sanity)
  try {
    const r = await fetchTimeout(
      `${API_BASE}/emsal/spatial?lat=41.08&lng=29.05&radius_km=5&kategori=arsa`,
    );
    if (r.ok) {
      const data = await r.json();
      if (typeof data.emsaller !== "undefined" && typeof data.halkaDagilimi !== "undefined") {
        gecen(`Spatial response şema doğru (emsal: ${data.adet ?? 0})`);
        if ((data.adet ?? 0) === 0) {
          uyari("D1 ilanlar tablosunda koordlu kayıt yok — bootstrap çalıştırmadan baseline boş.");
        }
      } else {
        basarisiz("Spatial response şeması bozuk — migration eksik olabilir");
      }
    }
  } catch (e) {
    basarisiz(`Spatial parse hata: ${e.message}`);
  }

  // 4. Token verildiyse admin doğrulaması
  if (token) {
    const payload = decodeJwt(token);
    if (!payload) {
      basarisiz("Geçersiz JWT (decode edilemedi)");
    } else if (payload.admin === 1) {
      gecen(`Token admin=1 ✓ (sub=${payload.sub})`);
    } else {
      basarisiz(`Token admin=${payload.admin ?? "tanımsız"} — Bootstrap'a erişemezsin`);
      bilgi(`Çözüm: D1'de UPDATE kullanicilar SET admin=1 WHERE id=${payload.sub}; sonra çıkış-giriş yap.`);
    }
  } else {
    bilgi("Token verilmedi — admin kontrolü atlandı (--token=<JWT> ile geç)");
  }

  // Özet
  console.log("");
  console.log(`Geçen: ${sonuc.gecen}, Başarısız: ${sonuc.kalan}, Uyarı: ${sonuc.uyari}`);
  if (sonuc.kalan > 0) {
    console.log("");
    console.log("Başarısız kontroller var. Bootstrap'i çalıştırmadan önce düzelt.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
