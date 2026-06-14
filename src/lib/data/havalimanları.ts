/** DHMİ ticari havalimanları — statik koordinat dataset'i */
export const HAVALIMANLARITÜMÜ: ReadonlyArray<{
  ad: string;
  il: string;
  lat: number;
  lng: number;
}> = [
  // Marmara
  { ad: "İstanbul Havalimanı", il: "İstanbul", lat: 41.2753, lng: 28.7519 },
  { ad: "Sabiha Gökçen", il: "İstanbul", lat: 40.8986, lng: 29.3092 },
  { ad: "Çorlu", il: "Tekirdağ", lat: 41.1382, lng: 27.9191 },
  { ad: "Yenişehir", il: "Bursa", lat: 40.2552, lng: 29.5612 },
  { ad: "Koca Seyit", il: "Balıkesir", lat: 39.5546, lng: 27.0138 },
  { ad: "Çanakkale", il: "Çanakkale", lat: 40.1377, lng: 26.6768 },
  // İç Anadolu
  { ad: "Esenboğa", il: "Ankara", lat: 40.1281, lng: 32.9951 },
  { ad: "Konya", il: "Konya", lat: 37.9790, lng: 32.5619 },
  { ad: "Erkilet", il: "Kayseri", lat: 38.7705, lng: 35.4954 },
  { ad: "Hasan Polatkan", il: "Eskişehir", lat: 39.8094, lng: 30.5194 },
  { ad: "Zafer", il: "Kütahya", lat: 39.1138, lng: 30.1249 },
  { ad: "Afyon", il: "Afyonkarahisar", lat: 38.7263, lng: 30.6011 },
  { ad: "Kapadokya", il: "Nevşehir", lat: 38.7719, lng: 34.5345 },
  { ad: "Süleyman Demirel", il: "Isparta", lat: 37.8554, lng: 30.3684 },
  { ad: "Çardak", il: "Denizli", lat: 37.7856, lng: 29.7013 },
  // Ege
  { ad: "Adnan Menderes", il: "İzmir", lat: 38.2924, lng: 27.1570 },
  { ad: "Milas-Bodrum", il: "Muğla", lat: 37.2501, lng: 27.6640 },
  { ad: "Dalaman", il: "Muğla", lat: 36.7131, lng: 28.7925 },
  { ad: "Uşak", il: "Uşak", lat: 38.6815, lng: 29.4717 },
  // Akdeniz
  { ad: "Antalya", il: "Antalya", lat: 36.8987, lng: 30.8007 },
  { ad: "Gazipaşa-Alanya", il: "Antalya", lat: 36.2997, lng: 32.2996 },
  { ad: "Şakirpaşa", il: "Adana", lat: 36.9822, lng: 35.2804 },
  { ad: "Hatay", il: "Hatay", lat: 36.3628, lng: 36.2823 },
  // Karadeniz
  { ad: "Trabzon", il: "Trabzon", lat: 40.9951, lng: 39.7897 },
  { ad: "Rize-Artvin", il: "Rize", lat: 41.3820, lng: 40.6555 },
  { ad: "Giresun-Ordu", il: "Ordu", lat: 40.9662, lng: 38.0801 },
  { ad: "Çarşamba", il: "Samsun", lat: 41.2545, lng: 36.5672 },
  { ad: "Merzifon", il: "Amasya", lat: 40.8293, lng: 35.5219 },
  { ad: "Kastamonu", il: "Kastamonu", lat: 41.3142, lng: 33.7958 },
  { ad: "Zonguldak", il: "Zonguldak", lat: 41.5064, lng: 32.0886 },
  { ad: "Tokat", il: "Tokat", lat: 40.3074, lng: 36.3675 },
  // Güneydoğu Anadolu
  { ad: "Oğuzeli", il: "Gaziantep", lat: 36.9473, lng: 37.4787 },
  { ad: "GAP", il: "Şanlıurfa", lat: 37.4459, lng: 38.8959 },
  { ad: "Diyarbakır", il: "Diyarbakır", lat: 37.8940, lng: 40.2010 },
  { ad: "Mardin", il: "Mardin", lat: 37.2233, lng: 40.6317 },
  { ad: "Batman", il: "Batman", lat: 37.9290, lng: 41.1166 },
  { ad: "Siirt", il: "Siirt", lat: 37.9789, lng: 41.8404 },
  { ad: "Şerafettin Elçi", il: "Şırnak", lat: 37.3644, lng: 42.0582 },
  { ad: "Kahramanmaraş", il: "Kahramanmaraş", lat: 37.5388, lng: 36.9535 },
  { ad: "Adıyaman", il: "Adıyaman", lat: 37.7314, lng: 38.4688 },
  // Doğu Anadolu
  { ad: "Erzurum", il: "Erzurum", lat: 39.9565, lng: 41.1702 },
  { ad: "Erzincan", il: "Erzincan", lat: 39.7102, lng: 39.5270 },
  { ad: "Elazığ", il: "Elazığ", lat: 38.6069, lng: 39.2914 },
  { ad: "Malatya Battalgazi", il: "Malatya", lat: 38.4354, lng: 38.0910 },
  { ad: "Ferit Melen", il: "Van", lat: 38.4682, lng: 43.3323 },
  { ad: "Ağrı Ahmed-i Hani", il: "Ağrı", lat: 39.6547, lng: 43.0206 },
  { ad: "Iğdır Şehit Bülent Aydın", il: "Iğdır", lat: 39.9768, lng: 44.0053 },
  { ad: "Harakani", il: "Kars", lat: 40.5622, lng: 43.1150 },
  { ad: "Muş", il: "Muş", lat: 38.7478, lng: 41.6612 },
  { ad: "Bingöl", il: "Bingöl", lat: 38.8593, lng: 40.5960 },
  { ad: "Kolağası Ali Çelik", il: "Tunceli", lat: 39.1047, lng: 39.6523 },
  { ad: "Nuri Demirağ", il: "Sivas", lat: 39.7738, lng: 36.9035 },
  { ad: "Bayburt-Gümüşhane", il: "Bayburt", lat: 40.3667, lng: 39.9433 },
  { ad: "Yüzüncüyıl", il: "Çorum", lat: 40.2800, lng: 34.5288 },
  { ad: "Yozgat", il: "Yozgat", lat: 39.6044, lng: 34.8145 },
];
