/**
 * Trend Grafik Kartı — Faz B1/B2
 * Mahalle / ilçe TL/m² zaman serisi SVG line chart.
 * Harici bağımlılık yok — pure SVG + Tailwind.
 * Veri kaynağı: GET /v1/sorgu/trend?lat=&lng=&kategori=&ay=12
 */
import { useEffect, useMemo, useState } from "react";
import { TrendingUp as TrendIcon, Loader2 as LoaderIcon } from "lucide-react";
import { Section } from "../ui/Card";

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

interface TrendNokta {
  ay: string;   // "2024-03"
  medyan: number;
  adet: number;
}

interface TrendSonuc {
  kategori: string;
  nokta_adet: number;
  degisim_yuzde: number | null;
  noktalar: TrendNokta[];
}

interface Props {
  lat?: number | null;
  lng?: number | null;
  il?: string;
  ilce?: string;
  mahalle?: string;
  kategori?: string;
  aySecenegi?: 6 | 12 | 24;
}

// ── SVG mini chart ────────────────────────────────────────────────────────────

interface MiniChartProps {
  noktalar: TrendNokta[];
  width?: number;
  height?: number;
}

function MiniLineChart({ noktalar, width = 260, height = 72 }: MiniChartProps) {
  if (noktalar.length < 2) return null;

  const padding = { top: 8, right: 8, bottom: 20, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = noktalar.map((n) => n.medyan);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const rangeV = maxV - minV || 1;

  const toX = (i: number) => padding.left + (i / (noktalar.length - 1)) * innerW;
  const toY = (v: number) => padding.top + innerH - ((v - minV) / rangeV) * innerH;

  const pathD = noktalar
    .map((n, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(n.medyan).toFixed(1)}`)
    .join(" ");

  // Gradient fill area
  const fillD =
    `${pathD} L ${toX(noktalar.length - 1).toFixed(1)} ${(padding.top + innerH).toFixed(1)} ` +
    `L ${toX(0).toFixed(1)} ${(padding.top + innerH).toFixed(1)} Z`;

  // Y axis labels (min/max)
  const fmt = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
        ? `${Math.round(n / 1_000)}K`
        : String(Math.round(n));

  // X axis: ilk + son ay
  const ilkAy = noktalar[0]!.ay.slice(5); // "MM"
  const sonAy = noktalar[noktalar.length - 1]!.ay.slice(5);
  const ilkYil = noktalar[0]!.ay.slice(0, 4);
  const sonYil = noktalar[noktalar.length - 1]!.ay.slice(0, 4);

  // PERF-3 fix: useId benzeri unique gradId — birden fazla TrendGrafik instance'da SVG çakışmaz
  const gradId = `trend-fill-grad-${noktalar[0]?.ay ?? "x"}-${noktalar.length}`;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Fiyat trendi zaman serisi"
      className="overflow-visible"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {[0, 0.5, 1].map((t) => {
        const y = padding.top + innerH * (1 - t);
        return (
          <line
            key={t}
            x1={padding.left}
            x2={padding.left + innerW}
            y1={y}
            y2={y}
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeWidth="1"
          />
        );
      })}

      {/* Fill area */}
      <path d={fillD} fill={`url(#${gradId})`} />

      {/* Line */}
      <path
        d={pathD}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Last point dot */}
      <circle
        cx={toX(noktalar.length - 1)}
        cy={toY(noktalar[noktalar.length - 1]!.medyan)}
        r="3"
        fill="#3b82f6"
        stroke="white"
        strokeWidth="1.5"
      />

      {/* Y axis labels */}
      <text x={padding.left - 4} y={padding.top + 4} textAnchor="end" fontSize="7" fill="currentColor" opacity="0.45">{fmt(maxV)}</text>
      <text x={padding.left - 4} y={padding.top + innerH} textAnchor="end" fontSize="7" fill="currentColor" opacity="0.45">{fmt(minV)}</text>

      {/* X axis labels */}
      <text x={toX(0)} y={height - 3} textAnchor="start" fontSize="7" fill="currentColor" opacity="0.45">
        {ilkAy}/{ilkYil.slice(2)}
      </text>
      <text x={toX(noktalar.length - 1)} y={height - 3} textAnchor="end" fontSize="7" fill="currentColor" opacity="0.45">
        {sonAy}/{sonYil.slice(2)}
      </text>
    </svg>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export function TrendGrafik({ lat, lng, il, ilce, kategori = "arsa", aySecenegi = 12 }: Props) {
  const [sonuc, setSonuc] = useState<TrendSonuc | null>(null);
  const [ay, setAy] = useState<6 | 12 | 24>(aySecenegi);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    const hasCoords = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
    if (!hasCoords) { setSonuc(null); return; }

    let iptal = false;
    setYukleniyor(true);
    setHata(null);

    const url = `${API_BASE}/sorgu/trend?lat=${lat!.toFixed(5)}&lng=${lng!.toFixed(5)}&kategori=${kategori}&ay=${ay}`;
    fetch(url, { signal: AbortSignal.timeout(12_000) })
      .then((r) => r.ok ? r.json() as Promise<TrendSonuc & { ok: boolean }> : Promise.reject(r.status))
      .then((d) => { if (!iptal) setSonuc(d); })
      .catch(() => { if (!iptal) setHata("Trend verisi alınamadı"); })
      .finally(() => { if (!iptal) setYukleniyor(false); });

    return () => { iptal = true; };
  }, [lat, lng, kategori, ay]);

  const baslik = useMemo(() => {
    if (il && ilce) return `${ilce} / ${il}`;
    if (il) return il;
    return "Bölge";
  }, [il, ilce]);

  const degisimRenk = sonuc?.degisim_yuzde != null
    ? sonuc.degisim_yuzde > 0 ? "text-emerald-600 dark:text-emerald-400"
      : sonuc.degisim_yuzde < 0 ? "text-red-500 dark:text-red-400"
      : "text-slate-500"
    : "text-slate-400";

  return (
    <Section
      title="Fiyat trendi"
      icon={<TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />}
      accent="info"
      subtitle={baslik}
      actions={
        <div className="flex gap-0.5">
          {([6, 12, 24] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAy(a)}
              className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                ay === a
                  ? "bg-blue-600 text-white"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
              aria-label={`${a} aylık trend`}
              aria-pressed={ay === a}
            >
              {a}A
            </button>
          ))}
        </div>
      }
    >
      <div className="space-y-1.5 p-2">
        {yukleniyor && (
          <div className="flex items-center justify-center gap-1.5 py-4 text-xs text-slate-400" role="status" aria-live="polite">
            <LoaderIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            <span>Trend verisi yükleniyor…</span>
          </div>
        )}

        {hata && !yukleniyor && (
          <p className="py-2 text-center text-[10px] text-slate-400">{hata}</p>
        )}

        {!lat && !yukleniyor && (
          <p className="py-2 text-center text-[10px] text-slate-400">Koordinat gerekli</p>
        )}

        {sonuc && !yukleniyor && sonuc.noktalar.length >= 2 && (
          <>
            {/* Değişim özeti */}
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-slate-500 dark:text-slate-400">
                {sonuc.nokta_adet} veri noktası · {ay} ay
              </span>
              {sonuc.degisim_yuzde != null && (
                <span className={`font-semibold tabular-nums ${degisimRenk}`}>
                  {sonuc.degisim_yuzde > 0 ? "+" : ""}{sonuc.degisim_yuzde.toFixed(1)}%
                </span>
              )}
            </div>

            {/* SVG chart */}
            <div className="text-slate-800 dark:text-slate-200">
              <MiniLineChart noktalar={sonuc.noktalar} />
            </div>

            {/* Son değer */}
            {sonuc.noktalar.length > 0 && (
              <div className="text-[9px] text-slate-400 text-right">
                Son: {sonuc.noktalar[sonuc.noktalar.length - 1]!.medyan.toLocaleString("tr-TR")} ₺/m²
              </div>
            )}
          </>
        )}

        {sonuc && !yukleniyor && sonuc.noktalar.length < 2 && (
          <p className="py-2 text-center text-[10px] text-slate-400">
            Bu bölgede yeterli veri yok ({sonuc.noktalar.length} nokta).
          </p>
        )}
      </div>
    </Section>
  );
}
