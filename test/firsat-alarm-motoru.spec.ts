import { describe, it, expect } from "vitest";
import {
  FirsatAlarmMotoru,
  type RadarKurali,
} from "../src/lib/bildirim/firsat-alarm-motoru";
import type { BulunanFirsatKart } from "../src/lib/ajanlar/kullanici-firsat-tarayici";

describe("Canlı Fırsat Radarı & Bildirim Motoru (FAZ 2)", () => {
  const alarmMotoru = new FirsatAlarmMotoru();

  const ornekFirsat: BulunanFirsatKart = {
    ilan: {
      ilanNo: "1192849102",
      baslik: "Urla Çamlıçay Denize Yakın İmarlı Arsa",
      fiyatTL: 5_000_000,
      m2: 1000,
      il: "izmir",
      ilce: "urla",
      kategori: "arsa",
      ilanUrl: "https://www.sahibinden.com/ilan/1192849102",
    },
    sentez: {
      firsat: {
        tahminiPiyasaDegeriTL: 7_500_000,
        iskontoOraniYuzde: 33.3,
        potansiyelKarTL: 2_500_000,
        firsatDerecesi: "yuksek-kelepir",
        gerekce: "Piyasa altı",
      },
      hukuk: {
        riskSkoru: 10,
        riskSeviyesi: "dusuk",
        tespitEdilenRiskler: [],
        ilgiliMevzuat: [],
        degerlendirmeOzeti: "Temiz",
      },
      nihaiTavsiye: "Güçlü Al",
      guvenSkoru: 90,
    },
    debate: {
      konsensusKarari: "guclu-al",
      efektifFirsatPuani: 92,
      uzlasmaOzeti: "Temiz ve yüksek kârlı fırsat.",
      turlar: [],
      aksiyonMaddeleri: [],
    },
    iskontoYuzde: 33.3,
    potansiyelKarTL: 2_500_000,
    efektifSkor: 92,
    firsatRozeti: "GÜÇLÜ FIRSAT",
  };

  it("Kullanıcı radar kuralıyla eşleştiğinde tetiklenir", () => {
    const kural: RadarKurali = {
      kuralId: "k-1",
      kullaniciId: "user-1",
      ad: "Urla 6M Altı Fırsat Arsa",
      il: "izmir",
      ilce: "urla",
      kategori: "arsa",
      maxFiyatTL: 6_000_000,
      minIskontoYuzde: 20,
      sadeceMüstakilTapu: true,
      aktif: true,
    };

    const eslesti = alarmMotoru.kuralEslesiyorMu(ornekFirsat, kural);
    expect(eslesti).toBe(true);
  });

  it("Telegram bildirim HTML formatını eksiksiz ve butonlu üretir", () => {
    const paket = alarmMotoru.telegramMesajiUret(ornekFirsat, "@yatirim_kanali");
    expect(paket.chatId).toBe("@yatirim_kanali");
    expect(paket.mesajHtml).toContain("YENİ FIRSAT YAKALANDI");
    expect(paket.mesajHtml).toContain("5.000.000 ₺");
    expect(paket.butonlar.length).toBe(1);
  });
});