/**
 * mahalle-cozumle.ts unit testleri
 *
 * Strateji: tüm dış I/O (TKGM API, alias storage, telemetri) vi.mock ile
 * stub'lanır. Sadece mahalleKoduCoz() içindeki öncelik mantığı test edilir.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mahalle } from "../src/types/tkgm";

// --- mock tanımları (import'lardan ÖNCE) ---
vi.mock("../src/lib/mahalle-alias", () => ({
  mahalleAliasOku: vi.fn().mockResolvedValue(null),
  mahalleAliasKaydet: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/lokasyon-slug", () => ({
  ilanUrldenLokasyon: vi.fn().mockReturnValue({ mahalle: null }),
}));

vi.mock("../src/lib/tkgm-api", () => ({
  ilceKodunuBul: vi.fn().mockResolvedValue(1234),
  getMahalleListesi: vi.fn().mockResolvedValue([]),
  mahalleAdaylariFromListe: vi.fn().mockReturnValue([]),
  mahalleBulKoordinatla: vi.fn().mockResolvedValue(null),
  mahalleEsleFromListe: vi.fn().mockReturnValue(null),
  findMahalleByAd: vi.fn().mockResolvedValue(null),
}));

vi.mock("../src/lib/telemetri", () => ({
  hataBildir: vi.fn(),
}));

// mock'ları import et
import {
  mahalleAliasOku,
  mahalleAliasKaydet,
} from "../src/lib/mahalle-alias";
import { ilanUrldenLokasyon } from "../src/lib/lokasyon-slug";
import {
  ilceKodunuBul,
  getMahalleListesi,
  mahalleAdaylariFromListe,
  mahalleBulKoordinatla,
  mahalleEsleFromListe,
  findMahalleByAd,
} from "../src/lib/tkgm-api";
import { hataBildir } from "../src/lib/telemetri";

// test edilen modül
import { mahalleKoduCoz } from "../src/lib/mahalle-cozumle";

// -------- yardımcı --------
const mahalle = (kodu: number, adi: string): Mahalle => ({
  mahalleKodu: kodu,
  mahalleAdi: adi,
  ilceKodu: 1234,
});

const ISTANBUL_GIRDI = {
  ilAd: "İstanbul",
  ilceAd: "Kadıköy",
  mahalleAd: "Moda",
};

beforeEach(() => {
  vi.clearAllMocks();
  // varsayılan: ilce kodu bulunur, liste boş
  vi.mocked(ilceKodunuBul).mockResolvedValue(1234);
  vi.mocked(getMahalleListesi).mockResolvedValue([]);
  vi.mocked(mahalleAliasOku).mockResolvedValue(null);
  vi.mocked(mahalleAliasKaydet).mockResolvedValue(undefined);
  vi.mocked(mahalleEsleFromListe).mockReturnValue(null);
  vi.mocked(mahalleAdaylariFromListe).mockReturnValue([]);
  vi.mocked(mahalleBulKoordinatla).mockResolvedValue(null);
  vi.mocked(findMahalleByAd).mockResolvedValue(null);
  vi.mocked(ilanUrldenLokasyon).mockReturnValue({ mahalle: null });
  vi.mocked(hataBildir).mockImplementation(() => {});
});

// ============================================================
describe("mahalleKoduCoz — manuel-kod yöntemi", () => {
  it("secilenMahalleKodu varsa ve listede bulunursa ok:true + yöntem=manuel-kod döner", async () => {
    const m = mahalle(99001, "Moda Mahallesi");
    vi.mocked(getMahalleListesi).mockResolvedValue([m]);

    const r = await mahalleKoduCoz({
      ...ISTANBUL_GIRDI,
      secilenMahalleKodu: 99001,
      mahalleler: [m],
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sonuc.mahalleKodu).toBe(99001);
      expect(r.sonuc.yontem).toBe("manuel-kod");
      expect(r.sonuc.skor).toBe(100);
    }
  });

  it("secilenMahalleKodu listede yoksa fallback zincirine devam eder", async () => {
    const m = mahalle(99001, "Moda Mahallesi");
    vi.mocked(getMahalleListesi).mockResolvedValue([m]);
    vi.mocked(mahalleEsleFromListe).mockReturnValue(m);

    const r = await mahalleKoduCoz({
      ...ISTANBUL_GIRDI,
      secilenMahalleKodu: 99999, // listede yok
      mahalleler: [m],
    });

    // Zincir devam etmeli — isim eşleşmesi bulunmalı
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sonuc.yontem).toBe("isim");
    }
  });
});

// ============================================================
describe("mahalleKoduCoz — alias yöntemi", () => {
  it("alias cache'te varsa ok:true + yöntem=alias döner, API çağrılmaz", async () => {
    const m = mahalle(42001, "Moda Mahallesi");
    vi.mocked(mahalleAliasOku).mockResolvedValue({
      key: "istanbul|kadikoy|moda",
      ilNorm: "istanbul",
      ilceNorm: "kadikoy",
      mahalleNorm: "moda",
      mahalleKodu: 42001,
      tkgmMahalleAd: "Moda Mahallesi",
      kaynak: "otomatik",
      guncellenme: Date.now(),
      hit: 1,
    });
    vi.mocked(getMahalleListesi).mockResolvedValue([m]);

    const r = await mahalleKoduCoz({ ...ISTANBUL_GIRDI, mahalleler: [m] });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sonuc.yontem).toBe("alias");
      expect(r.sonuc.mahalleKodu).toBe(42001);
    }
    // TKGM API çağrılmamalı
    expect(findMahalleByAd).not.toHaveBeenCalled();
  });

  it("alias kodu listede bulunamazsa (stale) fallback zincirine geçer", async () => {
    const m = mahalle(42001, "Moda Mahallesi");
    // Alias eski kod döndürüyor, listede farklı
    vi.mocked(mahalleAliasOku).mockResolvedValue({
      key: "istanbul|kadikoy|moda",
      ilNorm: "istanbul",
      ilceNorm: "kadikoy",
      mahalleNorm: "moda",
      mahalleKodu: 99999,
      tkgmMahalleAd: "Eski Ad",
      kaynak: "otomatik",
      guncellenme: Date.now(),
      hit: 0,
    });
    vi.mocked(getMahalleListesi).mockResolvedValue([m]);
    vi.mocked(mahalleEsleFromListe).mockReturnValue(m);

    const r = await mahalleKoduCoz({ ...ISTANBUL_GIRDI, mahalleler: [m] });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sonuc.yontem).toBe("isim"); // alias geçersiz, isim eşleşti
    }
  });
});

// ============================================================
describe("mahalleKoduCoz — isim yöntemi", () => {
  it("mahalleEsleFromListe eşleşirse ok:true + yöntem=isim + skor=90", async () => {
    const m = mahalle(11001, "Caferağa Mahallesi");
    vi.mocked(getMahalleListesi).mockResolvedValue([m]);
    vi.mocked(mahalleEsleFromListe).mockReturnValue(m);

    const r = await mahalleKoduCoz({
      ilAd: "İstanbul",
      ilceAd: "Kadıköy",
      mahalleAd: "Caferağa",
      mahalleler: [m],
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sonuc.yontem).toBe("isim");
      expect(r.sonuc.skor).toBe(90);
      expect(r.sonuc.mahalleKodu).toBe(11001);
    }
  });

  it("isim eşleşmesinde aliasKaydet=true ise mahalleAliasKaydet çağrılır", async () => {
    const m = mahalle(11001, "Caferağa Mahallesi");
    vi.mocked(getMahalleListesi).mockResolvedValue([m]);
    vi.mocked(mahalleEsleFromListe).mockReturnValue(m);

    await mahalleKoduCoz(
      { ilAd: "İstanbul", ilceAd: "Kadıköy", mahalleAd: "Caferağa", mahalleler: [m] },
      { aliasKaydet: true },
    );

    expect(mahalleAliasKaydet).toHaveBeenCalledOnce();
    const arg = vi.mocked(mahalleAliasKaydet).mock.calls[0][0];
    expect(arg.mahalleKodu).toBe(11001);
    expect(arg.kaynak).toBe("otomatik");
  });

  it("aliasKaydet=false ise kayıt yapılmaz", async () => {
    const m = mahalle(11001, "Caferağa Mahallesi");
    vi.mocked(getMahalleListesi).mockResolvedValue([m]);
    vi.mocked(mahalleEsleFromListe).mockReturnValue(m);

    await mahalleKoduCoz(
      { ilAd: "İstanbul", ilceAd: "Kadıköy", mahalleAd: "Caferağa", mahalleler: [m] },
      { aliasKaydet: false },
    );

    expect(mahalleAliasKaydet).not.toHaveBeenCalled();
  });
});

// ============================================================
describe("mahalleKoduCoz — url-slug yöntemi", () => {
  it("URL'den mahalle slug eşleşirse yöntem=url-slug + skor=85", async () => {
    const m = mahalle(55001, "Bostancı Mahallesi");
    vi.mocked(getMahalleListesi).mockResolvedValue([m]);
    vi.mocked(mahalleEsleFromListe)
      .mockReturnValueOnce(null)   // ilk çağrı: isim eşleşmesi yok
      .mockReturnValueOnce(m);    // ikinci çağrı: url slug eşleşmesi
    vi.mocked(ilanUrldenLokasyon).mockReturnValue({ mahalle: "bostanci" });

    const r = await mahalleKoduCoz({
      ilAd: "İstanbul",
      ilceAd: "Kadıköy",
      mahalleAd: "Bostancı",
      mahalleler: [m],
      url: "https://www.sahibinden.com/ilan/bostanci-arsa-12345",
      kaynak: "sahibinden",
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sonuc.yontem).toBe("url-slug");
      expect(r.sonuc.skor).toBe(85);
    }
  });
});

// ============================================================
describe("mahalleKoduCoz — koordinat yöntemi", () => {
  it("koordinat eşleşirse yöntem=koordinat + skor=95", async () => {
    const m = mahalle(77001, "Kozyatağı Mahallesi");
    vi.mocked(getMahalleListesi).mockResolvedValue([m]);
    vi.mocked(mahalleEsleFromListe).mockReturnValue(null);
    vi.mocked(findMahalleByAd).mockResolvedValue(null);
    vi.mocked(mahalleBulKoordinatla).mockResolvedValue(m);

    const r = await mahalleKoduCoz({
      ilAd: "İstanbul",
      ilceAd: "Kadıköy",
      mahalleAd: "Kozyatağı",
      mahalleler: [m],
      lat: 40.9605,
      lng: 29.1050,
    });

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sonuc.yontem).toBe("koordinat");
      expect(r.sonuc.skor).toBe(95);
    }
  });

  it("koordinat NaN ise koordinat yöntemi denenmez", async () => {
    vi.mocked(getMahalleListesi).mockResolvedValue([]);
    vi.mocked(mahalleBulKoordinatla).mockResolvedValue(null);

    await mahalleKoduCoz({
      ilAd: "İstanbul",
      ilceAd: "Kadıköy",
      mahalleAd: "Bir Mahalle",
      lat: NaN,
      lng: NaN,
    });

    expect(mahalleBulKoordinatla).not.toHaveBeenCalled();
  });
});

// ============================================================
describe("mahalleKoduCoz — başarısız durumlar", () => {
  it("ilçe kodu bulunamazsa ok:false + boş adaylar", async () => {
    vi.mocked(ilceKodunuBul).mockResolvedValue(null);

    const r = await mahalleKoduCoz({
      ilAd: "Bilinmeyen",
      ilceAd: "Bilinmeyen",
      mahalleAd: "Test",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.hata.adaylar).toHaveLength(0);
      expect(r.hata.mesaj).toContain("TKGM");
    }
  });

  it("tüm yöntemler başarısız olunca hataBildir çağrılır", async () => {
    vi.mocked(getMahalleListesi).mockResolvedValue([]);

    await mahalleKoduCoz({
      ilAd: "İstanbul",
      ilceAd: "Kadıköy",
      mahalleAd: "Var Olmayan Mahalle",
    });

    expect(hataBildir).toHaveBeenCalledOnce();
    const [kaynak] = vi.mocked(hataBildir).mock.calls[0];
    expect(kaynak).toBe("mahalle-cozumle:basarisiz");
  });

  it("mahalleAd boşsa hataBildir çağrılmaz", async () => {
    vi.mocked(getMahalleListesi).mockResolvedValue([]);

    await mahalleKoduCoz({
      ilAd: "İstanbul",
      ilceAd: "Kadıköy",
      mahalleAd: null,
    });

    expect(hataBildir).not.toHaveBeenCalled();
  });

  it("tüm yöntemler başarısızsa ok:false + adaylar listesi dolu gelir", async () => {
    const adaylar = [
      { mahalle: mahalle(1, "Moda Mah."), skor: 72 },
      { mahalle: mahalle(2, "Acıbadem Mah."), skor: 60 },
    ];
    vi.mocked(getMahalleListesi).mockResolvedValue([]);
    vi.mocked(mahalleAdaylariFromListe).mockReturnValue(adaylar);

    const r = await mahalleKoduCoz({
      ilAd: "İstanbul",
      ilceAd: "Kadıköy",
      mahalleAd: "Modaaa",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.hata.adaylar).toHaveLength(2);
      expect(r.hata.mesaj).toContain("Moda Mah.");
    }
  });
});

// ============================================================
describe("mahalleKoduCoz — öncelik sırası", () => {
  it("alias varsa isim yöntemi denenmez", async () => {
    const m = mahalle(42001, "Moda Mahallesi");
    vi.mocked(mahalleAliasOku).mockResolvedValue({
      key: "istanbul|kadikoy|moda",
      ilNorm: "istanbul",
      ilceNorm: "kadikoy",
      mahalleNorm: "moda",
      mahalleKodu: 42001,
      tkgmMahalleAd: "Moda Mahallesi",
      kaynak: "otomatik",
      guncellenme: Date.now(),
      hit: 5,
    });
    vi.mocked(getMahalleListesi).mockResolvedValue([m]);

    await mahalleKoduCoz({ ...ISTANBUL_GIRDI, mahalleler: [m] });

    expect(mahalleEsleFromListe).not.toHaveBeenCalled();
    expect(findMahalleByAd).not.toHaveBeenCalled();
  });

  it("isim eşleşirse api yöntemi denenmez", async () => {
    const m = mahalle(11001, "Caferağa Mahallesi");
    vi.mocked(getMahalleListesi).mockResolvedValue([m]);
    vi.mocked(mahalleEsleFromListe).mockReturnValue(m);

    await mahalleKoduCoz({ ...ISTANBUL_GIRDI, mahalleler: [m] });

    expect(findMahalleByAd).not.toHaveBeenCalled();
  });
});
