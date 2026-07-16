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
  // ── Faz 2 — İlçe bazlı ek OSB'ler (OSBÜK tam liste) ──────────────────
  // İstanbul ilçe OSB'leri
  { ad: "Hadımköy OSB", il: "İstanbul", lat: 41.0940, lng: 28.6520 },
  { ad: "Silivri OSB", il: "İstanbul", lat: 41.0730, lng: 28.2470 },
  { ad: "Pendik OSB", il: "İstanbul", lat: 40.8680, lng: 29.2570 },
  { ad: "Avcılar OSB", il: "İstanbul", lat: 40.9870, lng: 28.7210 },
  // Ankara ilçe OSB'leri
  { ad: "Polatlı OSB", il: "Ankara", lat: 39.5890, lng: 32.1460 },
  { ad: "Haymana OSB", il: "Ankara", lat: 39.4330, lng: 32.4970 },
  { ad: "Kazan OSB", il: "Ankara", lat: 40.0920, lng: 32.6860 },
  { ad: "Temelli OSB", il: "Ankara", lat: 39.9380, lng: 32.4720 },
  // İzmir ilçe OSB'leri
  { ad: "Torbalı OSB", il: "İzmir", lat: 38.1570, lng: 27.3620 },
  { ad: "Aliağa OSB", il: "İzmir", lat: 38.7990, lng: 26.9730 },
  { ad: "Bergama OSB", il: "İzmir", lat: 39.1210, lng: 27.1820 },
  { ad: "Ödemiş OSB", il: "İzmir", lat: 38.2310, lng: 27.9690 },
  // Bursa ilçe OSB'leri
  { ad: "İnegöl OSB", il: "Bursa", lat: 40.0740, lng: 29.5070 },
  { ad: "Mustafakemalpaşa OSB", il: "Bursa", lat: 40.0390, lng: 28.4050 },
  { ad: "Karacabey OSB", il: "Bursa", lat: 40.2150, lng: 28.3590 },
  { ad: "Orhangazi OSB", il: "Bursa", lat: 40.4820, lng: 29.3060 },
  // Kocaeli ilçe OSB'leri
  { ad: "İzmit OSB", il: "Kocaeli", lat: 40.7640, lng: 29.9190 },
  { ad: "Körfez OSB", il: "Kocaeli", lat: 40.7890, lng: 29.8970 },
  { ad: "Hendek OSB", il: "Sakarya", lat: 40.7870, lng: 30.7340 },
  { ad: "Kaynarca OSB", il: "Sakarya", lat: 40.7420, lng: 30.8110 },
  // Manisa ilçe OSB'leri
  { ad: "Turgutlu OSB", il: "Manisa", lat: 38.4970, lng: 27.6980 },
  { ad: "Salihli OSB", il: "Manisa", lat: 38.4810, lng: 28.1390 },
  { ad: "Soma OSB", il: "Manisa", lat: 39.1850, lng: 27.6050 },
  { ad: "Kırkağaç OSB", il: "Manisa", lat: 39.0960, lng: 27.6680 },
  // Balıkesir ilçe OSB'leri
  { ad: "Gönen OSB", il: "Balıkesir", lat: 40.0990, lng: 27.6500 },
  { ad: "Bigadiç OSB", il: "Balıkesir", lat: 39.3920, lng: 28.1240 },
  { ad: "Sındırgı OSB", il: "Balıkesir", lat: 39.2410, lng: 28.1720 },
  // Denizli ilçe OSB'leri
  { ad: "Buldan OSB", il: "Denizli", lat: 38.0480, lng: 28.8300 },
  { ad: "Sarayköy OSB", il: "Denizli", lat: 37.9220, lng: 28.9230 },
  { ad: "Çivril OSB", il: "Denizli", lat: 38.2990, lng: 29.7440 },
  // Aydın ilçe OSB'leri
  { ad: "Söke OSB", il: "Aydın", lat: 37.7500, lng: 27.4100 },
  { ad: "Kuşadası OSB", il: "Aydın", lat: 37.8580, lng: 27.2590 },
  { ad: "Didim OSB", il: "Aydın", lat: 37.3820, lng: 27.2660 },
  // Muğla ilçe OSB'leri
  { ad: "Bodrum OSB", il: "Muğla", lat: 37.0540, lng: 27.4220 },
  { ad: "Fethiye OSB", il: "Muğla", lat: 36.6560, lng: 29.1260 },
  { ad: "Ortaca OSB", il: "Muğla", lat: 36.8360, lng: 28.7690 },
  // Antalya ilçe OSB'leri
  { ad: "Manavgat OSB", il: "Antalya", lat: 36.7810, lng: 31.4430 },
  { ad: "Serik OSB", il: "Antalya", lat: 36.9150, lng: 31.0920 },
  { ad: "Döşemealtı OSB", il: "Antalya", lat: 37.0340, lng: 30.5580 },
  { ad: "Elmalı OSB", il: "Antalya", lat: 36.7300, lng: 29.9130 },
  // Adana ilçe OSB'leri
  { ad: "Ceyhan OSB", il: "Adana", lat: 37.0300, lng: 35.8200 },
  { ad: "Kozan OSB", il: "Adana", lat: 37.4510, lng: 35.8040 },
  { ad: "Karataş OSB", il: "Adana", lat: 36.5640, lng: 35.3990 },
  // Mersin ilçe OSB'leri
  { ad: "Erdemli OSB", il: "Mersin", lat: 36.6090, lng: 34.3050 },
  { ad: "Silifke OSB", il: "Mersin", lat: 36.3760, lng: 33.9290 },
  { ad: "Mut OSB", il: "Mersin", lat: 36.6490, lng: 33.4370 },
  // Hatay ilçe OSB'leri
  { ad: "Antakya OSB", il: "Hatay", lat: 36.2010, lng: 36.1600 },
  { ad: "Dörtyol OSB", il: "Hatay", lat: 36.8470, lng: 36.2190 },
  { ad: "Kırıkhan OSB", il: "Hatay", lat: 36.4950, lng: 36.3620 },
  // Konya ilçe OSB'leri
  { ad: "Ereğli OSB", il: "Konya", lat: 37.5130, lng: 34.0460 },
  { ad: "Karapınar OSB", il: "Konya", lat: 37.7170, lng: 33.5540 },
  { ad: "Akşehir OSB", il: "Konya", lat: 38.3600, lng: 31.4150 },
  { ad: "Ilgın OSB", il: "Konya", lat: 38.2830, lng: 31.9230 },
  { ad: "Kulu OSB", il: "Konya", lat: 38.9260, lng: 33.0760 },
  // Kayseri ilçe OSB'leri
  { ad: "Develi OSB", il: "Kayseri", lat: 38.3860, lng: 35.4870 },
  { ad: "Pınarbaşı OSB", il: "Kayseri", lat: 38.7230, lng: 36.3940 },
  // Samsun ilçe OSB'leri
  { ad: "Bafra OSB", il: "Samsun", lat: 41.5680, lng: 35.9130 },
  { ad: "Terme OSB", il: "Samsun", lat: 41.1980, lng: 36.9680 },
  { ad: "Alaçam OSB", il: "Samsun", lat: 41.5870, lng: 35.5940 },
  // Trabzon ilçe OSB'leri
  { ad: "Akçaabat OSB", il: "Trabzon", lat: 40.9980, lng: 39.5560 },
  { ad: "Araklı OSB", il: "Trabzon", lat: 40.9430, lng: 40.0680 },
  { ad: "Of OSB", il: "Trabzon", lat: 40.9590, lng: 40.2650 },
  // Ordu ilçe OSB'leri
  { ad: "Ünye OSB", il: "Ordu", lat: 41.1280, lng: 37.2920 },
  { ad: "Fatsa OSB", il: "Ordu", lat: 41.0310, lng: 37.4970 },
  // Giresun ilçe OSB'leri
  { ad: "Espiye OSB", il: "Giresun", lat: 40.9500, lng: 38.7190 },
  { ad: "Bulancak OSB", il: "Giresun", lat: 40.9380, lng: 38.2280 },
  // Tekirdağ ilçe OSB'leri
  { ad: "Malkara OSB", il: "Tekirdağ", lat: 41.0070, lng: 26.9000 },
  { ad: "Muratlı OSB", il: "Tekirdağ", lat: 41.1720, lng: 27.4990 },
  { ad: "Hayrabolu OSB", il: "Tekirdağ", lat: 41.2170, lng: 27.1010 },
  // Edirne ilçe OSB'leri
  { ad: "Lüleburgaz OSB", il: "Kırklareli", lat: 41.4060, lng: 27.3530 },
  { ad: "Babaeski OSB", il: "Kırklareli", lat: 41.4350, lng: 27.0890 },
  { ad: "Keşan OSB", il: "Edirne", lat: 40.8600, lng: 26.6310 },
  { ad: "Uzunköprü OSB", il: "Edirne", lat: 41.2650, lng: 26.6870 },
  // Çanakkale ilçe OSB'leri
  { ad: "Biga OSB", il: "Çanakkale", lat: 40.2260, lng: 27.2530 },
  { ad: "Gelibolu OSB", il: "Çanakkale", lat: 40.4000, lng: 26.6770 },
  { ad: "Ezine OSB", il: "Çanakkale", lat: 39.7880, lng: 26.3350 },
  // Afyonkarahisar ilçe OSB'leri
  { ad: "Dinar OSB", il: "Afyonkarahisar", lat: 38.0720, lng: 30.1670 },
  { ad: "Bolvadin OSB", il: "Afyonkarahisar", lat: 38.7100, lng: 31.0480 },
  { ad: "Sandıklı OSB", il: "Afyonkarahisar", lat: 38.4640, lng: 30.2680 },
  // Eskişehir ilçe OSB'leri
  { ad: "Sivrihisar OSB", il: "Eskişehir", lat: 39.4550, lng: 31.5360 },
  { ad: "Mihalgazi OSB", il: "Eskişehir", lat: 40.0210, lng: 30.2650 },
  // Kütahya ilçe OSB'leri
  { ad: "Gediz OSB", il: "Kütahya", lat: 38.9960, lng: 29.4020 },
  { ad: "Simav OSB", il: "Kütahya", lat: 39.0870, lng: 28.9790 },
  { ad: "Tavşanlı OSB", il: "Kütahya", lat: 39.5440, lng: 29.5000 },
  // Gaziantep ilçe OSB'leri
  { ad: "İslahiye OSB", il: "Gaziantep", lat: 37.0180, lng: 36.6380 },
  { ad: "Nizip OSB", il: "Gaziantep", lat: 37.0060, lng: 37.7930 },
  { ad: "Nurdağı OSB", il: "Gaziantep", lat: 37.1710, lng: 36.7310 },
  // Kahramanmaraş ilçe OSB'leri
  { ad: "Elbistan OSB", il: "Kahramanmaraş", lat: 38.2070, lng: 37.1960 },
  { ad: "Göksun OSB", il: "Kahramanmaraş", lat: 37.9870, lng: 36.4880 },
  // Şanlıurfa ilçe OSB'leri
  { ad: "Birecik OSB", il: "Şanlıurfa", lat: 37.0250, lng: 37.9830 },
  { ad: "Viranşehir OSB", il: "Şanlıurfa", lat: 37.2380, lng: 39.7700 },
  { ad: "Siverek OSB", il: "Şanlıurfa", lat: 37.7560, lng: 39.3180 },
  // Diyarbakır ilçe OSB'leri
  { ad: "Ergani OSB", il: "Diyarbakır", lat: 38.2700, lng: 39.7700 },
  { ad: "Bismil OSB", il: "Diyarbakır", lat: 37.8540, lng: 40.6560 },
  // Gaziantep / Adıyaman ek
  { ad: "Besni OSB", il: "Adıyaman", lat: 37.6920, lng: 37.8630 },
  { ad: "Kahta OSB", il: "Adıyaman", lat: 37.7790, lng: 38.6190 },
  // Sivas ilçe OSB'leri
  { ad: "Şarkışla OSB", il: "Sivas", lat: 39.3460, lng: 36.4180 },
  { ad: "Zara OSB", il: "Sivas", lat: 39.8890, lng: 37.7460 },
  { ad: "Gemerek OSB", il: "Sivas", lat: 39.1850, lng: 36.0720 },
  // Tokat ilçe OSB'leri
  { ad: "Turhal OSB", il: "Tokat", lat: 40.3880, lng: 36.0860 },
  { ad: "Niksar OSB", il: "Tokat", lat: 40.5580, lng: 36.9710 },
  { ad: "Erbaa OSB", il: "Tokat", lat: 40.6750, lng: 36.5760 },
  // Çorum ilçe OSB'leri
  { ad: "Osmancık OSB", il: "Çorum", lat: 40.9770, lng: 34.8090 },
  { ad: "İskilip OSB", il: "Çorum", lat: 40.7560, lng: 34.4690 },
  { ad: "Alaca OSB", il: "Çorum", lat: 40.1670, lng: 34.8480 },
  // Kastamonu ilçe OSB'leri
  { ad: "Tosya OSB", il: "Kastamonu", lat: 41.0200, lng: 34.0390 },
  { ad: "Taşköprü OSB", il: "Kastamonu", lat: 41.5080, lng: 34.2070 },
  // Bolu ilçe OSB'leri
  { ad: "Gerede OSB", il: "Bolu", lat: 40.8920, lng: 32.1930 },
  { ad: "Mudurnu OSB", il: "Bolu", lat: 40.4600, lng: 31.2060 },
  // Düzce ilçe OSB'leri
  { ad: "Akçakoca OSB", il: "Düzce", lat: 41.0830, lng: 31.1070 },
  { ad: "Gölyaka OSB", il: "Düzce", lat: 40.7640, lng: 31.3230 },
  // Malatya ilçe OSB'leri
  { ad: "Yeşilyurt OSB", il: "Malatya", lat: 38.2890, lng: 38.1920 },
  { ad: "Doğanşehir OSB", il: "Malatya", lat: 37.8850, lng: 37.8780 },
  // Elazığ ilçe OSB'leri
  { ad: "Kovancılar OSB", il: "Elazığ", lat: 38.7200, lng: 39.8200 },
  { ad: "Karakoçan OSB", il: "Elazığ", lat: 38.9520, lng: 40.0400 },
  // Erzurum ilçe OSB'leri
  { ad: "Horasan OSB", il: "Erzurum", lat: 40.0430, lng: 42.1710 },
  { ad: "Pasinler OSB", il: "Erzurum", lat: 39.9740, lng: 41.6700 },
  // Aksaray ilçe OSB'leri
  { ad: "Ortaköy OSB", il: "Aksaray", lat: 38.7400, lng: 34.0460 },
  { ad: "Güzelyurt OSB", il: "Aksaray", lat: 38.2600, lng: 33.7060 },
  // Niğde ilçe OSB'leri
  { ad: "Bor OSB", il: "Niğde", lat: 37.8870, lng: 34.5710 },
  { ad: "Ulukışla OSB", il: "Niğde", lat: 37.5510, lng: 34.4800 },
  // Nevşehir ilçe OSB'leri
  { ad: "Avanos OSB", il: "Nevşehir", lat: 38.7120, lng: 34.8450 },
  { ad: "Ürgüp OSB", il: "Nevşehir", lat: 38.6380, lng: 34.9130 },
  // Isparta ilçe OSB'leri
  { ad: "Yalvaç OSB", il: "Isparta", lat: 38.2950, lng: 31.1730 },
  { ad: "Eğirdir OSB", il: "Isparta", lat: 37.8790, lng: 30.8510 },
  // Burdur ilçe OSB'leri
  { ad: "Bucak OSB", il: "Burdur", lat: 37.4610, lng: 30.5950 },
  { ad: "Gölhisar OSB", il: "Burdur", lat: 37.1570, lng: 29.5060 },
  // Van ilçe OSB'leri
  { ad: "Erciş OSB", il: "Van", lat: 39.0260, lng: 43.3480 },
  { ad: "Özalp OSB", il: "Van", lat: 38.6570, lng: 43.9840 },
  // Mardin ilçe OSB'leri
  { ad: "Kızıltepe OSB", il: "Mardin", lat: 37.1930, lng: 40.5840 },
  { ad: "Midyat OSB", il: "Mardin", lat: 37.4190, lng: 41.3430 },
  { ad: "Nusaybin OSB", il: "Mardin", lat: 37.0770, lng: 41.2180 },
  // Kırıkkale ilçe OSB'leri
  { ad: "Delice OSB", il: "Kırıkkale", lat: 39.9530, lng: 33.9110 },
  { ad: "Keskin OSB", il: "Kırıkkale", lat: 39.6700, lng: 33.6070 },
  // Kırşehir ilçe OSB'leri
  { ad: "Kaman OSB", il: "Kırşehir", lat: 39.3570, lng: 33.7160 },
  { ad: "Mucur OSB", il: "Kırşehir", lat: 39.0680, lng: 34.3780 },
  // Yozgat ilçe OSB'leri
  { ad: "Sorgun OSB", il: "Yozgat", lat: 39.8110, lng: 35.1850 },
  { ad: "Boğazlıyan OSB", il: "Yozgat", lat: 39.1930, lng: 35.2490 },
];
