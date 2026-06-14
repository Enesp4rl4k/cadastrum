/**
 * Cadastrum PDF rapor için inline SVG chart bileşenleri.
 * Hiçbir dış kütüphane yok — sadece SVG + TS.
 * Print-friendly: vector, sabit boyut, transparan çalışır.
 */

import type { LatLng } from "../types/tkgm";

// ── Mini parsel haritası ────────────────────────────────────────
interface ParselHaritaProps {
  koordinatlar: LatLng[];
  merkez: LatLng;
  width?: number;
  height?: number;
  baslik?: string;
}

export function ParselHarita({ koordinatlar, merkez, width = 480, height = 280, baslik }: ParselHaritaProps) {
  if (koordinatlar.length < 3) {
    return (
      <div style={{ width, height, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4 }}>
        <span style={{ fontSize: "9pt", color: "#64748b" }}>Parsel geometrisi yok</span>
      </div>
    );
  }

  // Bounding box → ölçek
  const lats = koordinatlar.map(k => k.lat);
  const lngs = koordinatlar.map(k => k.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const padLat = (maxLat - minLat) * 0.4 || 0.0005;
  const padLng = (maxLng - minLng) * 0.4 || 0.0005;
  const bounds = {
    minLat: minLat - padLat,
    maxLat: maxLat + padLat,
    minLng: minLng - padLng,
    maxLng: maxLng + padLng,
  };

  // Ölçek çubuğu için yaklaşık metre cinsinden mesafe
  const orta = (bounds.minLat + bounds.maxLat) / 2;
  const enlemMesafe = (bounds.maxLat - bounds.minLat) * 111320; // m
  const boylamMesafe = (bounds.maxLng - bounds.minLng) * 111320 * Math.cos((orta * Math.PI) / 180);
  const haritaMesafe = Math.max(enlemMesafe, boylamMesafe);
  // Round scale: 50/100/200/500/1000 m
  const olcekMetre = haritaMesafe > 800 ? 200 : haritaMesafe > 400 ? 100 : haritaMesafe > 200 ? 50 : 25;

  const xy = (k: LatLng): [number, number] => {
    const x = ((k.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * width;
    const y = height - ((k.lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * height;
    return [x, y];
  };

  const path = koordinatlar.map((k, i) => {
    const [x, y] = xy(k);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ") + " Z";

  const olcekPx = (olcekMetre / haritaMesafe) * Math.min(width, height);
  const [mx, my] = xy(merkez);

  // Kuzey ok pozisyonu
  const okX = width - 28;
  const okY = 28;

  return (
    <div style={{ position: "relative", width, marginBottom: "12px" }}>
      {baslik && <div style={{ fontSize: "9pt", color: "#64748b", marginBottom: "4px", fontWeight: 500 }}>{baslik}</div>}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ borderRadius: 4, border: "1px solid #E2E8F0", background: "#F8FAFC" }}>
        {/* Grid */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#E2E8F0" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#grid)" />

        {/* Parsel polygon */}
        <path d={path} fill="#1B2A4A" fillOpacity="0.18" stroke="#1B2A4A" strokeWidth="2" strokeLinejoin="round" />

        {/* Köşe işaretleri */}
        {koordinatlar.map((k, i) => {
          const [x, y] = xy(k);
          return <circle key={i} cx={x} cy={y} r="2.5" fill="#1B2A4A" />;
        })}

        {/* Merkez */}
        <circle cx={mx} cy={my} r="4" fill="#C9A86A" stroke="#fff" strokeWidth="1.5" />

        {/* Kuzey oku */}
        <g transform={`translate(${okX}, ${okY})`}>
          <circle r="14" fill="#fff" stroke="#1B2A4A" strokeWidth="1" />
          <path d="M 0,-9 L 4,5 L 0,2 L -4,5 Z" fill="#1B2A4A" />
          <text x="0" y="-15" textAnchor="middle" fontSize="7" fontWeight="600" fill="#1B2A4A">K</text>
        </g>

        {/* Ölçek çubuğu */}
        <g transform={`translate(12, ${height - 18})`}>
          <line x1="0" y1="0" x2={olcekPx} y2="0" stroke="#1B2A4A" strokeWidth="2" />
          <line x1="0" y1="-4" x2="0" y2="4" stroke="#1B2A4A" strokeWidth="2" />
          <line x1={olcekPx} y1="-4" x2={olcekPx} y2="4" stroke="#1B2A4A" strokeWidth="2" />
          <text x={olcekPx / 2} y="-6" textAnchor="middle" fontSize="8" fill="#1B2A4A">{olcekMetre} m</text>
        </g>
      </svg>
    </div>
  );
}

// ── Karşılaştırma yatay bar chart ──────────────────────────────
interface KarsilastirmaProps {
  satirlar: { etiket: string; deger: number; vurgulu?: boolean; ikinci?: string }[];
  birim?: string;
  width?: number;
}

export function KarsilastirmaChart({ satirlar, birim = "TL/m²", width = 480 }: KarsilastirmaProps) {
  if (satirlar.length === 0) return null;
  const max = Math.max(...satirlar.map(s => s.deger), 1);
  const barW = width - 200;

  return (
    <div style={{ width, fontSize: "9pt" }}>
      {satirlar.map((s, i) => {
        const pct = (s.deger / max) * 100;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <div style={{ width: 100, color: s.vurgulu ? "#1B2A4A" : "#475569", fontWeight: s.vurgulu ? 600 : 400 }}>
              {s.etiket}
              {s.ikinci && <div style={{ fontSize: "7pt", color: "#94a3b8", fontWeight: 400 }}>{s.ikinci}</div>}
            </div>
            <div style={{ flex: 1, position: "relative", height: 18, background: "#F1F5F9", borderRadius: 2 }}>
              <div
                style={{
                  position: "absolute",
                  left: 0, top: 0, bottom: 0,
                  width: `${pct}%`,
                  background: s.vurgulu ? "linear-gradient(90deg, #1B2A4A, #2C4275)" : "#94A3B8",
                  borderRadius: 2,
                  transition: "width 0.3s",
                }}
              />
            </div>
            <div style={{ width: 90, textAlign: "right", fontWeight: 600, color: "#1B2A4A", fontVariantNumeric: "tabular-nums" }}>
              {s.deger.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}
              <span style={{ fontSize: "7pt", color: "#94a3b8", marginLeft: 2 }}>{birim}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Güven gauge (yarım daire) ──────────────────────────────────
interface GuvenGaugeProps {
  skor: number; // 0-100
  etiket?: string;
  size?: number;
}

export function GuvenGauge({ skor, etiket, size = 140 }: GuvenGaugeProps) {
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2 + 8;
  const ang = Math.PI * (1 - skor / 100); // 180° → 0°
  const ex = cx + r * Math.cos(ang);
  const ey = cy - r * Math.sin(ang);
  const renk = skor >= 70 ? "#059669" : skor >= 40 ? "#D97706" : "#DC2626";
  const seviye = skor >= 70 ? "Yüksek" : skor >= 40 ? "Orta" : "Düşük";

  // Background arc (180° → 0°)
  const bx1 = cx - r;
  const by1 = cy;
  const bx2 = cx + r;
  const by2 = cy;

  return (
    <div style={{ width: size, textAlign: "center" }}>
      <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.7}`}>
        {/* Background arc */}
        <path
          d={`M ${bx1} ${by1} A ${r} ${r} 0 0 1 ${bx2} ${by2}`}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Active arc */}
        <path
          d={`M ${bx1} ${by1} A ${r} ${r} 0 0 1 ${ex} ${ey}`}
          fill="none"
          stroke={renk}
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Center text */}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="22" fontWeight="700" fill="#1B2A4A">
          {skor}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize="7" fill="#94a3b8" letterSpacing="0.05em">
          / 100
        </text>
      </svg>
      <div style={{ fontSize: "10pt", fontWeight: 600, color: renk, marginTop: -8 }}>{seviye}</div>
      {etiket && <div style={{ fontSize: "8pt", color: "#94a3b8", marginTop: 2 }}>{etiket}</div>}
    </div>
  );
}

// ── Histogram (emsal dağılım) ──────────────────────────────────
interface HistogramProps {
  degerler: number[];
  bins?: number;
  vurguDeger?: number;
  width?: number;
  height?: number;
  birim?: string;
}

export function Histogram({ degerler, bins = 8, vurguDeger, width = 480, height = 120, birim = "TL/m²" }: HistogramProps) {
  if (degerler.length === 0) return <div style={{ fontSize: "9pt", color: "#94a3b8" }}>Veri yok</div>;
  const min = Math.min(...degerler);
  const max = Math.max(...degerler);
  const aralik = (max - min) || 1;
  const binW = aralik / bins;
  const histo = new Array(bins).fill(0);
  degerler.forEach(d => {
    const i = Math.min(Math.floor((d - min) / binW), bins - 1);
    histo[i]++;
  });
  const maxCount = Math.max(...histo, 1);
  const padding = 28;
  const barW = (width - padding * 2) / bins;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ fontSize: "8pt" }}>
      {histo.map((c, i) => {
        const h = (c / maxCount) * (height - 30);
        const x = padding + i * barW;
        const y = height - 18 - h;
        const merkez = min + (i + 0.5) * binW;
        const vurgulu = vurguDeger != null && vurguDeger >= min + i * binW && vurguDeger < min + (i + 1) * binW;
        return (
          <g key={i}>
            <rect
              x={x + 1}
              y={y}
              width={barW - 2}
              height={h}
              fill={vurgulu ? "#C9A86A" : "#94A3B8"}
              opacity={vurgulu ? 1 : 0.7}
              rx="1"
            />
            {c > 0 && (
              <text x={x + barW / 2} y={y - 2} textAnchor="middle" fontSize="7" fill="#475569">{c}</text>
            )}
          </g>
        );
      })}
      {/* X axis labels */}
      <line x1={padding} y1={height - 18} x2={width - padding} y2={height - 18} stroke="#cbd5e1" strokeWidth="0.5" />
      <text x={padding} y={height - 4} fontSize="7" fill="#94a3b8">{Math.round(min).toLocaleString("tr-TR")}</text>
      <text x={width - padding} y={height - 4} textAnchor="end" fontSize="7" fill="#94a3b8">{Math.round(max).toLocaleString("tr-TR")} {birim}</text>
      {/* Vurgu çizgisi */}
      {vurguDeger != null && vurguDeger >= min && vurguDeger <= max && (
        <line
          x1={padding + ((vurguDeger - min) / aralik) * (width - padding * 2)}
          y1={6}
          x2={padding + ((vurguDeger - min) / aralik) * (width - padding * 2)}
          y2={height - 18}
          stroke="#C9A86A"
          strokeWidth="2"
          strokeDasharray="3 2"
        />
      )}
    </svg>
  );
}

// ── Mahalle özellik radar ──────────────────────────────────────
interface OzellikBarProps {
  ozellikler: { etiket: string; deger: number; max: number; ters?: boolean; not?: string }[];
  width?: number;
}

/** Mesafe-tabanlı: küçük = iyi (sahil yakın). Score = 1 - clamp(deger/max). */
export function OzellikBar({ ozellikler, width = 480 }: OzellikBarProps) {
  return (
    <div style={{ width, fontSize: "9pt" }}>
      {ozellikler.map((o, i) => {
        const pct = o.ters
          ? Math.max(0, Math.min(100, (1 - o.deger / o.max) * 100))
          : Math.max(0, Math.min(100, (o.deger / o.max) * 100));
        const renk = pct >= 60 ? "#059669" : pct >= 30 ? "#D97706" : "#DC2626";
        return (
          <div key={i} style={{ marginBottom: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ color: "#475569", fontWeight: 500 }}>
                {o.etiket}
                {o.not && <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: 4 }}>· {o.not}</span>}
              </span>
              <span style={{ color: "#1B2A4A", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {o.deger.toFixed(1)} {o.ters ? "km" : ""}
              </span>
            </div>
            <div style={{ height: 6, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
              <div
                style={{ height: "100%", width: `${pct}%`, background: renk, borderRadius: 3 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
