/**
 * Sitemap'te ve `/veri/{il}/{ilce}/{mahalle}` statik üretiminde kullanılan
 * curated mahalle listesi.
 *
 * NEDEN AYRI DOSYA: bu liste eskiden yalnızca `sitemap.xml.ts` içindeydi ve
 * sitemap 90 derin URL'i Google'a bildiriyordu — ama o URL'ler için HİÇBİR
 * sayfa üretilmiyordu. Tek kaynak hâline getirildi: sitemap de sayfa üretimi de
 * buradan okuyor, dolayısıyla ikisi tanım gereği örtüşüyor.
 *
 * Biçim: `il__ilce__mahalle` (hepsi normalize).
 */

export const TOP_MAHALLELER: string[] = [
  "istanbul__besiktas__bebek",
  "istanbul__besiktas__etiler",
  "istanbul__besiktas__levent",
  "istanbul__besiktas__arnavutkoy",
  "istanbul__besiktas__ortakoy",
  "istanbul__sariyer__tarabya",
  "istanbul__sariyer__yenikoy",
  "istanbul__sariyer__istinye",
  "istanbul__sariyer__buyukdere",
  "istanbul__sariyer__zekeriyakoy",
  "istanbul__sisli__nisantasi",
  "istanbul__sisli__tesvikiye",
  "istanbul__sisli__mecidiyekoy",
  "istanbul__kadikoy__moda",
  "istanbul__kadikoy__caddebostan",
  "istanbul__kadikoy__fenerbahce",
  "istanbul__kadikoy__goztepe",
  "istanbul__kadikoy__suadiye",
  "istanbul__atasehir__icerenkoy",
  "istanbul__atasehir__acibadem",
  "istanbul__beykoz__anadoluhisari",
  "istanbul__beykoz__kandilli",
  "istanbul__beykoz__cubuklu",
  "istanbul__uskudar__kuzguncuk",
  "istanbul__uskudar__beylerbeyi",
  "istanbul__bakirkoy__atakoy",
  "istanbul__bakirkoy__yesilkoy",
  "istanbul__bakirkoy__florya",
  "istanbul__zeytinburnu__kazlicesme",
  "istanbul__fatih__sultanahmet",
  "istanbul__fatih__balat",
  "istanbul__beyoglu__galata",
  "istanbul__beyoglu__cihangir",
  "istanbul__beyoglu__karakoy",
  "istanbul__sile__sahilkoy",
  "ankara__cankaya__cukurambar",
  "ankara__cankaya__gaziosmanpasa",
  "ankara__cankaya__kavaklidere",
  "ankara__cankaya__bahcelievler",
  "ankara__cankaya__ayranci",
  "ankara__yenimahalle__batikent",
  "ankara__yenimahalle__demetevler",
  "ankara__golbasi__incek",
  "izmir__konak__alsancak",
  "izmir__karsiyaka__bostanli",
  "izmir__cesme__alacati",
  "izmir__cesme__ilica",
  "izmir__urla__kalabak",
  "izmir__seferihisar__sigacik",
  "antalya__muratpasa__lara",
  "antalya__konyaalti__hurma",
  "antalya__alanya__mahmutlar",
  "antalya__alanya__oba",
  "antalya__alanya__tosmur",
  "antalya__manavgat__side",
  "antalya__kemer__cirali",
  "antalya__kas__kalkan",
  "mugla__bodrum__yalikavak",
  "mugla__bodrum__turgutreis",
  "mugla__bodrum__gumusluk",
  "mugla__bodrum__bitez",
  "mugla__bodrum__turkbuku",
  "mugla__fethiye__calis",
  "mugla__fethiye__oludeniz",
  "mugla__fethiye__hisaronu",
  "mugla__marmaris__icmeler",
  "mugla__datca__merkez",
  "bursa__nilufer__gorukle",
  "bursa__nilufer__odunluk",
  "bursa__mudanya__guzelyali",
  "bursa__osmangazi__cekirge",
  "balikesir__bandirma__yali",
  "balikesir__bandirma__edincik",
  "balikesir__edremit__akcay",
  "balikesir__ayvalik__cunda",
  "balikesir__erdek__merkez",
  "balikesir__gomec__merkez",
  "aydin__didim__altinkum",
  "tekirdag__corlu__merkez",
  "kocaeli__izmit__merkez",
  "kocaeli__gebze__merkez",
  "yalova__cinarcik__merkez",
  "yalova__armutlu__merkez",
  "trabzon__ortahisar__akcaabat",
  "samsun__atakum__merkez",
  "konya__selcuklu__merkez",
];

/** getStaticPaths için ayrıştırılmış hâl. */
export function topMahalleParcalari(): Array<{ il: string; ilce: string; mahalle: string }> {
  const out: Array<{ il: string; ilce: string; mahalle: string }> = [];
  for (const k of TOP_MAHALLELER) {
    const p = k.split("__");
    if (p.length !== 3) continue;
    out.push({ il: p[0]!, ilce: p[1]!, mahalle: p[2]! });
  }
  return out;
}
