/**
 * Gerçek satış fiyatı feedback loop motoru.
 *
 * Problem: Model tamamen "asking price" (istenen fiyat) üzerine kurulu.
 * Kullanıcı gerçek satış fiyatını girmesiyle:
 *   1. Yerel kalibrasyona katkı sağlanır (o mahalledeki bias düzelir)
 *   2. Backend'e anonim olarak gönderilir (toplu kalibrasyon için)
 *   3. Kullanıcının kendi parsellerinde daha iyi tahmin yapılır
 *
 * Gizlilik prensipleri:
 *   - Koordinat 0.01° (~1km) yuvarlanır — kesin konum korunmaz
 *   - Parsel numarası gönderilmez, sadece mahalle bazlı bilgi
 *   - Kullanıcı "gönderme" seçeneğini kaldırabilir
 *
 * Kullanım:
 *   const kayit = await gercekFiyatKaydet(parsel, {
 *     gercekFiyatTL: 1_500_000,
 *     alanM2: parsel.alanM2,
 *     tip: "satin-alindi",
 *     tahminGorulduMu: true,
 *     heuristicTahminPerM2: 8500,
 *   });
 *   await gercekFiyatBackendGonder(kayit.id!, backendUrl, jwtToken);
 */

import { db, type GercekFiyatKaydi } from "./db";
import type { Parsel } from "../types/tkgm";

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface GercekFiyatGiris {
  /** Gerçek satış/alış fiyatı (TL) */
  gercekFiyatTL: number;
  /** Parsel alanı m² (TKGM'den gelir) */
  alanM2: number;
  /** Kayıt türü */
  tip: GercekFiyatKaydi["tip"];
  /** Kullanıcı tahmini gördü mü? */
  tahminGorulduMu: boolean;
  /** Heuristic motor tahmini TL/m² (varsa) */
  heuristicTahminPerM2: number | null;
  /** Opsiyonel not */
  not?: string;
  /** Backend'e gönderilsin mi? */
  backendGonder?: boolean;
}

export interface GercekFiyatOzeti {
  /** Girilen gerçek fiyat TL/m² */
  gercekPerM2: number;
  /** Heuristic tahmin TL/m² (varsa) */
  heuristicPerM2: number | null;
  /** Hata oranı: (tahmin - gerçek) / gerçek × 100 */
  hataorani: number | null;
  /** Tahmin yönü: pozitif = fazla tahmin, negatif = eksik tahmin */
  yon: "fazla" | "eksik" | "dogru" | null;
  /** Açıklama */
  aciklama: string;
}

// ─── Kaydetme ─────────────────────────────────────────────────────────────────

/**
 * Gerçek satış fiyatını Dexie'ye kaydet.
 * Koordinat yuvarlama ve parsel key oluşturma dahil.
 */
export async function gercekFiyatKaydet(
  parsel: Parsel,
  giris: GercekFiyatGiris,
): Promise<GercekFiyatKaydi> {
  if (!parsel.ilAd || !parsel.ilceAd) {
    throw new Error("Parsel il/ilçe bilgisi eksik");
  }
  if (giris.gercekFiyatTL <= 0 || giris.alanM2 <= 0) {
    throw new Error("Geçersiz fiyat veya alan değeri");
  }

  const gercekPerM2 = Math.round(giris.gercekFiyatTL / giris.alanM2);
  const parselKey = `${parsel.mahalleKodu}/${parsel.adaNo}/${parsel.parselNo}`;

  const kayit: Omit<GercekFiyatKaydi, "id"> = {
    parselKey,
    ilAd: parsel.ilAd,
    ilceAd: parsel.ilceAd,
    mahalleAd: parsel.mahalleAd ?? "",
    gercekFiyatTL: giris.gercekFiyatTL,
    alanM2: giris.alanM2,
    gercekPerM2,
    tahminGorulduMu: giris.tahminGorulduMu,
    heuristicTahminPerM2: giris.heuristicTahminPerM2,
    tip: giris.tip,
    girisTarihi: Date.now(),
    backendSenkronlandi: false,
    not: giris.not ?? null,
  };

  const id = await db.gercekFiyatlar.add(kayit as GercekFiyatKaydi);
  return { ...kayit, id: id as number };
}

/**
 * Kaydedilmiş gerçek fiyatları listele.
 * Son 100 kayıt, en yeni önce.
 */
export async function gercekFiyatlariGetir(): Promise<GercekFiyatKaydi[]> {
  return db.gercekFiyatlar
    .orderBy("girisTarihi")
    .reverse()
    .limit(100)
    .toArray();
}

/**
 * Belirli bir parsel için en son gerçek fiyat kaydını getir.
 */
export async function parselGercekFiyatiGetir(
  parselKey: string,
): Promise<GercekFiyatKaydi | undefined> {
  const kayitlar = await db.gercekFiyatlar
    .where("parselKey")
    .equals(parselKey)
    .reverse()
    .first();
  return kayitlar;
}

// ─── Backend gönderim ─────────────────────────────────────────────────────────

/**
 * Gerçek fiyat kaydını backend'e anonim olarak gönder.
 * Sadece mahalle seviyesi bilgi gider — parsel no, koordinat gönderilmez.
 */
export async function gercekFiyatBackendGonder(
  kayitId: number,
  backendUrl: string,
  jwtToken: string,
): Promise<{ basarili: boolean; mesaj: string }> {
  const kayit = await db.gercekFiyatlar.get(kayitId);
  if (!kayit) return { basarili: false, mesaj: "Kayıt bulunamadı" };
  if (kayit.backendSenkronlandi) return { basarili: true, mesaj: "Zaten gönderildi" };

  // Anonim payload — parsel no yok, koordinat yok
  const payload = {
    ilAd: kayit.ilAd,
    ilceAd: kayit.ilceAd,
    mahalleAd: kayit.mahalleAd,
    gercekPerM2: kayit.gercekPerM2,
    alanBant: alanBantGetir(kayit.alanM2), // exact alan değil, bant
    tip: kayit.tip,
    tahminGorulduMu: kayit.tahminGorulduMu,
    heuristicPerM2: kayit.heuristicTahminPerM2,
    girisTarihi: kayit.girisTarihi,
  };

  try {
    const res = await fetch(`${backendUrl}/v1/gercek-satis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwtToken}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { basarili: false, mesaj: `Backend hata: ${res.status}` };
    }

    // Başarılı — Dexie'de senkronlama flag'ini güncelle
    await db.gercekFiyatlar.update(kayitId, { backendSenkronlandi: true });
    return { basarili: true, mesaj: "Gönderildi" };
  } catch (e) {
    return { basarili: false, mesaj: `Ağ hatası: ${String(e)}` };
  }
}

/**
 * Senkronlanmamış kayıtları toplu gönder.
 * Genellikle uygulama açılışında veya "senkronla" butonuyla tetiklenir.
 */
export async function bekleyenGercekFiyatlariSenkronla(
  backendUrl: string,
  jwtToken: string,
): Promise<{ gonderilen: number; basarisiz: number }> {
  const bekleyenler = await db.gercekFiyatlar
    .where("backendSenkronlandi")
    .equals(0) // false → 0 (Dexie boolean indexing)
    .toArray();

  let gonderilen = 0;
  let basarisiz = 0;

  for (const kayit of bekleyenler) {
    if (!kayit.id) continue;
    const sonuc = await gercekFiyatBackendGonder(kayit.id, backendUrl, jwtToken);
    if (sonuc.basarili) gonderilen++;
    else basarisiz++;
  }

  return { gonderilen, basarisiz };
}

// ─── Analiz ──────────────────────────────────────────────────────────────────

/**
 * Kullanıcıya tahmin vs gerçek karşılaştırması göster.
 */
export function tahminGercekKarsilastir(
  gercekPerM2: number,
  heuristicPerM2: number | null,
): GercekFiyatOzeti {
  if (!heuristicPerM2 || heuristicPerM2 <= 0) {
    return {
      gercekPerM2,
      heuristicPerM2: null,
      hataorani: null,
      yon: null,
      aciklama: "Tahmin mevcut değildi — karşılaştırma yapılamıyor",
    };
  }

  const hataorani = ((heuristicPerM2 - gercekPerM2) / gercekPerM2) * 100;
  const yon: GercekFiyatOzeti["yon"] =
    Math.abs(hataorani) < 5 ? "dogru" :
    hataorani > 0 ? "fazla" : "eksik";

  const aciklama = yon === "dogru"
    ? `Tahmin %${Math.abs(hataorani).toFixed(1)} hata — çok iyi!`
    : yon === "fazla"
    ? `Tahmin gerçekten %${Math.abs(hataorani).toFixed(1)} fazlaydı`
    : `Tahmin gerçekten %${Math.abs(hataorani).toFixed(1)} eksikti`;

  return { gercekPerM2, heuristicPerM2, hataorani, yon, aciklama };
}

/**
 * Mahalle bazlı kullanıcı kalibrasyon farkını hesapla.
 * Birden fazla kayıt varsa ortalama bias döner.
 * Bu değer `biasCarpani()` fonksiyonunu geçersiz kılabilir.
 */
export async function mahalleBiasHesapla(
  ilNorm: string,
  ilceNorm: string,
  mahalleNorm: string,
): Promise<{ biasOran: number; kayitSayisi: number } | null> {
  const kayitlar = await db.gercekFiyatlar
    .where("ilAd").equals(ilNorm)
    .and((k: GercekFiyatKaydi) => k.ilceAd === ilceNorm && k.mahalleAd === mahalleNorm)
    .and((k: GercekFiyatKaydi) => k.heuristicTahminPerM2 != null && k.heuristicTahminPerM2 > 0)
    .toArray();

  if (kayitlar.length === 0) return null;

  const biaslar = kayitlar
    .filter((k: GercekFiyatKaydi) => k.heuristicTahminPerM2 != null)
    .map((k: GercekFiyatKaydi) => (k.heuristicTahminPerM2! - k.gercekPerM2) / k.gercekPerM2);

  const ortalamaBias = biaslar.reduce((a: number, b: number) => a + b, 0) / biaslar.length;

  return {
    biasOran: ortalamaBias, // pozitif = model fazla tahmin ediyor
    kayitSayisi: kayitlar.length,
  };
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function alanBantGetir(alanM2: number): string {
  if (alanM2 < 250)    return "<250m²";
  if (alanM2 < 1000)   return "250-1000m²";
  if (alanM2 < 5000)   return "1000-5000m²";
  if (alanM2 < 20000)  return "5000-20000m²";
  return ">20000m²";
}
