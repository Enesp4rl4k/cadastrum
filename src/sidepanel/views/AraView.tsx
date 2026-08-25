import { useEffect, useState } from "react";
import {
  getIlListesi,
  getIlceListesi,
  getMahalleListesi,
  getParselByCodes,
} from "../../lib/tkgm-api";
import { db } from "../../lib/db";
import type { Il, Ilce, Mahalle, Parsel } from "../../types/tkgm";
import { nlParse, nlSorguAcikla, type NlSorgu } from "../../lib/nl-sorgu";
import {
  Search as SearchIcon,
  Loader2 as LoaderIcon,
  MessageSquare as ChatIcon,
  ListOrdered as ListIcon,
  MapPin as MapPinIcon,
} from "lucide-react";

import { BACKEND_API as API_BASE } from "../../lib/api-constants";

interface EmsalSonuc {
  fiyat_per_m2: number;
  mesafe_m?: number;
  m2?: number | null;
  mahalle?: string | null;
  imar?: string | null;
  yas_gun?: number;
  /** Koordinat — backend'den geliyorsa harita butonu aktif olur */
  lat?: number | null;
  lng?: number | null;
}

interface Props {
  onResult: (parsel: Parsel) => void;
  /** NL sonucundaki konuma haritada git (parsel olmadan sadece koordinat) */
  onFlyTo?: (lat: number, lng: number) => void;
}

type ModSec = "kadastro" | "nl";

export function AraView({ onResult, onFlyTo }: Props) {
  const [mod, setMod] = useState<ModSec>("kadastro");
  const [iller, setIller] = useState<Il[]>([]);
  const [ilceler, setIlceler] = useState<Ilce[]>([]);
  const [mahalleler, setMahalleler] = useState<Mahalle[]>([]);

  const [ilKodu, setIlKodu] = useState<number | null>(null);
  const [ilceKodu, setIlceKodu] = useState<number | null>(null);
  const [mahalleKodu, setMahalleKodu] = useState<number | null>(null);
  const [adaNo, setAdaNo] = useState("");
  const [parselNo, setParselNo] = useState("");

  const [loadingIller, setLoadingIller] = useState(false);
  const [loadingIlceler, setLoadingIlceler] = useState(false);
  const [loadingMahalleler, setLoadingMahalleler] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingIller(true);
    getIlListesi()
      .then((list) => {
        // Türkçe alfabetik sırala
        list.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
        setIller(list);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingIller(false));
  }, []);

  useEffect(() => {
    setIlceler([]);
    setMahalleler([]);
    setIlceKodu(null);
    setMahalleKodu(null);
    if (ilKodu == null) return;
    setLoadingIlceler(true);
    getIlceListesi(ilKodu)
      .then((list) => {
        list.sort((a, b) => a.ilceAdi.localeCompare(b.ilceAdi, "tr"));
        setIlceler(list);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingIlceler(false));
  }, [ilKodu]);

  useEffect(() => {
    setMahalleler([]);
    setMahalleKodu(null);
    if (ilceKodu == null) return;
    setLoadingMahalleler(true);
    getMahalleListesi(ilceKodu)
      .then((list) => {
        list.sort((a, b) => a.mahalleAdi.localeCompare(b.mahalleAdi, "tr"));
        setMahalleler(list);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingMahalleler(false));
  }, [ilceKodu]);

  async function ara() {
    if (mahalleKodu == null || !adaNo.trim() || !parselNo.trim()) return;
    setError(null);
    setSearching(true);
    try {
      const parsel = await getParselByCodes(
        mahalleKodu,
        Number.parseInt(adaNo, 10),
        Number.parseInt(parselNo, 10),
      );
      await db.gecmis.add({
        lat: parsel.merkezNokta.lat,
        lng: parsel.merkezNokta.lng,
        zaman: Date.now(),
        basarili: true,
        parsel,
      });
      onResult(parsel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSearching(false);
    }
  }

  const aktif =
    mahalleKodu != null &&
    adaNo.trim() !== "" &&
    parselNo.trim() !== "" &&
    !searching;

  // ── NL Arama state ────────────────────────────────────────────────────────
  const [nlMetin, setNlMetin] = useState("");
  const [nlSorgu, setNlSorgu] = useState<NlSorgu | null>(null);
  const [nlArama, setNlArama] = useState(false);
  const [nlSonuclar, setNlSonuclar] = useState<EmsalSonuc[]>([]);
  const [nlHata, setNlHata] = useState<string | null>(null);

  async function nlAra() {
    if (!nlMetin.trim()) return;
    const sorgu = nlParse(nlMetin);
    setNlSorgu(sorgu);
    setNlArama(true);
    setNlHata(null);
    setNlSonuclar([]);

    try {
      // Türkiye 81 il centroid — normalize edilmiş il adı → [lat, lng]
      const IL_CENTROID: Record<string, [number, number]> = {
        adana: [37.00, 35.32], adiyaman: [37.76, 38.28], afyonkarahisar: [38.75, 30.54],
        agri: [39.72, 43.05], aksaray: [38.37, 34.04], amasya: [40.65, 35.83],
        ankara: [39.92, 32.85], antalya: [36.90, 30.70], ardahan: [41.11, 42.70],
        artvin: [41.18, 41.82], aydin: [37.85, 27.85], balikesir: [39.65, 27.88],
        bartin: [41.63, 32.34], batman: [37.88, 41.13], bayburt: [40.26, 40.23],
        bilecik: [40.14, 29.98], bingol: [38.88, 40.50], bitlis: [38.40, 42.11],
        bolu: [40.74, 31.61], burdur: [37.72, 30.29], bursa: [40.19, 29.06],
        canakkale: [40.15, 26.41], cankiri: [40.60, 33.62], corum: [40.55, 34.96],
        denizli: [37.78, 29.09], diyarbakir: [37.91, 40.22], duzce: [40.84, 31.16],
        edirne: [41.68, 26.56], elazig: [38.67, 39.22], erzincan: [39.75, 39.50],
        erzurum: [39.91, 41.27], eskisehir: [39.78, 30.52], gaziantep: [37.07, 37.38],
        giresun: [40.91, 38.39], gumushane: [40.46, 39.48], hakkari: [37.58, 43.74],
        hatay: [36.60, 36.16], igdir: [39.92, 44.05], isparta: [37.76, 30.55],
        istanbul: [41.01, 28.95], izmir: [38.42, 27.14], kahramanmaras: [37.59, 36.94],
        karabuk: [41.20, 32.63], karaman: [37.18, 33.22], kars: [40.61, 43.10],
        kastamonu: [41.38, 33.78], kayseri: [38.73, 35.49], kilis: [36.71, 37.12],
        kirikkale: [39.84, 33.51], kirklareli: [41.74, 27.22], kirsehir: [39.15, 34.17],
        kocaeli: [40.85, 29.88], konya: [37.87, 32.49], kutahya: [39.42, 29.99],
        malatya: [38.35, 38.31], manisa: [38.62, 27.43], mardin: [37.31, 40.74],
        mersin: [36.80, 34.64], mugla: [37.21, 28.37], mus: [38.74, 41.49],
        nevsehir: [38.62, 34.72], nigde: [37.97, 34.68], ordu: [40.98, 37.88],
        osmaniye: [37.07, 36.25], rize: [41.02, 40.52], sakarya: [40.69, 30.43],
        samsun: [41.28, 36.33], sanliurfa: [37.16, 38.80], siirt: [37.93, 41.95],
        sinop: [42.02, 35.15], sirnak: [37.52, 42.46], sivas: [39.75, 37.02],
        tekirdag: [41.00, 27.51], tokat: [40.31, 36.55], trabzon: [40.99, 39.73],
        tunceli: [39.11, 39.55], usak: [38.67, 29.41], van: [38.50, 43.38],
        yalova: [40.65, 29.27], yozgat: [39.82, 34.81], zonguldak: [41.46, 31.80],
      };

      // Koordinat: ilçe varsa il centroid yeterli (radius bunu karşılar)
      // İl bulunamazsa Türkiye merkezi
      let lat = 39.0, lng = 35.0;
      let radiusKm = 50; // varsayılan — il seçilmemişse geniş tut

      if (sorgu.ilNorm) {
        const c = IL_CENTROID[sorgu.ilNorm];
        if (c) { lat = c[0]; lng = c[1]; }
        // İl seçildiyse daha dar
        radiusKm = sorgu.ilceNorm ? 20 : 40;
      }

      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        radius_km: String(radiusKm),
        kategori: sorgu.kategori ?? "arsa",
      });

      if (sorgu.minM2)   params.set("min_m2",  String(sorgu.minM2));
      if (sorgu.maksM2)  params.set("max_m2",  String(sorgu.maksM2));

      const res = await fetch(`${API_BASE}/emsal/spatial?${params.toString()}`, {
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { emsaller?: EmsalSonuc[] };
      let emsaller = data.emsaller ?? [];

      // Client-side fiyat filtresi (API'de fiyat filtresi yok)
      if (sorgu.maksFiyat) {
        emsaller = emsaller.filter(
          (e) => e.fiyat_per_m2 * (e.m2 ?? 500) <= sorgu.maksFiyat!
        );
      }
      if (sorgu.minFiyat) {
        emsaller = emsaller.filter(
          (e) => e.fiyat_per_m2 * (e.m2 ?? 500) >= sorgu.minFiyat!
        );
      }

      setNlSonuclar(emsaller.slice(0, 15));
      if (emsaller.length === 0) {
        setNlHata(
          sorgu.ilNorm
            ? `${sorgu.ilNorm} için emsal bulunamadı. Arama alanını genişletin veya farklı kriterler deneyin.`
            : "Emsal bulunamadı. Bir il adı ekleyerek arama yapın."
        );
      }
    } catch (e) {
      setNlHata(e instanceof Error ? e.message : "Arama başarısız");
    } finally {
      setNlArama(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-0 overflow-hidden text-xs">
      {/* ── Mod seçici ──────────────────────────────────────────────────────── */}
      <div className="flex border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setMod("kadastro")}
          className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition ${
            mod === "kadastro"
              ? "border-b-2 border-blue-600 text-blue-700 dark:text-blue-400"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
          }`}
        >
          <ListIcon className="h-3.5 w-3.5" />
          Kadastro
        </button>
        <button
          type="button"
          onClick={() => setMod("nl")}
          className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition ${
            mod === "nl"
              ? "border-b-2 border-blue-600 text-blue-700 dark:text-blue-400"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
          }`}
        >
          <ChatIcon className="h-3.5 w-3.5" />
          Doğal Dil
        </button>
      </div>

      {/* ── NL Arama modu ───────────────────────────────────────────────────── */}
      {mod === "nl" && (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
            <p className="text-[11px] text-blue-700 dark:text-blue-300">
              <strong>Doğal dil ile ara:</strong> "İstanbul Beykoz imarlı 1000m² üstü 5M altı arsa" gibi yazın.
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={nlMetin}
              onChange={(e) => setNlMetin(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void nlAra(); }}
              placeholder="örn. Ankara Çankaya 500m² imarlı arsa"
              className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-xs focus:border-blue-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800"
            />
            <button
              type="button"
              onClick={() => void nlAra()}
              disabled={!nlMetin.trim() || nlArama}
              className="flex h-8 w-8 items-center justify-center rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300 transition"
              aria-label="Ara"
            >
              {nlArama
                ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
                : <SearchIcon className="h-3.5 w-3.5" />
              }
            </button>
          </div>

          {/* Parse özeti */}
          {nlSorgu && (
            <div className="flex flex-wrap gap-1">
              {nlSorguAcikla(nlSorgu).map((parcaSorgu, i) => (
                <span
                  key={i}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                >
                  {parcaSorgu}
                </span>
              ))}
            </div>
          )}

          {nlHata && (
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/20">
              {nlHata}
            </div>
          )}

          {/* Modifier özeti — hangi nitelikler tespit edildi */}
          {nlSorgu && (() => {
            const modlar: string[] = [];
            if (nlSorgu.imarli)       modlar.push("✅ İmarlı");
            if (nlSorgu.yuksekImar)   modlar.push("🏗 Yüksek imar");
            if (nlSorgu.yolaCephe)    modlar.push("🛣 Yola cephe");
            if (nlSorgu.duzArazi)     modlar.push("⬜ Düz arazi");
            if (nlSorgu.sahilYakini)  modlar.push("🌊 Sahil yakını");
            if (nlSorgu.manzarali)    modlar.push("🏔 Manzaralı");
            if (nlSorgu.kisitsiz)     modlar.push("✅ Kısıtsız");
            if (nlSorgu.mustakilTapu) modlar.push("📜 Müstakil tapu");
            if (nlSorgu.altyapiMevcut)modlar.push("⚡ Altyapı");
            if (nlSorgu.kiraGetirisi) modlar.push("💵 Kira getirisi");
            if (nlSorgu.aceleSatis)   modlar.push("⚡ Acil satış");
            if (modlar.length === 0) return null;
            return (
              <div className="rounded border border-amber-100 bg-amber-50 p-2 dark:border-amber-900/40 dark:bg-amber-950/20">
                <p className="mb-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                  Bu nitelikler client-side gösterim amaçlıdır, backend filtresi yok:
                </p>
                <div className="flex flex-wrap gap-1">
                  {modlar.map((m) => (
                    <span key={m} className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Emsal sonuçları */}
          {nlSonuclar.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-semibold text-slate-600 dark:text-slate-300">
                {nlSonuclar.length} emsal bulundu
              </p>
              {nlSonuclar.map((e: EmsalSonuc, i: number) => {
                const tahminiToplam = e.fiyat_per_m2 * (e.m2 ?? 500);
                const yasGun = e.yas_gun;
                const yasLabel = yasGun == null ? null
                  : yasGun < 30 ? "taze"
                  : yasGun < 90 ? `${Math.round(yasGun / 30)} ay`
                  : `${Math.round(yasGun / 30)} ay`;
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800"
                  >
                    {/* Fiyat satırı */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                        {e.fiyat_per_m2.toLocaleString("tr-TR")} TL/m²
                      </span>
                      <div className="flex items-center gap-1.5">
                        {e.mesafe_m != null && (
                          <span className="text-[10px] text-slate-400">
                            {e.mesafe_m < 1000
                              ? `${Math.round(e.mesafe_m)} m`
                              : `${(e.mesafe_m / 1000).toFixed(1)} km`}
                          </span>
                        )}
                        {/* Haritada Göster — koordinat varsa */}
                        {e.lat != null && e.lng != null && onFlyTo && (
                          <button
                            type="button"
                            onClick={() => onFlyTo(e.lat!, e.lng!)}
                            title="Haritada göster"
                            className="flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/40 transition-colors"
                            aria-label="Bu konumu haritada göster"
                          >
                            <MapPinIcon className="h-2.5 w-2.5" aria-hidden="true" />
                            Harita
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Toplam tahmini fiyat */}
                    {e.m2 && (
                      <div className="mt-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                        ≈ {tahminiToplam >= 1_000_000
                          ? `${(tahminiToplam / 1_000_000).toFixed(2)} M ₺`
                          : `${(tahminiToplam / 1_000).toFixed(0)} K ₺`}
                      </div>
                    )}
                    {/* Alt detay satırı */}
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                      {e.mahalle && <span>{e.mahalle}</span>}
                      {e.m2 && <span>· {e.m2.toLocaleString("tr-TR")} m²</span>}
                      {e.imar && <span className="text-slate-400">· {e.imar}</span>}
                      {yasLabel && <span className="text-slate-400">· {yasLabel}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Kadastro modu ───────────────────────────────────────────────────── */}
      {mod === "kadastro" && (
      <div className="flex flex-col gap-3 overflow-y-auto p-4">
      <Field label="İl">
        <select
          value={ilKodu ?? ""}
          onChange={(e) =>
            setIlKodu(e.target.value ? Number(e.target.value) : null)
          }
          disabled={loadingIller}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5"
        >
          <option value="">
            {loadingIller ? "Yükleniyor…" : "İl seç"}
          </option>
          {iller.map((il) => (
            <option key={il.kod} value={il.kod}>
              {il.ad}
            </option>
          ))}
        </select>
      </Field>

      <Field label="İlçe">
        <select
          value={ilceKodu ?? ""}
          onChange={(e) =>
            setIlceKodu(e.target.value ? Number(e.target.value) : null)
          }
          disabled={ilKodu == null || loadingIlceler}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 disabled:bg-slate-100"
        >
          <option value="">
            {loadingIlceler
              ? "Yükleniyor…"
              : ilKodu == null
                ? "Önce il seç"
                : "İlçe seç"}
          </option>
          {ilceler.map((ilce) => (
            <option key={ilce.ilceKodu} value={ilce.ilceKodu}>
              {ilce.ilceAdi}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Mahalle">
        <select
          value={mahalleKodu ?? ""}
          onChange={(e) =>
            setMahalleKodu(e.target.value ? Number(e.target.value) : null)
          }
          disabled={ilceKodu == null || loadingMahalleler}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 disabled:bg-slate-100"
        >
          <option value="">
            {loadingMahalleler
              ? "Yükleniyor…"
              : ilceKodu == null
                ? "Önce ilçe seç"
                : "Mahalle seç"}
          </option>
          {mahalleler.map((m) => (
            <option key={m.mahalleKodu} value={m.mahalleKodu}>
              {m.mahalleAdi}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Ada No">
          <input
            type="text"
            inputMode="numeric"
            value={adaNo}
            onChange={(e) => setAdaNo(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="örn. 1234"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5"
          />
        </Field>
        <Field label="Parsel No">
          <input
            type="text"
            inputMode="numeric"
            value={parselNo}
            onChange={(e) => setParselNo(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="örn. 5"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5"
          />
        </Field>
      </div>

      <button
        type="button"
        onClick={ara}
        disabled={!aktif}
        className="rounded bg-tkgm-primary py-2 font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
      >
        {searching ? "Sorgulanıyor…" : "Sorgula"}
      </button>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-red-700">
          {error}
        </div>
      )}

      <p className="mt-2 text-[11px] text-tkgm-muted">
        Bulunan parsel otomatik olarak harita sekmesine geçecek ve gösterilecek.
      </p>
      </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-medium text-tkgm-muted">{label}</span>
      {children}
    </label>
  );
}
