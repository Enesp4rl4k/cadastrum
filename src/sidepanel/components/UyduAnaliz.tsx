/**
 * UyduAnaliz — Parsel koordinatı için uydu görüntüsü + Gemini Vision AI analizi.
 *
 * Veri akışı:
 *   1. lat/lng → backend /v1/proxy/uydu-analiz (POST)
 *   2. Backend: ESRI World Imagery tile fetch → Gemini Flash multimodal analiz
 *   3. Sonuç: uydu tile URL + AI gözlemleri panel'de gösterilir
 *
 * Kullanım: <UyduAnaliz lat={parsel.merkezNokta[1]} lng={parsel.merkezNokta[0]} />
 */
import { useEffect, useState } from "react";
import { BACKEND_API } from "../../lib/api-constants";

// ── Tipler ──────────────────────────────────────────────────────────────────

interface UyduAnalizSonuc {
  ok: boolean;
  koordinat: { lat: number; lng: number; zoom: number };
  tileUrl: string;
  analiz: {
    arazi_tipi?: string;
    yapilasma_yogunlugu?: number;
    yesil_alan_orani?: number;
    ulasim_erisimi?: string;
    yakin_tesisler?: string[];
    degerlenme_potansiyeli?: string;
    gozlemler?: string;
  };
}

interface Props {
  lat: number;
  lng: number;
  /** Zoom seviyesi — 14 ilçe geneli, 16 mahalle, 18 parsel detay */
  zoom?: number;
}

// ── Yardımcı ────────────────────────────────────────────────────────────────

function potansiyelRenk(p?: string): string {
  if (!p) return "bg-slate-100 text-slate-600";
  if (p.includes("yüksek")) return "bg-emerald-100 text-emerald-800";
  if (p.includes("orta")) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-700";
}

function erişimRenk(e?: string): string {
  if (!e) return "text-slate-500";
  if (e === "çok iyi" || e === "iyi") return "text-emerald-700";
  if (e === "orta") return "text-amber-700";
  return "text-red-600";
}

// ── Ana bileşen ──────────────────────────────────────────────────────────────

export function UyduAnaliz({ lat, lng, zoom = 16 }: Props) {
  const [durum, setDurum] = useState<"bos" | "yukleniyor" | "tamam" | "hata">("bos");
  const [sonuc, setSonuc] = useState<UyduAnalizSonuc | null>(null);
  const [hata, setHata] = useState<string>("");
  const [aktifZoom, setAktifZoom] = useState(zoom);
  const [imgYuklendi, setImgYuklendi] = useState(false);

  // lat/lng değişince sonucu sıfırla
  useEffect(() => {
    setSonuc(null);
    setDurum("bos");
    setImgYuklendi(false);
  }, [lat, lng]);

  async function analizBaslat() {
    if (!lat || !lng) return;
    setDurum("yukleniyor");
    setHata("");
    setImgYuklendi(false);

    try {
      const res = await fetch(`${BACKEND_API}/proxy/uydu-analiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, zoom: aktifZoom }),
      });
      const data = await res.json() as UyduAnalizSonuc & { error?: string };

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      setSonuc(data);
      setDurum("tamam");
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
      setDurum("hata");
    }
  }

  if (!lat || !lng) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 overflow-hidden shadow-sm">
      {/* Başlık */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-1.5">
          <span className="text-base" aria-hidden="true">🛰️</span>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">AI Uydu Analizi</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Zoom seçici */}
          <select
            value={aktifZoom}
            onChange={(e) => setAktifZoom(Number(e.target.value))}
            className="text-[10px] border border-slate-200 rounded px-1 py-0.5 bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200"
            aria-label="Uydu zoom seviyesi"
          >
            <option value={14}>İlçe (z14)</option>
            <option value={16}>Mahalle (z16)</option>
            <option value={18}>Parsel (z18)</option>
          </select>
          <button
            type="button"
            onClick={analizBaslat}
            disabled={durum === "yukleniyor"}
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md
              bg-[#1B2A4A] text-white hover:bg-[#233461] disabled:opacity-50
              transition-colors"
            aria-label="Uydu analizi başlat"
          >
            {durum === "yukleniyor" ? (
              <>
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Analiz…
              </>
            ) : (
              "Analiz Et"
            )}
          </button>
        </div>
      </div>

      {/* Boş state */}
      {durum === "bos" && (
        <div className="flex flex-col items-center justify-center py-6 text-center px-4">
          <span className="text-3xl mb-2" aria-hidden="true">🌍</span>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Uydu görüntüsü + Gemini AI ile arazi analizi
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Yapılaşma · Yeşil alan · Erişim · Değerlenme potansiyeli
          </p>
        </div>
      )}

      {/* Hata */}
      {durum === "hata" && (
        <div className="p-3 text-xs text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-400">
          ❌ {hata}
        </div>
      )}

      {/* Sonuç */}
      {durum === "tamam" && sonuc && (
        <div className="p-3 space-y-2.5">
          {/* Uydu görüntüsü */}
          <div className="relative rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700" style={{ aspectRatio: "1/1" }}>
            {!imgYuklendi && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-pulse text-slate-400 text-xs">Görüntü yükleniyor…</div>
              </div>
            )}
            <img
              src={sonuc.tileUrl}
              alt={`Uydu görüntüsü — ${lat.toFixed(4)}, ${lng.toFixed(4)}`}
              className={`w-full h-full object-cover transition-opacity duration-300 ${imgYuklendi ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setImgYuklendi(true)}
              onError={() => setImgYuklendi(true)}
              loading="lazy"
            />
            {/* Koordinat overlay */}
            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
              {lat.toFixed(4)}, {lng.toFixed(4)} · z{sonuc.koordinat.zoom}
            </div>
          </div>

          {/* AI analiz özeti */}
          <div className="grid grid-cols-2 gap-1.5">
            {/* Arazi tipi */}
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-2 py-1.5">
              <div className="text-[9px] text-slate-400 uppercase tracking-wide">Arazi Tipi</div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 capitalize mt-0.5">
                {sonuc.analiz.arazi_tipi ?? "—"}
              </div>
            </div>

            {/* Değerlenme potansiyeli */}
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-2 py-1.5">
              <div className="text-[9px] text-slate-400 uppercase tracking-wide">Potansiyel</div>
              <div className="mt-0.5">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${potansiyelRenk(sonuc.analiz.degerlenme_potansiyeli)}`}>
                  {sonuc.analiz.degerlenme_potansiyeli ?? "—"}
                </span>
              </div>
            </div>

            {/* Yapılaşma yoğunluğu */}
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-2 py-1.5">
              <div className="text-[9px] text-slate-400 uppercase tracking-wide">Yapılaşma</div>
              <div className="flex items-center gap-1 mt-1">
                <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-600 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#1B2A4A] transition-all"
                    style={{ width: `${sonuc.analiz.yapilasma_yogunlugu ?? 0}%` }}
                  />
                </div>
                <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
                  %{sonuc.analiz.yapilasma_yogunlugu ?? 0}
                </span>
              </div>
            </div>

            {/* Yeşil alan */}
            <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 px-2 py-1.5">
              <div className="text-[9px] text-slate-400 uppercase tracking-wide">Yeşil Alan</div>
              <div className="flex items-center gap-1 mt-1">
                <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-600 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${sonuc.analiz.yesil_alan_orani ?? 0}%` }}
                  />
                </div>
                <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
                  %{sonuc.analiz.yesil_alan_orani ?? 0}
                </span>
              </div>
            </div>
          </div>

          {/* Ulaşım erişimi */}
          {sonuc.analiz.ulasim_erisimi && (
            <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50">
              <span className="text-[9px] text-slate-400 uppercase tracking-wide">Ulaşım Erişimi</span>
              <span className={`text-xs font-semibold capitalize ${erişimRenk(sonuc.analiz.ulasim_erisimi)}`}>
                {sonuc.analiz.ulasim_erisimi}
              </span>
            </div>
          )}

          {/* Yakın tesisler */}
          {sonuc.analiz.yakin_tesisler && sonuc.analiz.yakin_tesisler.length > 0 && (
            <div className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700/50">
              <div className="text-[9px] text-slate-400 uppercase tracking-wide mb-1">Yakın Tesisler</div>
              <div className="flex flex-wrap gap-1">
                {sonuc.analiz.yakin_tesisler.map((t, i) => (
                  <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* AI gözlemleri */}
          {sonuc.analiz.gozlemler && (
            <div className="px-2.5 py-2 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-100 dark:border-blue-900/50">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[9px] text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide">
                  🤖 Gemini AI Gözlemi
                </span>
              </div>
              <p className="text-[10px] leading-relaxed text-slate-700 dark:text-slate-300">
                {sonuc.analiz.gozlemler}
              </p>
            </div>
          )}

          {/* Kaynak notu */}
          <p className="text-[9px] text-slate-400 text-center">
            Kaynak: ESRI World Imagery · Analiz: Gemini 2.0 Flash Vision
          </p>
        </div>
      )}
    </div>
  );
}
