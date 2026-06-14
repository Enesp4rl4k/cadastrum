import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "Cadastrum — Arsa TKGM Parsel Zekâsı",
  version: pkg.version,
  description: "TKGM parsel + e-Plan imar + Sahibinden/Hepsiemlak ilan doğrulama + 65.000 mahalle AI fiyat tahmini + lojistik skor.",
  minimum_chrome_version: "114",
  action: {
    default_title: "Arsa TKGM Parsel — Panel'i aç",
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  permissions: [
    "sidePanel",
    "storage",
    "contextMenus",
    "tabs",
    "alarms",
    "declarativeNetRequest",
    "scripting",
  ],
  declarative_net_request: {
    rule_resources: [
      {
        id: "tkgm_origin_rules",
        enabled: true,
        path: "public/dnr-rules.json",
      },
    ],
  },
  host_permissions: [
    "https://cbsapi.tkgm.gov.tr/*",
    "https://parselsorgu.tkgm.gov.tr/*",
    "https://e-plan.gov.tr/*",
    "https://overpass-api.de/*",
    "https://lz4.overpass-api.de/*",
    "https://overpass.osm.ch/*",
    "https://overpass.private.coffee/*",
    "https://nominatim.openstreetmap.org/*",
    "https://api.open-meteo.com/*",
    "https://archive-api.open-meteo.com/*",
    "https://www.tcmb.gov.tr/*",
    "https://rest.isric.org/*",
    "https://re.jrc.ec.europa.eu/*",
    "https://www.sahibinden.com/*",
    "https://www.hepsiemlak.com/*",
    "https://hepsiemlak.com/*",
    // Harita tile sunucuları
    "https://server.arcgisonline.com/*",
    "https://tile.openstreetmap.org/*",
    "https://*.basemaps.cartocdn.com/*",
    "https://*.tile.opentopomap.org/*",
    // MapLibre PBF glyph fontu (symbol layer'ların text-field rendering'i için)
    "https://demotiles.maplibre.org/*",
    // AI fiyat tahmini sağlayıcıları (opt-in)
    "http://localhost:11434/*",
    "https://generativelanguage.googleapis.com/*",
    // Cadastrum backend API — custom domain + workers.dev (pilot)
    "https://api.cadastrum.com.tr/*",
    "https://cadastrum-api.cadastrum-tr.workers.dev/*",
  ],
  content_scripts: [
    {
      matches: ["https://www.sahibinden.com/ilan/*"],
      js: ["src/content/sahibinden.ts"],
      run_at: "document_idle",
    },
    {
      // Sahibinden arama/liste sayfaları — tüm sayfalarda yüklen, script içinde URL filtrele
      // (mid-path wildcard'lar Chrome MV3'te bazen güvenilmez davranıyor)
      matches: [
        "https://www.sahibinden.com/*",
      ],
      js: ["src/content/sahibinden-liste.ts"],
      run_at: "document_idle",
    },
    {
      // Hepsiemlak — tüm sayfalarda çalışsın, script kendi içinde URL filtresi yapar
      // (mid-path wildcard'lar Chrome'da bazen güvenilmez davranıyor)
      matches: [
        "https://www.hepsiemlak.com/*",
        "https://hepsiemlak.com/*",
      ],
      js: ["src/content/hepsiemlak.ts"],
      run_at: "document_idle",
    },
    {
      // Hepsiemlak liste — aynı şekilde tüm sayfalar, script içinde ayrılır
      matches: [
        "https://www.hepsiemlak.com/*",
        "https://hepsiemlak.com/*",
      ],
      js: ["src/content/hepsiemlak-liste.ts"],
      run_at: "document_idle",
    },
    {
      matches: ["https://e-plan.gov.tr/e-plan/html/imarDurumu.html*"],
      js: ["src/content/eplan.ts"],
      run_at: "document_idle",
    },
    {
      // Site ↔ Extension auth köprüsü — cadastrum.com.tr'de window.postMessage dinler
      matches: [
        "https://cadastrum.com.tr/*",
        "https://www.cadastrum.com.tr/*",
      ],
      js: ["src/content/auth-koprusu.ts"],
      run_at: "document_start",
    },
  ],
  icons: {
    "16": "public/icon-16.png",
    "48": "public/icon-48.png",
    "128": "public/icon-128.png",
  },
  web_accessible_resources: [
    {
      resources: ["src/rapor/index.html"],
      matches: ["<all_urls>"],
    },
  ],
});
