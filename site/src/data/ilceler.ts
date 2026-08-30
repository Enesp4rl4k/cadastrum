/**
 * Otomatik üretildi — ELLE DÜZENLEME.
 * Kaynak: src/lib/data/ilce-listesi-bootstrap.ts
 * Yenile: node scripts/site-ilce-listesi-uret.mjs
 *
 * 81 il · 973 ilçe.
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

export const ILCELER: Record<string, IlceKaydi[]> = {
  "adana": [
    {
      "norm": "aladag",
      "apiNorm": "aladag",
      "ad": "Aladağ"
    },
    {
      "norm": "ceyhan",
      "apiNorm": "ceyhan",
      "ad": "Ceyhan"
    },
    {
      "norm": "cukurova",
      "apiNorm": "cukurova",
      "ad": "Çukurova"
    },
    {
      "norm": "feke",
      "apiNorm": "feke",
      "ad": "Feke"
    },
    {
      "norm": "imamoglu",
      "apiNorm": "imamoglu",
      "ad": "İmamoğlu"
    },
    {
      "norm": "karaisali",
      "apiNorm": "karaisali",
      "ad": "Karaisalı"
    },
    {
      "norm": "karatas",
      "apiNorm": "karatas",
      "ad": "Karataş"
    },
    {
      "norm": "kozan",
      "apiNorm": "kozan",
      "ad": "Kozan"
    },
    {
      "norm": "pozanti",
      "apiNorm": "pozanti",
      "ad": "Pozantı"
    },
    {
      "norm": "saimbeyli",
      "apiNorm": "saimbeyli",
      "ad": "Saimbeyli"
    },
    {
      "norm": "saricam",
      "apiNorm": "saricam",
      "ad": "Sarıçam"
    },
    {
      "norm": "seyhan",
      "apiNorm": "seyhan",
      "ad": "Seyhan"
    },
    {
      "norm": "tufanbeyli",
      "apiNorm": "tufanbeyli",
      "ad": "Tufanbeyli"
    },
    {
      "norm": "yumurtalik",
      "apiNorm": "yumurtalik",
      "ad": "Yumurtalık"
    },
    {
      "norm": "yuregir",
      "apiNorm": "yuregir",
      "ad": "Yüreğir"
    }
  ],
  "adiyaman": [
    {
      "norm": "besni",
      "apiNorm": "besni",
      "ad": "Besni"
    },
    {
      "norm": "celikhan",
      "apiNorm": "celikhan",
      "ad": "Çelikhan"
    },
    {
      "norm": "gerger",
      "apiNorm": "gerger",
      "ad": "Gerger"
    },
    {
      "norm": "golbasi",
      "apiNorm": "golbasi",
      "ad": "Gölbaşı"
    },
    {
      "norm": "kahta",
      "apiNorm": "kahta",
      "ad": "Kâhta"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Adıyaman Merkez"
    },
    {
      "norm": "samsat",
      "apiNorm": "samsat",
      "ad": "Samsat"
    },
    {
      "norm": "sincik",
      "apiNorm": "sincik",
      "ad": "Sincik"
    },
    {
      "norm": "tut",
      "apiNorm": "tut",
      "ad": "Tut"
    }
  ],
  "afyonkarahisar": [
    {
      "norm": "basmakci",
      "apiNorm": "basmakci",
      "ad": "Başmakçı"
    },
    {
      "norm": "bayat",
      "apiNorm": "bayat",
      "ad": "Bayat"
    },
    {
      "norm": "bolvadin",
      "apiNorm": "bolvadin",
      "ad": "Bolvadin"
    },
    {
      "norm": "cay",
      "apiNorm": "cay",
      "ad": "Çay"
    },
    {
      "norm": "cobanlar",
      "apiNorm": "cobanlar",
      "ad": "Çobanlar"
    },
    {
      "norm": "dazkiri",
      "apiNorm": "dazkiri",
      "ad": "Dazkırı"
    },
    {
      "norm": "dinar",
      "apiNorm": "dinar",
      "ad": "Dinar"
    },
    {
      "norm": "emirdag",
      "apiNorm": "emirdag",
      "ad": "Emirdağ"
    },
    {
      "norm": "evciler",
      "apiNorm": "evciler",
      "ad": "Evciler"
    },
    {
      "norm": "hocalar",
      "apiNorm": "hocalar",
      "ad": "Hocalar"
    },
    {
      "norm": "ihsaniye",
      "apiNorm": "ihsaniye",
      "ad": "İhsaniye"
    },
    {
      "norm": "iscehisar",
      "apiNorm": "iscehisar",
      "ad": "İscehisar"
    },
    {
      "norm": "kiziloren",
      "apiNorm": "kiziloren",
      "ad": "Kızılören"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Afyonkarahisar Merkez"
    },
    {
      "norm": "sandikli",
      "apiNorm": "sandikli",
      "ad": "Sandıklı"
    },
    {
      "norm": "sinanpasa",
      "apiNorm": "sinanpasa",
      "ad": "Sinanpaşa"
    },
    {
      "norm": "suhut",
      "apiNorm": "suhut",
      "ad": "Şuhut"
    },
    {
      "norm": "sultandagi",
      "apiNorm": "sultandagi",
      "ad": "Sultandağı"
    }
  ],
  "agri": [
    {
      "norm": "diyadin",
      "apiNorm": "diyadin",
      "ad": "Diyadin"
    },
    {
      "norm": "dogubayazit",
      "apiNorm": "dogubayazit",
      "ad": "Doğubayazıt"
    },
    {
      "norm": "eleskirt",
      "apiNorm": "eleskirt",
      "ad": "Eleşkirt"
    },
    {
      "norm": "hamur",
      "apiNorm": "hamur",
      "ad": "Hamur"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Ağrı Merkez"
    },
    {
      "norm": "patnos",
      "apiNorm": "patnos",
      "ad": "Patnos"
    },
    {
      "norm": "taslicay",
      "apiNorm": "taslicay",
      "ad": "Taşlıçay"
    },
    {
      "norm": "tutak",
      "apiNorm": "tutak",
      "ad": "Tutak"
    }
  ],
  "aksaray": [
    {
      "norm": "agacoren",
      "apiNorm": "agacoren",
      "ad": "Ağaçören"
    },
    {
      "norm": "eskil",
      "apiNorm": "eskil",
      "ad": "Eskil"
    },
    {
      "norm": "gulagac",
      "apiNorm": "gulagac",
      "ad": "Gülağaç"
    },
    {
      "norm": "guzelyurt",
      "apiNorm": "guzelyurt",
      "ad": "Güzelyurt"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Aksaray Merkez"
    },
    {
      "norm": "ortakoy",
      "apiNorm": "ortakoy",
      "ad": "Ortaköy"
    },
    {
      "norm": "sariyahsi",
      "apiNorm": "sariyahsi",
      "ad": "Sarıyahşi"
    },
    {
      "norm": "sultanhani",
      "apiNorm": "sultanhani",
      "ad": "Sultanhanı"
    }
  ],
  "amasya": [
    {
      "norm": "goynucek",
      "apiNorm": "goynucek",
      "ad": "Göynücek"
    },
    {
      "norm": "gumushacikoy",
      "apiNorm": "gumushacikoy",
      "ad": "Gümüşhacıköy"
    },
    {
      "norm": "hamamozu",
      "apiNorm": "hamamozu",
      "ad": "Hamamözü"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Amasya Merkez"
    },
    {
      "norm": "merzifon",
      "apiNorm": "merzifon",
      "ad": "Merzifon"
    },
    {
      "norm": "suluova",
      "apiNorm": "suluova",
      "ad": "Suluova"
    },
    {
      "norm": "tasova",
      "apiNorm": "tasova",
      "ad": "Taşova"
    }
  ],
  "ankara": [
    {
      "norm": "akyurt",
      "apiNorm": "akyurt",
      "ad": "Akyurt"
    },
    {
      "norm": "altindag",
      "apiNorm": "altindag",
      "ad": "Altındağ"
    },
    {
      "norm": "ayas",
      "apiNorm": "ayas",
      "ad": "Ayaş"
    },
    {
      "norm": "bala",
      "apiNorm": "bala",
      "ad": "Balâ"
    },
    {
      "norm": "beypazari",
      "apiNorm": "beypazari",
      "ad": "Beypazarı"
    },
    {
      "norm": "camlidere",
      "apiNorm": "camlidere",
      "ad": "Çamlıdere"
    },
    {
      "norm": "cankaya",
      "apiNorm": "cankaya",
      "ad": "Çankaya"
    },
    {
      "norm": "cubuk",
      "apiNorm": "cubuk",
      "ad": "Çubuk"
    },
    {
      "norm": "elmadag",
      "apiNorm": "elmadag",
      "ad": "Elmadağ"
    },
    {
      "norm": "etimesgut",
      "apiNorm": "etimesgut",
      "ad": "Etimesgut"
    },
    {
      "norm": "evren",
      "apiNorm": "evren",
      "ad": "Evren"
    },
    {
      "norm": "golbasi",
      "apiNorm": "golbasi",
      "ad": "Gölbaşı"
    },
    {
      "norm": "gudul",
      "apiNorm": "gudul",
      "ad": "Güdül"
    },
    {
      "norm": "haymana",
      "apiNorm": "haymana",
      "ad": "Haymana"
    },
    {
      "norm": "kahramankazan",
      "apiNorm": "kahramankazan",
      "ad": "Kahramankazan"
    },
    {
      "norm": "kalecik",
      "apiNorm": "kalecik",
      "ad": "Kalecik"
    },
    {
      "norm": "kecioren",
      "apiNorm": "kecioren",
      "ad": "Keçiören"
    },
    {
      "norm": "kizilcahamam",
      "apiNorm": "kizilcahamam",
      "ad": "Kızılcahamam"
    },
    {
      "norm": "mamak",
      "apiNorm": "mamak",
      "ad": "Mamak"
    },
    {
      "norm": "nallihan",
      "apiNorm": "nallihan",
      "ad": "Nallıhan"
    },
    {
      "norm": "polatli",
      "apiNorm": "polatli",
      "ad": "Polatlı"
    },
    {
      "norm": "pursaklar",
      "apiNorm": "pursaklar",
      "ad": "Pursaklar"
    },
    {
      "norm": "sereflikochisar",
      "apiNorm": "sereflikochisar",
      "ad": "Şereflikoçhisar"
    },
    {
      "norm": "sincan",
      "apiNorm": "sincan",
      "ad": "Sincan"
    },
    {
      "norm": "yenimahalle",
      "apiNorm": "yenimahalle",
      "ad": "Yenimahalle"
    }
  ],
  "antalya": [
    {
      "norm": "akseki",
      "apiNorm": "akseki",
      "ad": "Akseki"
    },
    {
      "norm": "aksu",
      "apiNorm": "aksu",
      "ad": "Aksu"
    },
    {
      "norm": "alanya",
      "apiNorm": "alanya",
      "ad": "Alanya"
    },
    {
      "norm": "demre",
      "apiNorm": "demre",
      "ad": "Demre"
    },
    {
      "norm": "dosemealti",
      "apiNorm": "dosemealti",
      "ad": "Döşemealtı"
    },
    {
      "norm": "elmali",
      "apiNorm": "elmali",
      "ad": "Elmalı"
    },
    {
      "norm": "finike",
      "apiNorm": "finike",
      "ad": "Finike"
    },
    {
      "norm": "gazipasa",
      "apiNorm": "gazipasa",
      "ad": "Gazipaşa"
    },
    {
      "norm": "gundogmus",
      "apiNorm": "gundogmus",
      "ad": "Gündoğmuş"
    },
    {
      "norm": "ibradi",
      "apiNorm": "ibradi",
      "ad": "İbradı"
    },
    {
      "norm": "kas",
      "apiNorm": "kas",
      "ad": "Kaş"
    },
    {
      "norm": "kemer",
      "apiNorm": "kemer",
      "ad": "Kemer"
    },
    {
      "norm": "kepez",
      "apiNorm": "kepez",
      "ad": "Kepez"
    },
    {
      "norm": "konyaalti",
      "apiNorm": "konyaalti",
      "ad": "Konyaaltı"
    },
    {
      "norm": "korkuteli",
      "apiNorm": "korkuteli",
      "ad": "Korkuteli"
    },
    {
      "norm": "kumluca",
      "apiNorm": "kumluca",
      "ad": "Kumluca"
    },
    {
      "norm": "manavgat",
      "apiNorm": "manavgat",
      "ad": "Manavgat"
    },
    {
      "norm": "muratpasa",
      "apiNorm": "muratpasa",
      "ad": "Muratpaşa"
    },
    {
      "norm": "serik",
      "apiNorm": "serik",
      "ad": "Serik"
    }
  ],
  "ardahan": [
    {
      "norm": "cildir",
      "apiNorm": "cildir",
      "ad": "Çıldır"
    },
    {
      "norm": "damal",
      "apiNorm": "damal",
      "ad": "Damal"
    },
    {
      "norm": "gole",
      "apiNorm": "gole",
      "ad": "Göle"
    },
    {
      "norm": "hanak",
      "apiNorm": "hanak",
      "ad": "Hanak"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Ardahan Merkez"
    },
    {
      "norm": "posof",
      "apiNorm": "posof",
      "ad": "Posof"
    }
  ],
  "artvin": [
    {
      "norm": "ardanuc",
      "apiNorm": "ardanuc",
      "ad": "Ardanuç"
    },
    {
      "norm": "arhavi",
      "apiNorm": "arhavi",
      "ad": "Arhavi"
    },
    {
      "norm": "borcka",
      "apiNorm": "borcka",
      "ad": "Borçka"
    },
    {
      "norm": "hopa",
      "apiNorm": "hopa",
      "ad": "Hopa"
    },
    {
      "norm": "kemalpasa",
      "apiNorm": "kemalpasa",
      "ad": "Kemalpaşa"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Artvin Merkez"
    },
    {
      "norm": "murgul",
      "apiNorm": "murgul",
      "ad": "Murgul"
    },
    {
      "norm": "savsat",
      "apiNorm": "savsat",
      "ad": "Şavşat"
    },
    {
      "norm": "yusufeli",
      "apiNorm": "yusufeli",
      "ad": "Yusufeli"
    }
  ],
  "aydin": [
    {
      "norm": "bozdogan",
      "apiNorm": "bozdogan",
      "ad": "Bozdoğan"
    },
    {
      "norm": "buharkent",
      "apiNorm": "buharkent",
      "ad": "Buharkent"
    },
    {
      "norm": "cine",
      "apiNorm": "cine",
      "ad": "Çine"
    },
    {
      "norm": "didim",
      "apiNorm": "didim",
      "ad": "Didim"
    },
    {
      "norm": "efeler",
      "apiNorm": "efeler",
      "ad": "Efeler"
    },
    {
      "norm": "germencik",
      "apiNorm": "germencik",
      "ad": "Germencik"
    },
    {
      "norm": "incirliova",
      "apiNorm": "incirliova",
      "ad": "İncirliova"
    },
    {
      "norm": "karacasu",
      "apiNorm": "karacasu",
      "ad": "Karacasu"
    },
    {
      "norm": "karpuzlu",
      "apiNorm": "karpuzlu",
      "ad": "Karpuzlu"
    },
    {
      "norm": "kocarli",
      "apiNorm": "kocarli",
      "ad": "Koçarlı"
    },
    {
      "norm": "kosk",
      "apiNorm": "kosk",
      "ad": "Köşk"
    },
    {
      "norm": "kusadasi",
      "apiNorm": "kusadasi",
      "ad": "Kuşadası"
    },
    {
      "norm": "kuyucak",
      "apiNorm": "kuyucak",
      "ad": "Kuyucak"
    },
    {
      "norm": "nazilli",
      "apiNorm": "nazilli",
      "ad": "Nazilli"
    },
    {
      "norm": "soke",
      "apiNorm": "soke",
      "ad": "Söke"
    },
    {
      "norm": "sultanhisar",
      "apiNorm": "sultanhisar",
      "ad": "Sultanhisar"
    },
    {
      "norm": "yenipazar",
      "apiNorm": "yenipazar",
      "ad": "Yenipazar"
    }
  ],
  "balikesir": [
    {
      "norm": "altieylul",
      "apiNorm": "altieylul",
      "ad": "Altıeylül"
    },
    {
      "norm": "ayvalik",
      "apiNorm": "ayvalik",
      "ad": "Ayvalık"
    },
    {
      "norm": "balya",
      "apiNorm": "balya",
      "ad": "Balya"
    },
    {
      "norm": "bandirma",
      "apiNorm": "bandirma",
      "ad": "Bandırma"
    },
    {
      "norm": "bigadic",
      "apiNorm": "bigadic",
      "ad": "Bigadiç"
    },
    {
      "norm": "burhaniye",
      "apiNorm": "burhaniye",
      "ad": "Burhaniye"
    },
    {
      "norm": "dursunbey",
      "apiNorm": "dursunbey",
      "ad": "Dursunbey"
    },
    {
      "norm": "edremit",
      "apiNorm": "edremit",
      "ad": "Edremit"
    },
    {
      "norm": "erdek",
      "apiNorm": "erdek",
      "ad": "Erdek"
    },
    {
      "norm": "gomec",
      "apiNorm": "gomec",
      "ad": "Gömeç"
    },
    {
      "norm": "gonen",
      "apiNorm": "gonen",
      "ad": "Gönen"
    },
    {
      "norm": "havran",
      "apiNorm": "havran",
      "ad": "Havran"
    },
    {
      "norm": "ivrindi",
      "apiNorm": "ivrindi",
      "ad": "İvrindi"
    },
    {
      "norm": "karesi",
      "apiNorm": "karesi",
      "ad": "Karesi"
    },
    {
      "norm": "kepsut",
      "apiNorm": "kepsut",
      "ad": "Kepsut"
    },
    {
      "norm": "manyas",
      "apiNorm": "manyas",
      "ad": "Manyas"
    },
    {
      "norm": "marmara",
      "apiNorm": "marmara",
      "ad": "Marmara"
    },
    {
      "norm": "savastepe",
      "apiNorm": "savastepe",
      "ad": "Savaştepe"
    },
    {
      "norm": "sindirgi",
      "apiNorm": "sindirgi",
      "ad": "Sındırgı"
    },
    {
      "norm": "susurluk",
      "apiNorm": "susurluk",
      "ad": "Susurluk"
    }
  ],
  "bartin": [
    {
      "norm": "amasra",
      "apiNorm": "amasra",
      "ad": "Amasra"
    },
    {
      "norm": "kurucasile",
      "apiNorm": "kurucasile",
      "ad": "Kurucaşile"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Bartın Merkez"
    },
    {
      "norm": "ulus",
      "apiNorm": "ulus",
      "ad": "Ulus"
    }
  ],
  "batman": [
    {
      "norm": "besiri",
      "apiNorm": "besiri",
      "ad": "Beşiri"
    },
    {
      "norm": "gercus",
      "apiNorm": "gercus",
      "ad": "Gercüş"
    },
    {
      "norm": "hasankeyf",
      "apiNorm": "hasankeyf",
      "ad": "Hasankeyf"
    },
    {
      "norm": "kozluk",
      "apiNorm": "kozluk",
      "ad": "Kozluk"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Batman Merkez"
    },
    {
      "norm": "sason",
      "apiNorm": "sason",
      "ad": "Sason"
    }
  ],
  "bayburt": [
    {
      "norm": "aydintepe",
      "apiNorm": "aydintepe",
      "ad": "Aydıntepe"
    },
    {
      "norm": "demirozu",
      "apiNorm": "demirozu",
      "ad": "Demirözü"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Bayburt Merkez"
    }
  ],
  "bilecik": [
    {
      "norm": "bozuyuk",
      "apiNorm": "bozuyuk",
      "ad": "Bozüyük"
    },
    {
      "norm": "golpazari",
      "apiNorm": "golpazari",
      "ad": "Gölpazarı"
    },
    {
      "norm": "inhisar",
      "apiNorm": "inhisar",
      "ad": "İnhisar"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Bilecik Merkez"
    },
    {
      "norm": "osmaneli",
      "apiNorm": "osmaneli",
      "ad": "Osmaneli"
    },
    {
      "norm": "pazaryeri",
      "apiNorm": "pazaryeri",
      "ad": "Pazaryeri"
    },
    {
      "norm": "sogut",
      "apiNorm": "sogut",
      "ad": "Söğüt"
    },
    {
      "norm": "yenipazar",
      "apiNorm": "yenipazar",
      "ad": "Yenipazar"
    }
  ],
  "bingol": [
    {
      "norm": "adakli",
      "apiNorm": "adakli",
      "ad": "Adaklı"
    },
    {
      "norm": "genc",
      "apiNorm": "genc",
      "ad": "Genç"
    },
    {
      "norm": "karliova",
      "apiNorm": "karliova",
      "ad": "Karlıova"
    },
    {
      "norm": "kigi",
      "apiNorm": "kigi",
      "ad": "Kiğı"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Bingöl Merkez"
    },
    {
      "norm": "solhan",
      "apiNorm": "solhan",
      "ad": "Solhan"
    },
    {
      "norm": "yayladere",
      "apiNorm": "yayladere",
      "ad": "Yayladere"
    },
    {
      "norm": "yedisu",
      "apiNorm": "yedisu",
      "ad": "Yedisu"
    }
  ],
  "bitlis": [
    {
      "norm": "adilcevaz",
      "apiNorm": "adilcevaz",
      "ad": "Adilcevaz"
    },
    {
      "norm": "ahlat",
      "apiNorm": "ahlat",
      "ad": "Ahlat"
    },
    {
      "norm": "guroymak",
      "apiNorm": "guroymak",
      "ad": "Güroymak"
    },
    {
      "norm": "hizan",
      "apiNorm": "hizan",
      "ad": "Hizan"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Bitlis Merkez"
    },
    {
      "norm": "mutki",
      "apiNorm": "mutki",
      "ad": "Mutki"
    },
    {
      "norm": "tatvan",
      "apiNorm": "tatvan",
      "ad": "Tatvan"
    }
  ],
  "bolu": [
    {
      "norm": "dortdivan",
      "apiNorm": "dortdivan",
      "ad": "Dörtdivan"
    },
    {
      "norm": "gerede",
      "apiNorm": "gerede",
      "ad": "Gerede"
    },
    {
      "norm": "goynuk",
      "apiNorm": "goynuk",
      "ad": "Göynük"
    },
    {
      "norm": "kibriscik",
      "apiNorm": "kibriscik",
      "ad": "Kıbrıscık"
    },
    {
      "norm": "mengen",
      "apiNorm": "mengen",
      "ad": "Mengen"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Bolu Merkez"
    },
    {
      "norm": "mudurnu",
      "apiNorm": "mudurnu",
      "ad": "Mudurnu"
    },
    {
      "norm": "seben",
      "apiNorm": "seben",
      "ad": "Seben"
    },
    {
      "norm": "yenicaga",
      "apiNorm": "yenicaga",
      "ad": "Yeniçağa"
    }
  ],
  "burdur": [
    {
      "norm": "aglasun",
      "apiNorm": "aglasun",
      "ad": "Ağlasun"
    },
    {
      "norm": "altinyayla",
      "apiNorm": "altinyayla",
      "ad": "Altınyayla"
    },
    {
      "norm": "bucak",
      "apiNorm": "bucak",
      "ad": "Bucak"
    },
    {
      "norm": "cavdir",
      "apiNorm": "cavdir",
      "ad": "Çavdır"
    },
    {
      "norm": "celtikci",
      "apiNorm": "celtikci",
      "ad": "Çeltikçi"
    },
    {
      "norm": "golhisar",
      "apiNorm": "golhisar",
      "ad": "Gölhisar"
    },
    {
      "norm": "karamanli",
      "apiNorm": "karamanli",
      "ad": "Karamanlı"
    },
    {
      "norm": "kemer",
      "apiNorm": "kemer",
      "ad": "Kemer"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Burdur Merkez"
    },
    {
      "norm": "tefenni",
      "apiNorm": "tefenni",
      "ad": "Tefenni"
    },
    {
      "norm": "yesilova",
      "apiNorm": "yesilova",
      "ad": "Yeşilova"
    }
  ],
  "bursa": [
    {
      "norm": "buyukorhan",
      "apiNorm": "buyukorhan",
      "ad": "Büyükorhan"
    },
    {
      "norm": "gemlik",
      "apiNorm": "gemlik",
      "ad": "Gemlik"
    },
    {
      "norm": "gursu",
      "apiNorm": "gursu",
      "ad": "Gürsu"
    },
    {
      "norm": "harmancik",
      "apiNorm": "harmancik",
      "ad": "Harmancık"
    },
    {
      "norm": "inegol",
      "apiNorm": "inegol",
      "ad": "İnegöl"
    },
    {
      "norm": "iznik",
      "apiNorm": "iznik",
      "ad": "İznik"
    },
    {
      "norm": "karacabey",
      "apiNorm": "karacabey",
      "ad": "Karacabey"
    },
    {
      "norm": "keles",
      "apiNorm": "keles",
      "ad": "Keles"
    },
    {
      "norm": "kestel",
      "apiNorm": "kestel",
      "ad": "Kestel"
    },
    {
      "norm": "mudanya",
      "apiNorm": "mudanya",
      "ad": "Mudanya"
    },
    {
      "norm": "mustafakemalpasa",
      "apiNorm": "mustafakemalpasa",
      "ad": "Mustafakemalpaşa"
    },
    {
      "norm": "nilufer",
      "apiNorm": "nilufer",
      "ad": "Nilüfer"
    },
    {
      "norm": "orhaneli",
      "apiNorm": "orhaneli",
      "ad": "Orhaneli"
    },
    {
      "norm": "orhangazi",
      "apiNorm": "orhangazi",
      "ad": "Orhangazi"
    },
    {
      "norm": "osmangazi",
      "apiNorm": "osmangazi",
      "ad": "Osmangazi"
    },
    {
      "norm": "yenisehir",
      "apiNorm": "yenisehir",
      "ad": "Yenişehir"
    },
    {
      "norm": "yildirim",
      "apiNorm": "yildirim",
      "ad": "Yıldırım"
    }
  ],
  "canakkale": [
    {
      "norm": "ayvacik",
      "apiNorm": "ayvacik",
      "ad": "Ayvacık"
    },
    {
      "norm": "bayramic",
      "apiNorm": "bayramic",
      "ad": "Bayramiç"
    },
    {
      "norm": "biga",
      "apiNorm": "biga",
      "ad": "Biga"
    },
    {
      "norm": "bozcaada",
      "apiNorm": "bozcaada",
      "ad": "Bozcaada"
    },
    {
      "norm": "can",
      "apiNorm": "can",
      "ad": "Çan"
    },
    {
      "norm": "eceabat",
      "apiNorm": "eceabat",
      "ad": "Eceabat"
    },
    {
      "norm": "ezine",
      "apiNorm": "ezine",
      "ad": "Ezine"
    },
    {
      "norm": "gelibolu",
      "apiNorm": "gelibolu",
      "ad": "Gelibolu"
    },
    {
      "norm": "gokceada",
      "apiNorm": "gokceada",
      "ad": "Gökçeada"
    },
    {
      "norm": "lapseki",
      "apiNorm": "lapseki",
      "ad": "Lapseki"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Çanakkale Merkez"
    },
    {
      "norm": "yenice",
      "apiNorm": "yenice",
      "ad": "Yenice"
    }
  ],
  "cankiri": [
    {
      "norm": "atkaracalar",
      "apiNorm": "atkaracalar",
      "ad": "Atkaracalar"
    },
    {
      "norm": "bayramoren",
      "apiNorm": "bayramoren",
      "ad": "Bayramören"
    },
    {
      "norm": "cerkes",
      "apiNorm": "cerkes",
      "ad": "Çerkeş"
    },
    {
      "norm": "eldivan",
      "apiNorm": "eldivan",
      "ad": "Eldivan"
    },
    {
      "norm": "ilgaz",
      "apiNorm": "ilgaz",
      "ad": "Ilgaz"
    },
    {
      "norm": "kizilirmak",
      "apiNorm": "kizilirmak",
      "ad": "Kızılırmak"
    },
    {
      "norm": "korgun",
      "apiNorm": "korgun",
      "ad": "Korgun"
    },
    {
      "norm": "kursunlu",
      "apiNorm": "kursunlu",
      "ad": "Kurşunlu"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Çankırı Merkez"
    },
    {
      "norm": "orta",
      "apiNorm": "orta",
      "ad": "Orta"
    },
    {
      "norm": "sabanozu",
      "apiNorm": "sabanozu",
      "ad": "Şabanözü"
    },
    {
      "norm": "yaprakli",
      "apiNorm": "yaprakli",
      "ad": "Yapraklı"
    }
  ],
  "corum": [
    {
      "norm": "alaca",
      "apiNorm": "alaca",
      "ad": "Alaca"
    },
    {
      "norm": "bayat",
      "apiNorm": "bayat",
      "ad": "Bayat"
    },
    {
      "norm": "bogazkale",
      "apiNorm": "bogazkale",
      "ad": "Boğazkale"
    },
    {
      "norm": "dodurga",
      "apiNorm": "dodurga",
      "ad": "Dodurga"
    },
    {
      "norm": "iskilip",
      "apiNorm": "iskilip",
      "ad": "İskilip"
    },
    {
      "norm": "kargi",
      "apiNorm": "kargi",
      "ad": "Kargı"
    },
    {
      "norm": "lacin",
      "apiNorm": "lacin",
      "ad": "Laçin"
    },
    {
      "norm": "mecitozu",
      "apiNorm": "mecitozu",
      "ad": "Mecitözü"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Çorum Merkez"
    },
    {
      "norm": "oguzlar",
      "apiNorm": "oguzlar",
      "ad": "Oğuzlar"
    },
    {
      "norm": "ortakoy",
      "apiNorm": "ortakoy",
      "ad": "Ortaköy"
    },
    {
      "norm": "osmancik",
      "apiNorm": "osmancik",
      "ad": "Osmancık"
    },
    {
      "norm": "sungurlu",
      "apiNorm": "sungurlu",
      "ad": "Sungurlu"
    },
    {
      "norm": "ugurludag",
      "apiNorm": "ugurludag",
      "ad": "Uğurludağ"
    }
  ],
  "denizli": [
    {
      "norm": "acipayam",
      "apiNorm": "acipayam",
      "ad": "Acıpayam"
    },
    {
      "norm": "babadag",
      "apiNorm": "babadag",
      "ad": "Babadağ"
    },
    {
      "norm": "baklan",
      "apiNorm": "baklan",
      "ad": "Baklan"
    },
    {
      "norm": "bekilli",
      "apiNorm": "bekilli",
      "ad": "Bekilli"
    },
    {
      "norm": "beyagac",
      "apiNorm": "beyagac",
      "ad": "Beyağaç"
    },
    {
      "norm": "bozkurt",
      "apiNorm": "bozkurt",
      "ad": "Bozkurt"
    },
    {
      "norm": "buldan",
      "apiNorm": "buldan",
      "ad": "Buldan"
    },
    {
      "norm": "cal",
      "apiNorm": "cal",
      "ad": "Çal"
    },
    {
      "norm": "cameli",
      "apiNorm": "cameli",
      "ad": "Çameli"
    },
    {
      "norm": "cardak",
      "apiNorm": "cardak",
      "ad": "Çardak"
    },
    {
      "norm": "civril",
      "apiNorm": "civril",
      "ad": "Çivril"
    },
    {
      "norm": "guney",
      "apiNorm": "guney",
      "ad": "Güney"
    },
    {
      "norm": "honaz",
      "apiNorm": "honaz",
      "ad": "Honaz"
    },
    {
      "norm": "kale",
      "apiNorm": "kale",
      "ad": "Kale"
    },
    {
      "norm": "merkezefendi",
      "apiNorm": "merkezefendi",
      "ad": "Merkezefendi"
    },
    {
      "norm": "pamukkale",
      "apiNorm": "pamukkale",
      "ad": "Pamukkale"
    },
    {
      "norm": "saraykoy",
      "apiNorm": "saraykoy",
      "ad": "Sarayköy"
    },
    {
      "norm": "serinhisar",
      "apiNorm": "serinhisar",
      "ad": "Serinhisar"
    },
    {
      "norm": "tavas",
      "apiNorm": "tavas",
      "ad": "Tavas"
    }
  ],
  "diyarbakir": [
    {
      "norm": "baglar",
      "apiNorm": "baglar",
      "ad": "Bağlar"
    },
    {
      "norm": "bismil",
      "apiNorm": "bismil",
      "ad": "Bismil"
    },
    {
      "norm": "cermik",
      "apiNorm": "cermik",
      "ad": "Çermik"
    },
    {
      "norm": "cinar",
      "apiNorm": "cinar",
      "ad": "Çınar"
    },
    {
      "norm": "cungus",
      "apiNorm": "cungus",
      "ad": "Çüngüş"
    },
    {
      "norm": "dicle",
      "apiNorm": "dicle",
      "ad": "Dicle"
    },
    {
      "norm": "egil",
      "apiNorm": "egil",
      "ad": "Eğil"
    },
    {
      "norm": "ergani",
      "apiNorm": "ergani",
      "ad": "Ergani"
    },
    {
      "norm": "hani",
      "apiNorm": "hani",
      "ad": "Hani"
    },
    {
      "norm": "hazro",
      "apiNorm": "hazro",
      "ad": "Hazro"
    },
    {
      "norm": "kayapinar",
      "apiNorm": "kayapinar",
      "ad": "Kayapınar"
    },
    {
      "norm": "kocakoy",
      "apiNorm": "kocakoy",
      "ad": "Kocaköy"
    },
    {
      "norm": "kulp",
      "apiNorm": "kulp",
      "ad": "Kulp"
    },
    {
      "norm": "lice",
      "apiNorm": "lice",
      "ad": "Lice"
    },
    {
      "norm": "silvan",
      "apiNorm": "silvan",
      "ad": "Silvan"
    },
    {
      "norm": "sur",
      "apiNorm": "sur",
      "ad": "Sur"
    },
    {
      "norm": "yenisehir",
      "apiNorm": "yenisehir",
      "ad": "Yenişehir"
    }
  ],
  "duzce": [
    {
      "norm": "akcakoca",
      "apiNorm": "akcakoca",
      "ad": "Akçakoca"
    },
    {
      "norm": "cilimli",
      "apiNorm": "cilimli",
      "ad": "Çilimli"
    },
    {
      "norm": "cumayeri",
      "apiNorm": "cumayeri",
      "ad": "Cumayeri"
    },
    {
      "norm": "golyaka",
      "apiNorm": "golyaka",
      "ad": "Gölyaka"
    },
    {
      "norm": "gumusova",
      "apiNorm": "gumusova",
      "ad": "Gümüşova"
    },
    {
      "norm": "kaynasli",
      "apiNorm": "kaynasli",
      "ad": "Kaynaşlı"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Düzce Merkez"
    },
    {
      "norm": "yigilca",
      "apiNorm": "yigilca",
      "ad": "Yığılca"
    }
  ],
  "edirne": [
    {
      "norm": "enez",
      "apiNorm": "enez",
      "ad": "Enez"
    },
    {
      "norm": "havsa",
      "apiNorm": "havsa",
      "ad": "Havsa"
    },
    {
      "norm": "ipsala",
      "apiNorm": "ipsala",
      "ad": "İpsala"
    },
    {
      "norm": "kesan",
      "apiNorm": "kesan",
      "ad": "Keşan"
    },
    {
      "norm": "lalapasa",
      "apiNorm": "lalapasa",
      "ad": "Lalapaşa"
    },
    {
      "norm": "meric",
      "apiNorm": "meric",
      "ad": "Meriç"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Edirne Merkez"
    },
    {
      "norm": "suloglu",
      "apiNorm": "suloglu",
      "ad": "Süloğlu"
    },
    {
      "norm": "uzunkopru",
      "apiNorm": "uzunkopru",
      "ad": "Uzunköprü"
    }
  ],
  "elazig": [
    {
      "norm": "agin",
      "apiNorm": "agin",
      "ad": "Ağın"
    },
    {
      "norm": "alacakaya",
      "apiNorm": "alacakaya",
      "ad": "Alacakaya"
    },
    {
      "norm": "aricak",
      "apiNorm": "aricak",
      "ad": "Arıcak"
    },
    {
      "norm": "baskil",
      "apiNorm": "baskil",
      "ad": "Baskil"
    },
    {
      "norm": "karakocan",
      "apiNorm": "karakocan",
      "ad": "Karakoçan"
    },
    {
      "norm": "keban",
      "apiNorm": "keban",
      "ad": "Keban"
    },
    {
      "norm": "kovancilar",
      "apiNorm": "kovancilar",
      "ad": "Kovancılar"
    },
    {
      "norm": "maden",
      "apiNorm": "maden",
      "ad": "Maden"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Elâzığ Merkez"
    },
    {
      "norm": "palu",
      "apiNorm": "palu",
      "ad": "Palu"
    },
    {
      "norm": "sivrice",
      "apiNorm": "sivrice",
      "ad": "Sivrice"
    }
  ],
  "erzincan": [
    {
      "norm": "cayirli",
      "apiNorm": "cayirli",
      "ad": "Çayırlı"
    },
    {
      "norm": "ilic",
      "apiNorm": "ilic",
      "ad": "İliç"
    },
    {
      "norm": "kemah",
      "apiNorm": "kemah",
      "ad": "Kemah"
    },
    {
      "norm": "kemaliye",
      "apiNorm": "kemaliye",
      "ad": "Kemaliye"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Erzincan Merkez"
    },
    {
      "norm": "otlukbeli",
      "apiNorm": "otlukbeli",
      "ad": "Otlukbeli"
    },
    {
      "norm": "refahiye",
      "apiNorm": "refahiye",
      "ad": "Refahiye"
    },
    {
      "norm": "tercan",
      "apiNorm": "tercan",
      "ad": "Tercan"
    },
    {
      "norm": "uzumlu",
      "apiNorm": "uzumlu",
      "ad": "Üzümlü"
    }
  ],
  "erzurum": [
    {
      "norm": "askale",
      "apiNorm": "askale",
      "ad": "Aşkale"
    },
    {
      "norm": "aziziye",
      "apiNorm": "aziziye",
      "ad": "Aziziye"
    },
    {
      "norm": "cat",
      "apiNorm": "cat",
      "ad": "Çat"
    },
    {
      "norm": "hinis",
      "apiNorm": "hinis",
      "ad": "Hınıs"
    },
    {
      "norm": "horasan",
      "apiNorm": "horasan",
      "ad": "Horasan"
    },
    {
      "norm": "ispir",
      "apiNorm": "ispir",
      "ad": "İspir"
    },
    {
      "norm": "karacoban",
      "apiNorm": "karacoban",
      "ad": "Karaçoban"
    },
    {
      "norm": "karayazi",
      "apiNorm": "karayazi",
      "ad": "Karayazı"
    },
    {
      "norm": "koprukoy",
      "apiNorm": "koprukoy",
      "ad": "Köprüköy"
    },
    {
      "norm": "narman",
      "apiNorm": "narman",
      "ad": "Narman"
    },
    {
      "norm": "oltu",
      "apiNorm": "oltu",
      "ad": "Oltu"
    },
    {
      "norm": "olur",
      "apiNorm": "olur",
      "ad": "Olur"
    },
    {
      "norm": "palandoken",
      "apiNorm": "palandoken",
      "ad": "Palandöken"
    },
    {
      "norm": "pasinler",
      "apiNorm": "pasinler",
      "ad": "Pasinler"
    },
    {
      "norm": "pazaryolu",
      "apiNorm": "pazaryolu",
      "ad": "Pazaryolu"
    },
    {
      "norm": "senkaya",
      "apiNorm": "senkaya",
      "ad": "Şenkaya"
    },
    {
      "norm": "tekman",
      "apiNorm": "tekman",
      "ad": "Tekman"
    },
    {
      "norm": "tortum",
      "apiNorm": "tortum",
      "ad": "Tortum"
    },
    {
      "norm": "uzundere",
      "apiNorm": "uzundere",
      "ad": "Uzundere"
    },
    {
      "norm": "yakutiye",
      "apiNorm": "yakutiye",
      "ad": "Yakutiye"
    }
  ],
  "eskisehir": [
    {
      "norm": "alpu",
      "apiNorm": "alpu",
      "ad": "Alpu"
    },
    {
      "norm": "beylikova",
      "apiNorm": "beylikova",
      "ad": "Beylikova"
    },
    {
      "norm": "cifteler",
      "apiNorm": "cifteler",
      "ad": "Çifteler"
    },
    {
      "norm": "gunyuzu",
      "apiNorm": "gunyuzu",
      "ad": "Günyüzü"
    },
    {
      "norm": "han",
      "apiNorm": "han",
      "ad": "Han"
    },
    {
      "norm": "inonu",
      "apiNorm": "inonu",
      "ad": "İnönü"
    },
    {
      "norm": "mahmudiye",
      "apiNorm": "mahmudiye",
      "ad": "Mahmudiye"
    },
    {
      "norm": "mihalgazi",
      "apiNorm": "mihalgazi",
      "ad": "Mihalgazi"
    },
    {
      "norm": "mihaliccik",
      "apiNorm": "mihaliccik",
      "ad": "Mihalıççık"
    },
    {
      "norm": "odunpazari",
      "apiNorm": "odunpazari",
      "ad": "Odunpazarı"
    },
    {
      "norm": "saricakaya",
      "apiNorm": "saricakaya",
      "ad": "Sarıcakaya"
    },
    {
      "norm": "seyitgazi",
      "apiNorm": "seyitgazi",
      "ad": "Seyitgazi"
    },
    {
      "norm": "sivrihisar",
      "apiNorm": "sivrihisar",
      "ad": "Sivrihisar"
    },
    {
      "norm": "tepebasi",
      "apiNorm": "tepebasi",
      "ad": "Tepebaşı"
    }
  ],
  "gaziantep": [
    {
      "norm": "araban",
      "apiNorm": "araban",
      "ad": "Araban"
    },
    {
      "norm": "islahiye",
      "apiNorm": "islahiye",
      "ad": "İslahiye"
    },
    {
      "norm": "karkamis",
      "apiNorm": "karkamis",
      "ad": "Karkamış"
    },
    {
      "norm": "nizip",
      "apiNorm": "nizip",
      "ad": "Nizip"
    },
    {
      "norm": "nurdagi",
      "apiNorm": "nurdagi",
      "ad": "Nurdağı"
    },
    {
      "norm": "oguzeli",
      "apiNorm": "oguzeli",
      "ad": "Oğuzeli"
    },
    {
      "norm": "sahinbey",
      "apiNorm": "sahinbey",
      "ad": "Şahinbey"
    },
    {
      "norm": "sehitkamil",
      "apiNorm": "sehitkamil",
      "ad": "Şehitkamil"
    },
    {
      "norm": "yavuzeli",
      "apiNorm": "yavuzeli",
      "ad": "Yavuzeli"
    }
  ],
  "giresun": [
    {
      "norm": "alucra",
      "apiNorm": "alucra",
      "ad": "Alucra"
    },
    {
      "norm": "bulancak",
      "apiNorm": "bulancak",
      "ad": "Bulancak"
    },
    {
      "norm": "camoluk",
      "apiNorm": "camoluk",
      "ad": "Çamoluk"
    },
    {
      "norm": "canakci",
      "apiNorm": "canakci",
      "ad": "Çanakçı"
    },
    {
      "norm": "dereli",
      "apiNorm": "dereli",
      "ad": "Dereli"
    },
    {
      "norm": "dogankent",
      "apiNorm": "dogankent",
      "ad": "Doğankent"
    },
    {
      "norm": "espiye",
      "apiNorm": "espiye",
      "ad": "Espiye"
    },
    {
      "norm": "eynesil",
      "apiNorm": "eynesil",
      "ad": "Eynesil"
    },
    {
      "norm": "gorele",
      "apiNorm": "gorele",
      "ad": "Görele"
    },
    {
      "norm": "guce",
      "apiNorm": "guce",
      "ad": "Güce"
    },
    {
      "norm": "kesap",
      "apiNorm": "kesap",
      "ad": "Keşap"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Giresun Merkez"
    },
    {
      "norm": "piraziz",
      "apiNorm": "piraziz",
      "ad": "Piraziz"
    },
    {
      "norm": "sebinkarahisar",
      "apiNorm": "sebinkarahisar",
      "ad": "Şebinkarahisar"
    },
    {
      "norm": "tirebolu",
      "apiNorm": "tirebolu",
      "ad": "Tirebolu"
    },
    {
      "norm": "yaglidere",
      "apiNorm": "yaglidere",
      "ad": "Yağlıdere"
    }
  ],
  "gumushane": [
    {
      "norm": "kelkit",
      "apiNorm": "kelkit",
      "ad": "Kelkit"
    },
    {
      "norm": "kose",
      "apiNorm": "kose",
      "ad": "Köse"
    },
    {
      "norm": "kurtun",
      "apiNorm": "kurtun",
      "ad": "Kürtün"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Gümüşhane Merkez"
    },
    {
      "norm": "siran",
      "apiNorm": "siran",
      "ad": "Şiran"
    },
    {
      "norm": "torul",
      "apiNorm": "torul",
      "ad": "Torul"
    }
  ],
  "hakkari": [
    {
      "norm": "cukurca",
      "apiNorm": "cukurca",
      "ad": "Çukurca"
    },
    {
      "norm": "derecik",
      "apiNorm": "derecik",
      "ad": "Derecik"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Hakkari Merkez"
    },
    {
      "norm": "semdinli",
      "apiNorm": "semdinli",
      "ad": "Şemdinli"
    },
    {
      "norm": "yuksekova",
      "apiNorm": "yuksekova",
      "ad": "Yüksekova"
    }
  ],
  "hatay": [
    {
      "norm": "altinozu",
      "apiNorm": "altinozu",
      "ad": "Altınözü"
    },
    {
      "norm": "antakya",
      "apiNorm": "antakya",
      "ad": "Antakya"
    },
    {
      "norm": "arsuz",
      "apiNorm": "arsuz",
      "ad": "Arsuz"
    },
    {
      "norm": "belen",
      "apiNorm": "belen",
      "ad": "Belen"
    },
    {
      "norm": "defne",
      "apiNorm": "defne",
      "ad": "Defne"
    },
    {
      "norm": "dortyol",
      "apiNorm": "dortyol",
      "ad": "Dörtyol"
    },
    {
      "norm": "erzin",
      "apiNorm": "erzin",
      "ad": "Erzin"
    },
    {
      "norm": "hassa",
      "apiNorm": "hassa",
      "ad": "Hassa"
    },
    {
      "norm": "iskenderun",
      "apiNorm": "iskenderun",
      "ad": "İskenderun"
    },
    {
      "norm": "kirikhan",
      "apiNorm": "kirikhan",
      "ad": "Kırıkhan"
    },
    {
      "norm": "kumlu",
      "apiNorm": "kumlu",
      "ad": "Kumlu"
    },
    {
      "norm": "payas",
      "apiNorm": "payas",
      "ad": "Payas"
    },
    {
      "norm": "reyhanli",
      "apiNorm": "reyhanli",
      "ad": "Reyhanlı"
    },
    {
      "norm": "samandag",
      "apiNorm": "samandag",
      "ad": "Samandağ"
    },
    {
      "norm": "yayladagi",
      "apiNorm": "yayladagi",
      "ad": "Yayladağı"
    }
  ],
  "igdir": [
    {
      "norm": "aralik",
      "apiNorm": "aralik",
      "ad": "Aralık"
    },
    {
      "norm": "karakoyunlu",
      "apiNorm": "karakoyunlu",
      "ad": "Karakoyunlu"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Iğdır Merkez"
    },
    {
      "norm": "tuzluca",
      "apiNorm": "tuzluca",
      "ad": "Tuzluca"
    }
  ],
  "isparta": [
    {
      "norm": "aksu",
      "apiNorm": "aksu",
      "ad": "Aksu"
    },
    {
      "norm": "atabey",
      "apiNorm": "atabey",
      "ad": "Atabey"
    },
    {
      "norm": "egirdir",
      "apiNorm": "egirdir",
      "ad": "Eğirdir"
    },
    {
      "norm": "gelendost",
      "apiNorm": "gelendost",
      "ad": "Gelendost"
    },
    {
      "norm": "gonen",
      "apiNorm": "gonen",
      "ad": "Gönen"
    },
    {
      "norm": "keciborlu",
      "apiNorm": "keciborlu",
      "ad": "Keçiborlu"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Isparta Merkez"
    },
    {
      "norm": "sarkikaraagac",
      "apiNorm": "sarkikaraagac",
      "ad": "Şarkikaraağaç"
    },
    {
      "norm": "senirkent",
      "apiNorm": "senirkent",
      "ad": "Senirkent"
    },
    {
      "norm": "sutculer",
      "apiNorm": "sutculer",
      "ad": "Sütçüler"
    },
    {
      "norm": "uluborlu",
      "apiNorm": "uluborlu",
      "ad": "Uluborlu"
    },
    {
      "norm": "yalvac",
      "apiNorm": "yalvac",
      "ad": "Yalvaç"
    },
    {
      "norm": "yenisarbademli",
      "apiNorm": "yenisarbademli",
      "ad": "Yenişarbademli"
    }
  ],
  "istanbul": [
    {
      "norm": "adalar",
      "apiNorm": "adalar",
      "ad": "Adalar"
    },
    {
      "norm": "arnavutkoy",
      "apiNorm": "arnavutkoy",
      "ad": "Arnavutköy"
    },
    {
      "norm": "atasehir",
      "apiNorm": "atasehir",
      "ad": "Ataşehir"
    },
    {
      "norm": "avcilar",
      "apiNorm": "avcilar",
      "ad": "Avcılar"
    },
    {
      "norm": "bagcilar",
      "apiNorm": "bagcilar",
      "ad": "Bağcılar"
    },
    {
      "norm": "bahcelievler",
      "apiNorm": "bahcelievler",
      "ad": "Bahçelievler"
    },
    {
      "norm": "bakirkoy",
      "apiNorm": "bakirkoy",
      "ad": "Bakırköy"
    },
    {
      "norm": "basaksehir",
      "apiNorm": "basaksehir",
      "ad": "Başakşehir"
    },
    {
      "norm": "bayrampasa",
      "apiNorm": "bayrampasa",
      "ad": "Bayrampaşa"
    },
    {
      "norm": "besiktas",
      "apiNorm": "besiktas",
      "ad": "Beşiktaş"
    },
    {
      "norm": "beykoz",
      "apiNorm": "beykoz",
      "ad": "Beykoz"
    },
    {
      "norm": "beylikduzu",
      "apiNorm": "beylikduzu",
      "ad": "Beylikdüzü"
    },
    {
      "norm": "beyoglu",
      "apiNorm": "beyoglu",
      "ad": "Beyoğlu"
    },
    {
      "norm": "buyukcekmece",
      "apiNorm": "buyukcekmece",
      "ad": "Büyükçekmece"
    },
    {
      "norm": "catalca",
      "apiNorm": "catalca",
      "ad": "Çatalca"
    },
    {
      "norm": "cekmekoy",
      "apiNorm": "cekmekoy",
      "ad": "Çekmeköy"
    },
    {
      "norm": "esenler",
      "apiNorm": "esenler",
      "ad": "Esenler"
    },
    {
      "norm": "esenyurt",
      "apiNorm": "esenyurt",
      "ad": "Esenyurt"
    },
    {
      "norm": "eyupsultan",
      "apiNorm": "eyupsultan",
      "ad": "Eyüpsultan"
    },
    {
      "norm": "fatih",
      "apiNorm": "fatih",
      "ad": "Fatih"
    },
    {
      "norm": "gaziosmanpasa",
      "apiNorm": "gaziosmanpasa",
      "ad": "Gaziosmanpaşa"
    },
    {
      "norm": "gungoren",
      "apiNorm": "gungoren",
      "ad": "Güngören"
    },
    {
      "norm": "kadikoy",
      "apiNorm": "kadikoy",
      "ad": "Kadıköy"
    },
    {
      "norm": "kagithane",
      "apiNorm": "kagithane",
      "ad": "Kâğıthane"
    },
    {
      "norm": "kartal",
      "apiNorm": "kartal",
      "ad": "Kartal"
    },
    {
      "norm": "kucukcekmece",
      "apiNorm": "kucukcekmece",
      "ad": "Küçükçekmece"
    },
    {
      "norm": "maltepe",
      "apiNorm": "maltepe",
      "ad": "Maltepe"
    },
    {
      "norm": "pendik",
      "apiNorm": "pendik",
      "ad": "Pendik"
    },
    {
      "norm": "sancaktepe",
      "apiNorm": "sancaktepe",
      "ad": "Sancaktepe"
    },
    {
      "norm": "sariyer",
      "apiNorm": "sariyer",
      "ad": "Sarıyer"
    },
    {
      "norm": "sile",
      "apiNorm": "sile",
      "ad": "Şile"
    },
    {
      "norm": "silivri",
      "apiNorm": "silivri",
      "ad": "Silivri"
    },
    {
      "norm": "sisli",
      "apiNorm": "sisli",
      "ad": "Şişli"
    },
    {
      "norm": "sultanbeyli",
      "apiNorm": "sultanbeyli",
      "ad": "Sultanbeyli"
    },
    {
      "norm": "sultangazi",
      "apiNorm": "sultangazi",
      "ad": "Sultangazi"
    },
    {
      "norm": "tuzla",
      "apiNorm": "tuzla",
      "ad": "Tuzla"
    },
    {
      "norm": "umraniye",
      "apiNorm": "umraniye",
      "ad": "Ümraniye"
    },
    {
      "norm": "uskudar",
      "apiNorm": "uskudar",
      "ad": "Üsküdar"
    },
    {
      "norm": "zeytinburnu",
      "apiNorm": "zeytinburnu",
      "ad": "Zeytinburnu"
    }
  ],
  "izmir": [
    {
      "norm": "aliaga",
      "apiNorm": "aliaga",
      "ad": "Aliağa"
    },
    {
      "norm": "balcova",
      "apiNorm": "balcova",
      "ad": "Balçova"
    },
    {
      "norm": "bayindir",
      "apiNorm": "bayindir",
      "ad": "Bayındır"
    },
    {
      "norm": "bayrakli",
      "apiNorm": "bayrakli",
      "ad": "Bayraklı"
    },
    {
      "norm": "bergama",
      "apiNorm": "bergama",
      "ad": "Bergama"
    },
    {
      "norm": "beydag",
      "apiNorm": "beydag",
      "ad": "Beydağ"
    },
    {
      "norm": "bornova",
      "apiNorm": "bornova",
      "ad": "Bornova"
    },
    {
      "norm": "buca",
      "apiNorm": "buca",
      "ad": "Buca"
    },
    {
      "norm": "cesme",
      "apiNorm": "cesme",
      "ad": "Çeşme"
    },
    {
      "norm": "cigli",
      "apiNorm": "cigli",
      "ad": "Çiğli"
    },
    {
      "norm": "dikili",
      "apiNorm": "dikili",
      "ad": "Dikili"
    },
    {
      "norm": "foca",
      "apiNorm": "foca",
      "ad": "Foça"
    },
    {
      "norm": "gaziemir",
      "apiNorm": "gaziemir",
      "ad": "Gaziemir"
    },
    {
      "norm": "guzelbahce",
      "apiNorm": "guzelbahce",
      "ad": "Güzelbahçe"
    },
    {
      "norm": "karabaglar",
      "apiNorm": "karabaglar",
      "ad": "Karabağlar"
    },
    {
      "norm": "karaburun",
      "apiNorm": "karaburun",
      "ad": "Karaburun"
    },
    {
      "norm": "karsiyaka",
      "apiNorm": "karsiyaka",
      "ad": "Karşıyaka"
    },
    {
      "norm": "kemalpasa",
      "apiNorm": "kemalpasa",
      "ad": "Kemalpaşa"
    },
    {
      "norm": "kinik",
      "apiNorm": "kinik",
      "ad": "Kınık"
    },
    {
      "norm": "kiraz",
      "apiNorm": "kiraz",
      "ad": "Kiraz"
    },
    {
      "norm": "konak",
      "apiNorm": "konak",
      "ad": "Konak"
    },
    {
      "norm": "menderes",
      "apiNorm": "menderes",
      "ad": "Menderes"
    },
    {
      "norm": "menemen",
      "apiNorm": "menemen",
      "ad": "Menemen"
    },
    {
      "norm": "narlidere",
      "apiNorm": "narlidere",
      "ad": "Narlıdere"
    },
    {
      "norm": "odemis",
      "apiNorm": "odemis",
      "ad": "Ödemiş"
    },
    {
      "norm": "seferihisar",
      "apiNorm": "seferihisar",
      "ad": "Seferihisar"
    },
    {
      "norm": "selcuk",
      "apiNorm": "selcuk",
      "ad": "Selçuk"
    },
    {
      "norm": "tire",
      "apiNorm": "tire",
      "ad": "Tire"
    },
    {
      "norm": "torbali",
      "apiNorm": "torbali",
      "ad": "Torbalı"
    },
    {
      "norm": "urla",
      "apiNorm": "urla",
      "ad": "Urla"
    }
  ],
  "kahramanmaras": [
    {
      "norm": "afsin",
      "apiNorm": "afsin",
      "ad": "Afşin"
    },
    {
      "norm": "andirin",
      "apiNorm": "andirin",
      "ad": "Andırın"
    },
    {
      "norm": "caglayancerit",
      "apiNorm": "caglayancerit",
      "ad": "Çağlayancerit"
    },
    {
      "norm": "dulkadiroglu",
      "apiNorm": "dulkadiroglu",
      "ad": "Dulkadiroğlu"
    },
    {
      "norm": "ekinozu",
      "apiNorm": "ekinozu",
      "ad": "Ekinözü"
    },
    {
      "norm": "elbistan",
      "apiNorm": "elbistan",
      "ad": "Elbistan"
    },
    {
      "norm": "goksun",
      "apiNorm": "goksun",
      "ad": "Göksun"
    },
    {
      "norm": "nurhak",
      "apiNorm": "nurhak",
      "ad": "Nurhak"
    },
    {
      "norm": "onikisubat",
      "apiNorm": "onikisubat",
      "ad": "Onikişubat"
    },
    {
      "norm": "pazarcik",
      "apiNorm": "pazarcik",
      "ad": "Pazarcık"
    },
    {
      "norm": "turkoglu",
      "apiNorm": "turkoglu",
      "ad": "Türkoğlu"
    }
  ],
  "karabuk": [
    {
      "norm": "eflani",
      "apiNorm": "eflani",
      "ad": "Eflani"
    },
    {
      "norm": "eskipazar",
      "apiNorm": "eskipazar",
      "ad": "Eskipazar"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Karabük Merkez"
    },
    {
      "norm": "ovacik",
      "apiNorm": "ovacik",
      "ad": "Ovacık"
    },
    {
      "norm": "safranbolu",
      "apiNorm": "safranbolu",
      "ad": "Safranbolu"
    },
    {
      "norm": "yenice",
      "apiNorm": "yenice",
      "ad": "Yenice"
    }
  ],
  "karaman": [
    {
      "norm": "ayranci",
      "apiNorm": "ayranci",
      "ad": "Ayrancı"
    },
    {
      "norm": "basyayla",
      "apiNorm": "basyayla",
      "ad": "Başyayla"
    },
    {
      "norm": "ermenek",
      "apiNorm": "ermenek",
      "ad": "Ermenek"
    },
    {
      "norm": "kazimkarabekir",
      "apiNorm": "kazimkarabekir",
      "ad": "Kazımkarabekir"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Karaman Merkez"
    },
    {
      "norm": "sariveliler",
      "apiNorm": "sariveliler",
      "ad": "Sarıveliler"
    }
  ],
  "kars": [
    {
      "norm": "akyaka",
      "apiNorm": "akyaka",
      "ad": "Akyaka"
    },
    {
      "norm": "arpacay",
      "apiNorm": "arpacay",
      "ad": "Arpaçay"
    },
    {
      "norm": "digor",
      "apiNorm": "digor",
      "ad": "Digor"
    },
    {
      "norm": "kagizman",
      "apiNorm": "kagizman",
      "ad": "Kağızman"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Kars Merkez"
    },
    {
      "norm": "sarikamis",
      "apiNorm": "sarikamis",
      "ad": "Sarıkamış"
    },
    {
      "norm": "selim",
      "apiNorm": "selim",
      "ad": "Selim"
    },
    {
      "norm": "susuz",
      "apiNorm": "susuz",
      "ad": "Susuz"
    }
  ],
  "kastamonu": [
    {
      "norm": "abana",
      "apiNorm": "abana",
      "ad": "Abana"
    },
    {
      "norm": "agli",
      "apiNorm": "agli",
      "ad": "Ağlı"
    },
    {
      "norm": "arac",
      "apiNorm": "arac",
      "ad": "Araç"
    },
    {
      "norm": "azdavay",
      "apiNorm": "azdavay",
      "ad": "Azdavay"
    },
    {
      "norm": "bozkurt",
      "apiNorm": "bozkurt",
      "ad": "Bozkurt"
    },
    {
      "norm": "catalzeytin",
      "apiNorm": "catalzeytin",
      "ad": "Çatalzeytin"
    },
    {
      "norm": "cide",
      "apiNorm": "cide",
      "ad": "Cide"
    },
    {
      "norm": "daday",
      "apiNorm": "daday",
      "ad": "Daday"
    },
    {
      "norm": "devrekani",
      "apiNorm": "devrekani",
      "ad": "Devrekani"
    },
    {
      "norm": "doganyurt",
      "apiNorm": "doganyurt",
      "ad": "Doğanyurt"
    },
    {
      "norm": "hanonu",
      "apiNorm": "hanonu",
      "ad": "Hanönü"
    },
    {
      "norm": "ihsangazi",
      "apiNorm": "ihsangazi",
      "ad": "İhsangazi"
    },
    {
      "norm": "inebolu",
      "apiNorm": "inebolu",
      "ad": "İnebolu"
    },
    {
      "norm": "kure",
      "apiNorm": "kure",
      "ad": "Küre"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Kastamonu Merkez"
    },
    {
      "norm": "pinarbasi",
      "apiNorm": "pinarbasi",
      "ad": "Pınarbaşı"
    },
    {
      "norm": "senpazar",
      "apiNorm": "senpazar",
      "ad": "Şenpazar"
    },
    {
      "norm": "seydiler",
      "apiNorm": "seydiler",
      "ad": "Seydiler"
    },
    {
      "norm": "taskopru",
      "apiNorm": "taskopru",
      "ad": "Taşköprü"
    },
    {
      "norm": "tosya",
      "apiNorm": "tosya",
      "ad": "Tosya"
    }
  ],
  "kayseri": [
    {
      "norm": "akkisla",
      "apiNorm": "akkisla",
      "ad": "Akkışla"
    },
    {
      "norm": "bunyan",
      "apiNorm": "bunyan",
      "ad": "Bünyan"
    },
    {
      "norm": "develi",
      "apiNorm": "develi",
      "ad": "Develi"
    },
    {
      "norm": "felahiye",
      "apiNorm": "felahiye",
      "ad": "Felahiye"
    },
    {
      "norm": "hacilar",
      "apiNorm": "hacilar",
      "ad": "Hacılar"
    },
    {
      "norm": "incesu",
      "apiNorm": "incesu",
      "ad": "İncesu"
    },
    {
      "norm": "kocasinan",
      "apiNorm": "kocasinan",
      "ad": "Kocasinan"
    },
    {
      "norm": "melikgazi",
      "apiNorm": "melikgazi",
      "ad": "Melikgazi"
    },
    {
      "norm": "ozvatan",
      "apiNorm": "ozvatan",
      "ad": "Özvatan"
    },
    {
      "norm": "pinarbasi",
      "apiNorm": "pinarbasi",
      "ad": "Pınarbaşı"
    },
    {
      "norm": "sarioglan",
      "apiNorm": "sarioglan",
      "ad": "Sarıoğlan"
    },
    {
      "norm": "sariz",
      "apiNorm": "sariz",
      "ad": "Sarız"
    },
    {
      "norm": "talas",
      "apiNorm": "talas",
      "ad": "Talas"
    },
    {
      "norm": "tomarza",
      "apiNorm": "tomarza",
      "ad": "Tomarza"
    },
    {
      "norm": "yahyali",
      "apiNorm": "yahyali",
      "ad": "Yahyalı"
    },
    {
      "norm": "yesilhisar",
      "apiNorm": "yesilhisar",
      "ad": "Yeşilhisar"
    }
  ],
  "kilis": [
    {
      "norm": "elbeyli",
      "apiNorm": "elbeyli",
      "ad": "Elbeyli"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Kilis Merkez"
    },
    {
      "norm": "musabeyli",
      "apiNorm": "musabeyli",
      "ad": "Musabeyli"
    },
    {
      "norm": "polateli",
      "apiNorm": "polateli",
      "ad": "Polateli"
    }
  ],
  "kirikkale": [
    {
      "norm": "bahsili",
      "apiNorm": "bahsili",
      "ad": "Bahşılı"
    },
    {
      "norm": "baliseyh",
      "apiNorm": "baliseyh",
      "ad": "Balışeyh"
    },
    {
      "norm": "celebi",
      "apiNorm": "celebi",
      "ad": "Çelebi"
    },
    {
      "norm": "delice",
      "apiNorm": "delice",
      "ad": "Delice"
    },
    {
      "norm": "karakecili",
      "apiNorm": "karakecili",
      "ad": "Karakeçili"
    },
    {
      "norm": "keskin",
      "apiNorm": "keskin",
      "ad": "Keskin"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Kırıkkale Merkez"
    },
    {
      "norm": "sulakyurt",
      "apiNorm": "sulakyurt",
      "ad": "Sulakyurt"
    },
    {
      "norm": "yahsihan",
      "apiNorm": "yahsihan",
      "ad": "Yahşihan"
    }
  ],
  "kirklareli": [
    {
      "norm": "babaeski",
      "apiNorm": "babaeski",
      "ad": "Babaeski"
    },
    {
      "norm": "demirkoy",
      "apiNorm": "demirkoy",
      "ad": "Demirköy"
    },
    {
      "norm": "kofcaz",
      "apiNorm": "kofcaz",
      "ad": "Kofçaz"
    },
    {
      "norm": "luleburgaz",
      "apiNorm": "luleburgaz",
      "ad": "Lüleburgaz"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Kırklareli Merkez"
    },
    {
      "norm": "pehlivankoy",
      "apiNorm": "pehlivankoy",
      "ad": "Pehlivanköy"
    },
    {
      "norm": "pinarhisar",
      "apiNorm": "pinarhisar",
      "ad": "Pınarhisar"
    },
    {
      "norm": "vize",
      "apiNorm": "vize",
      "ad": "Vize"
    }
  ],
  "kirsehir": [
    {
      "norm": "akcakent",
      "apiNorm": "akcakent",
      "ad": "Akçakent"
    },
    {
      "norm": "akpinar",
      "apiNorm": "akpinar",
      "ad": "Akpınar"
    },
    {
      "norm": "boztepe",
      "apiNorm": "boztepe",
      "ad": "Boztepe"
    },
    {
      "norm": "cicekdagi",
      "apiNorm": "cicekdagi",
      "ad": "Çiçekdağı"
    },
    {
      "norm": "kaman",
      "apiNorm": "kaman",
      "ad": "Kaman"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Kırşehir Merkez"
    },
    {
      "norm": "mucur",
      "apiNorm": "mucur",
      "ad": "Mucur"
    }
  ],
  "kocaeli": [
    {
      "norm": "basiskele",
      "apiNorm": "basiskele",
      "ad": "Başiskele"
    },
    {
      "norm": "cayirova",
      "apiNorm": "cayirova",
      "ad": "Çayırova"
    },
    {
      "norm": "darica",
      "apiNorm": "darica",
      "ad": "Darıca"
    },
    {
      "norm": "derince",
      "apiNorm": "derince",
      "ad": "Derince"
    },
    {
      "norm": "dilovasi",
      "apiNorm": "dilovasi",
      "ad": "Dilovası"
    },
    {
      "norm": "gebze",
      "apiNorm": "gebze",
      "ad": "Gebze"
    },
    {
      "norm": "golcuk",
      "apiNorm": "golcuk",
      "ad": "Gölcük"
    },
    {
      "norm": "izmit",
      "apiNorm": "izmit",
      "ad": "İzmit"
    },
    {
      "norm": "kandira",
      "apiNorm": "kandira",
      "ad": "Kandıra"
    },
    {
      "norm": "karamursel",
      "apiNorm": "karamursel",
      "ad": "Karamürsel"
    },
    {
      "norm": "kartepe",
      "apiNorm": "kartepe",
      "ad": "Kartepe"
    },
    {
      "norm": "korfez",
      "apiNorm": "korfez",
      "ad": "Körfez"
    }
  ],
  "konya": [
    {
      "norm": "ahirli",
      "apiNorm": "ahirli",
      "ad": "Ahırlı"
    },
    {
      "norm": "akoren",
      "apiNorm": "akoren",
      "ad": "Akören"
    },
    {
      "norm": "aksehir",
      "apiNorm": "aksehir",
      "ad": "Akşehir"
    },
    {
      "norm": "altinekin",
      "apiNorm": "altinekin",
      "ad": "Altınekin"
    },
    {
      "norm": "beysehir",
      "apiNorm": "beysehir",
      "ad": "Beyşehir"
    },
    {
      "norm": "bozkir",
      "apiNorm": "bozkir",
      "ad": "Bozkır"
    },
    {
      "norm": "celtik",
      "apiNorm": "celtik",
      "ad": "Çeltik"
    },
    {
      "norm": "cihanbeyli",
      "apiNorm": "cihanbeyli",
      "ad": "Cihanbeyli"
    },
    {
      "norm": "cumra",
      "apiNorm": "cumra",
      "ad": "Çumra"
    },
    {
      "norm": "derbent",
      "apiNorm": "derbent",
      "ad": "Derbent"
    },
    {
      "norm": "derebucak",
      "apiNorm": "derebucak",
      "ad": "Derebucak"
    },
    {
      "norm": "doganhisar",
      "apiNorm": "doganhisar",
      "ad": "Doğanhisar"
    },
    {
      "norm": "emirgazi",
      "apiNorm": "emirgazi",
      "ad": "Emirgazi"
    },
    {
      "norm": "eregli",
      "apiNorm": "eregli",
      "ad": "Ereğli"
    },
    {
      "norm": "guneysinir",
      "apiNorm": "guneysinir",
      "ad": "Güneysınır"
    },
    {
      "norm": "hadim",
      "apiNorm": "hadim",
      "ad": "Hadim"
    },
    {
      "norm": "halkapinar",
      "apiNorm": "halkapinar",
      "ad": "Halkapınar"
    },
    {
      "norm": "huyuk",
      "apiNorm": "huyuk",
      "ad": "Hüyük"
    },
    {
      "norm": "ilgin",
      "apiNorm": "ilgin",
      "ad": "Ilgın"
    },
    {
      "norm": "kadinhani",
      "apiNorm": "kadinhani",
      "ad": "Kadınhanı"
    },
    {
      "norm": "karapinar",
      "apiNorm": "karapinar",
      "ad": "Karapınar"
    },
    {
      "norm": "karatay",
      "apiNorm": "karatay",
      "ad": "Karatay"
    },
    {
      "norm": "kulu",
      "apiNorm": "kulu",
      "ad": "Kulu"
    },
    {
      "norm": "meram",
      "apiNorm": "meram",
      "ad": "Meram"
    },
    {
      "norm": "sarayonu",
      "apiNorm": "sarayonu",
      "ad": "Sarayönü"
    },
    {
      "norm": "selcuklu",
      "apiNorm": "selcuklu",
      "ad": "Selçuklu"
    },
    {
      "norm": "seydisehir",
      "apiNorm": "seydisehir",
      "ad": "Seydişehir"
    },
    {
      "norm": "taskent",
      "apiNorm": "taskent",
      "ad": "Taşkent"
    },
    {
      "norm": "tuzlukcu",
      "apiNorm": "tuzlukcu",
      "ad": "Tuzlukçu"
    },
    {
      "norm": "yalihuyuk",
      "apiNorm": "yalihuyuk",
      "ad": "Yalıhüyük"
    },
    {
      "norm": "yunak",
      "apiNorm": "yunak",
      "ad": "Yunak"
    }
  ],
  "kutahya": [
    {
      "norm": "altintas",
      "apiNorm": "altintas",
      "ad": "Altıntaş"
    },
    {
      "norm": "aslanapa",
      "apiNorm": "aslanapa",
      "ad": "Aslanapa"
    },
    {
      "norm": "cavdarhisar",
      "apiNorm": "cavdarhisar",
      "ad": "Çavdarhisar"
    },
    {
      "norm": "domanic",
      "apiNorm": "domanic",
      "ad": "Domaniç"
    },
    {
      "norm": "dumlupinar",
      "apiNorm": "dumlupinar",
      "ad": "Dumlupınar"
    },
    {
      "norm": "emet",
      "apiNorm": "emet",
      "ad": "Emet"
    },
    {
      "norm": "gediz",
      "apiNorm": "gediz",
      "ad": "Gediz"
    },
    {
      "norm": "hisarcik",
      "apiNorm": "hisarcik",
      "ad": "Hisarcık"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Kütahya Merkez"
    },
    {
      "norm": "pazarlar",
      "apiNorm": "pazarlar",
      "ad": "Pazarlar"
    },
    {
      "norm": "saphane",
      "apiNorm": "saphane",
      "ad": "Şaphane"
    },
    {
      "norm": "simav",
      "apiNorm": "simav",
      "ad": "Simav"
    },
    {
      "norm": "tavsanli",
      "apiNorm": "tavsanli",
      "ad": "Tavşanlı"
    }
  ],
  "malatya": [
    {
      "norm": "akcadag",
      "apiNorm": "akcadag",
      "ad": "Akçadağ"
    },
    {
      "norm": "arapgir",
      "apiNorm": "arapgir",
      "ad": "Arapgir"
    },
    {
      "norm": "arguvan",
      "apiNorm": "arguvan",
      "ad": "Arguvan"
    },
    {
      "norm": "battalgazi",
      "apiNorm": "battalgazi",
      "ad": "Battalgazi"
    },
    {
      "norm": "darende",
      "apiNorm": "darende",
      "ad": "Darende"
    },
    {
      "norm": "dogansehir",
      "apiNorm": "dogansehir",
      "ad": "Doğanşehir"
    },
    {
      "norm": "doganyol",
      "apiNorm": "doganyol",
      "ad": "Doğanyol"
    },
    {
      "norm": "hekimhan",
      "apiNorm": "hekimhan",
      "ad": "Hekimhan"
    },
    {
      "norm": "kale",
      "apiNorm": "kale",
      "ad": "Kale"
    },
    {
      "norm": "kuluncak",
      "apiNorm": "kuluncak",
      "ad": "Kuluncak"
    },
    {
      "norm": "puturge",
      "apiNorm": "puturge",
      "ad": "Pütürge"
    },
    {
      "norm": "yazihan",
      "apiNorm": "yazihan",
      "ad": "Yazıhan"
    },
    {
      "norm": "yesilyurt",
      "apiNorm": "yesilyurt",
      "ad": "Yeşilyurt"
    }
  ],
  "manisa": [
    {
      "norm": "ahmetli",
      "apiNorm": "ahmetli",
      "ad": "Ahmetli"
    },
    {
      "norm": "akhisar",
      "apiNorm": "akhisar",
      "ad": "Akhisar"
    },
    {
      "norm": "alasehir",
      "apiNorm": "alasehir",
      "ad": "Alaşehir"
    },
    {
      "norm": "demirci",
      "apiNorm": "demirci",
      "ad": "Demirci"
    },
    {
      "norm": "golmarmara",
      "apiNorm": "golmarmara",
      "ad": "Gölmarmara"
    },
    {
      "norm": "gordes",
      "apiNorm": "gordes",
      "ad": "Gördes"
    },
    {
      "norm": "kirkagac",
      "apiNorm": "kirkagac",
      "ad": "Kırkağaç"
    },
    {
      "norm": "koprubasi",
      "apiNorm": "koprubasi",
      "ad": "Köprübaşı"
    },
    {
      "norm": "kula",
      "apiNorm": "kula",
      "ad": "Kula"
    },
    {
      "norm": "salihli",
      "apiNorm": "salihli",
      "ad": "Salihli"
    },
    {
      "norm": "sarigol",
      "apiNorm": "sarigol",
      "ad": "Sarıgöl"
    },
    {
      "norm": "saruhanli",
      "apiNorm": "saruhanli",
      "ad": "Saruhanlı"
    },
    {
      "norm": "sehzadeler",
      "apiNorm": "sehzadeler",
      "ad": "Şehzadeler"
    },
    {
      "norm": "selendi",
      "apiNorm": "selendi",
      "ad": "Selendi"
    },
    {
      "norm": "soma",
      "apiNorm": "soma",
      "ad": "Soma"
    },
    {
      "norm": "turgutlu",
      "apiNorm": "turgutlu",
      "ad": "Turgutlu"
    },
    {
      "norm": "yunusemre",
      "apiNorm": "yunusemre",
      "ad": "Yunusemre"
    }
  ],
  "mardin": [
    {
      "norm": "artuklu",
      "apiNorm": "artuklu",
      "ad": "Artuklu"
    },
    {
      "norm": "dargecit",
      "apiNorm": "dargecit",
      "ad": "Dargeçit"
    },
    {
      "norm": "derik",
      "apiNorm": "derik",
      "ad": "Derik"
    },
    {
      "norm": "kiziltepe",
      "apiNorm": "kiziltepe",
      "ad": "Kızıltepe"
    },
    {
      "norm": "mazidagi",
      "apiNorm": "mazidagi",
      "ad": "Mazıdağı"
    },
    {
      "norm": "midyat",
      "apiNorm": "midyat",
      "ad": "Midyat"
    },
    {
      "norm": "nusaybin",
      "apiNorm": "nusaybin",
      "ad": "Nusaybin"
    },
    {
      "norm": "omerli",
      "apiNorm": "omerli",
      "ad": "Ömerli"
    },
    {
      "norm": "savur",
      "apiNorm": "savur",
      "ad": "Savur"
    },
    {
      "norm": "yesilli",
      "apiNorm": "yesilli",
      "ad": "Yeşilli"
    }
  ],
  "mersin": [
    {
      "norm": "akdeniz",
      "apiNorm": "akdeniz",
      "ad": "Akdeniz"
    },
    {
      "norm": "anamur",
      "apiNorm": "anamur",
      "ad": "Anamur"
    },
    {
      "norm": "aydincik",
      "apiNorm": "aydincik",
      "ad": "Aydıncık"
    },
    {
      "norm": "bozyazi",
      "apiNorm": "bozyazi",
      "ad": "Bozyazı"
    },
    {
      "norm": "camliyayla",
      "apiNorm": "camliyayla",
      "ad": "Çamlıyayla"
    },
    {
      "norm": "erdemli",
      "apiNorm": "erdemli",
      "ad": "Erdemli"
    },
    {
      "norm": "gulnar",
      "apiNorm": "gulnar",
      "ad": "Gülnar"
    },
    {
      "norm": "mezitli",
      "apiNorm": "mezitli",
      "ad": "Mezitli"
    },
    {
      "norm": "mut",
      "apiNorm": "mut",
      "ad": "Mut"
    },
    {
      "norm": "silifke",
      "apiNorm": "silifke",
      "ad": "Silifke"
    },
    {
      "norm": "tarsus",
      "apiNorm": "tarsus",
      "ad": "Tarsus"
    },
    {
      "norm": "toroslar",
      "apiNorm": "toroslar",
      "ad": "Toroslar"
    },
    {
      "norm": "yenisehir",
      "apiNorm": "yenisehir",
      "ad": "Yenişehir"
    }
  ],
  "mugla": [
    {
      "norm": "bodrum",
      "apiNorm": "bodrum",
      "ad": "Bodrum"
    },
    {
      "norm": "dalaman",
      "apiNorm": "dalaman",
      "ad": "Dalaman"
    },
    {
      "norm": "datca",
      "apiNorm": "datca",
      "ad": "Datça"
    },
    {
      "norm": "fethiye",
      "apiNorm": "fethiye",
      "ad": "Fethiye"
    },
    {
      "norm": "kavaklidere",
      "apiNorm": "kavaklidere",
      "ad": "Kavaklıdere"
    },
    {
      "norm": "koycegiz",
      "apiNorm": "koycegiz",
      "ad": "Köyceğiz"
    },
    {
      "norm": "marmaris",
      "apiNorm": "marmaris",
      "ad": "Marmaris"
    },
    {
      "norm": "mentese",
      "apiNorm": "mentese",
      "ad": "Menteşe"
    },
    {
      "norm": "milas",
      "apiNorm": "milas",
      "ad": "Milas"
    },
    {
      "norm": "ortaca",
      "apiNorm": "ortaca",
      "ad": "Ortaca"
    },
    {
      "norm": "seydikemer",
      "apiNorm": "seydikemer",
      "ad": "Seydikemer"
    },
    {
      "norm": "ula",
      "apiNorm": "ula",
      "ad": "Ula"
    },
    {
      "norm": "yatagan",
      "apiNorm": "yatagan",
      "ad": "Yatağan"
    }
  ],
  "mus": [
    {
      "norm": "bulanik",
      "apiNorm": "bulanik",
      "ad": "Bulanık"
    },
    {
      "norm": "haskoy",
      "apiNorm": "haskoy",
      "ad": "Hasköy"
    },
    {
      "norm": "korkut",
      "apiNorm": "korkut",
      "ad": "Korkut"
    },
    {
      "norm": "malazgirt",
      "apiNorm": "malazgirt",
      "ad": "Malazgirt"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Muş Merkez"
    },
    {
      "norm": "varto",
      "apiNorm": "varto",
      "ad": "Varto"
    }
  ],
  "nevsehir": [
    {
      "norm": "acigol",
      "apiNorm": "acigol",
      "ad": "Acıgöl"
    },
    {
      "norm": "avanos",
      "apiNorm": "avanos",
      "ad": "Avanos"
    },
    {
      "norm": "derinkuyu",
      "apiNorm": "derinkuyu",
      "ad": "Derinkuyu"
    },
    {
      "norm": "gulsehir",
      "apiNorm": "gulsehir",
      "ad": "Gülşehir"
    },
    {
      "norm": "hacibektas",
      "apiNorm": "hacibektas",
      "ad": "Hacıbektaş"
    },
    {
      "norm": "kozakli",
      "apiNorm": "kozakli",
      "ad": "Kozaklı"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Nevşehir Merkez"
    },
    {
      "norm": "urgup",
      "apiNorm": "urgup",
      "ad": "Ürgüp"
    }
  ],
  "nigde": [
    {
      "norm": "altunhisar",
      "apiNorm": "altunhisar",
      "ad": "Altunhisar"
    },
    {
      "norm": "bor",
      "apiNorm": "bor",
      "ad": "Bor"
    },
    {
      "norm": "camardi",
      "apiNorm": "camardi",
      "ad": "Çamardı"
    },
    {
      "norm": "ciftlik",
      "apiNorm": "ciftlik",
      "ad": "Çiftlik"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Niğde Merkez"
    },
    {
      "norm": "ulukisla",
      "apiNorm": "ulukisla",
      "ad": "Ulukışla"
    }
  ],
  "ordu": [
    {
      "norm": "akkus",
      "apiNorm": "akkus",
      "ad": "Akkuş"
    },
    {
      "norm": "altinordu",
      "apiNorm": "altinordu",
      "ad": "Altınordu"
    },
    {
      "norm": "aybasti",
      "apiNorm": "aybasti",
      "ad": "Aybastı"
    },
    {
      "norm": "camas",
      "apiNorm": "camas",
      "ad": "Çamaş"
    },
    {
      "norm": "catalpinar",
      "apiNorm": "catalpinar",
      "ad": "Çatalpınar"
    },
    {
      "norm": "caybasi",
      "apiNorm": "caybasi",
      "ad": "Çaybaşı"
    },
    {
      "norm": "fatsa",
      "apiNorm": "fatsa",
      "ad": "Fatsa"
    },
    {
      "norm": "golkoy",
      "apiNorm": "golkoy",
      "ad": "Gölköy"
    },
    {
      "norm": "gulyali",
      "apiNorm": "gulyali",
      "ad": "Gülyalı"
    },
    {
      "norm": "gurgentepe",
      "apiNorm": "gurgentepe",
      "ad": "Gürgentepe"
    },
    {
      "norm": "ikizce",
      "apiNorm": "ikizce",
      "ad": "İkizce"
    },
    {
      "norm": "kabaduz",
      "apiNorm": "kabaduz",
      "ad": "Kabadüz"
    },
    {
      "norm": "kabatas",
      "apiNorm": "kabatas",
      "ad": "Kabataş"
    },
    {
      "norm": "korgan",
      "apiNorm": "korgan",
      "ad": "Korgan"
    },
    {
      "norm": "kumru",
      "apiNorm": "kumru",
      "ad": "Kumru"
    },
    {
      "norm": "mesudiye",
      "apiNorm": "mesudiye",
      "ad": "Mesudiye"
    },
    {
      "norm": "persembe",
      "apiNorm": "persembe",
      "ad": "Perşembe"
    },
    {
      "norm": "ulubey",
      "apiNorm": "ulubey",
      "ad": "Ulubey"
    },
    {
      "norm": "unye",
      "apiNorm": "unye",
      "ad": "Ünye"
    }
  ],
  "osmaniye": [
    {
      "norm": "bahce",
      "apiNorm": "bahce",
      "ad": "Bahçe"
    },
    {
      "norm": "duzici",
      "apiNorm": "duzici",
      "ad": "Düziçi"
    },
    {
      "norm": "hasanbeyli",
      "apiNorm": "hasanbeyli",
      "ad": "Hasanbeyli"
    },
    {
      "norm": "kadirli",
      "apiNorm": "kadirli",
      "ad": "Kadirli"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Osmaniye Merkez"
    },
    {
      "norm": "sumbas",
      "apiNorm": "sumbas",
      "ad": "Sumbas"
    },
    {
      "norm": "toprakkale",
      "apiNorm": "toprakkale",
      "ad": "Toprakkale"
    }
  ],
  "rize": [
    {
      "norm": "ardesen",
      "apiNorm": "ardesen",
      "ad": "Ardeşen"
    },
    {
      "norm": "camlihemsin",
      "apiNorm": "camlihemsin",
      "ad": "Çamlıhemşin"
    },
    {
      "norm": "cayeli",
      "apiNorm": "cayeli",
      "ad": "Çayeli"
    },
    {
      "norm": "derepazari",
      "apiNorm": "derepazari",
      "ad": "Derepazarı"
    },
    {
      "norm": "findikli",
      "apiNorm": "findikli",
      "ad": "Fındıklı"
    },
    {
      "norm": "guneysu",
      "apiNorm": "guneysu",
      "ad": "Güneysu"
    },
    {
      "norm": "hemsin",
      "apiNorm": "hemsin",
      "ad": "Hemşin"
    },
    {
      "norm": "ikizdere",
      "apiNorm": "ikizdere",
      "ad": "İkizdere"
    },
    {
      "norm": "iyidere",
      "apiNorm": "iyidere",
      "ad": "İyidere"
    },
    {
      "norm": "kalkandere",
      "apiNorm": "kalkandere",
      "ad": "Kalkandere"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Rize Merkez"
    },
    {
      "norm": "pazar",
      "apiNorm": "pazar",
      "ad": "Pazar"
    }
  ],
  "sakarya": [
    {
      "norm": "adapazari",
      "apiNorm": "adapazari",
      "ad": "Adapazarı"
    },
    {
      "norm": "akyazi",
      "apiNorm": "akyazi",
      "ad": "Akyazı"
    },
    {
      "norm": "arifiye",
      "apiNorm": "arifiye",
      "ad": "Arifiye"
    },
    {
      "norm": "erenler",
      "apiNorm": "erenler",
      "ad": "Erenler"
    },
    {
      "norm": "ferizli",
      "apiNorm": "ferizli",
      "ad": "Ferizli"
    },
    {
      "norm": "geyve",
      "apiNorm": "geyve",
      "ad": "Geyve"
    },
    {
      "norm": "hendek",
      "apiNorm": "hendek",
      "ad": "Hendek"
    },
    {
      "norm": "karapurcek",
      "apiNorm": "karapurcek",
      "ad": "Karapürçek"
    },
    {
      "norm": "karasu",
      "apiNorm": "karasu",
      "ad": "Karasu"
    },
    {
      "norm": "kaynarca",
      "apiNorm": "kaynarca",
      "ad": "Kaynarca"
    },
    {
      "norm": "kocaali",
      "apiNorm": "kocaali",
      "ad": "Kocaali"
    },
    {
      "norm": "pamukova",
      "apiNorm": "pamukova",
      "ad": "Pamukova"
    },
    {
      "norm": "sapanca",
      "apiNorm": "sapanca",
      "ad": "Sapanca"
    },
    {
      "norm": "serdivan",
      "apiNorm": "serdivan",
      "ad": "Serdivan"
    },
    {
      "norm": "sogutlu",
      "apiNorm": "sogutlu",
      "ad": "Söğütlü"
    },
    {
      "norm": "tarakli",
      "apiNorm": "tarakli",
      "ad": "Taraklı"
    }
  ],
  "samsun": [
    {
      "norm": "19-mayis",
      "apiNorm": "19 mayis",
      "ad": "19 Mayıs"
    },
    {
      "norm": "alacam",
      "apiNorm": "alacam",
      "ad": "Alaçam"
    },
    {
      "norm": "asarcik",
      "apiNorm": "asarcik",
      "ad": "Asarcık"
    },
    {
      "norm": "atakum",
      "apiNorm": "atakum",
      "ad": "Atakum"
    },
    {
      "norm": "ayvacik",
      "apiNorm": "ayvacik",
      "ad": "Ayvacık"
    },
    {
      "norm": "bafra",
      "apiNorm": "bafra",
      "ad": "Bafra"
    },
    {
      "norm": "canik",
      "apiNorm": "canik",
      "ad": "Canik"
    },
    {
      "norm": "carsamba",
      "apiNorm": "carsamba",
      "ad": "Çarşamba"
    },
    {
      "norm": "havza",
      "apiNorm": "havza",
      "ad": "Havza"
    },
    {
      "norm": "ilkadim",
      "apiNorm": "ilkadim",
      "ad": "İlkadım"
    },
    {
      "norm": "kavak",
      "apiNorm": "kavak",
      "ad": "Kavak"
    },
    {
      "norm": "ladik",
      "apiNorm": "ladik",
      "ad": "Ladik"
    },
    {
      "norm": "salipazari",
      "apiNorm": "salipazari",
      "ad": "Salıpazarı"
    },
    {
      "norm": "tekkekoy",
      "apiNorm": "tekkekoy",
      "ad": "Tekkeköy"
    },
    {
      "norm": "terme",
      "apiNorm": "terme",
      "ad": "Terme"
    },
    {
      "norm": "vezirkopru",
      "apiNorm": "vezirkopru",
      "ad": "Vezirköprü"
    },
    {
      "norm": "yakakent",
      "apiNorm": "yakakent",
      "ad": "Yakakent"
    }
  ],
  "sanliurfa": [
    {
      "norm": "akcakale",
      "apiNorm": "akcakale",
      "ad": "Akçakale"
    },
    {
      "norm": "birecik",
      "apiNorm": "birecik",
      "ad": "Birecik"
    },
    {
      "norm": "bozova",
      "apiNorm": "bozova",
      "ad": "Bozova"
    },
    {
      "norm": "ceylanpinar",
      "apiNorm": "ceylanpinar",
      "ad": "Ceylanpınar"
    },
    {
      "norm": "eyyubiye",
      "apiNorm": "eyyubiye",
      "ad": "Eyyübiye"
    },
    {
      "norm": "halfeti",
      "apiNorm": "halfeti",
      "ad": "Halfeti"
    },
    {
      "norm": "haliliye",
      "apiNorm": "haliliye",
      "ad": "Haliliye"
    },
    {
      "norm": "harran",
      "apiNorm": "harran",
      "ad": "Harran"
    },
    {
      "norm": "hilvan",
      "apiNorm": "hilvan",
      "ad": "Hilvan"
    },
    {
      "norm": "karakopru",
      "apiNorm": "karakopru",
      "ad": "Karaköprü"
    },
    {
      "norm": "siverek",
      "apiNorm": "siverek",
      "ad": "Siverek"
    },
    {
      "norm": "suruc",
      "apiNorm": "suruc",
      "ad": "Suruç"
    },
    {
      "norm": "viransehir",
      "apiNorm": "viransehir",
      "ad": "Viranşehir"
    }
  ],
  "siirt": [
    {
      "norm": "baykan",
      "apiNorm": "baykan",
      "ad": "Baykan"
    },
    {
      "norm": "eruh",
      "apiNorm": "eruh",
      "ad": "Eruh"
    },
    {
      "norm": "kurtalan",
      "apiNorm": "kurtalan",
      "ad": "Kurtalan"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Siirt Merkez"
    },
    {
      "norm": "pervari",
      "apiNorm": "pervari",
      "ad": "Pervari"
    },
    {
      "norm": "sirvan",
      "apiNorm": "sirvan",
      "ad": "Şirvan"
    },
    {
      "norm": "tillo",
      "apiNorm": "tillo",
      "ad": "Tillo"
    }
  ],
  "sinop": [
    {
      "norm": "ayancik",
      "apiNorm": "ayancik",
      "ad": "Ayancık"
    },
    {
      "norm": "boyabat",
      "apiNorm": "boyabat",
      "ad": "Boyabat"
    },
    {
      "norm": "dikmen",
      "apiNorm": "dikmen",
      "ad": "Dikmen"
    },
    {
      "norm": "duragan",
      "apiNorm": "duragan",
      "ad": "Durağan"
    },
    {
      "norm": "erfelek",
      "apiNorm": "erfelek",
      "ad": "Erfelek"
    },
    {
      "norm": "gerze",
      "apiNorm": "gerze",
      "ad": "Gerze"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Sinop Merkez"
    },
    {
      "norm": "sarayduzu",
      "apiNorm": "sarayduzu",
      "ad": "Saraydüzü"
    },
    {
      "norm": "turkeli",
      "apiNorm": "turkeli",
      "ad": "Türkeli"
    }
  ],
  "sirnak": [
    {
      "norm": "beytussebap",
      "apiNorm": "beytussebap",
      "ad": "Beytüşşebap"
    },
    {
      "norm": "cizre",
      "apiNorm": "cizre",
      "ad": "Cizre"
    },
    {
      "norm": "guclukonak",
      "apiNorm": "guclukonak",
      "ad": "Güçlükonak"
    },
    {
      "norm": "idil",
      "apiNorm": "idil",
      "ad": "İdil"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Şırnak Merkez"
    },
    {
      "norm": "silopi",
      "apiNorm": "silopi",
      "ad": "Silopi"
    },
    {
      "norm": "uludere",
      "apiNorm": "uludere",
      "ad": "Uludere"
    }
  ],
  "sivas": [
    {
      "norm": "akincilar",
      "apiNorm": "akincilar",
      "ad": "Akıncılar"
    },
    {
      "norm": "altinyayla",
      "apiNorm": "altinyayla",
      "ad": "Altınyayla"
    },
    {
      "norm": "divrigi",
      "apiNorm": "divrigi",
      "ad": "Divriği"
    },
    {
      "norm": "dogansar",
      "apiNorm": "dogansar",
      "ad": "Doğanşar"
    },
    {
      "norm": "gemerek",
      "apiNorm": "gemerek",
      "ad": "Gemerek"
    },
    {
      "norm": "golova",
      "apiNorm": "golova",
      "ad": "Gölova"
    },
    {
      "norm": "gurun",
      "apiNorm": "gurun",
      "ad": "Gürün"
    },
    {
      "norm": "hafik",
      "apiNorm": "hafik",
      "ad": "Hafik"
    },
    {
      "norm": "imranli",
      "apiNorm": "imranli",
      "ad": "İmranlı"
    },
    {
      "norm": "kangal",
      "apiNorm": "kangal",
      "ad": "Kangal"
    },
    {
      "norm": "koyulhisar",
      "apiNorm": "koyulhisar",
      "ad": "Koyulhisar"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Sivas Merkez"
    },
    {
      "norm": "sarkisla",
      "apiNorm": "sarkisla",
      "ad": "Şarkışla"
    },
    {
      "norm": "susehri",
      "apiNorm": "susehri",
      "ad": "Suşehri"
    },
    {
      "norm": "ulas",
      "apiNorm": "ulas",
      "ad": "Ulaş"
    },
    {
      "norm": "yildizeli",
      "apiNorm": "yildizeli",
      "ad": "Yıldızeli"
    },
    {
      "norm": "zara",
      "apiNorm": "zara",
      "ad": "Zara"
    }
  ],
  "tekirdag": [
    {
      "norm": "cerkezkoy",
      "apiNorm": "cerkezkoy",
      "ad": "Çerkezköy"
    },
    {
      "norm": "corlu",
      "apiNorm": "corlu",
      "ad": "Çorlu"
    },
    {
      "norm": "ergene",
      "apiNorm": "ergene",
      "ad": "Ergene"
    },
    {
      "norm": "hayrabolu",
      "apiNorm": "hayrabolu",
      "ad": "Hayrabolu"
    },
    {
      "norm": "kapakli",
      "apiNorm": "kapakli",
      "ad": "Kapaklı"
    },
    {
      "norm": "malkara",
      "apiNorm": "malkara",
      "ad": "Malkara"
    },
    {
      "norm": "marmaraereglisi",
      "apiNorm": "marmaraereglisi",
      "ad": "Marmaraereğlisi"
    },
    {
      "norm": "muratli",
      "apiNorm": "muratli",
      "ad": "Muratlı"
    },
    {
      "norm": "saray",
      "apiNorm": "saray",
      "ad": "Saray"
    },
    {
      "norm": "sarkoy",
      "apiNorm": "sarkoy",
      "ad": "Şarköy"
    },
    {
      "norm": "suleymanpasa",
      "apiNorm": "suleymanpasa",
      "ad": "Süleymanpaşa"
    }
  ],
  "tokat": [
    {
      "norm": "almus",
      "apiNorm": "almus",
      "ad": "Almus"
    },
    {
      "norm": "artova",
      "apiNorm": "artova",
      "ad": "Artova"
    },
    {
      "norm": "basciftlik",
      "apiNorm": "basciftlik",
      "ad": "Başçiftlik"
    },
    {
      "norm": "erbaa",
      "apiNorm": "erbaa",
      "ad": "Erbaa"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Tokat Merkez"
    },
    {
      "norm": "niksar",
      "apiNorm": "niksar",
      "ad": "Niksar"
    },
    {
      "norm": "pazar",
      "apiNorm": "pazar",
      "ad": "Pazar"
    },
    {
      "norm": "resadiye",
      "apiNorm": "resadiye",
      "ad": "Reşadiye"
    },
    {
      "norm": "sulusaray",
      "apiNorm": "sulusaray",
      "ad": "Sulusaray"
    },
    {
      "norm": "turhal",
      "apiNorm": "turhal",
      "ad": "Turhal"
    },
    {
      "norm": "yesilyurt",
      "apiNorm": "yesilyurt",
      "ad": "Yeşilyurt"
    },
    {
      "norm": "zile",
      "apiNorm": "zile",
      "ad": "Zile"
    }
  ],
  "trabzon": [
    {
      "norm": "akcaabat",
      "apiNorm": "akcaabat",
      "ad": "Akçaabat"
    },
    {
      "norm": "arakli",
      "apiNorm": "arakli",
      "ad": "Araklı"
    },
    {
      "norm": "arsin",
      "apiNorm": "arsin",
      "ad": "Arsin"
    },
    {
      "norm": "besikduzu",
      "apiNorm": "besikduzu",
      "ad": "Beşikdüzü"
    },
    {
      "norm": "carsibasi",
      "apiNorm": "carsibasi",
      "ad": "Çarşıbaşı"
    },
    {
      "norm": "caykara",
      "apiNorm": "caykara",
      "ad": "Çaykara"
    },
    {
      "norm": "dernekpazari",
      "apiNorm": "dernekpazari",
      "ad": "Dernekpazarı"
    },
    {
      "norm": "duzkoy",
      "apiNorm": "duzkoy",
      "ad": "Düzköy"
    },
    {
      "norm": "hayrat",
      "apiNorm": "hayrat",
      "ad": "Hayrat"
    },
    {
      "norm": "koprubasi",
      "apiNorm": "koprubasi",
      "ad": "Köprübaşı"
    },
    {
      "norm": "macka",
      "apiNorm": "macka",
      "ad": "Maçka"
    },
    {
      "norm": "of",
      "apiNorm": "of",
      "ad": "Of"
    },
    {
      "norm": "ortahisar",
      "apiNorm": "ortahisar",
      "ad": "Ortahisar"
    },
    {
      "norm": "salpazari",
      "apiNorm": "salpazari",
      "ad": "Şalpazarı"
    },
    {
      "norm": "surmene",
      "apiNorm": "surmene",
      "ad": "Sürmene"
    },
    {
      "norm": "tonya",
      "apiNorm": "tonya",
      "ad": "Tonya"
    },
    {
      "norm": "vakfikebir",
      "apiNorm": "vakfikebir",
      "ad": "Vakfıkebir"
    },
    {
      "norm": "yomra",
      "apiNorm": "yomra",
      "ad": "Yomra"
    }
  ],
  "tunceli": [
    {
      "norm": "cemisgezek",
      "apiNorm": "cemisgezek",
      "ad": "Çemişgezek"
    },
    {
      "norm": "hozat",
      "apiNorm": "hozat",
      "ad": "Hozat"
    },
    {
      "norm": "mazgirt",
      "apiNorm": "mazgirt",
      "ad": "Mazgirt"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Tunceli Merkez"
    },
    {
      "norm": "nazimiye",
      "apiNorm": "nazimiye",
      "ad": "Nazımiye"
    },
    {
      "norm": "ovacik",
      "apiNorm": "ovacik",
      "ad": "Ovacık"
    },
    {
      "norm": "pertek",
      "apiNorm": "pertek",
      "ad": "Pertek"
    },
    {
      "norm": "pulumur",
      "apiNorm": "pulumur",
      "ad": "Pülümür"
    }
  ],
  "usak": [
    {
      "norm": "banaz",
      "apiNorm": "banaz",
      "ad": "Banaz"
    },
    {
      "norm": "esme",
      "apiNorm": "esme",
      "ad": "Eşme"
    },
    {
      "norm": "karahalli",
      "apiNorm": "karahalli",
      "ad": "Karahallı"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Uşak Merkez"
    },
    {
      "norm": "sivasli",
      "apiNorm": "sivasli",
      "ad": "Sivaslı"
    },
    {
      "norm": "ulubey",
      "apiNorm": "ulubey",
      "ad": "Ulubey"
    }
  ],
  "van": [
    {
      "norm": "bahcesaray",
      "apiNorm": "bahcesaray",
      "ad": "Bahçesaray"
    },
    {
      "norm": "baskale",
      "apiNorm": "baskale",
      "ad": "Başkale"
    },
    {
      "norm": "caldiran",
      "apiNorm": "caldiran",
      "ad": "Çaldıran"
    },
    {
      "norm": "catak",
      "apiNorm": "catak",
      "ad": "Çatak"
    },
    {
      "norm": "edremit",
      "apiNorm": "edremit",
      "ad": "Edremit"
    },
    {
      "norm": "ercis",
      "apiNorm": "ercis",
      "ad": "Erciş"
    },
    {
      "norm": "gevas",
      "apiNorm": "gevas",
      "ad": "Gevaş"
    },
    {
      "norm": "gurpinar",
      "apiNorm": "gurpinar",
      "ad": "Gürpınar"
    },
    {
      "norm": "ipekyolu",
      "apiNorm": "ipekyolu",
      "ad": "İpekyolu"
    },
    {
      "norm": "muradiye",
      "apiNorm": "muradiye",
      "ad": "Muradiye"
    },
    {
      "norm": "ozalp",
      "apiNorm": "ozalp",
      "ad": "Özalp"
    },
    {
      "norm": "saray",
      "apiNorm": "saray",
      "ad": "Saray"
    },
    {
      "norm": "tusba",
      "apiNorm": "tusba",
      "ad": "Tuşba"
    }
  ],
  "yalova": [
    {
      "norm": "altinova",
      "apiNorm": "altinova",
      "ad": "Altınova"
    },
    {
      "norm": "armutlu",
      "apiNorm": "armutlu",
      "ad": "Armutlu"
    },
    {
      "norm": "ciftlikkoy",
      "apiNorm": "ciftlikkoy",
      "ad": "Çiftlikköy"
    },
    {
      "norm": "cinarcik",
      "apiNorm": "cinarcik",
      "ad": "Çınarcık"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Yalova Merkez"
    },
    {
      "norm": "termal",
      "apiNorm": "termal",
      "ad": "Termal"
    }
  ],
  "yozgat": [
    {
      "norm": "akdagmadeni",
      "apiNorm": "akdagmadeni",
      "ad": "Akdağmadeni"
    },
    {
      "norm": "aydincik",
      "apiNorm": "aydincik",
      "ad": "Aydıncık"
    },
    {
      "norm": "bogazliyan",
      "apiNorm": "bogazliyan",
      "ad": "Boğazlıyan"
    },
    {
      "norm": "candir",
      "apiNorm": "candir",
      "ad": "Çandır"
    },
    {
      "norm": "cayiralan",
      "apiNorm": "cayiralan",
      "ad": "Çayıralan"
    },
    {
      "norm": "cekerek",
      "apiNorm": "cekerek",
      "ad": "Çekerek"
    },
    {
      "norm": "kadisehri",
      "apiNorm": "kadisehri",
      "ad": "Kadışehri"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Yozgat Merkez"
    },
    {
      "norm": "saraykent",
      "apiNorm": "saraykent",
      "ad": "Saraykent"
    },
    {
      "norm": "sarikaya",
      "apiNorm": "sarikaya",
      "ad": "Sarıkaya"
    },
    {
      "norm": "sefaatli",
      "apiNorm": "sefaatli",
      "ad": "Şefaatli"
    },
    {
      "norm": "sorgun",
      "apiNorm": "sorgun",
      "ad": "Sorgun"
    },
    {
      "norm": "yenifakili",
      "apiNorm": "yenifakili",
      "ad": "Yenifakılı"
    },
    {
      "norm": "yerkoy",
      "apiNorm": "yerkoy",
      "ad": "Yerköy"
    }
  ],
  "zonguldak": [
    {
      "norm": "alapli",
      "apiNorm": "alapli",
      "ad": "Alaplı"
    },
    {
      "norm": "caycuma",
      "apiNorm": "caycuma",
      "ad": "Çaycuma"
    },
    {
      "norm": "devrek",
      "apiNorm": "devrek",
      "ad": "Devrek"
    },
    {
      "norm": "eregli",
      "apiNorm": "eregli",
      "ad": "Ereğli"
    },
    {
      "norm": "gokcebey",
      "apiNorm": "gokcebey",
      "ad": "Gökçebey"
    },
    {
      "norm": "kilimli",
      "apiNorm": "kilimli",
      "ad": "Kilimli"
    },
    {
      "norm": "kozlu",
      "apiNorm": "kozlu",
      "ad": "Kozlu"
    },
    {
      "norm": "merkez",
      "apiNorm": "merkez",
      "ad": "Zonguldak Merkez"
    }
  ]
};

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
