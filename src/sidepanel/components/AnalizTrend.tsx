import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AnalizTip,
  ANALIZ_TIPI_ETIKETLERI,
  type YilOzeti,
  getYilSerisi,
} from "../../lib/tkgm-analiz";
import { compactSayi } from "../../lib/viz";
import { downloadBlob, svgToPng } from "../../lib/svg-export";

interface Props {
  ilceKodu: number;
  /** Aktif/seçili tipler — varsayılan tümü */
  tipler?: AnalizTip[];
  yilBaslangic?: number;
  yilBitis?: number;
  /** Yıla tıklayınca callback */
  onYilSec?: (yil: number, tip: AnalizTip) => void;
  /** Hangi yıl şu an seçili (vurgu için) */
  seciliYil?: number;
}

const TIP_RENKLERI: Record<AnalizTip, string> = {
  1: "#7c3aed", // mor — alım satım yoğunluğu
  2: "#0d9488", // teal — ana taşınmaz
  3: "#dc2626", // kırmızı — ipotekli
  4: "#0891b2", // cyan — bağımsız bölüm
  5: "#ea580c", // turuncu — bb ipotekli
};

export function AnalizTrend({
  ilceKodu,
  tipler = [1, 2],
  yilBaslangic,
  yilBitis,
  onYilSec,
  seciliYil,
}: Props) {
  const yb = yilBaslangic ?? new Date().getFullYear() - 11;
  const ye = yilBitis ?? new Date().getFullYear() - 1;
  const [seriler, setSeriler] = useState<Map<AnalizTip, YilOzeti[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [aktifTipler, setAktifTipler] = useState<Set<AnalizTip>>(new Set(tipler));
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  async function pngOlarakIndir() {
    if (!svgRef.current) return;
    setExportLoading(true);
    try {
      const blob = await svgToPng(svgRef.current, 3);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `tkgm-trend-ilce${ilceKodu}-${stamp}.png`);
    } catch (e) {
      console.error(e);
    } finally {
      setExportLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setSeriler(new Map());

    (async () => {
      const yeni = new Map<AnalizTip, YilOzeti[]>();
      for (const tip of tipler) {
        if (cancelled) break;
        const seri = await getYilSerisi(ilceKodu, tip, yb, ye, ctrl.signal);
        if (cancelled) break;
        yeni.set(tip, seri);
        setSeriler(new Map(yeni));
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ilceKodu, yb, ye]);

  const yillar = useMemo(() => {
    const out: number[] = [];
    for (let y = yb; y <= ye; y++) out.push(y);
    return out;
  }, [yb, ye]);

  // Tüm seriler için global max — aynı eksende karşılaştırma için
  const globalMax = useMemo(() => {
    let m = 0;
    for (const seri of seriler.values()) {
      for (const o of seri) if (o.toplamIslem > m) m = o.toplamIslem;
    }
    return m;
  }, [seriler]);

  const W = 280;
  const H = 110;
  const padL = 26;
  const padR = 6;
  const padT = 6;
  const padB = 18;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const xAt = (i: number) =>
    yillar.length <= 1 ? padL + innerW / 2 : padL + (i / (yillar.length - 1)) * innerW;
  const yAt = (v: number) => padT + innerH - (globalMax > 0 ? (v / globalMax) * innerH : 0);

  return (
    <div className="rounded border border-slate-200 bg-white p-2">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-tkgm-ink">
          📈 Yıllara göre işlem trendi
        </div>
        <div className="flex items-center gap-2">
          {loading && <span className="text-[10px] text-tkgm-muted">yükleniyor…</span>}
          <button
            type="button"
            onClick={pngOlarakIndir}
            disabled={exportLoading || seriler.size === 0}
            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] hover:bg-slate-50 disabled:opacity-40"
            title="PNG olarak indir"
          >
            {exportLoading ? "…" : "⬇ PNG"}
          </button>
        </div>
      </div>

      {/* Tip toggle butonları */}
      <div className="mb-2 flex flex-wrap gap-1">
        {tipler.map((tip) => {
          const aktif = aktifTipler.has(tip);
          return (
            <button
              key={tip}
              type="button"
              onClick={() => {
                const yeni = new Set(aktifTipler);
                if (aktif) yeni.delete(tip);
                else yeni.add(tip);
                setAktifTipler(yeni);
              }}
              className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition"
              style={{
                borderColor: TIP_RENKLERI[tip],
                background: aktif ? TIP_RENKLERI[tip] : "white",
                color: aktif ? "white" : TIP_RENKLERI[tip],
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: aktif ? "white" : TIP_RENKLERI[tip] }}
              />
              {ANALIZ_TIPI_ETIKETLERI[tip]}
            </button>
          );
        })}
      </div>

      <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* Y ekseni grid */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={padL}
              x2={W - padR}
              y1={padT + innerH * (1 - f)}
              y2={padT + innerH * (1 - f)}
              stroke="#e2e8f0"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            <text
              x={padL - 3}
              y={padT + innerH * (1 - f) + 3}
              fontSize={8}
              textAnchor="end"
              fill="#94a3b8"
            >
              {compactSayi(Math.round(globalMax * f))}
            </text>
          </g>
        ))}

        {/* X ekseni — yıl etiketleri (her 2 yılda bir) */}
        {yillar.map((yil, i) =>
          i % 2 === 0 || i === yillar.length - 1 ? (
            <text
              key={yil}
              x={xAt(i)}
              y={H - 4}
              fontSize={8}
              textAnchor="middle"
              fill="#64748b"
            >
              {yil}
            </text>
          ) : null,
        )}

        {/* Seçili yıl vurgu çubuğu */}
        {seciliYil != null && yillar.includes(seciliYil) && (
          <line
            x1={xAt(yillar.indexOf(seciliYil))}
            x2={xAt(yillar.indexOf(seciliYil))}
            y1={padT}
            y2={padT + innerH}
            stroke="#1e293b"
            strokeWidth={1}
            strokeDasharray="3 2"
            opacity={0.5}
          />
        )}

        {/* Çizgiler */}
        {[...seriler.entries()].map(([tip, seri]) => {
          if (!aktifTipler.has(tip)) return null;
          const points = seri
            .map((o, i) => `${xAt(i)},${yAt(o.toplamIslem)}`)
            .join(" ");
          const renk = TIP_RENKLERI[tip];
          return (
            <g key={tip}>
              <polyline
                points={points}
                fill="none"
                stroke={renk}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {seri.map((o, i) => (
                <circle
                  key={i}
                  cx={xAt(i)}
                  cy={yAt(o.toplamIslem)}
                  r={2.5}
                  fill={renk}
                  className="cursor-pointer"
                  onClick={() => onYilSec?.(o.yil, tip)}
                >
                  <title>
                    {o.yil} · {ANALIZ_TIPI_ETIKETLERI[tip]} · {o.toplamIslem} işlem ·{" "}
                    {o.parselSayisi} parsel
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
