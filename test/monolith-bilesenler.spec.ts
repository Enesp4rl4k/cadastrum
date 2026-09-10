import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { CevreDetayKarti } from "../src/sidepanel/components/CevreDetayKarti";
import { IlanYerDuzeltme } from "../src/sidepanel/components/IlanYerDuzeltme";
import type { CevreAnalizi } from "../src/lib/osm";
import type { IlanBilgisi } from "../src/types/ilan";

describe("Monolith Bileşen Bölme: CevreDetayKarti & IlanYerDuzeltme", () => {
  const mockCevre: CevreAnalizi = {
    poi: {
      market: 2,
      okul: 1,
      cami: 1,
      eczane: 0,
      hastane: 0,
      duraklar: 3,
      marketMinM: 400,
      okulMinM: 600,
      camiMinM: 300,
      eczaneMinM: null,
      hastaneMinM: null,
      durakMinM: 250,
    },
    enYakinlar: [
      { ad: "Kuzey Marmara Otoyolu", tip: "motorway", mesafeM: 1200, ikon: "🛣" },
      { ad: "D100 Karayolu", tip: "trunk", mesafeM: 2500, ikon: "🛣" },
    ],
    altyapi: {
      elektrikHattiM: 350,
      suBoruM: 500,
      demiryoluM: null,
      dogalgazM: null,
    },
    kirsal: {
      yolaCepheM: 10,
      suKaynagiM: 800,
      koyMerkeziM: 1500,
    },
  };

  it("CevreDetayKarti: yol analizi ve altyapı mesafelerini render eder", () => {
    const html = renderToString(React.createElement(CevreDetayKarti, { cevre: mockCevre, nitelik: "arsa" }));
    expect(html).toContain("Kuzey Marmara Otoyolu");
    expect(html).toContain("1.2 km");
    expect(html).toContain("D100 Karayolu");
    expect(html).toContain("2.5 km");
    expect(html).toContain("350 m"); // Elektrik
    expect(html).toContain("500 m"); // Su
    expect(html).not.toContain("Kırsal Analiz"); // Arsa için kırsal analiz render edilmez
  });

  it("CevreDetayKarti: tarla niteliğinde kırsal analiz bölümünü render eder", () => {
    const html = renderToString(React.createElement(CevreDetayKarti, { cevre: mockCevre, nitelik: "Zeytinlik" }));
    expect(html).toContain("Kırsal Analiz");
    expect(html).toContain("Yola cephe");
    expect(html).toContain("800 m");
    expect(html).toContain("1500 m");
  });

  it("CevreDetayKarti: yol bulunamadığında uygun mesaj gösterir", () => {
    const bosCevre: CevreAnalizi = {
      ...mockCevre,
      enYakinlar: [],
    };
    const html = renderToString(React.createElement(CevreDetayKarti, { cevre: bosCevre, nitelik: "arsa" }));
    expect(html).toContain("30km içinde önemli yol bulunamadı");
  });

  it("IlanYerDuzeltme: form bileşenlerini render eder", () => {
    const mockIlan: IlanBilgisi = {
      ilanNo: "123456",
      kaynak: "sahibinden",
      il: "Balıkesir",
      ilce: "Bandırma",
      mahalle: "Yalı",
      adaNo: 116,
      parselNo: 977,
      fiyat: 1000000,
      m2: 500,
      fiyatStr: "1.000.000 TL",
      yakalanmaZamani: Date.now(),
      aciklamadaAdaParsel: [],
    };

    const onKaydet = vi.fn();
    const onIptal = vi.fn();

    const html = renderToString(
      React.createElement(IlanYerDuzeltme, {
        ilan: mockIlan,
        onKaydet,
        onIptal,
      }),
    );

    expect(html).toContain("Yer bilgisini düzelt");
    expect(html).toContain("Balıkesir");
    expect(html).toContain("Bandırma");
    expect(html).toContain("Kaydet &amp; yeniden sorgula");
  });
});
