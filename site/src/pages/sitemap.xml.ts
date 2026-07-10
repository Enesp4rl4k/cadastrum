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

// Top mahalleler — AI-tarama gelene kadar manuel curated liste (büyük şehir popüler).
// İleride: build script mahalle-baseline-final.json'dan AI-research kaynaklı top 1000'i çıkartır.
// Format: il__ilce__mahalle (URL'de tire ile değil boşluksuz)
const TOP_MAHALLELER = [
  // İstanbul
  "istanbul__besiktas__bebek", "istanbul__besiktas__etiler", "istanbul__besiktas__levent",
  "istanbul__besiktas__arnavutkoy", "istanbul__besiktas__ortakoy",
  "istanbul__sariyer__tarabya", "istanbul__sariyer__yenikoy", "istanbul__sariyer__istinye",
  "istanbul__sariyer__buyukdere", "istanbul__sariyer__zekeriyakoy",
  "istanbul__sisli__nisantasi", "istanbul__sisli__tesvikiye", "istanbul__sisli__mecidiyekoy",
  "istanbul__kadikoy__moda", "istanbul__kadikoy__caddebostan", "istanbul__kadikoy__fenerbahce",
  "istanbul__kadikoy__goztepe", "istanbul__kadikoy__suadiye",
  "istanbul__atasehir__icerenkoy", "istanbul__atasehir__acibadem",
  "istanbul__beykoz__anadoluhisari", "istanbul__beykoz__kandilli", "istanbul__beykoz__cubuklu",
  "istanbul__uskudar__kuzguncuk", "istanbul__uskudar__beylerbeyi",
  "istanbul__bakirkoy__atakoy", "istanbul__bakirkoy__yesilkoy", "istanbul__bakirkoy__florya",
  "istanbul__zeytinburnu__kazlicesme", "istanbul__fatih__sultanahmet", "istanbul__fatih__balat",
  "istanbul__beyoglu__galata", "istanbul__beyoglu__cihangir", "istanbul__beyoglu__karakoy",
  "istanbul__sile__sahilkoy",
  // Ankara
  "ankara__cankaya__cukurambar", "ankara__cankaya__gaziosmanpasa", "ankara__cankaya__kavaklidere",
  "ankara__cankaya__bahcelievler", "ankara__cankaya__ayranci",
  "ankara__yenimahalle__batikent", "ankara__yenimahalle__demetevler",
  "ankara__golbasi__incek",
  // İzmir
  "izmir__konak__alsancak", "izmir__karsiyaka__bostanli", "izmir__cesme__alacati",
  "izmir__cesme__ilica", "izmir__urla__kalabak", "izmir__seferihisar__sigacik",
  "izmir__foca__kucuk-foca",
  // Antalya
  "antalya__muratpasa__lara", "antalya__konyaalti__hurma",
  "antalya__alanya__mahmutlar", "antalya__alanya__oba", "antalya__alanya__tosmur",
  "antalya__manavgat__side", "antalya__kemer__cirali", "antalya__kas__kalkan",
  "antalya__belek__belek-merkez",
  // Muğla
  "mugla__bodrum__yalikavak", "mugla__bodrum__turgutreis", "mugla__bodrum__gumusluk",
  "mugla__bodrum__bitez", "mugla__bodrum__turkbuku",
  "mugla__fethiye__calis", "mugla__fethiye__oludeniz", "mugla__fethiye__hisaronu",
  "mugla__marmaris__icmeler", "mugla__datca__merkez",
  // Bursa
  "bursa__nilufer__gorukle", "bursa__nilufer__odunluk", "bursa__mudanya__guzelyali",
  "bursa__osmangazi__cekirge",
  // Balıkesir
  "balikesir__bandirma__yali", "balikesir__bandirma__edincik",
  "balikesir__edremit__akcay", "balikesir__ayvalik__cunda",
  "balikesir__erdek__merkez", "balikesir__gomec__merkez",
  // Aydın
  "aydin__kusadasi__kadinlar-denizi", "aydin__didim__altinkum",
  // Diğer önemliler
  "tekirdag__corlu__merkez", "kocaeli__izmit__merkez", "kocaeli__gebze__merkez",
  "yalova__cinarcik__merkez", "yalova__armutlu__merkez",
  "trabzon__ortahisar__akcaabat", "samsun__atakum__merkez",
  "denizli__pamukkale__pamukkale-merkez", "konya__selcuklu__merkez",
];

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
  entries.push({ loc: `${SITE}/kullanim-sartlari`, changefreq: "monthly", priority: 0.3 });
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
