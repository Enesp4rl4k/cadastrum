/**
 * Inline SVG charts — recharts dependency yok.
 * Pie chart + Histogram + Donut.
 */

interface PieDilim {
  label: string;
  value: number;
  renk: string;
}

interface PieProps {
  dilimler: PieDilim[];
  size?: number;
  strokeWidth?: number;
  toplamLabel?: string;
}

export function PieChart({
  dilimler,
  size = 90,
  strokeWidth = 16,
  toplamLabel,
}: PieProps) {
  const toplam = dilimler.reduce((s, d) => s + d.value, 0);
  if (toplam === 0) {
    return (
      <div className="flex h-[90px] w-[90px] items-center justify-center text-3xs text-slate-400">
        Veri yok
      </div>
    );
  }

  const r = size / 2 - strokeWidth / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgb(241, 245, 249)"
        strokeWidth={strokeWidth}
      />
      {dilimler.map((d, i) => {
        const yuzde = d.value / toplam;
        const dasharray = `${c * yuzde} ${c}`;
        const dashoffset = c * (1 - acc);
        acc += yuzde;
        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={d.renk}
            strokeWidth={strokeWidth}
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="transition-all duration-500"
          >
            <title>
              {d.label}: {d.value} ({((yuzde * 100) | 0)}%)
            </title>
          </circle>
        );
      })}
      {toplamLabel && (
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-slate-700 font-bold tabular-nums"
          fontSize={size / 6}
        >
          {toplamLabel}
        </text>
      )}
    </svg>
  );
}

interface HistogramBin {
  label: string;
  value: number;
}

interface HistogramProps {
  bins: HistogramBin[];
  height?: number;
  color?: string;
}

export function Histogram({
  bins,
  height = 80,
  color = "#3b82f6",
}: HistogramProps) {
  const maks = Math.max(...bins.map((b) => b.value), 1);
  return (
    <div className="space-y-0.5">
      <div className="flex items-end gap-0.5" style={{ height }}>
        {bins.map((b, i) => (
          <div
            key={i}
            className="flex flex-1 flex-col items-center justify-end"
            title={`${b.label}: ${b.value}`}
          >
            <div className="w-full text-center text-3xs font-medium tabular-nums text-slate-600">
              {b.value > 0 ? b.value : ""}
            </div>
            <div
              className="w-full rounded-t transition-all"
              style={{
                height: `${(b.value / maks) * 100}%`,
                backgroundColor: color,
                minHeight: b.value > 0 ? 2 : 0,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-0.5">
        {bins.map((b, i) => (
          <div
            key={i}
            className="flex-1 truncate text-center text-3xs text-slate-500"
            style={{ fontSize: "8px" }}
          >
            {b.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PieLegend({ dilimler }: { dilimler: PieDilim[] }) {
  const toplam = dilimler.reduce((s, d) => s + d.value, 0);
  return (
    <div className="space-y-0.5">
      {dilimler.slice(0, 8).map((d, i) => {
        const yuzde = toplam > 0 ? Math.round((d.value / toplam) * 1000) / 10 : 0;
        return (
          <div key={i} className="flex items-center gap-1.5 text-3xs">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: d.renk }}
            />
            <span className="flex-1 truncate text-slate-700">{d.label}</span>
            <span className="font-medium tabular-nums text-slate-600">
              {d.value} · %{yuzde}
            </span>
          </div>
        );
      })}
    </div>
  );
}
