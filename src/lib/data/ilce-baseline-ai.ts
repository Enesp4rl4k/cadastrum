/**
 * Otomatik üretildi: 2026-07-11
 * Kaynak: data/ilce-baseline-ai.json (AI araştırma — Groq llama-3.3-70b)
 *
 * !!! BU DOSYAYI ELLE DÜZENLEME !!!
 * Yenile: node scripts/ilce-baseline-ai-ts-uret.mjs
 *
 * Hiyerarşi: ilceFiyatGetir önce manuel ILCE_BASELINE_ARSA/TARLA'ya bakar,
 * bulamazsa BURAYA düşer. ILCE_BASELINE_AI_TARIH ile enflasyon düzeltmesi yapılır.
 *
 * Toplam: 87 ilçe arsa, 87 ilçe tarla
 * (Düşük güven (25'den az) → 6 kayıt atıldı)
 */

/** AI baseline'ın üretildiği tarih (enflasyon düzeltmesi referansı) */
export const ILCE_BASELINE_AI_TARIH = "2026-05-01";

/** İlçe bazlı ARSA TL/m² baseline — AI fallback (manuel tablodan sonra başvurulur) */
export const ILCE_BASELINE_AI_ARSA: Record<string, number> = {
  "edirne__havsa": 2500, /* g40 */
  "kirklareli__luleburgaz": 2500, /* g40 */
  "kirklareli__babaeski": 2500, /* g40 */
  "tekirdag__saray": 8000, /* g40 */
  "istanbul__basaksehir": 25000, /* g60 */
  "edirne__kesan": 2500, /* g40 */
  "karabuk__karabuk merkez": 2500, /* g40 */
  "bartin__kurucasile": 4000, /* g40 */
  "bartin__amasra": 8000, /* g40 */
  "ankara__mamak": 8000, /* g60 */
  "kirikkale__yahsihan": 2500, /* g40 */
  "antalya__demre": 8000, /* g40 */
  "nevsehir__nevsehir merkez": 8000, /* g40 */
  "istanbul__esenyurt": 18200, /* g60 */
  "tekirdag__sarkoy": 8000, /* g40 */
  "tekirdag__malkara": 2500, /* g40 */
  "eskisehir__seyitgazi": 8000, /* g60 */
  "eskisehir__odunpazari": 8000, /* g60 */
  "bursa__inegol": 8000, /* g40 */
  "ankara__pursaklar": 8000, /* g40 */
  "mersin__erdemli": 8000, /* g40 */
  "nevsehir__avanos": 8000, /* g40 */
  "nevsehir__urgup": 8000, /* g40 */
  "aksaray__guzelyurt": 2500, /* g40 */
  "nigde__bor": 2500, /* g40 */
  "konya__karatay": 4200, /* g40 */
  "isparta__egirdir": 2500, /* g40 */
  "nigde__ulukisla": 2500, /* g40 */
  "nigde__nigde merkez": 2500, /* g40 */
  "konya__eregli": 5500, /* g40 */
  "kayseri__incesu": 4200, /* g40 */
  "karaman__karaman merkez": 2500, /* g40 */
  "diyarbakir__kocakoy": 800, /* g40 */
  "kars__kars merkez": 2500, /* g40 */
  "el zig__el zig merkez": 4500, /* g40 */
  "isparta__gelendost": 2500, /* g40 */
  "isparta__yalvac": 2500, /* g40 */
  "kayseri__kocasinan": 4200, /* g40 */
  "nevsehir__derinkuyu": 2500, /* g40 */
  "sivas__kangal": 2500, /* g40 */
  "sivas__yildizeli": 2500, /* g40 */
  "kayseri__pinarbasi": 2500, /* g40 */
  "corum__sungurlu": 2500, /* g40 */
  "ankara__bal": 4000, /* g40 */
  "gumushane__kelkit": 800, /* g40 */
  "erzurum__hinis": 2500, /* g40 */
  "erzurum__tekman": 2500, /* g40 */
  "erzurum__karayazi": 800, /* g40 */
  "mus__malazgirt": 800, /* g40 */
  "denizli__tavas": 2500, /* g40 */
  "nevsehir__acigol": 2500, /* g40 */
  "kirikkale__kirikkale merkez": 4500, /* g40 */
  "burdur__bucak": 2500, /* g40 */
  "antalya__korkuteli": 4000, /* g40 */
  "yozgat__sorgun": 2500, /* g40 */
  "yozgat__yerkoy": 2500, /* g40 */
  "kayseri__talas": 4500, /* g40 */
  "adana__tufanbeyli": 2000, /* g40 */
  "nigde__altunhisar": 2500, /* g40 */
  "konya__karapinar": 5500, /* g40 */
  "aksaray__gulagac": 2500, /* g40 */
  "antalya__ibradi": 4000, /* g40 */
  "konya__cumra": 4200, /* g40 */
  "konya__kulu": 2500, /* g40 */
  "konya__derebucak": 2500, /* g40 */
  "karaman__kazimkarabekir": 2500, /* g40 */
  "denizli__cal": 2500, /* g40 */
  "usak__esme": 2500, /* g40 */
  "nevsehir__hacibektas": 2500, /* g40 */
  "nevsehir__kozakli": 2500, /* g40 */
  "nevsehir__gulsehir": 2500, /* g40 */
  "ardahan__posof": 2000, /* g40 */
  "kayseri__develi": 1040, /* g40 */
  "ankara__nallihan": 4000, /* g40 */
  "istanbul__bahcelievler": 25000, /* g60 */
  "kahramanmaras__afsin": 2500, /* g40 */
  "yalova__cinarcik": 8000, /* g40 */
  "istanbul__kadikoy": 42000, /* g85 */
  "istanbul__maltepe": 25000, /* g60 */
  "istanbul__atasehir": 45000, /* g70 */
  "istanbul__besiktas": 85000, /* g80 */
  "istanbul__sariyer": 25000, /* g70 */
  "istanbul__uskudar": 25000, /* g60 */
  "yalova__yalova merkez": 8000, /* g60 */
  "istanbul__kartal": 25000, /* g60 */
  "istanbul__sancaktepe": 18000, /* g60 */
  "istanbul__cekmekoy": 8000, /* g40 */
  "istanbul__pendik": 25000, /* g60 */
  "istanbul__tuzla": 8000, /* g40 */
  "bursa__orhangazi": 8000, /* g40 */
  "yalova__ciftlikkoy": 8000, /* g40 */
  "yalova__altinova": 8000, /* g40 */
};

/** İlçe bazlı TARLA TL/m² baseline — AI fallback */
export const ILCE_BASELINE_AI_TARLA: Record<string, number> = {
  "edirne__havsa": 200, /* g30 */
  "kirklareli__luleburgaz": 200, /* g30 */
  "kirklareli__babaeski": 350, /* g30 */
  "tekirdag__saray": 400, /* g30 */
  "istanbul__basaksehir": 1500, /* g40 */
  "edirne__kesan": 400, /* g30 */
  "karabuk__karabuk merkez": 200, /* g30 */
  "bartin__kurucasile": 400, /* g30 */
  "bartin__amasra": 1200, /* g30 */
  "ankara__mamak": 1200, /* g50 */
  "kirikkale__yahsihan": 200, /* g30 */
  "antalya__demre": 1200, /* g30 */
  "nevsehir__nevsehir merkez": 400, /* g30 */
  "istanbul__esenyurt": 2600, /* g40 */
  "tekirdag__sarkoy": 1200, /* g30 */
  "tekirdag__malkara": 400, /* g30 */
  "eskisehir__seyitgazi": 1200, /* g50 */
  "eskisehir__odunpazari": 1200, /* g50 */
  "bursa__inegol": 400, /* g30 */
  "ankara__pursaklar": 400, /* g30 */
  "mersin__erdemli": 1200, /* g30 */
  "nevsehir__avanos": 400, /* g30 */
  "nevsehir__urgup": 400, /* g30 */
  "aksaray__guzelyurt": 200, /* g30 */
  "nigde__bor": 200, /* g30 */
  "konya__karatay": 280, /* g30 */
  "isparta__egirdir": 400, /* g30 */
  "nigde__ulukisla": 200, /* g30 */
  "nigde__nigde merkez": 200, /* g30 */
  "konya__eregli": 350, /* g30 */
  "kayseri__incesu": 280, /* g30 */
  "karaman__karaman merkez": 200, /* g30 */
  "diyarbakir__kocakoy": 120, /* g30 */
  "kars__kars merkez": 200, /* g30 */
  "el zig__el zig merkez": 300, /* g30 */
  "isparta__gelendost": 200, /* g30 */
  "isparta__yalvac": 200, /* g30 */
  "kayseri__kocasinan": 600, /* g30 */
  "nevsehir__derinkuyu": 350, /* g30 */
  "sivas__kangal": 200, /* g30 */
  "sivas__yildizeli": 200, /* g30 */
  "kayseri__pinarbasi": 350, /* g30 */
  "corum__sungurlu": 200, /* g30 */
  "ankara__bal": 200, /* g30 */
  "gumushane__kelkit": 150, /* g30 */
  "erzurum__hinis": 200, /* g30 */
  "erzurum__tekman": 200, /* g30 */
  "erzurum__karayazi": 150, /* g30 */
  "mus__malazgirt": 150, /* g30 */
  "denizli__tavas": 200, /* g30 */
  "nevsehir__acigol": 200, /* g30 */
  "kirikkale__kirikkale merkez": 300, /* g30 */
  "burdur__bucak": 200, /* g30 */
  "antalya__korkuteli": 300, /* g30 */
  "yozgat__sorgun": 200, /* g30 */
  "yozgat__yerkoy": 200, /* g30 */
  "kayseri__talas": 300, /* g30 */
  "adana__tufanbeyli": 300, /* g30 */
  "nigde__altunhisar": 350, /* g30 */
  "konya__karapinar": 350, /* g30 */
  "aksaray__gulagac": 350, /* g30 */
  "antalya__ibradi": 200, /* g30 */
  "konya__cumra": 280, /* g40 */
  "konya__kulu": 200, /* g30 */
  "konya__derebucak": 200, /* g30 */
  "karaman__kazimkarabekir": 200, /* g30 */
  "denizli__cal": 200, /* g30 */
  "usak__esme": 200, /* g30 */
  "nevsehir__hacibektas": 200, /* g30 */
  "nevsehir__kozakli": 200, /* g30 */
  "nevsehir__gulsehir": 200, /* g30 */
  "ardahan__posof": 200, /* g30 */
  "kayseri__develi": 200, /* g30 */
  "ankara__nallihan": 200, /* g30 */
  "istanbul__bahcelievler": 1500, /* g40 */
  "kahramanmaras__afsin": 200, /* g30 */
  "yalova__cinarcik": 1200, /* g30 */
  "istanbul__kadikoy": 6000, /* g60 */
  "istanbul__maltepe": 1500, /* g40 */
  "istanbul__atasehir": 3000, /* g40 */
  "istanbul__besiktas": 3000, /* g40 */
  "istanbul__sariyer": 4000, /* g60 */
  "istanbul__uskudar": 1500, /* g40 */
  "yalova__yalova merkez": 1200, /* g50 */
  "istanbul__kartal": 4000, /* g40 */
  "istanbul__sancaktepe": 1200, /* g40 */
  "istanbul__cekmekoy": 400, /* g30 */
  "istanbul__pendik": 1500, /* g40 */
  "istanbul__tuzla": 1200, /* g30 */
  "bursa__orhangazi": 400, /* g30 */
  "yalova__ciftlikkoy": 1200, /* g30 */
  "yalova__altinova": 1200, /* g30 */
};
