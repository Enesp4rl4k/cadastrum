/**
 * Risk Uyarıları — TR gayrimenkul yatırımı için kritik kısıt/risk sinyalleri.
 *
 * Bir parsel hakkındaki KOMBİNE risk değerlendirmesi:
 * 1) Parsel niteliğinden (TKGM)
 * 2) e-Plan resmi imar verisi (varsa)
 * 3) İlan açıklaması metninden (Sahibinden/Hepsiemlak)
 *
 * Çıktı: kullanıcının yatırım kararından önce mutlaka görmesi gereken
 * uyarı listesi. "Kırmızı bayrak" = işleme girmeden önce hukukçu/SMM
 * danışmanlığı gerektiren durumlar.
 */

import type { Parsel } from "../types/tkgm";
import type { EPlanImarVerisi } from "./eplan";
import type { TucbsCdpSonuc } from "./tucbs";
import { tucbsCdpCeliskiVar } from "./tucbs";

export type RiskSeviye = "kritik" | "yuksek" | "orta" | "bilgi";

export interface RiskUyarisi {
  /** Risk kodu — programatik referans */
  kod: string;
  /** Kullanıcıya gösterilecek başlık */
  baslik: string;
  /** Detaylı açıklama */
  aciklama: string;
  /** Risk seviyesi — UI rengi belirler */
  seviye: RiskSeviye;
  /** Hangi kaynaktan tespit edildi */
  kaynak: "parsel-nitelik" | "eplan" | "ilan-aciklama" | "konum" | "tucbs-cdp";
  /** İlgili kanun/yönetmelik referansı (varsa) */
  yasaRef?: string;
  /** Kullanıcıya somut tavsiye */
  oneri?: string;
}

/**
 * Tüm risk detector'ları çalıştırıp birleşik liste döner.
 * Kritik > yüksek > orta > bilgi sırasıyla sıralı.
 */
export function riskleriTara(input: {
  parsel: Parsel;
  ePlan?: EPlanImarVerisi | null;
  tucbs?: TucbsCdpSonuc | null;
  ilanAciklama?: string | null;
  ilanImarDurumu?: string | null;
}): RiskUyarisi[] {
  const { parsel, ePlan, tucbs, ilanAciklama, ilanImarDurumu } = input;
  const tumMetin = [
    parsel.nitelik,
    ePlan?.kullanimKarari,
    ePlan?.planKarari,
    ePlan?.planNotu,
    ePlan?.hamMetin?.join(" "),
    tucbs?.araziKullanimi?.metin,
    tucbs?.araziKullanimi?.eskiMetin,
    ilanAciklama,
    ilanImarDurumu,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr");

  const uyarilar: RiskUyarisi[] = [];

  // ===== Zeytinlik (3573 sayılı kanun) =====
  if (/zeytin/i.test(parsel.nitelik) || /zeytin/.test(tumMetin)) {
    uyarilar.push({
      kod: "ZEYTINLIK_3573",
      baslik: "Zeytinlik niteliği — 3573 sayılı kanun kısıtı",
      aciklama:
        "Bu parsel zeytinlik nitelikli. 3573 sayılı Zeytinciliğin Islahı Kanunu kapsamında zeytinlik alanlarda yapılaşma ve nitelik değişikliği ciddi şekilde kısıtlıdır. Tarımsal kullanım dışı işlemler bakanlık iznine tabidir.",
      seviye: "yuksek",
      kaynak: /zeytin/i.test(parsel.nitelik) ? "parsel-nitelik" : "eplan",
      yasaRef: "3573 sayılı Zeytinciliğin Islahı Kanunu",
      oneri:
        "Yatırım planınız tarımsal kullanım değilse Tarım ve Orman Bakanlığı il müdürlüğünden zeytinlik vasfı sorgusu yapın.",
    });
  }

  // ===== Sit alanı / koruma =====
  if (/\bsit\b|sit alan|koruma alan|koruma kurulu|kentsel sit|arkeolojik sit|doğal sit|tabiat varlığı/.test(tumMetin)) {
    const seviye: RiskSeviye = /arkeolojik sit|kentsel sit i|1\. derece/.test(tumMetin) ? "kritik" : "yuksek";
    uyarilar.push({
      kod: "SIT_ALANI",
      baslik: "Sit alanı / koruma sinyali",
      aciklama:
        "Parsel veya çevresi sit/koruma kapsamında. Yapılaşma, restorasyon ve nitelik değişikliği Koruma Kurulu onayına bağlıdır. Süreçler aylar/yıllar alabilir.",
      seviye,
      kaynak: ePlan ? "eplan" : "ilan-aciklama",
      yasaRef: "2863 sayılı Kültür ve Tabiat Varlıklarını Koruma Kanunu",
      oneri:
        "İl Kültür Müdürlüğü veya ilgili Koruma Kurulu'ndan sit derecesini ve izin koşullarını yazılı olarak sorgulayın.",
    });
  }

  // ===== Askeri yasak bölge =====
  if (/asker[iî] yasak|asker[iî] güvenlik|2565 say[iı]l|asker[iî] alan/.test(tumMetin)) {
    uyarilar.push({
      kod: "ASKERI_YASAK",
      baslik: "Askeri yasak/güvenlik bölgesi",
      aciklama:
        "Parsel veya yakın çevre, 2565 sayılı kanun kapsamında askeri yasak veya güvenlik bölgesinde olabilir. Bu bölgelerde yabancılara satış kısıtlı, bazı yapı türleri yasaktır.",
      seviye: "kritik",
      kaynak: "eplan",
      yasaRef: "2565 sayılı Askeri Yasak Bölgeler ve Güvenlik Bölgeleri Kanunu",
      oneri:
        "Tapu Kadastro Müdürlüğünden ve ilçe komutanlığından parselin askeri statüsünü teyit edin.",
    });
  }

  // ===== Orman / 2B =====
  if (/orman vasf|orman s[ıi]n[ıi]r|orman alan|6831 say[ıi]l/.test(tumMetin) && !/orman dışı|2b/.test(tumMetin)) {
    uyarilar.push({
      kod: "ORMAN",
      baslik: "Orman alanı sinyali",
      aciklama:
        "Parsel orman vasfında veya orman sınırına bitişik. Orman vasıflı arazi kişilerin tasarrufunda olamaz; tahsis ve devir özel prosedüre bağlıdır.",
      seviye: "kritik",
      kaynak: "eplan",
      yasaRef: "6831 sayılı Orman Kanunu",
      oneri:
        "Orman İdaresi'nden 2B sorgusu ve ormancılık sınır tespiti talep edin. Tapudan 'orman' şerhi olup olmadığını kontrol edin.",
    });
  }
  if (/\b2b\b|2\/b|orman dışı/.test(tumMetin)) {
    uyarilar.push({
      kod: "IKINCI_B",
      baslik: "2B (Orman Vasfından Çıkarılmış) alan sinyali",
      aciklama:
        "Parsel 2B niteliğinde olabilir — yani orman vasfından çıkarılmış ama tapulama prosedürü farklı yürütülen alan. Tapu devri özel koşullara tabi.",
      seviye: "yuksek",
      kaynak: "eplan",
      yasaRef: "6292 sayılı 2B Kanunu",
      oneri: "Tapu kayıt durumunu (kesin/şartlı tapu) ve devir koşullarını avukatla doğrulayın.",
    });
  }

  // ===== Mera =====
  if (/\bmera\b|otlak|yaylak|k[ıi]şlak/.test(tumMetin) && !/mera dışı/.test(tumMetin)) {
    uyarilar.push({
      kod: "MERA",
      baslik: "Mera/otlak alanı",
      aciklama:
        "Parsel mera vasfında olabilir. Mera, yaylak ve kışlaklar 4342 sayılı kanun kapsamında devletin hüküm ve tasarrufundadır; özel mülkiyete konu olamaz, tahsis amacı dışı kullanımı yasaktır.",
      seviye: "kritik",
      kaynak: "eplan",
      yasaRef: "4342 sayılı Mera Kanunu",
      oneri:
        "Mera tahsis kararı varsa tahsis amacı dışı kullanım için Tarım Bakanlığı izni gerekir; yatırım öncesi sorgulayın.",
    });
  }

  // ===== Kıyı kenar çizgisi =====
  if (/k[ıi]y[ıi] kenar|sahil ş[ei]rid[ıi]|k[ıi]y[ıi] kanun|3621 say[ıi]l/.test(tumMetin)) {
    uyarilar.push({
      kod: "KIYI_KENAR",
      baslik: "Kıyı kenar çizgisi yakını",
      aciklama:
        "Parsel kıyı kenar çizgisi içinde veya yakınında. 3621 sayılı Kıyı Kanunu kapsamında kıyıda yapılaşma yasak; sahil şeridinde sınırlı.",
      seviye: "yuksek",
      kaynak: "eplan",
      yasaRef: "3621 sayılı Kıyı Kanunu",
      oneri:
        "Çevre, Şehircilik ve İklim Değişikliği Bakanlığı'ndan kıyı kenar çizgisi tespit krokisi talep edin.",
    });
  }

  // ===== Sulak alan =====
  if (/sulak alan|göl koruma|nehir koruma|baraj koruma havzas[ıi]/.test(tumMetin)) {
    uyarilar.push({
      kod: "SULAK_ALAN",
      baslik: "Sulak alan / havza koruma",
      aciklama:
        "Parsel sulak alan veya havza koruma kapsamında olabilir. Yapılaşma ve tarımsal kullanım sınırları sıkıdır.",
      seviye: "yuksek",
      kaynak: "eplan",
      yasaRef: "Sulak Alanların Korunması Yönetmeliği",
      oneri: "DSİ ve Doğa Koruma Genel Müdürlüğü'nden havza statüsünü teyit edin.",
    });
  }

  // ===== Rezerv yapı alanı =====
  if (/rezerv yap[ıi]|rezerv alan|6306 say[ıi]l|kentsel dönüşüm/.test(tumMetin)) {
    uyarilar.push({
      kod: "REZERV_ALAN",
      baslik: "Rezerv yapı alanı / dönüşüm",
      aciklama:
        "Parsel 6306 sayılı kanun kapsamında rezerv yapı alanı veya kentsel dönüşüm alanı olabilir. Bu durum hem fırsat (yeniden değerleme) hem risk (uzlaşma süreci) yaratır.",
      seviye: "orta",
      kaynak: "eplan",
      yasaRef: "6306 sayılı Afet Riski Altındaki Alanların Dönüştürülmesi Hakkında Kanun",
      oneri: "Belediyeden dönüşüm planı, hak sahipliği ve takvim bilgisi talep edin.",
    });
  }

  // ===== Heyelan / fay / afet riski =====
  if (/heyelan|kaya düşmes[ıi]|fay hatt[ıi]|deprem|afete uğram[ıi]ş/.test(tumMetin)) {
    uyarilar.push({
      kod: "AFET_RISKI",
      baslik: "Afet riski sinyali",
      aciklama:
        "İlgili metinde heyelan, kaya düşmesi, fay hattı veya afet kaydı geçiyor. Statik etüt ve zemin raporu kritik.",
      seviye: "yuksek",
      kaynak: "ilan-aciklama",
      yasaRef: "AFAD Afet Yönetmeliği",
      oneri:
        "AFAD Türkiye Deprem Tehlike Haritası ve heyelan duyarlılık verilerini kontrol edin; mutlaka zemin etüdü yaptırın.",
    });
  }

  // ===== Maden / petrol ruhsat sahası =====
  if (/maden ruhsat|petrol ruhsat|jeotermal ruhsat|3213 say[ıi]l|6491 say[ıi]l/.test(tumMetin)) {
    uyarilar.push({
      kod: "MADEN_RUHSAT",
      baslik: "Maden / petrol ruhsat sahası",
      aciklama:
        "Parsel veya çevresinde maden, petrol veya jeotermal ruhsatı olabilir. Yer altı kullanım hakları yatırım planınızı etkileyebilir.",
      seviye: "orta",
      kaynak: "eplan",
      yasaRef: "3213 sayılı Maden Kanunu / 6491 sayılı Petrol Kanunu",
      oneri: "MAPEG (Maden ve Petrol İşleri Genel Müdürlüğü) ruhsat sorgusu yapın.",
    });
  }

  // ===== TAKS / KAKS yokluğu (e-Plan tamamlanmamış) =====
  if (ePlan && (ePlan.taks == null && ePlan.emsal == null && ePlan.maksKat == null)) {
    uyarilar.push({
      kod: "YAPILANMA_BOS",
      baslik: "Yapılaşma koşulları belirsiz",
      aciklama:
        "e-Plan kaydında TAKS, Emsal/KAKS ve maksimum kat değerleri net çıkmadı. Yatırım yapılaşma temellisiyse belediye imar müdürlüğünden yazılı imar durumu belgesi alın.",
      seviye: "bilgi",
      kaynak: "eplan",
      oneri: "İlgili belediye Yapı Kontrol/İmar Müdürlüğünden 'imar durum belgesi' isteyin.",
    });
  }

  // ===== TUCBS ÇDP — resmi üst plan =====
  if (tucbs?.sitAlani) {
    uyarilar.push({
      kod: "TUCBS_SIT",
      baslik: "TUCBS: Sit / koruma alanı",
      aciklama:
        "Çevre Düzeni Planı (1/100.000) bu koordinatı sit veya koruma alanı olarak işaretliyor. Yapılaşma Koruma Kurulu onayına tabi olabilir.",
      seviye: "yuksek",
      kaynak: "tucbs-cdp",
      yasaRef: "2863 sayılı Kültür ve Tabiat Varlıklarını Koruma Kanunu",
      oneri: "İl Kültür Müdürlüğünden sit derecesini yazılı olarak doğrulayın.",
    });
  }

  if (tucbs?.endustriBolgesi || tucbs?.araziKullanimi?.kategori === "sanayi") {
    uyarilar.push({
      kod: "TUCBS_SANAYI",
      baslik: "TUCBS: Sanayi / endüstri planı",
      aciklama:
        "Üst planda sanayi, depolama veya organize sanayi bölgesi kararı var. Konut yatırımı için uygun olmayabilir.",
      seviye: "orta",
      kaynak: "tucbs-cdp",
      oneri: "Plan kararını belediye imar müdürlüğü ile teyit edin.",
    });
  }

  if (tucbs?.araziKullanimi?.kategori === "tarim-koruma") {
    const konutIddiasi = /imarlı|imarli|konut|arsa|villa/.test(
      (ilanImarDurumu ?? "").toLocaleLowerCase("tr"),
    );
    uyarilar.push({
      kod: "TUCBS_TARIM",
      baslik: "TUCBS: Tarım / koruma alanı",
      aciklama: `Çevre Düzeni Planı: "${tucbs.araziKullanimi.metin}". Üst planda imar potansiyeli sınırlı görünüyor.${
        konutIddiasi ? " İlandaki imarlı iddiası planla çelişiyor olabilir." : ""
      }`,
      seviye: konutIddiasi ? "yuksek" : "bilgi",
      kaynak: "tucbs-cdp",
      oneri:
        "İmar değişikliği beklentisiyle alım yapmayın; üst plan tarımsal/koruma ise süreç uzun ve belirsizdir.",
    });
  }

  if (tucbsCdpCeliskiVar(tucbs, ilanImarDurumu)) {
    uyarilar.push({
      kod: "TUCBS_CELISKI",
      baslik: "İlan imarı ile üst plan çelişkisi",
      aciklama:
        "İlanda geçen imar ifadesi, TUCBS Çevre Düzeni Planı kararıyla uyuşmuyor. Satıcı iddiasını bağımsız doğrulayın.",
      seviye: "yuksek",
      kaynak: "tucbs-cdp",
      oneri: "Belediyeden güncel imar durumu belgesi ve ÇDP paftası isteyin.",
    });
  }

  // Seviyeye göre sırala (kritik öncelik)
  const seviyeAgirlik: Record<RiskSeviye, number> = {
    kritik: 0,
    yuksek: 1,
    orta: 2,
    bilgi: 3,
  };
  uyarilar.sort((a, b) => seviyeAgirlik[a.seviye] - seviyeAgirlik[b.seviye]);

  return uyarilar;
}

/** Risk seviyesi için Tailwind class'ı */
export function riskRengi(seviye: RiskSeviye): {
  bg: string;
  border: string;
  text: string;
  iconBg: string;
} {
  switch (seviye) {
    case "kritik":
      return { bg: "bg-red-50", border: "border-red-300", text: "text-red-900", iconBg: "bg-red-600" };
    case "yuksek":
      return {
        bg: "bg-amber-50",
        border: "border-amber-300",
        text: "text-amber-900",
        iconBg: "bg-amber-600",
      };
    case "orta":
      return { bg: "bg-sky-50", border: "border-sky-300", text: "text-sky-900", iconBg: "bg-sky-600" };
    case "bilgi":
    default:
      return {
        bg: "bg-slate-50",
        border: "border-slate-300",
        text: "text-slate-700",
        iconBg: "bg-slate-500",
      };
  }
}

/** Genel risk skoru — UI'da özet rozet için */
export function riskOzetSkoru(uyarilar: RiskUyarisi[]): {
  toplam: number;
  kritikSayi: number;
  yuksekSayi: number;
  ortaSayi: number;
  bilgiSayi: number;
  /** "Temiz" / "Dikkat" / "Yüksek Risk" / "KRİTİK" */
  etiket: string;
  /** UI rengi */
  renk: "emerald" | "amber" | "orange" | "red";
} {
  const kritik = uyarilar.filter((u) => u.seviye === "kritik").length;
  const yuksek = uyarilar.filter((u) => u.seviye === "yuksek").length;
  const orta = uyarilar.filter((u) => u.seviye === "orta").length;
  const bilgi = uyarilar.filter((u) => u.seviye === "bilgi").length;

  let etiket = "Temiz";
  let renk: "emerald" | "amber" | "orange" | "red" = "emerald";

  if (kritik > 0) {
    etiket = "KRİTİK";
    renk = "red";
  } else if (yuksek >= 2) {
    etiket = "Yüksek risk";
    renk = "orange";
  } else if (yuksek === 1) {
    etiket = "Dikkat";
    renk = "amber";
  } else if (orta > 0) {
    etiket = "Orta";
    renk = "amber";
  }

  return {
    toplam: uyarilar.length,
    kritikSayi: kritik,
    yuksekSayi: yuksek,
    ortaSayi: orta,
    bilgiSayi: bilgi,
    etiket,
    renk,
  };
}
