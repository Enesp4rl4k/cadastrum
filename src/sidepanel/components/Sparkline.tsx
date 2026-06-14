interface Props {
  values: number[];
  width?: number;
  height?: number;
  /** Her nokta için tooltip text */
  labels?: string[];
  color?: string;
  /** Aktif (vurgulu) index */
  highlightIndex?: number;
  onHover?: (index: number | null) => void;
}

/**
 * Mini SVG sparkline. Saf SVG, dependency yok.
 * Y normalize 0-1, X eşit aralıklı, en yüksek noktayı dolu daireyle vurgular.
 */
export function Sparkline({
  values,
  width = 120,
  height = 36,
  labels,
  color = "#7c3aed",
  highlightIndex,
  onHover,
}: Props) {
  if (values.length === 0) {
    return (
      <div
        className="text-[10px] italic text-tkgm-muted"
        style={{ width, height }}
      >
        veri yok
      </div>
    );
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const padX = 4;
  const padY = 4;
  const w = width - padX * 2;
  const h = height - padY * 2;

  const xAt = (i: number) =>
    values.length === 1 ? padX + w / 2 : padX + (i / (values.length - 1)) * w;
  const yAt = (v: number) => padY + h - ((v - min) / range) * h;

  const points = values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
  const areaPath = `M ${xAt(0)} ${padY + h} L ${points} L ${xAt(values.length - 1)} ${padY + h} Z`;

  const maxIdx = values.indexOf(max);
  const lastIdx = values.length - 1;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Sparkline ${values.length} değer`}
    >
      <path d={areaPath} fill={color} fillOpacity={0.15} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {values.map((v, i) => {
        const isMax = i === maxIdx;
        const isLast = i === lastIdx;
        const isHl = highlightIndex === i;
        const r = isHl ? 3.5 : isMax || isLast ? 2.5 : 0;
        if (r === 0) return null;
        return (
          <circle
            key={i}
            cx={xAt(i)}
            cy={yAt(v)}
            r={r}
            fill={isHl ? "#dc2626" : color}
          />
        );
      })}
      {/* Hover targets — geniş tıklama alanı */}
      {labels &&
        values.map((v, i) => (
          <rect
            key={`hit-${i}`}
            x={xAt(i) - 6}
            y={0}
            width={12}
            height={height}
            fill="transparent"
            onMouseEnter={() => onHover?.(i)}
            onMouseLeave={() => onHover?.(null)}
          >
            <title>{labels[i] ?? `${i}: ${v}`}</title>
          </rect>
        ))}
    </svg>
  );
}
