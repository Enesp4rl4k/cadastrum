/**
 * Sitemap.xml — Cadastrum site için Google indexleme.
 *
 * İçerik: statik SEO landings + blog + 81 il + ilçe sayfaları.
 * SEO-5: İlçe sayfaları eklendi.
 * Not: ILCE_LISTESI [ilce].astro ile senkron tutulmalı.
 */
import type { APIRoute } from "astro";
import { BLOG_YAZILAR } from "../data/blog-yazilar.ts";
// SEO-5: İlçe URL'leri sitemap'e eklendi
// SITE_ILCE_LISTESI = site/src/data/ilce-listesi.ts (node scripts/site-ilce-uret.mjs ile üretilir)
// Şimdilik inline SITEMAP_ILCELER ile çalışır — dosya generate edilince import bağlanır

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

  // ── Ana & ürün sayfaları ─────────────────────────────────────────────────
  entries.push({ loc: `${SITE}/`, changefreq: "weekly", priority: 1.0, lastmod: TODAY });
  entries.push({ loc: `${SITE}/sorgu`, changefreq: "weekly", priority: 0.95, lastmod: TODAY });
  entries.push({ loc: `${SITE}/harita`, changefreq: "weekly", priority: 0.9, lastmod: TODAY });
  entries.push({ loc: `${SITE}/fiyat`, changefreq: "monthly", priority: 0.85, lastmod: TODAY });

  // ── Yüksek niyetli SEO landings ──────────────────────────────────────────
  entries.push({ loc: `${SITE}/arsa-yatirimi`, changefreq: "weekly", priority: 0.95, lastmod: TODAY });
  entries.push({ loc: `${SITE}/tarla-yatirimi`, changefreq: "weekly", priority: 0.95, lastmod: TODAY });
  entries.push({ loc: `${SITE}/imar-sorgu`, changefreq: "weekly", priority: 0.9, lastmod: TODAY });
  entries.push({ loc: `${SITE}/tkgm-parsel-sorgu`, changefreq: "weekly", priority: 0.9, lastmod: TODAY });
  entries.push({ loc: `${SITE}/ai-arsa-analiz`, changefreq: "weekly", priority: 0.95, lastmod: TODAY });
  entries.push({ loc: `${SITE}/kat-karsiligi`, changefreq: "weekly", priority: 0.85, lastmod: TODAY });

  // ── İçerik & destek sayfaları ────────────────────────────────────────────
  entries.push({ loc: `${SITE}/veri`, changefreq: "weekly", priority: 0.9, lastmod: TODAY });
  entries.push({ loc: `${SITE}/veri-katalogu`, changefreq: "monthly", priority: 0.75, lastmod: TODAY });
  entries.push({ loc: `${SITE}/blog`, changefreq: "weekly", priority: 0.8, lastmod: TODAY });
  entries.push({ loc: `${SITE}/sss`, changefreq: "monthly", priority: 0.55, lastmod: TODAY });
  // arsa-talep → /sorgu redirect, sitemap'ten çıkarıldı
  entries.push({ loc: `${SITE}/iletisim`, changefreq: "monthly", priority: 0.4, lastmod: TODAY });
  // api-docs footer'da linklenir, düşük öncelik
  entries.push({ loc: `${SITE}/api-docs`, changefreq: "monthly", priority: 0.35, lastmod: TODAY });

  // ── Yasal (indeksle ama düşük priority) ──────────────────────────────────
  entries.push({ loc: `${SITE}/gizlilik`, changefreq: "monthly", priority: 0.3 });
  entries.push({ loc: `${SITE}/kullanim-sartlari`, changefreq: "monthly", priority: 0.3 });
  entries.push({ loc: `${SITE}/iade-iptal`, changefreq: "monthly", priority: 0.3 });
  entries.push({ loc: `${SITE}/mesafeli-satis`, changefreq: "monthly", priority: 0.3 });

  // ── SITEMAP'TEN ÇIKARILANLAR (noindex veya private) ──────────────────────
  // logo-secim         → redirect to /
  // ornek              → demo sayfası, noindex
  // musteri/musteriler → auth korumalı, private
  // admin/             → auth korumalı, private
  // hesap/             → auth korumalı, private
  // dogrulama/cikis    → auth flow, private
  // giris/kayit        → auth, low SEO value
  // kullanim-kosullari → tekrar eden T&C, /kullanim-sartlari tercih edildi
  // rapor              → dinamik hash sayfası, noindex

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

  // İlçe sayfaları — [ilce].astro getStaticPaths ile SSG üretiliyor
  // Büyük şehirlerin önemli ilçeleri + kırsal ilçeler
  const SITEMAP_ILCELER: { il: string; ilce: string }[] = [
    ...["besiktas","kadikoy","sisli","uskudar","beyoglu","fatih","bakirkoy","zeytinburnu",
        "kucukcekmece","buyukcekmece","avcilar","gaziosmanpasa","sariyer","beykoz",
        "maltepe","kartal","pendik","tuzla","atasehir","umraniye","esenyurt","arnavutkoy",
        "catalca","silivri","beylikduzu","basaksehir","sancaktepe","cekmekoy","sultanbeyli",
        "kagithane","eyupsultan","bayrampasa","esenler","bagcilar","bahcelievler",
        "gungoren","sultangazi","adalar"].map(ilce => ({ il: "istanbul", ilce })),
    ...["cankaya","kecioren","mamak","yenimahalle","etimesgut","sincan","altindag",
        "pursaklar","golbasi","polatli","kazan","nallihan","haymana","bala",
        "sereflikochisar","cubuk","camlidere","gudul","elmadağ","ayas"].map(ilce => ({ il: "ankara", ilce })),
    ...["konak","karsiyaka","bornova","buca","gaziemir","narlidere","bayrakli","cigli",
        "menemen","kemalpasa","torbali","odemis","tire","seferihisar","selcuk","cesme",
        "karaburun","urla","aliaga","bergama","dikili","foca","kinik","menderes",
        "bayindir","beydağ"].map(ilce => ({ il: "izmir", ilce })),
    ...["muratpasa","konyaalti","kepez","aksu","dosemealti","alanya","manavgat","serik",
        "kemer","kas","finike","kumluca","elmali","gazipasa"].map(ilce => ({ il: "antalya", ilce })),
    ...["nilufer","osmangazi","yildirim","mudanya","gemlik","inegol","iznik",
        "karacabey","mustafakemalpasa","orhangazi","yenisehir"].map(ilce => ({ il: "bursa", ilce })),
    ...["bodrum","fethiye","marmaris","milas","merkez","ortaca","koycegiz","datca",
        "yatagan","ula","seydikemer","dalaman"].map(ilce => ({ il: "mugla", ilce })),
    ...["seyhan","yuregir","cukurova","saricam","karaisali","pozanti","kozan","imamoglu",
        "karatas","yumurtalik","tufanbeyli","aladag","feke","saimbeyli"].map(ilce => ({ il: "adana", ilce })),
    ...["selcuklu","meram","karatay","eregli","aksehir","kulu","cumra","beysehir",
        "seydisehir","karapinar"].map(ilce => ({ il: "konya", ilce })),
    ...["izmit","gebze","darica","derince","basiskele","golcuk","kandira","karamursel"].map(ilce => ({ il: "kocaeli", ilce })),
    ...["ortahisar","akcaabat","of","yomra","vakfikebir"].map(ilce => ({ il: "trabzon", ilce })),
    ...["bandirma","edremit","altieylul","gonen","erdek"].map(ilce => ({ il: "balikesir", ilce })),
    ...["efeler","nazilli","kusadasi","didim","soke","kocarli"].map(ilce => ({ il: "aydin", ilce })),
    ...["adapazari","serdivan","erenler","arifiye","karasu","hendek"].map(ilce => ({ il: "sakarya", ilce })),
    ...["suleymanpasa","corlu","cerkezkoy","malkara"].map(ilce => ({ il: "tekirdag", ilce })),
    ...["pamukkale","merkezefendi","acipayam","tavas","civril","honaz"].map(ilce => ({ il: "denizli", ilce })),
    ...["yenisehir","mezitli","akdeniz","toroslar","silifke","erdemli","tarsus","anamur"].map(ilce => ({ il: "mersin", ilce })),
    ...["sahinbey","sehitkamil","islahiye","nizip"].map(ilce => ({ il: "gaziantep", ilce })),
    ...["antakya","iskenderun","defne","samandağ","kirikhan","kumlu"].map(ilce => ({ il: "hatay", ilce })),
    ...["cukurova","seyhan"].map(ilce => ({ il: "adana", ilce })),
    ...["yunusemre","turgutlu","akhisar","salihli","soma"].map(ilce => ({ il: "manisa", ilce })),
    ...["onikisubat","dulkadiroglu","elbistan","afsin"].map(ilce => ({ il: "kahramanmaras", ilce })),
  ];

  // Deduplicate
  const gorulen = new Set<string>();
  for (const { il, ilce } of SITEMAP_ILCELER) {
    const key = `${il}/${ilce}`;
    if (gorulen.has(key)) continue;
    gorulen.add(key);
    entries.push({
      loc: `${SITE}/veri/${il}/${ilce}`,
      changefreq: "weekly",
      priority: 0.65,
      lastmod: TODAY,
    });
  }

  // Mahalle URL'leri sitemap'te YOK — unique prerender HTML yoksa soft-404.

  return new Response(buildUrlSet(entries), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
};
