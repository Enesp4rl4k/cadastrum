import { describe, it, expect } from "vitest";
import { ilanSanitizeEt, type RawIlanGirdisi } from "../src/lib/fiyat/data-sanitizer";

describe("Veri Rafinerisi: data-sanitizer", () => {
  it("temiz ve müstakil bir arsa ilanını onaylar", () => {
    const ilan: RawIlanGirdisi = {
      ilanNo: "12345",
      baslik: "Kadıköy Fenerbahçe'de Müstakil Parsel 500m² Konut İmarlı Arsa",
      aciklama: "Krediye uygun, tek tapu, sorunsuz arsa.",
      fiyatTL: 25_000_000,
      m2: 500,
      nitelik: "Arsa",
    };
    const res = ilanSanitizeEt(ilan);
    expect(res.kullanilabilir).toBe(true);
    expect(res.guvenilirMi).toBe(true);
    expect(res.duzeltilmisFiyatPerM2).toBe(50_000);
    expect(res.tespitEdilenKisitlar).toHaveLength(0);
    expect(res.guvenlikCarpani).toBe(1.0);
  });

  it("kooperatif hisseli ilanı tespit edip kullanılamaz olarak eler", () => {
    const ilan: RawIlanGirdisi = {
      baslik: "Gölbaşı Kooperatif Hissesi Yatırımlık Tel Örgülü Bahçe",
      aciklama: "Kooperatif payı noterden devredilecektir. Rızai taksim yapılmıştır.",
      fiyatTL: 350_000,
      m2: 500,
      nitelik: "Tarla",
    };
    const res = ilanSanitizeEt(ilan);
    expect(res.kullanilabilir).toBe(false);
    expect(res.tespitEdilenKisitlar).toContain("kooperatif_hisse");
    expect(res.guvenlikCarpani).toBeLessThan(0.5);
  });

  it("hobi bahçesi ibaresini tespit edip eler", () => {
    const ilan: RawIlanGirdisi = {
      baslik: "Konteynerli Elektrik Su Bağlı Hobi Bahçesi Fırsat",
      aciklama: "Tel örgü çekili parsel, hafta sonu için ideal.",
      fiyatTL: 400_000,
      m2: 300,
      nitelik: "Tarla",
    };
    const res = ilanSanitizeEt(ilan);
    expect(res.kullanilabilir).toBe(false);
    expect(res.tespitEdilenKisitlar).toContain("hobi_bahcesi");
  });

  it("2B ve zilliyetlik arazileri tespit edip eler", () => {
    const ilan: RawIlanGirdisi = {
      baslik: "Orman Bitişiği 2B Arazisi Zilliyetlik Devri",
      aciklama: "Kullanım hakkı noterden devredilecektir.",
      fiyatTL: 1_000_000,
      m2: 5000,
      nitelik: "Tarla",
    };
    const res = ilanSanitizeEt(ilan);
    expect(res.kullanilabilir).toBe(false);
    expect(res.tespitEdilenKisitlar).toContain("zilliyet_2b");
  });

  it("hisseli tapu tespit ettiğinde güvenlik katsayısını düşürür", () => {
    const ilan: RawIlanGirdisi = {
      baslik: "Yatırımlık 1/2 Hisseli Tarla",
      aciklama: "Hissedarlardan muvafakatname alınmıştır, hisse satışı yapılacaktır.",
      fiyatTL: 1_500_000,
      m2: 3000,
      nitelik: "Tarla",
    };
    const res = ilanSanitizeEt(ilan);
    expect(res.tespitEdilenKisitlar).toContain("hisseli_tapu");
    expect(res.guvenlikCarpani).toBeLessThanOrEqual(0.65);
  });

  it("dönüm/dekar alan giriş hatasını düzeltir", () => {
    const ilan: RawIlanGirdisi = {
      baslik: "Köy Yoluna Cepheli 15 Dönüm Verimli Tarla",
      aciklama: "Müstakil tek tapu.",
      fiyatTL: 3_000_000,
      m2: 15, // Kullanıcı 15 dönüm yerine m2 alanına 15 yazmış
      nitelik: "Tarla",
    };
    const res = ilanSanitizeEt(ilan);
    expect(res.duzeltilmisM2).toBe(15_000);
    expect(res.duzeltilmisFiyatPerM2).toBe(200); // 3M / 15.000 = 200 TL/m2
    expect(res.kullanilabilir).toBe(true);
  });

  it("birim fiyat yerine toplam fiyat girilmesi durumunu normalize eder", () => {
    const ilan: RawIlanGirdisi = {
      baslik: "Sanayi İmarlı Arsa",
      aciklama: "m2 fiyatı 1500 TL",
      fiyatTL: 1500, // Toplam fiyata 1500 yazmış ama m2'si 2000
      m2: 2000,
      nitelik: "Arsa",
    };
    const res = ilanSanitizeEt(ilan);
    expect(res.duzeltilmisFiyatTL).toBe(3_000_000);
    expect(res.duzeltilmisFiyatPerM2).toBe(1500);
  });

  it("absürd düşük fiyatları eler (örn: 5 TL/m²)", () => {
    const ilan: RawIlanGirdisi = {
      baslik: "Kelepir Tarla",
      fiyatTL: 5000,
      m2: 1000,
      nitelik: "Tarla",
    };
    const res = ilanSanitizeEt(ilan);
    expect(res.kullanilabilir).toBe(false);
  });

  // Yanlış-pozitif regresyon testleri — bkz. planda madde E.
  it("'elektrik su bağlı parsel' ibaresi tek başına hobi bahçesi sayılmaz", () => {
    const ilan: RawIlanGirdisi = {
      baslik: "Elektrik Su Bağlı Parsel — Yatırımlık Arsa",
      aciklama: "Altyapısı tamamlanmış, müstakil tapulu arsa.",
      fiyatTL: 5_000_000,
      m2: 500,
      nitelik: "Arsa",
    };
    const res = ilanSanitizeEt(ilan);
    expect(res.kullanilabilir).toBe(true);
    expect(res.tespitEdilenKisitlar).not.toContain("hobi_bahcesi");
  });

  it("'kullanım hakkı' ibaresi tek başına 2B/zilliyet sayılmaz", () => {
    const ilan: RawIlanGirdisi = {
      baslik: "Site İçi Ortak Alan Kullanım Hakkı Olan Müstakil Arsa",
      aciklama: "Tapulu, sorunsuz arsa.",
      fiyatTL: 5_000_000,
      m2: 500,
      nitelik: "Arsa",
    };
    const res = ilanSanitizeEt(ilan);
    expect(res.kullanilabilir).toBe(true);
    expect(res.tespitEdilenKisitlar).not.toContain("zilliyet_2b");
  });

  it("sıradan 'şerh' ibaresi sert elemeye yol açmaz, sadece güven cezalandırılabilir", () => {
    const ilan: RawIlanGirdisi = {
      baslik: "Tapu Şerhi Kaldırılmış Temiz Arsa",
      aciklama: "Müstakil parsel, imar durumu net.",
      fiyatTL: 5_000_000,
      m2: 500,
      nitelik: "Arsa",
    };
    const res = ilanSanitizeEt(ilan);
    expect(res.kullanilabilir).toBe(true);
  });
});
