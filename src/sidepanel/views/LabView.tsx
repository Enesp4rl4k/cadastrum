import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import {
  type AnalizNoktasi,
  type AnalizTip,
  ANALIZ_TIPI_ETIKETLERI,
  YIL_SECENEKLERI,
  prefetchAnalizSerisi,
  tkgmAnalizGetir,
} from "../../lib/tkgm-analiz";
import { compactSayi } from "../../lib/viz";
import {
  HEAT_TIP_RENKLERI as TIP_RENKLERI,
  applyHeatmap,
} from "./heatmap-layer";
import { AnalizTrend } from "../components/AnalizTrend";
import { KarsilastirmaPanel } from "../components/KarsilastirmaPanel";
import { IlceSecici } from "../components/IlceSecici";
import {
  getParselByLatLng,
  getMahalleGeometrileri,
  noktaPoligonIcinde,
  normalizeYerAdi,
  type MahalleGeometri,
} from "../../lib/tkgm-api";
import { db } from "../../lib/db";
import type { Parsel } from "../../types/tkgm";
import { BasemapSecici } from "../components/BasemapSecici";
import {
  type BasemapId,
  getBasemap,
  loadSavedBasemap,
  saveBasemap,
} from "../../lib/basemaps";

interface Props {
  /** Side panel'dan ön-yüklenmiş ilçe (parsel açıkken) */
  initialIlceKodu?: number | null;
  initialIlceAd?: string | null;
  /** Top 10 hotspot'ta bir parsele tıklanınca side panel'a aktar */
  onParselSec?: (parsel: Parsel) => void;
}

export function LabView({ initialIlceKodu, initialIlceAd, onParselSec }: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const noktalarRef = useRef<AnalizNoktasi[]>([]);
  // Standalone — kullanıcı seçici ile değiştirebilsin (initial varsa onu kullan)
  const [ilceKodu, setIlceKodu] = useState<number | null>(initialIlceKodu ?? null);
  const [ilceAd, setIlceAd] = useState<string | null>(initialIlceAd ?? null);
  // Initial prop değişirse state'i güncelle
  useEffect(() => {
    if (initialIlceKodu != null) {
      setIlceKodu(initialIlceKodu);
      setIlceAd(initialIlceAd ?? `İlçe ${initialIlceKodu}`);
    }
  }, [initialIlceKodu, initialIlceAd]);
  const [analizTip, setAnalizTip] = useState<AnalizTip>(1);
  const [yil, setYil] = useState<number>(YIL_SECENEKLERI[3] ?? 2020);
  const [noktalar, setNoktalar] = useState<AnalizNoktasi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oynatiliyor, setOynatiliyor] = useState(false);
  const [hotspotAciliyor, setHotspotAciliyor] = useState<number | null>(null);
  const [basemap, setBasemap] = useState<BasemapId>(() => loadSavedBasemap());
  const [mahalleler, setMahalleler] = useState<MahalleGeometri[]>([]);
  const [secilenMahalleKodu, setSecilenMahalleKodu] = useState<number | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const playRef = useRef<number | null>(null);
  const yilRef = useRef(yil);
  yilRef.current = yil;
  noktalarRef.current = noktalar;

  // Bölgedeki sahibinden gözlem sayısı (TKGM × ilan join için)
  const ilanIlceSayisi = useLiveIlanSayisi(ilceAd);

  // Init map
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: getBasemap(basemap).style,
      center: [35.0, 39.0],
      zoom: 5.5,
    });
    mapRef.current = map;
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(mapEl.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Basemap swap + heatmap'i yeniden çiz (ilk render'da skip)
  const oncekiBasemap = useRef(basemap);
  useEffect(() => {
    if (oncekiBasemap.current === basemap) return;
    oncekiBasemap.current = basemap;
    const map = mapRef.current;
    if (!map) return;
    saveBasemap(basemap);
    map.setStyle(getBasemap(basemap).style);
    map.once("styledata", () => {
      if (noktalarRef.current.length > 0)
        applyHeatmap(map, noktalarRef.current, analizTip, { fitBounds: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  // İlçe değişince mahalle listesini çek (geometry ile birlikte)
  useEffect(() => {
    if (ilceKodu == null) {
      setMahalleler([]);
      setSecilenMahalleKodu(null);
      return;
    }
    getMahalleGeometrileri(ilceKodu)
      .then((list) => {
        list.sort((a, b) => a.mahalleAdi.localeCompare(b.mahalleAdi, "tr"));
        setMahalleler(list);
        setSecilenMahalleKodu(null);
      })
      .catch(() => {});
  }, [ilceKodu]);

  // Analiz tip / yıl / ilçe değişince noktaları çek + haritaya yansıt.
  // Prefetch (25 sorgu) kaldırıldı — çok pahalı, TKGM günlük limit hızlı dolar.
  // Yıl scrubber'ı oynattıkça lazy load + cache yardım eder.
  useEffect(() => {
    if (ilceKodu == null) return;
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setLoading(true);
    setError(null);
    console.log("[arsa-lab] sorgu →", { ilceKodu, ilceAd, analizTip, yil });
    tkgmAnalizGetir({ ilceKodu, analizTip, yil }, ctrl.signal)
      .then((data) => {
        if (ctrl.signal.aborted) return;
        console.log("[arsa-lab] sorgu ←", data.length, "nokta");
        setNoktalar(data);
        applyHeatmap(mapRef.current, data, analizTip, { fitBounds: true });
        // İlk yüklemede haritayı bbox'a uçur (tüm ilçe)
        if (data.length > 0 && mapRef.current) {
          const lats = data.map((n) => n.enlem);
          const lngs = data.map((n) => n.boylam);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);
          mapRef.current.fitBounds(
            [
              [minLng, minLat],
              [maxLng, maxLat],
            ],
            { padding: 30, maxZoom: 14, duration: 800 },
          );
        }
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[arsa-lab] hata:", msg);
        setError(msg);
        setNoktalar([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [ilceKodu, analizTip, yil]);

  const noktalarFiltered = useMemo(() => {
    if (!secilenMahalleKodu) return noktalar;
    const m = mahalleler.find((x) => x.mahalleKodu === secilenMahalleKodu);
    if (!m?.polygon) return noktalar;
    return noktalar.filter((n) => noktaPoligonIcinde(n.enlem, n.boylam, m.polygon!));
  }, [noktalar, secilenMahalleKodu, mahalleler]);

  const ozet = useMemo(() => {
    if (noktalarFiltered.length === 0)
      return { toplam: 0, ort: 0, max: 0, parsel: 0 };
    const toplam = noktalarFiltered.reduce((s, n) => s + n.sayi, 0);
    return {
      toplam,
      parsel: noktalarFiltered.length,
      ort: Math.round((toplam / noktalarFiltered.length) * 10) / 10,
      max: Math.max(...noktalarFiltered.map((n) => n.sayi)),
    };
  }, [noktalarFiltered]);

  const top10 = useMemo(
    () => [...noktalarFiltered].sort((a, b) => b.sayi - a.sayi).slice(0, 10),
    [noktalarFiltered],
  );

  // Mahalle filtresi değişince heatmap'i yeniden uygula
  useEffect(() => {
    if (noktalar.length === 0) return;
    applyHeatmap(mapRef.current, noktalarFiltered, analizTip, { fitBounds: true });
    // Filtrelenmiş noktalar için fitBounds
    if (noktalarFiltered.length > 0 && mapRef.current) {
      const lats = noktalarFiltered.map((n) => n.enlem);
      const lngs = noktalarFiltered.map((n) => n.boylam);
      try {
        mapRef.current.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 40, maxZoom: 15, duration: 600 },
        );
      } catch {
        mapRef.current.flyTo({ center: [lngs[0]!, lats[0]!], zoom: 14 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secilenMahalleKodu, noktalarFiltered]);

  // Yıl playback — ▶ basınca her 1.2sn'de yıl artar, sonuna gelince durur
  function oynatmayiBaslat() {
    if (oynatiliyor) {
      durdur();
      return;
    }
    setOynatiliyor(true);
    const minYil = Math.min(...YIL_SECENEKLERI);
    const maxYil = Math.max(...YIL_SECENEKLERI);
    if (yilRef.current >= maxYil) setYil(minYil);
    playRef.current = window.setInterval(() => {
      const next = yilRef.current + 1;
      if (next > maxYil) {
        durdur();
        return;
      }
      setYil(next);
    }, 1200);
  }
  function durdur() {
    if (playRef.current != null) clearInterval(playRef.current);
    playRef.current = null;
    setOynatiliyor(false);
  }
  useEffect(() => () => durdur(), []);

  async function hotspotAc(n: AnalizNoktasi) {
    setHotspotAciliyor(n.parselId);
    try {
      const parsel = await getParselByLatLng(n.enlem, n.boylam);
      onParselSec?.(parsel);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setHotspotAciliyor(null);
    }
  }

  if (ilceKodu == null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="text-3xl">🔬</div>
        <div className="max-w-[280px]">
          <strong className="text-sm text-slate-800 dark:text-slate-100">
            Analiz Lab
          </strong>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Doğrudan bir ilçe seç, TKGM resmi alım-satım yoğunluk verilerini
            ekrana getir. Ya da Harita'dan bir parsel açarsan o parselin ilçesi
            otomatik yüklenir.
          </p>
        </div>
        <div className="w-full max-w-[280px] rounded-lg border border-slate-200 bg-white p-3 shadow-card dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-2 text-2xs font-semibold text-slate-700 dark:text-slate-200">
            İlçe seç:
          </div>
          <IlceSecici
            onSec={(sec) => {
              setIlceKodu(sec.ilceKodu);
              setIlceAd(sec.ilceAd);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Üst bar — ilçe + tip butonları */}
      <div className="border-b border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-tkgm-ink dark:text-slate-100">
            🔬 Lab · {ilceAd ?? `İlçe ${ilceKodu}`}
            {secilenMahalleKodu != null && mahalleler.find((m) => m.mahalleKodu === secilenMahalleKodu) && (
              <span className="text-tkgm-muted font-normal">
                / {mahalleler.find((m) => m.mahalleKodu === secilenMahalleKodu)!.mahalleAdi}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setIlceKodu(null);
                setIlceAd(null);
                setNoktalar([]);
                setMahalleler([]);
                setSecilenMahalleKodu(null);
              }}
              className="cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-normal text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
              title="Farklı ilçe seç"
            >
              ✕ değiştir
            </button>
          </div>
          {loading && <span className="text-[10px] text-tkgm-muted">yükleniyor…</span>}
        </div>
        {mahalleler.length > 0 && (
          <div className="mb-1 flex items-center gap-1.5">
            <span className="text-[9px] text-tkgm-muted flex-shrink-0">Mahalle:</span>
            <select
              value={secilenMahalleKodu ?? ""}
              onChange={(e) => setSecilenMahalleKodu(e.target.value ? Number(e.target.value) : null)}
              className="flex-1 min-w-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">Tüm ilçe</option>
              {mahalleler.map((m) => (
                <option key={m.mahalleKodu} value={m.mahalleKodu}>
                  {m.mahalleAdi}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {([1, 2, 3, 4, 5] as AnalizTip[]).map((t) => {
            const aktif = analizTip === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setAnalizTip(t)}
                className="rounded border px-2 py-0.5 text-[10px] font-medium transition"
                style={{
                  borderColor: TIP_RENKLERI[t],
                  background: aktif ? TIP_RENKLERI[t] : "white",
                  color: aktif ? "white" : TIP_RENKLERI[t],
                }}
              >
                {ANALIZ_TIPI_ETIKETLERI[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Ana alan: harita üstte, paneller altta */}
      <div className="relative flex-[2] min-h-[200px]">
        <div ref={mapEl} className="h-full w-full" />
        <BasemapSecici active={basemap} onChange={setBasemap} />
        <div className="pointer-events-none absolute left-2 top-2 rounded bg-white/90 px-2 py-1 text-[10px] shadow">
          {noktalarFiltered.length > 0 ? (
            <>
              <div className="font-semibold">{noktalarFiltered.length} parsel · {ozet.toplam} işlem</div>
              <div className="text-tkgm-muted">Renk: yoğunluk (sarı→kırmızı)</div>
            </>
          ) : (
            <div className="text-tkgm-muted">Bu yıl/tip için kayıt yok</div>
          )}
        </div>
      </div>

      {/* Yıl scrubber + KPI + trend + top10 */}
      <div className="flex-[3] overflow-y-auto border-t border-slate-200 bg-slate-50 p-2 text-xs">
        {error && (
          <div className="mb-2 rounded-md border-2 border-red-300 bg-red-50 p-2 text-2xs text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">
            <div className="font-semibold">⚠ TKGM analiz alınamadı</div>
            <div className="mt-0.5">{error}</div>
            {/limit|günlük|403/i.test(error) && (
              <div className="mt-1 italic text-2xs text-red-600 dark:text-red-400">
                Çözüm: Yarın 00:00'da limit sıfırlanır. VPN ile IP değiştirebilirsin (Cloudflare WARP ücretsiz).
              </div>
            )}
          </div>
        )}

        {!loading && !error && noktalar.length === 0 && ilceKodu != null && (
          <div className="mb-2 rounded-md border border-slate-200 bg-white p-2 text-2xs dark:border-slate-700 dark:bg-slate-800">
            <div className="font-medium text-slate-700 dark:text-slate-300">
              Bu ilçe + tip + yıl kombinasyonunda kayıt yok
            </div>
            <div className="mt-0.5 text-3xs text-slate-500">
              TKGM bu ilçede {yil} yılında "{ANALIZ_TIPI_ETIKETLERI[analizTip]}" tipinde işlem kaydı bulamadı. Farklı yıl/tip dene.
            </div>
          </div>
        )}

        {/* Yıl scrubber + playback */}
        <div className="mb-2 rounded border border-slate-200 bg-white p-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-tkgm-muted">
              Yıl
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={oynatmayiBaslat}
                className="rounded bg-purple-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-purple-700"
                title="Tüm yılları oynat"
              >
                {oynatiliyor ? "⏸" : "▶"}
              </button>
              <span className="text-base font-bold text-tkgm-ink">{yil}</span>
            </div>
          </div>
          <input
            type="range"
            min={Math.min(...YIL_SECENEKLERI)}
            max={Math.max(...YIL_SECENEKLERI)}
            value={yil}
            onChange={(e) => {
              setYil(Number(e.target.value));
              durdur();
            }}
            className="mt-1 w-full accent-purple-600"
          />
          <div className="flex justify-between text-[9px] text-tkgm-muted">
            <span>{Math.min(...YIL_SECENEKLERI)}</span>
            <span>{Math.max(...YIL_SECENEKLERI)}</span>
          </div>
        </div>

        {/* Sahibinden join — opsiyonel */}
        {ilanIlceSayisi.adet > 0 && (
          <div className="mb-2 rounded border-2 border-orange-200 bg-orange-50 p-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-orange-800">
                💰 Bölge fiyat × yoğunluk
              </span>
              <span className="text-[10px] text-orange-700">
                {ilanIlceSayisi.adet} sahibinden ilanı kayıtlı
              </span>
            </div>
            {ilanIlceSayisi.ortPerM2 > 0 && (
              <div className="mt-1 grid grid-cols-2 gap-x-3">
                <KpiKart label="Ort. TL/m²" v={ilanIlceSayisi.ortPerM2.toLocaleString("tr-TR")} />
                <KpiKart
                  label="Bölge değeri (tahmin)"
                  v={`${compactSayi(ozet.toplam * ilanIlceSayisi.ortPerM2 * 100)} TL`}
                />
              </div>
            )}
            <div className="mt-1 text-[10px] italic text-orange-700">
              {ozet.toplam} işlem × {ilanIlceSayisi.ortPerM2.toLocaleString("tr-TR")} TL/m² ortalaması ≈
              {" "}
              {compactSayi(ozet.toplam * ilanIlceSayisi.ortPerM2 * 100)} TL döngü hacmi tahmini (parsel başı 100m² varsayımı).
            </div>
          </div>
        )}

        {/* KPI */}
        <div className="mb-2 grid grid-cols-4 gap-1">
          <KpiKart label="Parsel" v={compactSayi(ozet.parsel)} />
          <KpiKart label="Toplam İşlem" v={compactSayi(ozet.toplam)} />
          <KpiKart label="Parsel Ort." v={String(ozet.ort)} />
          <KpiKart label="Max" v={String(ozet.max)} />
        </div>

        {/* Trend */}
        <div className="mb-2">
          <AnalizTrend
            ilceKodu={ilceKodu}
            tipler={[1, 2, 3, 4, 5]}
            seciliYil={yil}
            onYilSec={(y, t) => {
              setYil(y);
              setAnalizTip(t);
            }}
          />
        </div>

        {/* Karşılaştırma */}
        <div className="mb-2">
          <KarsilastirmaPanel
            baslangicIlce={{ ilceKodu, ilceAd: ilceAd ?? `İlçe ${ilceKodu}` }}
            analizTip={analizTip}
            yil={yil}
          />
        </div>

        {/* Top 10 hotspot */}
        {top10.length > 0 && top10[0]!.sayi > 1 && (
          <div className="rounded border border-slate-200 bg-white p-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-tkgm-ink">
              🏆 En Yoğun 10 Parsel
            </div>
            <div className="space-y-0.5">
              {top10.map((n, i) => {
                const max = top10[0]!.sayi;
                const w = (n.sayi / max) * 100;
                return (
                  <div key={n.parselId} className="text-[10px]">
                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          mapRef.current?.flyTo({
                            center: [n.boylam, n.enlem],
                            zoom: 18,
                          });
                        }}
                        className="flex-1 text-left hover:underline"
                      >
                        <span className="font-mono text-[9px] text-tkgm-muted">
                          #{i + 1} parselId {n.parselId}
                        </span>
                      </button>
                      <span className="font-bold text-purple-700">{n.sayi}</span>
                      <button
                        type="button"
                        onClick={() => hotspotAc(n)}
                        disabled={hotspotAciliyor != null}
                        className="rounded bg-purple-600 px-1.5 py-0.5 text-[9px] font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                        title="Bu parselin TKGM detayını yan panelde aç"
                      >
                        {hotspotAciliyor === n.parselId ? "…" : "Aç"}
                      </button>
                    </div>
                    <div className="mt-0.5 h-1 w-full overflow-hidden rounded bg-slate-100">
                      <div className="h-full bg-purple-500" style={{ width: `${w}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Aktif ilçedeki sahibinden ilan istatistiği — useLiveQuery wrapper */
import { useLiveQuery } from "dexie-react-hooks";

function useLiveIlanSayisi(ilceAd: string | null): {
  adet: number;
  ortPerM2: number;
} {
  const data = useLiveQuery(
    async () => {
      if (!ilceAd) return [];
      const ilceNorm = normalizeYerAdi(ilceAd);
      const kayitlar = await db.ilanGozlem.toArray();
      return kayitlar.filter((k) => {
        const kayitIlceNorm =
          k.ilceNorm ?? (k.ilceAd ? normalizeYerAdi(k.ilceAd) : null);
        return kayitIlceNorm === ilceNorm;
      });
    },
    [ilceAd],
  );
  return useMemo(() => {
    const list = (data ?? []).filter(
      (k) => k.fiyatPerM2 != null && k.fiyatPerM2 > 0 && k.paraBirimi === "TL",
    );
    if (list.length === 0) return { adet: data?.length ?? 0, ortPerM2: 0 };
    const ort =
      list.reduce((s, k) => s + (k.fiyatPerM2 ?? 0), 0) / list.length;
    return { adet: data?.length ?? 0, ortPerM2: Math.round(ort) };
  }, [data]);
}

function KpiKart({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-1.5">
      <div className="text-[9px] uppercase tracking-wide text-tkgm-muted">
        {label}
      </div>
      <div className="text-base font-bold leading-none text-tkgm-ink">{v}</div>
    </div>
  );
}

