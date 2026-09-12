/**
 * Sitemap.xml — Cadastrum site için Google indexleme.
 *
 * İçerik:
 * - Statik sayfalar (anasayfa, fiyat, sss, gizlilik, kullanım şartları, /veri)
 * - 81 il sayfası (/veri/{il})
 * - Top 1000 popüler mahalle (AI-research veya yüksek güvenli KNN)
 *
 * Astro endpoint: GET /sitemap.xml → application/xml
 */
import type { APIRoute } from "astro";
import { BLOG_YAZILAR } from "../data/blog-yazilar.ts";
import { TOP_MAHALLELER as ORTAK_TOP_MAHALLELER } from "../data/top-mahalleler.ts";

export const prerender = true;

const SITE = "https://cadastrum.com.tr";
const TODAY = new Date().toISOString().slice(0, 10);

// 81 il norm key (extension'ın normalizeYerAdi çıktısıyla uyumlu)
const ILLER_NORM = [
  "istanbul", "ankara", "izmir", "bursa", "antalya", "adana", "konya",
  "gaziantep", "mersin", "diyarbakir", "kayseri", "samsun", "eskisehir",
  "denizli", "sanliurfa", "trabzon", "hatay", "manisa", "kahramanmaras",
  "balikesir", "aydin", "tekirdag", "sakarya", "mugla", "kocaeli",
  "malatya", "erzurum", "van", "ordu", "yalova", "canakkale", "edirne",
  "adiyaman", "afyonkarahisar", "agri", "aksaray", "amasya", "ardahan",
  "artvin", "bartin", "batman", "bayburt", "bilecik", "bingol", "bitlis",
  "bolu", "burdur", "cankiri", "corum", "duzce", "elazig", "erzincan",
  "giresun", "gumushane", "hakkari", "igdir", "isparta", "karabuk",
  "karaman", "kars", "kastamonu", "kirikkale", "kirklareli", "kirsehir",
  "kilis", "kutahya", "mardin", "mus", "nevsehir", "nigde", "osmaniye",
  "rize", "siirt", "sinop", "sivas", "sirnak", "tokat", "tunceli", "usak",
  "zonguldak",
];

// Top mahalleler — TEK KAYNAK: src/data/top-mahalleler.ts.
// Aynı liste /veri/{il}/{ilce}/{mahalle} sayfalarını da üretiyor; sitemap'in
// vaat ettiği her URL'in karşılığında gerçek bir sayfa olsun diye ortaklaştırıldı.
const TOP_MAHALLELER = ORTAK_TOP_MAHALLELER;

interface UrlEntry {
  loc: string;
  changefreq: "daily" | "weekly" | "monthly";
  priority: number;
  lastmod?: string;
}

function buildUrlSet(entries: UrlEntry[]): string {
  const xmlEntries = entries.map(e => `  <url>
    <loc>${e.loc}</loc>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority.toFixed(1)}</priority>
    ${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}
  </url>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlEntries}
</urlset>`;
}

export const GET: APIRoute = () => {
  const entries: UrlEntry[] = [];

  // Statik sayfalar
  entries.push({ loc: `${SITE}/`, changefreq: "weekly", priority: 1.0, lastmod: TODAY });
  entries.push({ loc: `${SITE}/fiyat`, changefreq: "monthly", priority: 0.8, lastmod: TODAY });
  entries.push({ loc: `${SITE}/harita`, changefreq: "weekly", priority: 0.9, lastmod: TODAY });
  entries.push({ loc: `${SITE}/sss`, changefreq: "monthly", priority: 0.5, lastmod: TODAY });
  entries.push({ loc: `${SITE}/gizlilik`, changefreq: "monthly", priority: 0.3 });
  // Kullanıcının kayıtta kabul ettiği metin bu. Eskiden sitemap farklı içerikli
  // /kullanim-sartlari'nı bildiriyordu (iade modeli bile çelişiyordu); o sayfa
  // kaldırıldı ve buraya 301 ile yönleniyor (public/_redirects).
  entries.push({ loc: `${SITE}/kullanim-kosullari`, changefreq: "monthly", priority: 0.3 });
  entries.push({ loc: `${SITE}/veri`, changefreq: "weekly", priority: 0.9, lastmod: TODAY });
  entries.push({ loc: `${SITE}/blog`, changefreq: "weekly", priority: 0.8, lastmod: TODAY });

  // Blog yazıları
  for (const yazi of BLOG_YAZILAR) {
    entries.push({
      loc: `${SITE}/blog/${yazi.slug}`,
      changefreq: "monthly",
      priority: 0.7,
      lastmod: yazi.yayinTarihi,
    });
  }

  // 81 il sayfası
  for (const il of ILLER_NORM) {
    entries.push({
      loc: `${SITE}/veri/${il}`,
      changefreq: "weekly",
      priority: 0.7,
      lastmod: TODAY,
    });
  }

  // Top mahalleler (popüler 100+, dinamik AI sonrası genişler)
  for (const key of TOP_MAHALLELER) {
    const parts = key.split("__");
    if (parts.length !== 3) continue;
    entries.push({
      loc: `${SITE}/veri/${parts[0]}/${parts[1]}/${parts[2]}`,
      changefreq: "weekly",
      priority: 0.6,
      lastmod: TODAY,
    });
  }

  return new Response(buildUrlSet(entries), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
};
