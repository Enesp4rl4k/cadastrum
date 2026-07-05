import { describe, it, expect } from "vitest";
import { tucbsWmsEndpointGetir } from "../src/lib/data/tucbs-wms-endpoints";
import {
  kullanimMetniniSiniflandir,
  tucbsCdpCeliskiVar,
  tucbsParselKeyFromParsel,
} from "../src/lib/tucbs";
import { kodIleSiniflandir } from "../src/lib/data/tucbs-kullanim-kodlari";
import { riskleriTara } from "../src/lib/risk-uyarilari";
import type { Parsel } from "../src/types/tkgm";

const ornekParsel = (ilAd: string): Parsel =>
  ({
    ilAd,
    ilceAd: "Merkez",
    mahalleAd: "Test",
    adaNo: 1,
    parselNo: 2,
    mahalleKodu: 123,
    alan: 500,
    nitelik: "Tarla",
    merkezNokta: { lat: 38.4, lng: 27.1 },
    koordinatlar: [],
  }) as Parsel;

describe("tucbsWmsEndpointGetir", () => {
  it("İzmir → izmir-manisa servisi", () => {
    const ep = tucbsWmsEndpointGetir("İzmir");
    expect(ep?.slug).toBe("csb_cdp_im_wms");
    expect(ep?.bolgeAd).toContain("İzmir");
  });

  it("Ankara → null (henüz kapsam dışı)", () => {
    expect(tucbsWmsEndpointGetir("Ankara")).toBeNull();
  });

  it("büyük/küçük harf ve aksan toleransı", () => {
    expect(tucbsWmsEndpointGetir("KIRŞEHİR")?.slug).toBe("csb_cdp_knna_wms");
  });
});

describe("kullanimMetniniSiniflandir", () => {
  it("konut gelişme alanı → sarı kategori", () => {
    const s = kullanimMetniniSiniflandir("KONUT GELİŞME ALANI");
    expect(s.kategori).toBe("konut-gelisme");
    expect(s.renkEtiket).toContain("Sarı");
  });

  it("liman → ticari-turizm", () => {
    const s = kullanimMetniniSiniflandir("LİMAN / LİMAN GERİ ALANI");
    expect(s.kategori).toBe("ticari-turizm");
  });

  it("tarım alanı → tarim-koruma", () => {
    const s = kullanimMetniniSiniflandir("TARIM ALANI");
    expect(s.kategori).toBe("tarim-koruma");
  });

  it("organize sanayi → sanayi", () => {
    const s = kullanimMetniniSiniflandir("ORGANİZE SANAYİ BÖLGESİ");
    expect(s.kategori).toBe("sanayi");
  });

  it("KullanımTipi kodu 40301 → liman / ticari", () => {
    const s = kullanimMetniniSiniflandir("LİMAN / LİMAN GERİ ALANI", "40301");
    expect(s.kategori).toBe("ticari-turizm");
    expect(kodIleSiniflandir("40301")?.kategori).toBe("ticari-turizm");
  });
});

describe("tucbsCdpCeliskiVar", () => {
  it("imarlı ilan + tarım planı → çelişki", () => {
    const celiski = tucbsCdpCeliskiVar(
      {
        parselKey: "x",
        kaynak: "tucbs-wms",
        bolge: "Test",
        wmsSlug: "csb_cdp_im_wms",
        araziKullanimi: {
          kod: "1",
          metin: "TARIM ALANI",
          eskiMetin: null,
          kategori: "tarim-koruma",
          renkEtiket: "Yeşil",
        },
        sitAlani: false,
        endustriBolgesi: false,
        il: "İzmir",
        ilce: "Test",
        kapsam: "tam",
        guvenSkoru: 85,
        fetchedAt: Date.now(),
      },
      "İmarlı arsa",
    );
    expect(celiski).toBe(true);
  });
});

describe("riskleriTara + TUCBS", () => {
  it("sit alanı sinyali üretir", () => {
    const uyarilar = riskleriTara({
      parsel: ornekParsel("İzmir"),
      tucbs: {
        parselKey: "x",
        kaynak: "tucbs-wms",
        bolge: "İzmir – Manisa",
        wmsSlug: "csb_cdp_im_wms",
        araziKullanimi: null,
        sitAlani: true,
        endustriBolgesi: false,
        il: "İzmir",
        ilce: "Test",
        kapsam: "tam",
        guvenSkoru: 90,
        fetchedAt: Date.now(),
      },
    });
    expect(uyarilar.some((u) => u.kod === "TUCBS_SIT")).toBe(true);
  });
});

describe("tucbsParselKeyFromParsel", () => {
  it("ada/parsel içerir", () => {
    const key = tucbsParselKeyFromParsel(ornekParsel("İzmir"));
    expect(key).toContain("1");
    expect(key).toContain("2");
  });
});
