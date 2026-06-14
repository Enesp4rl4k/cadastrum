import { describe, it, expect } from "vitest";
import { lokasyonMetniniAyir } from "../src/lib/lokasyon-ayir";
import {
  sahibindenUrldenLokasyon,
  hepsiemlakUrldenLokasyon,
} from "../src/lib/lokasyon-slug";
import { mahalleAliasAnahtar } from "../src/lib/mahalle-alias";

describe("lokasyonMetniniAyir", () => {
  it("4 parçada son Mh. mahalle olur", () => {
    const r = lokasyonMetniniAyir("Balıkesir / Altıeylül / Merkez / Bozen Mh.");
    expect(r.il).toBe("Balıkesir");
    expect(r.ilce).toBe("Altıeylül");
    expect(r.mahalle).toBe("Bozen");
  });

  it("3 parça suffix yoksa mahalle null (semt)", () => {
    const r = lokasyonMetniniAyir("Balıkesir / Altıeylül / Yenimahalle");
    expect(r.il).toBe("Balıkesir");
    expect(r.ilce).toBe("Altıeylül");
    expect(r.mahalle).toBeNull();
  });

  it("3 parça Mh. suffix ile mahalle alınır", () => {
    const r = lokasyonMetniniAyir("İstanbul / Kadıköy / Moda Mah.");
    expect(r.mahalle).toBe("Moda");
  });
});

describe("urldenLokasyon", () => {
  it("Sahibinden ilan slug", () => {
    const r = sahibindenUrldenLokasyon(
      "https://www.sahibinden.com/ilan/arsa-satilik-balikesir-altieylul-bozen-12345678901",
    );
    expect(r.il).toBe("Balikesir");
    expect(r.ilce).toBe("Altieylul");
    expect(r.mahalle).toBe("Bozen");
  });

  it("Hepsiemlak slug", () => {
    const r = hepsiemlakUrldenLokasyon(
      "https://www.hepsiemlak.com/balikesir-altieylul-bozen-satilik-arsa/120239-3336",
    );
    expect(r.il).toBe("Balikesir");
    expect(r.ilce).toBe("Altieylul");
    expect(r.mahalle).toBe("Bozen");
  });
});

describe("mahalleAliasAnahtar", () => {
  it("aynı ilan için stabil anahtar", () => {
    const a = mahalleAliasAnahtar("Balıkesir", "Altıeylül", "Bozen Mh.");
    const b = mahalleAliasAnahtar("BALIKESIR", "altieylul", "bozen");
    expect(a).toBe(b);
  });
});
