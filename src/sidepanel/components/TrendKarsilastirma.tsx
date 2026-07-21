/**
 * Trend Karşılaştırma Kartı — YENI-2
 * Max 3 seri karşılaştırması: farklı il/ilce/kategori kombinasyonları.
 * Pure SVG, sıfır harici bağımlılık.
 */
import { useEffect, useState, useId } from "react";
import { TrendingUp as TrendIcon, Plus as PlusIcon, X as CloseIcon, Loader2 as LoaderIcon } from "lucide-react";
import { Section } from "../ui/Card";

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";
const MAX_SERI = 3;

interface TrendNokta { ay: string; medyan: number; adet: number; }

interface TrendSeri {
  id: string;
  etiket: string;
  renk: string;
  lat: number;
  lng: number;
  kategori: string;
  noktalar: TrendNokta[];
  yukleniyor: boolean;
  hata: string | null;
}

interface Props {
  /** Varsayılan birinci seri */
  lat?: number | null;
  lng?: number | null;
  il?: string;
  ilce?: string;
  kategori?: string;
}

const RENKLER = ["#3b82f6", "#10b981", "#f59e0b"];
const KATEGORI_LABEL: Record<string, string> = { arsa: "Arsa", tarla: "Tarla", konut: "Konut" };

async function trendCek(lat: number, lng: number, kategori: string, ay: number): Promise<TrendNokta[]> {
  const url = `${API_BASE}/sorgu/trend?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}&kategori=${kategori}&ay=${ay}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json() as { noktalar?: TrendNokta[] };
  return d.noktalar ?? [];
}

// ── Çoklu seri SVG ────────────────────────────────────────────────────────────

interface MultiChartProps {
  seriler: TrendSeri[];
  width?: number;
  height?: number;
  gradBase: string;
}

function MultiLineChart({ seriler, width = 260, height = 80, gradBase }: MultiChartProps) {
  const aktif = seriler.filter((s) => s.noktalar.length >= 2);
  if (aktif.length === 0) return null;

  const pad = { top: 8, right: 8, bottom: 20, left: 46 };
  const iW = width - pad.left - pad.right;
  const iH = height - pad.top - pad.bottom;

  // Tüm değerler üzerinden global min/max
  const tumDegerler = aktif.flatMap((s) => s.noktalar.map((n) => n.medyan));
  const minV = Math.min(...tumDegerler);
  const maxV = Math.max(...tumDegerler);
  const rangeV = maxV - minV || 1;

  // Tüm ay anahtarlarını topla ve sırala
  const aySet = new Set<string>();
  aktif.forEach((s) => s.noktalar.forEach((n) => aySet.add(n.ay)));
  const aylar = [...aySet].sort();
  if (aylar.length < 2) return null;

  const toX = (ayIdx: number) => pad.left + (ayIdx / (aylar.length - 1)) * iW;
  const toY = (v: number) => pad.top + iH - ((v - minV) / rangeV) * iH;

  const fmt = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n/1_000)}K` : String(Math.round(n));

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Çoklu trend karşılaştırması" className="overflow-visible">
      {/* Grid */}
      {[0, 0.5, 1].map((t) => (
        <line key={t} x1={pad.left} x2={pad.left+iW} y1={pad.top+iH*(1-t)} y2={pad.top+iH*(1-t)}
          stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
      ))}

      {/* Her seri için gradient + çizgi */}
      <defs>
        {aktif.map((s, i) => (
          <linearGradient key={s.id} id={`${gradBase}-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.renk} stopOpacity="0.15" />
            <stop offset="100%" stopColor={s.renk} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>

      {aktif.map((s) => {
        const noktaMap = new Map(s.noktalar.map((n) => [n.ay, n.medyan]));
        const pts = aylar.map((ay, i) => ({ x: toX(i), y: noktaMap.has(ay) ? toY(noktaMap.get(ay)!) : null }))
          .filter((p) => p.y !== null) as { x: number; y: number }[];
        if (pts.length < 2) return null;
        const d = pts.map((p, i) => `${i===0?"M":"L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
        const sonPt = pts[pts.length-1]!;
        return (
          <g key={s.id}>
            <path d={d} fill="none" stroke={s.renk} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={sonPt.x} cy={sonPt.y} r="3" fill={s.renk} stroke="white" strokeWidth="1.5" />
          </g>
        );
      })}

      {/* Y eksen etiketleri */}
      <text x={pad.left-4} y={pad.top+4} textAnchor="end" fontSize="7" fill="currentColor" opacity="0.45">{fmt(maxV)}</text>
      <text x={pad.left-4} y={pad.top+iH} textAnchor="end" fontSize="7" fill="currentColor" opacity="0.45">{fmt(minV)}</text>

      {/* X eksen: ilk ve son ay */}
      <text x={toX(0)} y={height-3} textAnchor="start" fontSize="7" fill="currentColor" opacity="0.45">
        {aylar[0]!.slice(5)}/{aylar[0]!.slice(2,4)}
      </text>
      <text x={toX(aylar.length-1)} y={height-3} textAnchor="end" fontSize="7" fill="currentColor" opacity="0.45">
        {aylar[aylar.length-1]!.slice(5)}/{aylar[aylar.length-1]!.slice(2,4)}
      </text>
    </svg>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export function TrendKarsilastirma({ lat, lng, il, ilce, kategori = "arsa" }: Props) {
  const uid = useId().replace(/:/g, "");
  const [seriler, setSeriler] = useState<TrendSeri[]>([]);
  const [ay, setAy] = useState<6 | 12 | 24>(12);

  // İlk seri — props'tan
  useEffect(() => {
    if (!lat || !lng || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const etiket = il && ilce ? `${ilce}/${il}` : il ?? "Bölge 1";
    const ilkSeri: TrendSeri = {
      id: `s0-${lat}-${lng}`,
      etiket,
      renk: RENKLER[0]!,
      lat, lng, kategori,
      noktalar: [],
      yukleniyor: true,
      hata: null,
    };
    setSeriler([ilkSeri]);

    let iptal = false;
    trendCek(lat, lng, kategori, ay)
      .then((n) => { if (!iptal) setSeriler((prev) => prev.map((s) => s.id === ilkSeri.id ? { ...s, noktalar: n, yukleniyor: false } : s)); })
      .catch((e) => { if (!iptal) setSeriler((prev) => prev.map((s) => s.id === ilkSeri.id ? { ...s, yukleniyor: false, hata: e.message } : s)); });
    return () => { iptal = true; };
  }, [lat, lng, kategori, ay]); // eslint-disable-line react-hooks/exhaustive-deps

  const seriEkle = () => {
    if (seriler.length >= MAX_SERI) return;
    const idx = seriler.length;
    const yeniSeri: TrendSeri = {
      id: `s${idx}-${Date.now()}`,
      etiket: `Bölge ${idx + 1}`,
      renk: RENKLER[idx]!,
      lat: 39.9 + idx * 0.5,
      lng: 32.8 + idx * 0.3,
      kategori,
      noktalar: [],
      yukleniyor: false,
      hata: "Koordinat gir",
    };
    setSeriler((prev) => [...prev, yeniSeri]);
  };

  const seriSil = (id: string) => setSeriler((prev) => prev.filter((s) => s.id !== id));

  const yukleniyor = seriler.some((s) => s.yukleniyor);

  return (
    <Section
      title="Trend karşılaştırma"
      icon={<TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />}
      accent="info"
      actions={
        <div className="flex items-center gap-1">
          {([6, 12, 24] as const).map((a) => (
            <button key={a} onClick={() => setAy(a)} aria-pressed={ay===a}
              className={`rounded px-1.5 py-0.5 text-[9px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${ay===a ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"}`}>
              {a}A
            </button>
          ))}
          {seriler.length < MAX_SERI && (
            <button onClick={seriEkle} className="ml-1 rounded p-0.5 text-slate-400 hover:text-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" aria-label="Seri ekle">
              <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-1.5 p-2">
        {/* Grafik */}
        {!yukleniyor && (
          <div className="text-slate-800 dark:text-slate-200">
            <MultiLineChart seriler={seriler} gradBase={uid} />
          </div>
        )}
        {yukleniyor && (
          <div className="flex justify-center py-4" role="status" aria-live="polite">
            <LoaderIcon className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
          </div>
        )}

        {/* Seri listesi + legend */}
        <div className="space-y-1">
          {seriler.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 text-[10px]">
              <div className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: s.renk }} aria-hidden="true" />
              <div className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300">{s.etiket}</div>
              {s.noktalar.length > 0 && (
                <span className="tabular-nums text-slate-500">
                  {s.noktalar[s.noktalar.length-1]!.medyan.toLocaleString("tr-TR")} ₺/m²
                </span>
              )}
              {s.hata && <span className="text-red-400">{s.hata}</span>}
              {seriler.length > 1 && (
                <button onClick={() => seriSil(s.id)} className="text-slate-300 hover:text-red-400 focus-visible:outline-none" aria-label={`${s.etiket} serisini kaldır`}>
                  <CloseIcon className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>

        {seriler.length < MAX_SERI && (
          <p className="text-[9px] text-slate-400">+ butonuyla max {MAX_SERI} seri karşılaştırabilirsiniz</p>
        )}
      </div>
    </Section>
  );
}
