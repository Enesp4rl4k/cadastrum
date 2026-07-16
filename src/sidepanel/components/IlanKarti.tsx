import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Radio as RadioIcon,
  ExternalLink as ExternalLinkIcon,
  Target as TargetIcon,
  Check as CheckIcon,
  X as XIcon,
  AlertTriangle as AlertTriIcon,
  TrendingDown as TrendingDownIcon,
  TrendingUp as TrendingUpIcon,
} from "lucide-react";
import type { IlanBilgisi } from "../../types/ilan";
import type { Parsel } from "../../types/tkgm";
import {
  getParselByCodes,
  ilceKodunuBul,
  getMahalleListesi,
  normalizeTr,
  normalizeYerAdi,
  type MahalleAdayi,
} from "../../lib/tkgm-api";
import { mahalleKoduCoz } from "../../lib/mahalle-cozumle";
import type { Mahalle } from "../../types/tkgm";
import { db, type IlanGozlem } from "../../lib/db";
import { getMahalleMerkez } from "../../lib/data/mahalle-merkezleri";
import { useAyarlar } from "../../lib/ayarlar";
import { Card } from "../ui/Card";
import { IlanFiyatKarsilastirma } from "./IlanFiyatKarsilastirma";
import { useToast } from "./Toast";

interface Props {
  acikParsel?: Parsel | null;
  onParselDogrula?: (parsel: Parsel) => void;
}

// Browser preview'da chrome global yok — IlanKarti tamamen no-op olsun.
// Production extension'da chrome her zaman var, bu kontrol false olur.
const HAS_CHROME =
  typeof chrome !== "undefined" && !!chrome?.storage?.local;

/**
 * ilanGozlem upsert — `&[kaynak+ilanNo]` unique compound index'i ihlal etmeden yaz.
 * id'siz put() insert dener → aynı (kaynak,ilanNo) varsa ConstraintError. Bu yüzden
 * önce mevcut kaydı bul, varsa id'siyle put et (update), yoksa yeni ekle. rw transaction
 * ile atomik: lookup ile put arasında yarış olmaz.
 */
async function ilanGozlemUpsert(kayit: Omit<IlanGozlem, "id">): Promise<void> {
  const kaynak = kayit.kaynak;
  const ilanNo = kayit.ilanNo;
  if (!ilanNo || !kaynak) return; // ilanNo/kaynak yoksa unique dedup çalışmaz — atla
  try {
    await db.transaction("rw", db.ilanGozlem, async () => {
      const mevcut = await db.ilanGozlem
        .where("[kaynak+ilanNo]")
        .equals([kaynak, ilanNo])
        .first();
      await db.ilanGozlem.put(mevcut?.id != null ? { ...kayit, id: mevcut.id } : kayit);
    });
  } catch (e) {
    console.warn("[arsa] ilanGozlem upsert:", (e as Error)?.name ?? e);
  }
}

export function IlanKarti(props: Props) {
  if (!HAS_CHROME) return null;
  return <IlanKartiInternal {...props} />;
}

function IlanKartiInternal({ acikParsel, onParselDogrula }: Props) {
  const { toast } = useToast();
  const [ilan, setIlan] = useState<IlanBilgisi | null>(null);
  const [dogrulaniyor, setDogrulaniyor] = useState(false);
  const [dogrulamaHatasi, setDogrulamaHatasi] = useState<string | null>(null);
  const [dogrulamaAdimi, setDogrulamaAdimi] = useState<string | null>(null);
  /** 0-3 arası ilerleme adımı — progress bar için */
  const [dogrulamaAdimNo, setDogrulamaAdimNo] = useState(0);
  const [mahallelerDropdown, setMahallelerDropdown] = useState<Mahalle[]>([]);
  const [secilenMahalleKodu, setSecilenMahalleKodu] = useState<number | null>(null);
  /** İl+ilçe için TKGM mahalle listesi ön-yüklemesi — doğrulama 3 API turu yerine 0–1 tur */
  const [hazirIlceKodu, setHazirIlceKodu] = useState<number | null>(null);
  const [hazirMahalleler, setHazirMahalleler] = useState<Mahalle[] | null>(null);
  const mahalleHazirlikRef = useRef<Promise<void> | null>(null);
  /** Otomatik eşleşme başarısız — TKGM'den önerilen mahalleler */
  const [mahalleOnerileri, setMahalleOnerileri] = useState<MahalleAdayi[]>([]);
  const [mahalleSecimGerekli, setMahalleSecimGerekli] = useState(false);
  /** Kullanıcı paneli kapattığı ilan no — yeni ilan tespit edilince sıfırlanır */
  const [kapatilanIlanNo, setKapatilanIlanNo] = useState<string | null>(null);
  /** Kullanıcı "yer yanlış" tıkladığında manuel düzeltme modu */
  const [yerDuzeltModu, setYerDuzeltModu] = useState(false);
  /** Manuel girilen il/ilçe (mahalle dropdown'ı il+ilçe biliniyorsa otomatik) */
  const [duzeltIl, setDuzeltIl] = useState("");
  const [duzeltIlce, setDuzeltIlce] = useState("");
  const [duzeltMahalle, setDuzeltMahalle] = useState("");
  /** Manuel düzeltilen ada/parsel no — açıklamada farklı no varsa kullanıcı buradan girer */
  const [duzeltAda, setDuzeltAda] = useState("");
  const [duzeltParsel, setDuzeltParsel] = useState("");
  const [ayarlar] = useAyarlar();

  // İlan değişince storage'dan yükle + dinle.
  // chrome.storage.session: browser kapanınca otomatik silinir (kalıcı state YOK)
  useEffect(() => {
    chrome.storage.session.get("sonIlan").then((d) => {
      if (d.sonIlan) setIlan(d.sonIlan as IlanBilgisi);
    });
    const dinleyici = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "session" && changes["sonIlan"]?.newValue) {
        const yeni = changes["sonIlan"].newValue as IlanBilgisi;
        setIlan(yeni);
        setDogrulamaHatasi(null);
        setDogrulamaAdimi(null);
        setMahalleOnerileri([]);
        setMahalleSecimGerekli(false);
        setKapatilanIlanNo(null);
      }
    };
    chrome.storage.onChanged.addListener(dinleyici);
    return () => chrome.storage.onChanged.removeListener(dinleyici);
  }, []);

  // Sahibinden LISTE sayfasından gelen toplu ilanları kaydet
  useEffect(() => {
    if (!ayarlar.ilanGozlemiKaydet) return;
    const dinleyici = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== "local" || !changes["listeIlanlari"]?.newValue) return;
      const { ilanlar } = changes["listeIlanlari"].newValue as {
        ilanlar: import("../../types/ilan").IlanBilgisi[];
        zaman: number;
      };
      for (const il of ilanlar) {
        if (!il.ilanNo) continue;
        const fiyatPerM2 =
          il.fiyat != null && il.m2 != null && il.m2 > 0
            ? Math.round(il.fiyat / il.m2)
            : null;

        // Faz 2 — liste sayfalarında genelde koord yok; mahalle merkez fallback
        let lat: number | null = il.lat ?? null;
        let lng: number | null = il.lng ?? null;
        let koordKaynagi: "dom" | "mahalle-merkez" | "manuel" | null = il.koordKaynagi ?? null;
        let koordDogruluk: "yuksek" | "orta" | "dusuk" | null = il.koordDogruluk ?? null;
        if (lat == null || lng == null) {
          const merkez = getMahalleMerkez(il.il, il.ilce, il.mahalle);
          if (merkez) {
            lat = merkez.lat;
            lng = merkez.lng;
            koordKaynagi = "mahalle-merkez";
            koordDogruluk = merkez.seviye === "mahalle" ? "orta" : "dusuk";
          }
        }

        void ilanGozlemUpsert({
            kaynak: il.kaynak,
            ilanNo: il.ilanNo,
            url: il.url,
            baslik: il.baslik,
            ilAd: il.il,
            ilceAd: il.ilce,
            mahalleAd: il.mahalle,
            ilNorm: il.il ? normalizeTr(il.il) : null,
            ilceNorm: il.ilce ? normalizeYerAdi(il.ilce) : null,
            mahalleNorm: il.mahalle ? normalizeYerAdi(il.mahalle) : null,
            imarDurumu: il.imarDurumu,
            fiyat: il.fiyat,
            m2: il.m2,
            fiyatPerM2,
            paraBirimi: il.paraBirimi,
            adaNo: il.adaNo,
            parselNo: il.parselNo,
            zaman: il.yakalanmaZamani,
            lat,
            lng,
            koordKaynagi,
            koordDogruluk,
          });
      }
    };
    chrome.storage.onChanged.addListener(dinleyici);
    return () => chrome.storage.onChanged.removeListener(dinleyici);
  }, [ayarlar.ilanGozlemiKaydet]);

  // İlan tespit edilince ayar açıksa ilanGozlem'e yaz
  useEffect(() => {
    if (!ilan || !ayarlar.ilanGozlemiKaydet) return;
    const fiyatPerM2 =
      ilan.fiyat != null && ilan.m2 != null && ilan.m2 > 0
        ? Math.round(ilan.fiyat / ilan.m2)  // tam sayıya yuvarla — liste ile tutarlılık
        : null;

    // Faz 2 — koord fallback zinciri: DOM scrape → mahalle merkez tablo → null
    let lat: number | null = ilan.lat ?? null;
    let lng: number | null = ilan.lng ?? null;
    let koordKaynagi: "dom" | "mahalle-merkez" | "manuel" | null = ilan.koordKaynagi ?? null;
    let koordDogruluk: "yuksek" | "orta" | "dusuk" | null = ilan.koordDogruluk ?? null;
    if (lat == null || lng == null) {
      const merkez = getMahalleMerkez(ilan.il, ilan.ilce, ilan.mahalle);
      if (merkez) {
        lat = merkez.lat;
        lng = merkez.lng;
        koordKaynagi = "mahalle-merkez";
        koordDogruluk = merkez.seviye === "mahalle" ? "orta" : "dusuk";
      }
    }

    void ilanGozlemUpsert({
        kaynak: ilan.kaynak,
        ilanNo: ilan.ilanNo,
        url: ilan.url,
        baslik: ilan.baslik,
        ilAd: ilan.il,
        ilceAd: ilan.ilce,
        mahalleAd: ilan.mahalle,
        ilNorm: ilan.il ? normalizeTr(ilan.il) : null,
        ilceNorm: ilan.ilce ? normalizeYerAdi(ilan.ilce) : null,
        mahalleNorm: ilan.mahalle ? normalizeYerAdi(ilan.mahalle) : null,
        imarDurumu: ilan.imarDurumu,
        fiyat: ilan.fiyat,
        m2: ilan.m2,
        fiyatPerM2,
        paraBirimi: ilan.paraBirimi,
        adaNo: ilan.adaNo,
        parselNo: ilan.parselNo,
        zaman: ilan.yakalanmaZamani,
        lat,
        lng,
        koordKaynagi,
        koordDogruluk,
      });
  }, [ilan, ayarlar.ilanGozlemiKaydet]);

  // İl+ilçe biliniyorsa mahalle listesini hemen ön-yükle (dropdown + hızlı kod eşleşmesi)
  useEffect(() => {
    setMahallelerDropdown([]);
    setSecilenMahalleKodu(null);
    setHazirIlceKodu(null);
    setHazirMahalleler(null);
    setMahalleOnerileri([]);
    setMahalleSecimGerekli(false);
    mahalleHazirlikRef.current = null;

    const ilSorgu = yerDuzeltModu && duzeltIl ? duzeltIl : ilan?.il;
    const ilceSorgu = yerDuzeltModu && duzeltIlce ? duzeltIlce : ilan?.ilce;
    if (!ilan || !ilSorgu || !ilceSorgu) return;

    let iptal = false;
    const hazirlik = (async () => {
      const ilceKodu = await ilceKodunuBul(ilSorgu, ilceSorgu);
      if (iptal || !ilceKodu) return;
      const liste = await getMahalleListesi(ilceKodu);
      if (iptal) return;
      liste.sort((a, b) => a.mahalleAdi.localeCompare(b.mahalleAdi, "tr"));
      setHazirIlceKodu(ilceKodu);
      setHazirMahalleler(liste);
      if (!ilan.mahalle || yerDuzeltModu) setMahallelerDropdown(liste);
    })().catch(() => {});
    mahalleHazirlikRef.current = hazirlik;
    return () => {
      iptal = true;
    };
  }, [ilan?.ilanNo, ilan?.il, ilan?.ilce, ilan?.mahalle, yerDuzeltModu, duzeltIl, duzeltIlce]);

  const aciklamaAdaParsel = ilan?.aciklamadaAdaParsel[0];
  const adaCandidate = ilan?.adaNo ?? aciklamaAdaParsel?.ada ?? null;
  const parselCandidate = ilan?.parselNo ?? aciklamaAdaParsel?.parsel ?? null;
  // Ada olmadan sadece parsel no varsa — TKGM ada=0 ile dene
  const adaCandidateEff = adaCandidate ?? (parselCandidate != null ? 0 : null);

  // Otomatik doğrulama — ilan parsel içeriyorsa, mahalle de doluysa
  // ve henüz açık parsel yoksa, kullanıcı tıklamak zorunda kalmadan TKGM'den çekelim.
  const otoDogrulamaTetiklenmisRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ilan) return;
    if (acikParsel) return; // zaten parsel açık, atla
    if (adaCandidateEff == null || parselCandidate == null) return;
    if (!ilan.il || !ilan.ilce) return;
    // Mahalle null ise dropdown ile manuel seçim gerekiyor — oto tetikleme
    if (!ilan.mahalle && !secilenMahalleKodu) return;
    if (dogrulaniyor || dogrulamaHatasi) return;

    const ilanKey = `${ilan.ilanNo ?? ""}/${adaCandidateEff}/${parselCandidate}`;
    if (otoDogrulamaTetiklenmisRef.current === ilanKey) return;
    otoDogrulamaTetiklenmisRef.current = ilanKey;

    const timer = setTimeout(() => {
      void (async () => {
        if (ilan.mahalle && mahalleHazirlikRef.current) {
          await mahalleHazirlikRef.current;
        }
        await dogrula();
      })();
    }, 80);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ilan?.ilanNo, adaCandidate, parselCandidate, acikParsel]);

  // Bölge ortalaması (aynı mahalle / ilçe)
  const bolgeOrtalama = useBolgeOrtalama(ilan);

  // Eşleşme kontrolü (acık parsel varsa)
  const adaEsler =
    acikParsel && adaCandidate != null && acikParsel.adaNo === adaCandidate;
  const parselEsler =
    acikParsel && parselCandidate != null && acikParsel.parselNo === parselCandidate;
  const m2Esler =
    acikParsel && ilan?.m2 != null && acikParsel.alan > 0
      ? Math.abs(acikParsel.alan - ilan.m2) / acikParsel.alan < 0.05
      : null;
  // Hisse tespiti: ilan m²'si parsel alanından belirgin küçükse (< %90), ilan muhtemelen
  // parselin tamamını değil bir HİSSE'sini satıyor. Kullanıcı 800 m² sanıp 4036 m²'lik
  // parselin ~%20'sini alabilir → net uyarı ver.
  const hisseOrani =
    acikParsel && ilan?.m2 != null && ilan.m2 > 0 && acikParsel.alan > 0 &&
    ilan.m2 < acikParsel.alan * 0.9
      ? ilan.m2 / acikParsel.alan
      : null;

  if (!ilan) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2.5 text-xs text-slate-400 dark:text-slate-500 fade-up">
        <div className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800">
          <RadioIcon className="h-3.5 w-3.5" />
        </div>
        <span>
          <a
            href="https://www.sahibinden.com/satilik-arsa"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-500 dark:text-slate-400 hover:text-tkgm-primary transition"
          >
            Sahibinden
          </a>
          {" "}veya{" "}
          <a
            href="https://www.hepsiemlak.com/arsa-satilik"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-slate-500 dark:text-slate-400 hover:text-tkgm-primary transition"
          >
            Hepsiemlak
          </a>
          {" "}ilanı açınca analiz başlar.
        </span>
      </div>
    );
  }
  // Kullanıcı bu ilan için paneli kapattıysa gizle (yeni ilan gelince sıfırlanır)
  if (kapatilanIlanNo && kapatilanIlanNo === (ilan.ilanNo ?? ilan.url)) return null;

  async function dogrula() {
    if (!ilan || adaCandidateEff == null || parselCandidate == null) return;
    setDogrulamaHatasi(null);
    setDogrulaniyor(true);
    setDogrulamaAdimNo(0);

    let mahalleKodu = acikParsel?.mahalleKodu ?? secilenMahalleKodu ?? null;

    try {
      // 1) Mahalle kodu — alias → isim → URL → API → koordinat → öneri
      if (mahalleKodu == null && ilan.il && ilan.ilce) {
        setDogrulamaAdimi("Mahalle kodu çözülüyor…");
        setDogrulamaAdimNo(1);
        const coz = await mahalleKoduCoz({
          ilAd: ilan.il,
          ilceAd: ilan.ilce,
          mahalleAd: ilan.mahalle,
          kaynak: ilan.kaynak,
          url: ilan.url,
          lat: ilan.lat,
          lng: ilan.lng,
          ilceKodu: hazirIlceKodu,
          mahalleler: hazirMahalleler,
          secilenMahalleKodu,
        });
        if (!coz.ok) {
          setMahalleOnerileri(coz.hata.adaylar);
          setMahalleSecimGerekli(true);
          const liste = hazirMahalleler ?? [];
          if (liste.length > 0 && !mahallelerDropdown.length) {
            setMahallelerDropdown(liste);
          }
          throw new Error(coz.hata.mesaj);
        }
        mahalleKodu = coz.sonuc.mahalleKodu;
        setMahalleSecimGerekli(false);
        setMahalleOnerileri([]);
      }
      if (mahalleKodu == null) {
        throw new Error("Mahalle seç — aşağıdaki listeden ilgili mahalleyi seç.");
      }

      // 2) Parsel sorgusu
      setDogrulamaAdimi("Parsel TKGM'den çekiliyor…");
      setDogrulamaAdimNo(2);
      const parsel = await getParselByCodes(
        mahalleKodu,
        adaCandidateEff,
        parselCandidate,
      );

      // 3) Otomatik favori (ayar açıksa)
      if (ayarlar.otomatikFavori) {
        setDogrulamaAdimi("Favorilere ekleniyor…");
        setDogrulamaAdimNo(3);
        const fiyatPerM2 =
          ilan.fiyat != null && ilan.m2 != null && ilan.m2 > 0
            ? Math.round(ilan.fiyat / ilan.m2)
            : null;
        const not =
          [
            ilan.ilanNo ? `İlan #${ilan.ilanNo}` : null,
            fiyatPerM2 != null ? `${fiyatPerM2.toLocaleString("tr-TR")} TL/m²` : null,
            ilan.fiyatStr,
          ]
            .filter(Boolean)
            .join(" · ");

        // Aynı parsel + ilan no zaten varsa dup yapma
        const mevcut = ilan.ilanNo
          ? await db.favoriler
              .where("[adaNo+parselNo]")
              .equals([parsel.adaNo, parsel.parselNo])
              .filter((f) => f.not.includes(`#${ilan.ilanNo}`))
              .first()
          : null;

        if (!mevcut) {
          await db.favoriler.add({
            mahalleKodu: parsel.mahalleKodu ?? mahalleKodu,
            adaNo: parsel.adaNo,
            parselNo: parsel.parselNo,
            ilAd: parsel.ilAd,
            ilceAd: parsel.ilceAd,
            mahalleAd: parsel.mahalleAd,
            not,
            eklenmeTarihi: Date.now(),
            parsel,
          });
        }
      }

      onParselDogrula?.(parsel);
      // Başarı toast — parsel haritada açılacak
      toast.success(
        `${parsel.ilAd ? parsel.ilAd + " · " : ""}Ada ${parsel.adaNo} / Parsel ${parsel.parselNo} doğrulandı`
      );
    } catch (e) {
      const mesaj = e instanceof Error ? e.message : String(e);
      setDogrulamaHatasi(mesaj);
      // Hata toast — "limit doldu" gibi önemli mesajlar için
      if (/limit|günlük|403|503|sunucu/i.test(mesaj)) {
        toast.error(mesaj, 6000);
      }
    } finally {
      setDogrulaniyor(false);
      setDogrulamaAdimi(null);
    }
  }

  const ilanFiyatPerM2 =
    ilan.fiyat != null && ilan.m2 != null && ilan.m2 > 0
      ? Math.round(ilan.fiyat / ilan.m2)
      : null;

  let firsatYuzdesi: number | null = null;
  let firsatRengi = "text-tkgm-muted";
  if (
    ilanFiyatPerM2 != null &&
    bolgeOrtalama &&
    bolgeOrtalama.medyanPerM2 > 0 &&
    bolgeOrtalama.adet >= 3
  ) {
    // Medyan bazlı karşılaştırma — ortalama'dan daha robust (aykırı değerlere dayanıklı)
    firsatYuzdesi = Math.round(
      ((bolgeOrtalama.medyanPerM2 - ilanFiyatPerM2) / bolgeOrtalama.medyanPerM2) * 100,
    );
    if (firsatYuzdesi >= 15) firsatRengi = "text-emerald-700";
    else if (firsatYuzdesi <= -15) firsatRengi = "text-red-700";
    else firsatRengi = "text-amber-700";
  }

  return (
    <Card accent="ilan" variant="elevated" className="text-2xs ilan-karti-enter overflow-hidden">
      {/* ── Hero header — gradient strip ── */}
      <header
        className="relative flex items-center justify-between gap-2 px-3 pt-2.5 pb-2"
        style={{
          background: "linear-gradient(135deg, rgba(234,88,12,0.06) 0%, rgba(249,115,22,0.03) 100%)",
          borderBottom: "1px solid rgba(234,88,12,0.1)",
        }}
      >
        <span className="flex items-center gap-1.5 font-semibold text-accent-ilan">
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="status-live absolute inline-flex h-full w-full rounded-full bg-accent-ilan opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-ilan" />
          </span>
          {ilan.kaynak === "hepsiemlak" ? "Hepsiemlak" : "Sahibinden"}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <a
            href={ilan.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-3xs text-accent-ilan hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
          >
            İlana git
            <ExternalLinkIcon className="h-2.5 w-2.5 ml-0.5" />
          </a>
          <button
            type="button"
            onClick={() => setKapatilanIlanNo(ilan.ilanNo ?? ilan.url)}
            title="Paneli kapat"
            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            aria-label="Paneli kapat"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="space-y-2 px-3 pb-2.5 pt-2">
        {/* Başlık */}
        {ilan.baslik && (
          <div className="line-clamp-2 text-xs font-medium text-slate-800 dark:text-slate-100 leading-snug field-reveal">
            {ilan.baslik}
          </div>
        )}

        {/* Fiyat hero — büyük gösterim */}
        {(ilan.fiyatStr || ilan.m2 != null) && (
          <div className="flex items-end justify-between gap-2 rounded-xl border border-orange-100 dark:border-orange-900/30 bg-orange-50/60 dark:bg-orange-950/20 px-2.5 py-2 field-reveal">
            <div>
              {ilan.fiyatStr && (
                <div className="text-base font-bold text-accent-ilan leading-none metric-value">
                  {ilan.fiyatStr}
                </div>
              )}
              {ilanFiyatPerM2 != null && (
                <div className="text-2xs text-orange-700 dark:text-orange-400 mt-0.5 metric-value">
                  {ilanFiyatPerM2.toLocaleString("tr-TR")} TL/m²
                </div>
              )}
            </div>
            {ilan.m2 != null && (
              <div className="text-right">
                <div className="text-sm font-bold text-slate-700 dark:text-slate-200 leading-none metric-value">
                  {ilan.m2.toLocaleString("tr-TR")}
                  <span className="text-2xs font-normal text-slate-400 ml-0.5">m²</span>
                </div>
                {m2Esler === false && (
                  <div className="text-3xs text-amber-600 mt-0.5">⚠ alan uyuşmuyor</div>
                )}
              </div>
            )}
          </div>
        )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {/* Fiyat/m² artık hero'da — KV'den çıkarıldı */}
        {ilan.m2 == null && ilan.fiyatStr && <KV k="Fiyat" v={ilan.fiyatStr} className="field-reveal" />}
        {ilan.m2 != null && ilan.fiyatStr == null && (
          <KV k="Alan" v={`${ilan.m2.toLocaleString("tr-TR")} m²`} esler={m2Esler ?? undefined} className="field-reveal" />
        )}
        {ilan.il && <KV k="İl" v={ilan.il} className="field-reveal" />}
        {ilan.ilce && <KV k="İlçe" v={ilan.ilce} className="field-reveal" />}
        {ilan.mahalle && <KV k="Mahalle" v={ilan.mahalle} className="field-reveal" />}
        {(ilan.il || ilan.ilce || ilan.mahalle) && !yerDuzeltModu && (
          <div className="col-span-2 text-right">
            <button
              type="button"
              onClick={() => {
                  setYerDuzeltModu(true);
                  setDuzeltIl(ilan.il ?? "");
                  setDuzeltIlce(ilan.ilce ?? "");
                  setDuzeltMahalle(ilan.mahalle ?? "");
                  setDuzeltAda(ilan.adaNo != null ? String(ilan.adaNo) : "");
                  setDuzeltParsel(ilan.parselNo != null ? String(ilan.parselNo) : "");
                }}
              className="text-3xs italic text-slate-500 hover:text-accent-ilan underline"
            >
              Yer yanlış mı? Düzelt →
            </button>
          </div>
        )}
        {yerDuzeltModu && (
          <div className="col-span-2 mt-1 space-y-1.5 rounded-md border border-orange-200 bg-orange-50/60 p-2">
            <div className="text-3xs font-semibold text-slate-700">Yer bilgisini düzelt</div>
            <input
              type="text"
              placeholder="İl (örn: Balıkesir)"
              value={duzeltIl}
              onChange={(e) => setDuzeltIl(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-2xs"
            />
            <input
              type="text"
              placeholder="İlçe (örn: Bandırma)"
              value={duzeltIlce}
              onChange={(e) => setDuzeltIlce(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-2xs"
            />
            {/* Mahalle: il+ilçe biliniyorsa dropdown (TKGM listesi), değilse text input */}
            {duzeltIl && duzeltIlce && mahallelerDropdown.length > 0 ? (
              <select
                value={duzeltMahalle}
                onChange={(e) => setDuzeltMahalle(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-2xs"
              >
                <option value="">— Mahalle seç —</option>
                {mahallelerDropdown.map((m) => (
                  <option key={m.mahalleKodu} value={m.mahalleAdi}>
                    {m.mahalleAdi}
                  </option>
                ))}
              </select>
            ) : duzeltIl && duzeltIlce ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="Mahalle (yükleniyor…)"
                  value={duzeltMahalle}
                  onChange={(e) => setDuzeltMahalle(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-2xs"
                  readOnly
                />
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-orange-300 border-t-orange-600 flex-shrink-0" />
              </div>
            ) : (
              <input
                type="text"
                placeholder="Mahalle (örn: Yalı)"
                value={duzeltMahalle}
                onChange={(e) => setDuzeltMahalle(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-2xs"
              />
            )}
            {/* Ada / Parsel No — açıklamada farklı bilgi varsa veya ada eksikse */}
            <div className="grid grid-cols-2 gap-1">
              <label className="flex flex-col gap-0.5">
                <span className="text-3xs text-slate-500">Ada No <span className="text-slate-400">(opsiyonel)</span></span>
                <input
                  type="number"
                  min="0"
                  placeholder="örn: 116"
                  value={duzeltAda}
                  onChange={(e) => setDuzeltAda(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-2xs"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-3xs text-slate-500">Parsel No</span>
                <input
                  type="number"
                  min="1"
                  placeholder="örn: 977"
                  value={duzeltParsel}
                  onChange={(e) => setDuzeltParsel(e.target.value)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-2xs"
                />
              </label>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  if (!ilan) return;
                  const adaDuzelt = duzeltAda.trim() ? Number(duzeltAda.trim()) : undefined;
                  const parselDuzelt = duzeltParsel.trim() ? Number(duzeltParsel.trim()) : undefined;
                  // İlan'ı override et
                  const yeniIlan: IlanBilgisi = {
                    ...ilan,
                    il: duzeltIl.trim() || ilan.il,
                    ilce: duzeltIlce.trim() || ilan.ilce,
                    mahalle: duzeltMahalle.trim() || ilan.mahalle,
                    ...(adaDuzelt != null && !isNaN(adaDuzelt) ? { adaNo: adaDuzelt } : {}),
                    ...(parselDuzelt != null && !isNaN(parselDuzelt) ? { parselNo: parselDuzelt } : {}),
                    manuelDuzeltildi: true,
                  };
                  setIlan(yeniIlan);
                  // chrome storage'a yaz
                  chrome.storage.session.set({ sonIlan: yeniIlan }).catch(() => {});
                  setYerDuzeltModu(false);
                  // Otomatik doğrulamayı yeniden tetikle
                  otoDogrulamaTetiklenmisRef.current = null;
                }}
                className="flex-1 cursor-pointer rounded bg-accent-ilan px-2 py-1 text-2xs font-medium text-white hover:bg-orange-700"
              >
                Kaydet & yeniden sorgula
              </button>
              <button
                type="button"
                onClick={() => setYerDuzeltModu(false)}
                className="cursor-pointer rounded bg-slate-200 px-2 py-1 text-2xs text-slate-700 hover:bg-slate-300"
              >
                İptal
              </button>
            </div>
            <div className="text-3xs italic text-slate-500">
              Mahalle TKGM'den seçilir. Ada boş bırakılırsa sadece parsel no ile sorgulanır.
            </div>
          </div>
        )}
        {adaCandidate != null && (
          <KV k="Ada" v={String(adaCandidate)} esler={adaEsler ?? undefined} className="field-reveal" />
        )}
        {parselCandidate != null && (
          <KV k="Parsel" v={String(parselCandidate)} esler={parselEsler ?? undefined} className="field-reveal" />
        )}
        {ilanFiyatPerM2 != null && (
          <KV k="TL/m²" v={ilanFiyatPerM2.toLocaleString("tr-TR")} className="field-reveal" />
        )}
      </div>

      {/* Bölge ortalaması — lokal birikim, medyan + tazelik göstergesi */}
      {bolgeOrtalama && bolgeOrtalama.adet >= 2 && (
        <div className="rounded-md border border-slate-200 bg-slate-50/60 p-2">
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <span className="flex items-center gap-1 text-3xs font-semibold uppercase tracking-wide text-slate-600">
              <TargetIcon className="h-3 w-3" />
              {bolgeOrtalama.aralik} ortalaması
            </span>
            {/* Tazelik badge */}
            <span
              className={`text-[9px] font-medium tabular-nums ${
                bolgeOrtalama.ortYasGun <= 30
                  ? "text-emerald-600"
                  : bolgeOrtalama.ortYasGun <= 60
                    ? "text-amber-600"
                    : "text-slate-400"
              }`}
              title={`Ortalama ilan yaşı: ${bolgeOrtalama.ortYasGun} gün`}
            >
              {bolgeOrtalama.ortYasGun <= 30 ? "🟢" : bolgeOrtalama.ortYasGun <= 60 ? "🟡" : "⚪"}
              {" "}{bolgeOrtalama.son30GunAdet > 0 ? `${bolgeOrtalama.son30GunAdet} son 30g` : `~${bolgeOrtalama.ortYasGun}g`}
            </span>
          </div>

          {/* Medyan + ortalama + kayıt sayısı */}
          <div className="mb-1 grid grid-cols-3 gap-1 text-center">
            <div className="rounded bg-white/70 px-1 py-1">
              <div className="text-[9px] uppercase tracking-wide text-slate-400">Medyan</div>
              <div className="text-2xs font-bold tabular-nums text-slate-700">
                {bolgeOrtalama.medyanPerM2.toLocaleString("tr-TR")}
              </div>
              <div className="text-[9px] text-slate-400">TL/m²</div>
            </div>
            <div className="rounded bg-white/70 px-1 py-1">
              <div className="text-[9px] uppercase tracking-wide text-slate-400">Ort.</div>
              <div className="text-2xs font-bold tabular-nums text-slate-700">
                {bolgeOrtalama.ortPerM2.toLocaleString("tr-TR")}
              </div>
              <div className="text-[9px] text-slate-400">TL/m²</div>
            </div>
            <div className="rounded bg-white/70 px-1 py-1">
              <div className="text-[9px] uppercase tracking-wide text-slate-400">Kayıt</div>
              <div className="text-2xs font-bold tabular-nums text-slate-700">
                {bolgeOrtalama.adet}
              </div>
              <div className="text-[9px] text-slate-400">ilan</div>
            </div>
          </div>

          {/* Fırsat / pahalı fark satırı */}
          {firsatYuzdesi != null && (
            <div className={`flex items-center justify-between rounded px-1.5 py-1 text-3xs ${
              firsatYuzdesi >= 15
                ? "bg-emerald-50 text-emerald-700"
                : firsatYuzdesi <= -15
                  ? "bg-red-50 text-red-700"
                  : "bg-amber-50 text-amber-700"
            }`}>
              <span className="flex items-center gap-0.5">
                {firsatYuzdesi > 0 ? (
                  <TrendingDownIcon className="h-3 w-3" />
                ) : (
                  <TrendingUpIcon className="h-3 w-3" />
                )}
                <span className="font-bold tabular-nums">%{Math.abs(firsatYuzdesi)}</span>
                <span className="ml-0.5">
                  {firsatYuzdesi >= 15
                    ? "— fırsat olabilir"
                    : firsatYuzdesi <= -15
                      ? "— pahalı"
                      : "— makul"}
                </span>
              </span>
              <span className="text-[9px] italic opacity-70">medyana göre</span>
            </div>
          )}
        </div>
      )}

      {/* Fiyat karşılaştırma — heuristic vs ilan asking */}
      {acikParsel && ilan.fiyat != null && ilan.m2 != null && (
        <IlanFiyatKarsilastirma parsel={acikParsel} ilan={ilan} />
      )}

      {acikParsel ? (
        <div className="rounded-md border border-slate-200 bg-slate-50/60 p-2">
          <div className="mb-1 text-3xs font-semibold uppercase tracking-wide text-slate-600">
            TKGM ile karşılaştırma
          </div>
          <div className="space-y-0.5">
            {adaCandidate != null && (
              <KarsilastirmaSatir
                ok={adaEsler === true}
                label={`Ada: ilan ${adaCandidate} · TKGM ${acikParsel.adaNo}`}
              />
            )}
            {parselCandidate != null && (
              <KarsilastirmaSatir
                ok={parselEsler === true}
                label={`Parsel: ilan ${parselCandidate} · TKGM ${acikParsel.parselNo}`}
              />
            )}
            {ilan.m2 != null && (
              <KarsilastirmaSatir
                ok={m2Esler === true}
                warn={m2Esler === false}
                label={`m²: ilan ${ilan.m2} · TKGM ${acikParsel.alan}`}
              />
            )}
          </div>
          {hisseOrani != null && (
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-800">
              <div className="mb-0.5 flex items-center gap-1 font-semibold text-amber-900">
                <AlertTriIcon className="h-3.5 w-3.5" /> Hisseli tapu olabilir
              </div>
              İlanda <b>{ilan.m2!.toLocaleString("tr-TR")} m²</b> satılıyor ama parsel{" "}
              <b>{acikParsel.alan.toLocaleString("tr-TR")} m²</b> — yani parselin{" "}
              <b>~%{Math.round(hisseOrani * 100)}</b>'i. Parselin tamamını değil, muhtemelen{" "}
              <b>hisse</b> (pay) alıyorsunuz. Tapu türünü (müstakil / hisseli) mutlaka doğrulayın.
            </div>
          )}
        </div>
      ) : adaCandidate != null && parselCandidate != null ? (
        <div className="space-y-1.5">
          {/* Mahalle dropdown — ilanda yok veya TKGM eşleşmesi başarısız */}
          {mahallelerDropdown.length > 0 &&
            (!ilan.mahalle || mahalleSecimGerekli) && (
            <div className="space-y-1">
              <label className="text-3xs font-medium text-slate-600">
                {mahalleSecimGerekli
                  ? "TKGM mahallesi (Sahibinden adı eşleşmedi — seç):"
                  : "Mahalle (ilanda belirtilmemiş — seç):"}
              </label>
              <select
                value={secilenMahalleKodu ?? ""}
                onChange={(e) => {
                  setSecilenMahalleKodu(e.target.value ? Number(e.target.value) : null);
                  setMahalleSecimGerekli(false);
                  setDogrulamaHatasi(null);
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-2xs text-slate-700 focus:border-accent-ilan focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="">— Mahalle seç —</option>
                {(mahalleOnerileri.length > 0
                  ? mahalleOnerileri.map((o) => o.mahalle)
                  : mahallelerDropdown
                ).map((m) => (
                  <option key={m.mahalleKodu} value={m.mahalleKodu}>
                    {m.mahalleAdi}
                  </option>
                ))}
              </select>
            </div>
          )}
          {dogrulaniyor ? (
            /* Progressive loading — 3 adımlı görsel feedback */
            <div className="space-y-1.5">
              {/* Adım metni */}
              <div className="flex items-center gap-1.5 text-3xs text-slate-600 dark:text-slate-300">
                <svg className="spin-smooth h-3 w-3 flex-shrink-0 text-accent-ilan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
                <span>{dogrulamaAdimi ?? "TKGM'de sorgulanıyor…"}</span>
              </div>
              {/* 3 segmentli progress bar */}
              <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={dogrulamaAdimNo}>
                {[1, 2, 3].map((adim) => (
                  <div
                    key={adim}
                    className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                      adim <= dogrulamaAdimNo
                        ? "bg-accent-ilan"
                        : adim === dogrulamaAdimNo + 1
                          ? "bg-accent-ilan/30 animate-pulse"
                          : "bg-slate-200 dark:bg-slate-700"
                    }`}
                  />
                ))}
              </div>
              {/* Adım etiketleri */}
              <div className="flex justify-between text-[9px] text-slate-400">
                <span className={dogrulamaAdimNo >= 1 ? "text-accent-ilan font-medium" : ""}>Mahalle</span>
                <span className={dogrulamaAdimNo >= 2 ? "text-accent-ilan font-medium" : ""}>TKGM</span>
                <span className={dogrulamaAdimNo >= 3 ? "text-accent-ilan font-medium" : ""}>Tamamla</span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={dogrula}
              disabled={
                (!ilan.mahalle || mahalleSecimGerekli) &&
                !secilenMahalleKodu &&
                mahallelerDropdown.length > 0
              }
              className="btn-tkgm-dogrula w-full cursor-pointer rounded-md bg-accent-ilan px-2 py-1.5 text-2xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              TKGM&apos;de doğrula
            </button>
          )}
          {dogrulamaHatasi && (
            <div className="text-3xs text-accent-danger">{dogrulamaHatasi}</div>
          )}
        </div>
      ) : (
        <div className="flex items-start gap-1 text-3xs italic text-slate-500">
          <AlertTriIcon className="mt-0.5 h-3 w-3 flex-shrink-0" />
          İlanda ada/parsel bilgisi yok — DOM scraper bulamadı veya ilan paylaşmamış.
        </div>
      )}
      </div>
    </Card>
  );
}

function KarsilastirmaSatir({
  ok,
  warn,
  label,
}: {
  ok: boolean;
  warn?: boolean;
  label: string;
}) {
  const Icon = ok ? CheckIcon : warn ? AlertTriIcon : XIcon;
  const color = ok
    ? "text-accent-success"
    : warn
      ? "text-accent-warning"
      : "text-accent-danger";
  return (
    <div className={`flex items-center gap-1.5 text-3xs ${color}`}>
      <Icon className="h-3 w-3 flex-shrink-0" />
      <span>{label}</span>
    </div>
  );
}

interface BolgeOrt {
  aralik: string; // "Mahalle" / "İlçe"
  ortPerM2: number;
  medyanPerM2: number;
  adet: number;
  /** Son 30 gün içindeki ilan sayısı — tazelik göstergesi */
  son30GunAdet: number;
  /** Ortalama ilan yaşı (gün) */
  ortYasGun: number;
}

/**
 * Bölge ortalaması — v14 compound index ile hızlı sorgu.
 *
 * Önce mahalle bazlı [ilceNorm+mahalleNorm] sorgular.
 * Mahalle'de yeterli kayıt yoksa ilçe seviyesine düşer.
 * Full scan YOKTUR — index'li where().equals() kullanılır.
 */
function useBolgeOrtalama(ilan: IlanBilgisi | null): BolgeOrt | null {
  const sorguMahalleNorm = ilan?.mahalle ? normalizeYerAdi(ilan.mahalle) : null;
  const sorguIlceNorm = ilan?.ilce ? normalizeYerAdi(ilan.ilce) : null;

  // Mahalle seviyesi — [ilceNorm+mahalleNorm] compound index (v14)
  const mahalleKayitlar = useLiveQuery(
    async () => {
      if (!sorguIlceNorm || !sorguMahalleNorm) return [];
      return db.ilanGozlem
        .where("[ilceNorm+mahalleNorm]")
        .equals([sorguIlceNorm, sorguMahalleNorm])
        .toArray();
    },
    [sorguIlceNorm, sorguMahalleNorm],
    [],
  );

  // İlçe seviyesi — [ilceNorm+zaman] index, tüm zamanlar
  const ilceKayitlar = useLiveQuery(
    async () => {
      if (!sorguIlceNorm) return [];
      return db.ilanGozlem
        .where("[ilceNorm+zaman]")
        .between([sorguIlceNorm, 0], [sorguIlceNorm, Date.now()])
        .toArray();
    },
    [sorguIlceNorm],
    [],
  );

  return useMemo(() => {
    const mahalleGecerli = (mahalleKayitlar ?? []).filter(
      (k) => k.fiyatPerM2 != null && k.fiyatPerM2 > 0 && k.paraBirimi === "TL",
    );
    const ilceGecerli = (ilceKayitlar ?? []).filter(
      (k) => k.fiyatPerM2 != null && k.fiyatPerM2 > 0 && k.paraBirimi === "TL",
    );

    // Mahalle'de ≥2 kayıt varsa mahalle, yoksa ilçe
    const fiyatlilar = mahalleGecerli.length >= 2 ? mahalleGecerli : ilceGecerli;
    const seviye = mahalleGecerli.length >= 2 ? "Mahalle" : "İlçe";

    if (fiyatlilar.length === 0) return null;

    const fiyatlar = fiyatlilar.map((k) => k.fiyatPerM2!).sort((a, b) => a - b);
    const orta = Math.floor(fiyatlar.length / 2);
    const medyan =
      fiyatlar.length % 2 === 0
        ? Math.round(((fiyatlar[orta - 1] ?? 0) + (fiyatlar[orta] ?? 0)) / 2)
        : Math.round(fiyatlar[orta] ?? 0);
    const ort = Math.round(
      fiyatlar.reduce((s, v) => s + v, 0) / fiyatlar.length,
    );

    const simdi = Date.now();
    const son30gunEsik = simdi - 30 * 24 * 60 * 60 * 1000;
    const son30GunAdet = fiyatlilar.filter((k) => (k.zaman ?? 0) >= son30gunEsik).length;
    const ortYasGun = Math.round(
      fiyatlilar.reduce((s, k) => s + (simdi - (k.zaman ?? simdi)) / 86400000, 0) /
        fiyatlilar.length,
    );

    return {
      aralik: seviye,
      ortPerM2: ort,
      medyanPerM2: medyan,
      adet: fiyatlilar.length,
      son30GunAdet,
      ortYasGun,
    };
  }, [mahalleKayitlar, ilceKayitlar]);
}

function KV({
  k,
  v,
  esler,
  className,
}: {
  k: string;
  v: string;
  esler?: boolean;
  className?: string;
}) {
  const renk =
    esler === true ? "text-emerald-700" : esler === false ? "text-red-700" : "text-tkgm-ink";
  return (
    <div className={`flex justify-between gap-2 text-[11px] ${className ?? ""}`}>
      <span className="text-tkgm-muted">{k}</span>
      <span className={`font-medium ${renk}`}>{v}</span>
    </div>
  );
}
