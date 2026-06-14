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
import { db } from "../../lib/db";
import { getMahalleMerkez } from "../../lib/data/mahalle-merkezleri";
import { useAyarlar } from "../../lib/ayarlar";
import { Card } from "../ui/Card";
import { IlanFiyatKarsilastirma } from "./IlanFiyatKarsilastirma";

interface Props {
  acikParsel?: Parsel | null;
  onParselDogrula?: (parsel: Parsel) => void;
}

// Browser preview'da chrome global yok — IlanKarti tamamen no-op olsun.
// Production extension'da chrome her zaman var, bu kontrol false olur.
const HAS_CHROME =
  typeof chrome !== "undefined" && !!chrome?.storage?.local;

export function IlanKarti(props: Props) {
  if (!HAS_CHROME) return null;
  return <IlanKartiInternal {...props} />;
}

function IlanKartiInternal({ acikParsel, onParselDogrula }: Props) {
  const [ilan, setIlan] = useState<IlanBilgisi | null>(null);
  const [dogrulaniyor, setDogrulaniyor] = useState(false);
  const [dogrulamaHatasi, setDogrulamaHatasi] = useState<string | null>(null);
  const [dogrulamaAdimi, setDogrulamaAdimi] = useState<string | null>(null);
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

        db.ilanGozlem
          .put({
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
          })
          .catch(() => {});
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
        ? ilan.fiyat / ilan.m2
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

    db.ilanGozlem
      .put({
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
      })
      .catch((e) => console.warn("[arsa] ilanGozlem put hatası:", e?.name, e?.message ?? e));
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

  // Otomatik doğrulama — ilan ada/parsel içeriyorsa, mahalle de doluysa
  // ve henüz açık parsel yoksa, kullanıcı tıklamak zorunda kalmadan TKGM'den çekelim.
  const otoDogrulamaTetiklenmisRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ilan) return;
    if (acikParsel) return; // zaten parsel açık, atla
    if (adaCandidate == null || parselCandidate == null) return;
    if (!ilan.il || !ilan.ilce) return;
    // Mahalle null ise dropdown ile manuel seçim gerekiyor — oto tetikleme
    if (!ilan.mahalle && !secilenMahalleKodu) return;
    if (dogrulaniyor || dogrulamaHatasi) return;

    const ilanKey = `${ilan.ilanNo ?? ""}/${adaCandidate}/${parselCandidate}`;
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

  if (!ilan) return null;
  // Kullanıcı bu ilan için paneli kapattıysa gizle (yeni ilan gelince sıfırlanır)
  if (kapatilanIlanNo && kapatilanIlanNo === (ilan.ilanNo ?? ilan.url)) return null;

  async function dogrula() {
    if (!ilan || adaCandidate == null || parselCandidate == null) return;
    setDogrulamaHatasi(null);
    setDogrulaniyor(true);

    let mahalleKodu = acikParsel?.mahalleKodu ?? secilenMahalleKodu ?? null;

    try {
      // 1) Mahalle kodu — alias → isim → URL → API → koordinat → öneri
      if (mahalleKodu == null && ilan.il && ilan.ilce) {
        setDogrulamaAdimi("Mahalle kodu çözülüyor…");
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
      const parsel = await getParselByCodes(
        mahalleKodu,
        adaCandidate,
        parselCandidate,
      );

      // 3) Otomatik favori (ayar açıksa)
      if (ayarlar.otomatikFavori) {
        setDogrulamaAdimi("Favorilere ekleniyor…");
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
    } catch (e) {
      setDogrulamaHatasi(e instanceof Error ? e.message : String(e));
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
    bolgeOrtalama.ortPerM2 > 0 &&
    bolgeOrtalama.adet >= 3
  ) {
    firsatYuzdesi = Math.round(
      ((bolgeOrtalama.ortPerM2 - ilanFiyatPerM2) / bolgeOrtalama.ortPerM2) * 100,
    );
    if (firsatYuzdesi >= 15) firsatRengi = "text-emerald-700";
    else if (firsatYuzdesi <= -15) firsatRengi = "text-red-700";
    else firsatRengi = "text-amber-700";
  }

  return (
    <Card accent="ilan" className="text-2xs">
      <header className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
        <span className="flex items-center gap-1.5 font-semibold text-accent-ilan">
          <RadioIcon className="h-3.5 w-3.5" />
          {ilan.kaynak === "hepsiemlak" ? "Hepsiemlak" : "Sahibinden"} ilanı tespit edildi
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href={ilan.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-3xs text-accent-ilan hover:underline"
          >
            ilana git
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
          <button
            type="button"
            onClick={() => setKapatilanIlanNo(ilan.ilanNo ?? ilan.url)}
            title="Paneli kapat (yeni ilan tespit edilince tekrar açılır)"
            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            aria-label="Paneli kapat"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
      <div className="space-y-2 px-3 pb-2.5">
        <div className="hidden">{/* placeholder marker for future inserts */}</div>
      {ilan.baslik && (
        <div className="mb-1 line-clamp-2 font-medium text-tkgm-ink">
          {ilan.baslik}
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {ilan.fiyatStr && <KV k="Fiyat" v={ilan.fiyatStr} />}
        {ilan.m2 != null && (
          <KV k="Alan" v={`${ilan.m2.toLocaleString("tr-TR")} m²`} esler={m2Esler ?? undefined} />
        )}
        {ilan.il && <KV k="İl" v={ilan.il} />}
        {ilan.ilce && <KV k="İlçe" v={ilan.ilce} />}
        {ilan.mahalle && <KV k="Mahalle" v={ilan.mahalle} />}
        {(ilan.il || ilan.ilce || ilan.mahalle) && !yerDuzeltModu && (
          <div className="col-span-2 text-right">
            <button
              type="button"
              onClick={() => {
                setYerDuzeltModu(true);
                setDuzeltIl(ilan.il ?? "");
                setDuzeltIlce(ilan.ilce ?? "");
                setDuzeltMahalle(ilan.mahalle ?? "");
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
            {/* Mahalle: il+ilçe biliniyorsa dropdown, değilse text input */}
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
            ) : (
              <input
                type="text"
                placeholder="Mahalle (örn: Yalı)"
                value={duzeltMahalle}
                onChange={(e) => setDuzeltMahalle(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-2xs"
              />
            )}
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  if (!ilan) return;
                  // İlan'ı override et
                  const yeniIlan: IlanBilgisi = {
                    ...ilan,
                    il: duzeltIl.trim() || ilan.il,
                    ilce: duzeltIlce.trim() || ilan.ilce,
                    mahalle: duzeltMahalle.trim() || ilan.mahalle,
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
              Düzeltme TKGM sorgusunu yeniden başlatır + bulut emsal verisini doğru mahalleden çeker.
            </div>
          </div>
        )}
        {adaCandidate != null && (
          <KV k="Ada" v={String(adaCandidate)} esler={adaEsler ?? undefined} />
        )}
        {parselCandidate != null && (
          <KV k="Parsel" v={String(parselCandidate)} esler={parselEsler ?? undefined} />
        )}
        {ilanFiyatPerM2 != null && (
          <KV k="TL/m²" v={ilanFiyatPerM2.toLocaleString("tr-TR")} />
        )}
      </div>

      {/* Bölge ortalaması — lokal Fırsat puanı */}
      {bolgeOrtalama && bolgeOrtalama.adet >= 2 && (
        <div className="rounded-md border border-slate-200 bg-slate-50/60 p-2">
          <div className="mb-1 flex items-center gap-1 text-3xs font-semibold uppercase tracking-wide text-slate-600">
            <TargetIcon className="h-3 w-3" />
            Bölge ortalaması (lokal birikim)
          </div>
          <div className="grid grid-cols-2 gap-x-3 text-3xs">
            <div className="flex justify-between">
              <span className="text-slate-500">
                {bolgeOrtalama.aralik} · n={bolgeOrtalama.adet}
              </span>
              <span className="font-medium tabular-nums text-slate-700">
                {bolgeOrtalama.ortPerM2.toLocaleString("tr-TR")} TL/m²
              </span>
            </div>
            {firsatYuzdesi != null && (
              <div className="flex justify-between">
                <span className="text-slate-500">Fark</span>
                <span className={`flex items-center gap-0.5 font-bold tabular-nums ${firsatRengi}`}>
                  {firsatYuzdesi > 0 ? (
                    <TrendingDownIcon className="h-3 w-3" />
                  ) : (
                    <TrendingUpIcon className="h-3 w-3" />
                  )}
                  %{Math.abs(firsatYuzdesi)}
                </span>
              </div>
            )}
          </div>
          {firsatYuzdesi != null && (
            <div className={`mt-1 text-3xs italic ${firsatRengi}`}>
              {firsatYuzdesi >= 15
                ? "Bölge ortalamasının altında — fırsat olabilir."
                : firsatYuzdesi <= -15
                  ? "Bölge ortalamasının üstünde — pahalı."
                  : "Bölge ortalamasıyla uyumlu."}
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
          <button
            type="button"
            onClick={dogrula}
            disabled={
              dogrulaniyor ||
              ((!ilan.mahalle || mahalleSecimGerekli) &&
                !secilenMahalleKodu &&
                mahallelerDropdown.length > 0)
            }
            className="w-full cursor-pointer rounded-md bg-accent-ilan px-2 py-1.5 text-2xs font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dogrulaniyor
              ? (dogrulamaAdimi ?? "TKGM'de sorgulanıyor…")
              : "TKGM'de doğrula"}
          </button>
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
  aralik: string; // "Bu mahallede" / "Bu ilçede"
  ortPerM2: number;
  adet: number;
}

function useBolgeOrtalama(ilan: IlanBilgisi | null): BolgeOrt | null {
  const sorguMahalle = ilan?.mahalle ?? null;
  const sorguIlce = ilan?.ilce ?? null;
  const sorguMahalleNorm = sorguMahalle ? normalizeYerAdi(sorguMahalle) : null;
  const sorguIlceNorm = sorguIlce ? normalizeYerAdi(sorguIlce) : null;

  const mahalleKayitlar = useLiveQuery(
    async () => {
      if (!sorguMahalleNorm) return [];
      const tumKayitlar = await db.ilanGozlem.toArray();
      return tumKayitlar.filter((k) => {
        const mahalleNorm = k.mahalleNorm ?? (k.mahalleAd ? normalizeYerAdi(k.mahalleAd) : null);
        return mahalleNorm === sorguMahalleNorm;
      });
    },
    [sorguMahalleNorm],
  );

  const ilceKayitlar = useLiveQuery(
    async () => {
      if (!sorguIlceNorm) return [];
      const tumKayitlar = await db.ilanGozlem.toArray();
      return tumKayitlar.filter((k) => {
        const ilceNorm = k.ilceNorm ?? (k.ilceAd ? normalizeYerAdi(k.ilceAd) : null);
        return ilceNorm === sorguIlceNorm;
      });
    },
    [sorguIlceNorm],
  );

  return useMemo(() => {
    const aday = (mahalleKayitlar?.length ?? 0) >= 2 ? mahalleKayitlar : ilceKayitlar;
    const arali =
      (mahalleKayitlar?.length ?? 0) >= 2 ? "Mahalle" : "İlçe";
    const fiyatlilar = (aday ?? []).filter(
      (k) => k.fiyatPerM2 != null && k.fiyatPerM2 > 0 && k.paraBirimi === "TL",
    );
    if (fiyatlilar.length === 0) return null;
    const ort =
      fiyatlilar.reduce((s, k) => s + (k.fiyatPerM2 ?? 0), 0) /
      fiyatlilar.length;
    return {
      aralik: arali,
      ortPerM2: Math.round(ort),
      adet: fiyatlilar.length,
    };
  }, [mahalleKayitlar, ilceKayitlar]);
}

function KV({
  k,
  v,
  esler,
}: {
  k: string;
  v: string;
  esler?: boolean;
}) {
  const renk =
    esler === true ? "text-emerald-700" : esler === false ? "text-red-700" : "text-tkgm-ink";
  return (
    <div className="flex justify-between gap-2 text-[11px]">
      <span className="text-tkgm-muted">{k}</span>
      <span className={`font-medium ${renk}`}>{v}</span>
    </div>
  );
}
