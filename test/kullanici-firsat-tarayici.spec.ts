import { describe, it, expect } from "vitest";
import {
  KullaniciFirsatTarayici,
  type KullaniciAramaKriteri,
  type TarananIlanGirdisi,
} from "../src/lib/ajanlar/kullanici-firsat-tarayici";

describe("Kullanıcı Tanımlı Otonom Fırsat Tarayıcı (Deal Scanner)", () => {
  const scanner = new KullaniciFirsatTarayici();

  it("Kullanıcı kriterine göre kelepir ilanları süzer ve kâr marjını hesaplar", async () => {
    const kriter: KullaniciAramaKriteri = {
      il: "ankara",
      ilce: "golbasi",
      kategori: "arsa",
      maxFiyatTL: 8_000_000,
      minIskontoYuzde: 20,
      sadeceTemizTapu: true,
    };

    const ilanlar: TarananIlanGirdisi[] = [
      {
        ilanNo: "101",
        baslik: "Gölbaşı İncek Konut İmarlı Kelepir Arsa",
        fiyatTL: 5_000_000,
        m2: 1200,
        il: "ankara",
        ilce: "golbasi",
        mahalle: "incek",
        kategori: "arsa",
        lat: 39.82,
        lng: 32.75,
        imarDurumu: "konut-imarli",
        aciklama: "Müstakil tek tapu, acil satılık.",
      },
      {
        ilanNo: "102",
        baslik: "Gölbaşı Hisseli Sorunlu Tarla",
        fiyatTL: 2_000_000,
        m2: 2000,
        il: "ankara",
        ilce: "golbasi",
        kategori: "tarla",
        aciklama: "Hisseli tapu mahkemelik.",
      },
    ];

    const sonuclar = await scanner.ilanlariTara(kriter, ilanlar);

    // İlan 102 hisseli olduğu için elenmeli, ilan 101 fırsat olarak yakalanmalı
    expect(sonuclar.length).toBe(1);
    expect(sonuclar[0]!.ilan.ilanNo).toBe("101");
    expect(sonuclar[0]!.iskontoYuzde).toBeGreaterThan(20);
    expect(sonuclar[0]!.potansiyelKarTL).toBeGreaterThan(1_000_000);
    expect(sonuclar[0]!.firsatRozeti).toBeDefined();
  });
});