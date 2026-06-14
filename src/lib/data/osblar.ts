/** Türkiye major OSB'leri — statik koordinat dataset'i.
 *  Kapsam: il merkezleri + büyük sanayi ilçeleri (ilk aşama ~120 nokta).
 *  Kaynak: OSBÜK, OSB koordinatları yaklaşık ±3 km hassasiyetle. */
export const OSBLAR: ReadonlyArray<{
  ad: string;
  il: string;
  lat: number;
  lng: number;
}> = [
  // İstanbul
  { ad: "İkitelli OSB", il: "İstanbul", lat: 41.0583, lng: 28.7975 },
  { ad: "Dudullu OSB", il: "İstanbul", lat: 41.0208, lng: 29.2131 },
  { ad: "Tuzla OSB", il: "İstanbul", lat: 40.8440, lng: 29.3606 },
  { ad: "Arnavutköy OSB", il: "İstanbul", lat: 41.1800, lng: 28.7200 },
  // Ankara
  { ad: "Ostim OSB", il: "Ankara", lat: 39.9389, lng: 32.7931 },
  { ad: "Sincan OSB", il: "Ankara", lat: 39.9746, lng: 32.5819 },
  { ad: "Ankara Abidinpaşa OSB", il: "Ankara", lat: 40.0340, lng: 32.7200 },
  // İzmir
  { ad: "Atatürk OSB", il: "İzmir", lat: 38.4592, lng: 27.0467 },
  { ad: "Kemalpaşa OSB", il: "İzmir", lat: 38.4260, lng: 27.4210 },
  { ad: "Çiğli OSB", il: "İzmir", lat: 38.4880, lng: 27.0730 },
  // Kocaeli / Bursa / Sakarya
  { ad: "Gebze OSB", il: "Kocaeli", lat: 40.7900, lng: 29.4310 },
  { ad: "Dilovası OSB", il: "Kocaeli", lat: 40.7730, lng: 29.5290 },
  { ad: "GOSB Teknopark OSB", il: "Kocaeli", lat: 40.7793, lng: 29.4741 },
  { ad: "Bursa OSB", il: "Bursa", lat: 40.2003, lng: 29.0097 },
  { ad: "Nilüfer OSB", il: "Bursa", lat: 40.2400, lng: 28.9800 },
  { ad: "Gemlik OSB", il: "Bursa", lat: 40.4370, lng: 29.1630 },
  { ad: "Adapazarı OSB", il: "Sakarya", lat: 40.7970, lng: 30.4200 },
  // Tekirdağ / Edirne / Kırklareli
  { ad: "Çorlu OSB", il: "Tekirdağ", lat: 41.1630, lng: 27.8070 },
  { ad: "Çerkezköy OSB", il: "Tekirdağ", lat: 41.2869, lng: 27.9994 },
  { ad: "Edirne OSB", il: "Edirne", lat: 41.6770, lng: 26.5560 },
  { ad: "Kırklareli OSB", il: "Kırklareli", lat: 41.7360, lng: 27.2250 },
  // Balıkesir / Çanakkale / Manisa
  { ad: "Balıkesir OSB", il: "Balıkesir", lat: 39.6170, lng: 27.8870 },
  { ad: "Bandırma OSB", il: "Balıkesir", lat: 40.3300, lng: 27.9750 },
  { ad: "Susurluk OSB", il: "Balıkesir", lat: 39.9050, lng: 28.1640 },
  { ad: "Edremit-Havran OSB", il: "Balıkesir", lat: 39.5570, lng: 27.0950 },
  { ad: "Çanakkale OSB", il: "Çanakkale", lat: 40.1550, lng: 26.4200 },
  { ad: "Manisa OSB", il: "Manisa", lat: 38.6190, lng: 27.5030 },
  { ad: "Akhisar OSB", il: "Manisa", lat: 38.9190, lng: 27.8330 },
  // Aydın / Muğla / Denizli / Uşak
  { ad: "Aydın OSB", il: "Aydın", lat: 37.8540, lng: 27.8390 },
  { ad: "Nazilli OSB", il: "Aydın", lat: 37.9130, lng: 28.3220 },
  { ad: "Denizli OSB", il: "Denizli", lat: 37.7730, lng: 29.1000 },
  { ad: "Uşak OSB", il: "Uşak", lat: 38.6850, lng: 29.3780 },
  { ad: "Muğla Milas OSB", il: "Muğla", lat: 37.3260, lng: 27.7970 },
  // Antalya / Isparta / Burdur
  { ad: "Antalya OSB", il: "Antalya", lat: 36.9750, lng: 30.6490 },
  { ad: "Alanya OSB", il: "Antalya", lat: 36.5300, lng: 31.9400 },
  { ad: "Isparta OSB", il: "Isparta", lat: 37.7470, lng: 30.5670 },
  { ad: "Burdur OSB", il: "Burdur", lat: 37.7420, lng: 30.2650 },
  // Adana / Mersin / Hatay / Osmaniye / Kahramanmaraş
  { ad: "Adana OSB", il: "Adana", lat: 36.9870, lng: 35.3350 },
  { ad: "Tarsus OSB", il: "Mersin", lat: 36.9170, lng: 34.9000 },
  { ad: "Mersin OSB", il: "Mersin", lat: 36.7580, lng: 34.5670 },
  { ad: "İskenderun OSB", il: "Hatay", lat: 36.6000, lng: 36.1640 },
  { ad: "Osmaniye OSB", il: "Osmaniye", lat: 37.0730, lng: 36.2470 },
  { ad: "Kahramanmaraş OSB", il: "Kahramanmaraş", lat: 37.5870, lng: 36.9780 },
  // Konya / Karaman / Niğde / Aksaray
  { ad: "Konya OSB", il: "Konya", lat: 37.8386, lng: 32.4228 },
  { ad: "Konya Seydişehir OSB", il: "Konya", lat: 37.4150, lng: 31.8480 },
  { ad: "Karaman OSB", il: "Karaman", lat: 37.1790, lng: 33.2180 },
  { ad: "Niğde OSB", il: "Niğde", lat: 37.9670, lng: 34.6790 },
  { ad: "Aksaray OSB", il: "Aksaray", lat: 38.3690, lng: 34.0280 },
  // Kayseri / Nevşehir / Kırşehir / Yozgat
  { ad: "Kayseri OSB", il: "Kayseri", lat: 38.6822, lng: 35.5261 },
  { ad: "Kayseri Hacılar OSB", il: "Kayseri", lat: 38.6400, lng: 35.4230 },
  { ad: "Nevşehir OSB", il: "Nevşehir", lat: 38.6250, lng: 34.7210 },
  { ad: "Kırşehir OSB", il: "Kırşehir", lat: 39.1450, lng: 34.1700 },
  { ad: "Yozgat OSB", il: "Yozgat", lat: 39.8200, lng: 34.8040 },
  // Ankara çevresi
  { ad: "Kırıkkale OSB", il: "Kırıkkale", lat: 39.8510, lng: 33.5090 },
  { ad: "Çankırı OSB", il: "Çankırı", lat: 40.6010, lng: 33.6180 },
  { ad: "Bilecik OSB", il: "Bilecik", lat: 40.1420, lng: 29.9790 },
  { ad: "Afyon OSB", il: "Afyonkarahisar", lat: 38.7730, lng: 30.5580 },
  { ad: "Eskişehir OSB", il: "Eskişehir", lat: 39.7920, lng: 30.5150 },
  { ad: "Kütahya OSB", il: "Kütahya", lat: 39.4270, lng: 29.9800 },
  // Bolu / Düzce / Zonguldak / Karabük / Bartın
  { ad: "Bolu OSB", il: "Bolu", lat: 40.7390, lng: 31.6050 },
  { ad: "Düzce OSB", il: "Düzce", lat: 40.8560, lng: 31.1650 },
  { ad: "Zonguldak Ereğli OSB", il: "Zonguldak", lat: 41.2760, lng: 31.4230 },
  { ad: "Karabük OSB", il: "Karabük", lat: 41.1940, lng: 32.6120 },
  { ad: "Bartın OSB", il: "Bartın", lat: 41.6280, lng: 32.3380 },
  // Kastamonu / Sinop / Çorum / Amasya / Tokat
  { ad: "Kastamonu OSB", il: "Kastamonu", lat: 41.3790, lng: 33.7760 },
  { ad: "Sinop OSB", il: "Sinop", lat: 42.0260, lng: 35.1510 },
  { ad: "Çorum OSB", il: "Çorum", lat: 40.5490, lng: 34.9560 },
  { ad: "Amasya OSB", il: "Amasya", lat: 40.6500, lng: 35.8310 },
  { ad: "Tokat OSB", il: "Tokat", lat: 40.3130, lng: 36.5500 },
  // Samsun / Ordu / Giresun / Trabzon / Rize / Artvin
  { ad: "Samsun OSB", il: "Samsun", lat: 41.2560, lng: 36.3190 },
  { ad: "Ordu OSB", il: "Ordu", lat: 40.9790, lng: 37.8810 },
  { ad: "Giresun OSB", il: "Giresun", lat: 40.9120, lng: 38.3870 },
  { ad: "Trabzon OSB", il: "Trabzon", lat: 40.9950, lng: 39.6370 },
  { ad: "Rize OSB", il: "Rize", lat: 41.0210, lng: 40.5210 },
  { ad: "Artvin Hopa OSB", il: "Artvin", lat: 41.4100, lng: 41.3960 },
  // Gaziantep / Şanlıurfa / Adıyaman / Kilis
  { ad: "Gaziantep OSB", il: "Gaziantep", lat: 37.0581, lng: 37.3947 },
  { ad: "Gaziantep OSB-2", il: "Gaziantep", lat: 37.0910, lng: 37.5260 },
  { ad: "Şanlıurfa OSB", il: "Şanlıurfa", lat: 37.1850, lng: 38.9510 },
  { ad: "Adıyaman OSB", il: "Adıyaman", lat: 37.7640, lng: 38.2790 },
  { ad: "Kilis OSB", il: "Kilis", lat: 36.7140, lng: 37.1130 },
  // Diyarbakır / Mardin / Batman / Siirt / Şırnak
  { ad: "Diyarbakır OSB", il: "Diyarbakır", lat: 37.8940, lng: 40.2490 },
  { ad: "Mardin OSB", il: "Mardin", lat: 37.3240, lng: 40.7290 },
  { ad: "Batman OSB", il: "Batman", lat: 37.8740, lng: 41.1060 },
  { ad: "Siirt OSB", il: "Siirt", lat: 37.9270, lng: 41.9470 },
  { ad: "Şırnak OSB", il: "Şırnak", lat: 37.5180, lng: 42.4610 },
  // Malatya / Elazığ / Tunceli / Bingöl / Erzincan
  { ad: "Malatya OSB", il: "Malatya", lat: 38.4070, lng: 38.2460 },
  { ad: "Elazığ OSB", il: "Elazığ", lat: 38.6730, lng: 39.2260 },
  { ad: "Tunceli OSB", il: "Tunceli", lat: 39.1080, lng: 39.5470 },
  { ad: "Bingöl OSB", il: "Bingöl", lat: 38.8860, lng: 40.4980 },
  { ad: "Erzincan OSB", il: "Erzincan", lat: 39.7520, lng: 39.4980 },
  // Erzurum / Ağrı / Iğdır / Kars / Ardahan
  { ad: "Erzurum OSB", il: "Erzurum", lat: 39.9060, lng: 41.2740 },
  { ad: "Ağrı OSB", il: "Ağrı", lat: 39.7220, lng: 43.0540 },
  { ad: "Iğdır OSB", il: "Iğdır", lat: 39.9210, lng: 44.0460 },
  { ad: "Kars OSB", il: "Kars", lat: 40.6090, lng: 43.0970 },
  { ad: "Ardahan OSB", il: "Ardahan", lat: 41.1100, lng: 42.7030 },
  // Van / Muş / Bitlis / Hakkari
  { ad: "Van OSB", il: "Van", lat: 38.4940, lng: 43.3800 },
  { ad: "Muş OSB", il: "Muş", lat: 38.7360, lng: 41.5030 },
  { ad: "Bitlis OSB", il: "Bitlis", lat: 38.4010, lng: 42.1090 },
  { ad: "Hakkari OSB", il: "Hakkari", lat: 37.5740, lng: 43.7400 },
  // Sivas / Bayburt / Gümüşhane
  { ad: "Sivas OSB", il: "Sivas", lat: 39.7490, lng: 37.0120 },
  { ad: "Gümüşhane OSB", il: "Gümüşhane", lat: 40.4600, lng: 39.4790 },
  { ad: "Bayburt OSB", il: "Bayburt", lat: 40.2580, lng: 40.2240 },
];
