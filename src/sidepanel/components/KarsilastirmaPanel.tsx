import { useEffect, useMemo, useState } from "react";
import {
  type AnalizTip,
  ANALIZ_TIPI_ETIKETLERI,
  getYilSerisi,
  type YilOzeti,
} from "../../lib/tkgm-analiz";
import { compactSayi } from "../../lib/viz";
import { IlceSecici } from "./IlceSecici";

interface KarsilastirmaIlcesi {
  ilceKodu: number;
  ilceAd: string;
  ilAd: string;
  renk: string;
}

const RENKLER = ["#7c3aed", "#0d9488", "#dc2626", "#ea580c"];

interface Props {
  /** Aktif ilçe (Lab'dan gelen) — varsayılan ilk karşılaştırma slot */
  baslangicIlce: { ilceKodu: number; ilceAd: string } | null;
  analizTip: AnalizTip;
  yil: number;
}

export function KarsilastirmaPanel({ baslangicIlce, analizTip, yil }: Props) {
  const [acik, setAcik] = useState(false);
  const [ilceler, setIlceler] = useState<KarsilastirmaIlcesi[]>(() =>
    baslangicIlce
      ? [
          {
            ilceKodu: baslangicIlce.ilceKodu,
            ilceAd: baslangicIlce.ilceAd,
            ilAd: "",
            renk: RENKLER[0]!,
          },
        ]
      : [],
  );

  function ekle(yeni: { ilceKodu: number; ilceAd: string; ilAd: string }) {
    if (ilceler.find((x) => x.ilceKodu === yeni.ilceKodu)) return;
    if (ilceler.length >= 4) return;
    const renk = RENKLER[ilceler.length] ?? "#64748b";
    setIlceler([...ilceler, { ...yeni, renk }]);
  }

  function sil(ilceKodu: number) {
    setIlceler(ilceler.filter((x) => x.ilceKodu !== ilceKodu));
  }

  if (!acik) {
    return (
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="w-full rounded border border-dashed border-slate-300 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
      >
        🆚 İlçe karşılaştırma aç
      </button>
    );
  }

  return (
    <div className="rounded border border-slate-200 bg-white p-2 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-tkgm-ink">
          🆚 İlçe karşılaştırma · {ANALIZ_TIPI_ETIKETLERI[analizTip]}
        </div>
        <button
          type="button"
          onClick={() => setAcik(false)}
          className="text-[10px] text-tkgm-muted hover:underline"
        >
          Kapat
        </button>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1">
        {ilceler.map((il) => (
          <span
            key={il.ilceKodu}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-white"
            style={{ background: il.renk }}
          >
            {il.ilceAd}
            <button
              type="button"
              onClick={() => sil(il.ilceKodu)}
              className="ml-0.5 opacity-70 hover:opacity-100"
              title="Çıkar"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {ilceler.length < 4 && (
        <div className="mb-2">
          <IlceSecici onSec={ekle} />
        </div>
      )}

      {ilceler.length >= 1 && (
        <KarsilastirmaCizimi
          ilceler={ilceler}
          analizTip={analizTip}
          seciliYil={yil}
        />
      )}
    </div>
  );
}

function KarsilastirmaCizimi({
  ilceler,
  analizTip,
  seciliYil,
}: {
  ilceler: KarsilastirmaIlcesi[];
  analizTip: AnalizTip;
  seciliYil: number;
}) {
  const [seriler, setSeriler] = useState<Map<number, YilOzeti[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const yb = new Date().getFullYear() - 11;
  const ye = new Date().getFullYear() - 1;

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setSeriler(new Map());
    (async () => {
      const yeni = new Map<number, YilOzeti[]>();
      for (const ilce of ilceler) {
        if (cancelled) break;
        try {
          const seri = await getYilSerisi(ilce.ilceKodu, analizTip, yb, ye, ctrl.signal);
          if (cancelled) break;
          yeni.set(ilce.ilceKodu, seri);
          setSeriler(new Map(yeni));
        } catch {}
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [ilceler.map((i) => i.ilceKodu).join(","), analizTip]);

  const yillar = useMemo(() => {
    const out: number[] = [];
    for (let y = yb; y <= ye; y++) out.push(y);
    return out;
  }, [yb, ye]);

  const globalMax = useMemo(() => {
    let m = 0;
    for (const seri of seriler.values()) {
      for (const o of seri) if (o.toplamIslem > m) m = o.toplamIslem;
    }
    return m;
  }, [seriler]);

  const seciliYilOzetleri = useMemo(() => {
    return ilceler.map((ilce) => {
      const seri = seriler.get(ilce.ilceKodu) ?? [];
      const o = seri.find((s) => s.yil === seciliYil);
      return { ilce, ozet: o };
    });
  }, [ilceler, seriler, seciliYil]);

  const W = 280;
  const H = 100;
  const padL = 26;
  const padR = 6;
  const padT = 4;
  const padB = 16;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const xAt = (i: number) =>
    yillar.length <= 1 ? padL + innerW / 2 : padL + (i / (yillar.length - 1)) * innerW;
  const yAt = (v: number) =>
    padT + innerH - (globalMax > 0 ? (v / globalMax) * innerH : 0);

  return (
    <div className="space-y-2">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {[0.5, 1].map((f) => (
          <line
            key={f}
            x1={padL}
            x2={W - padR}
            y1={padT + innerH * (1 - f)}
            y2={padT + innerH * (1 - f)}
            stroke="#e2e8f0"
            strokeDasharray="2 2"
          />
        ))}
        <text x={padL - 3} y={padT + 4} fontSize={8} textAnchor="end" fill="#94a3b8">
          {compactSayi(globalMax)}
        </text>
        {/* Seçili yıl vurgusu */}
        {yillar.includes(seciliYil) && (
          <line
            x1={xAt(yillar.indexOf(seciliYil))}
            x2={xAt(yillar.indexOf(seciliYil))}
            y1={padT}
            y2={padT + innerH}
            stroke="#1e293b"
            strokeWidth={1}
            strokeDasharray="3 2"
            opacity={0.4}
          />
        )}
        {/* X etiket */}
        {[0, Math.floor(yillar.length / 2), yillar.length - 1].map((i) => (
          <text
            key={i}
            x={xAt(i)}
            y={H - 4}
            fontSize={8}
            textAnchor="middle"
            fill="#64748b"
          >
            {yillar[i]}
          </text>
        ))}
        {/* Çizgiler */}
        {ilceler.map((ilce) => {
          const seri = seriler.get(ilce.ilceKodu);
          if (!seri) return null;
          const points = seri.map((o, i) => `${xAt(i)},${yAt(o.toplamIslem)}`).join(" ");
          return (
            <g key={ilce.ilceKodu}>
              <polyline
                points={points}
                fill="none"
                stroke={ilce.renk}
                strokeWidth={1.8}
                strokeLinejoin="round"
              />
            </g>
          );
        })}
      </svg>

      {loading && (
        <div className="text-[10px] italic text-tkgm-muted">yükleniyor…</div>
      )}

      <div className="rounded bg-slate-50 p-1.5">
        <div className="text-[10px] font-medium text-tkgm-muted">
          {seciliYil} yılı toplam işlem
        </div>
        {seciliYilOzetleri.map(({ ilce, ozet }) => (
          <div
            key={ilce.ilceKodu}
            className="flex items-center justify-between text-[11px]"
          >
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: ilce.renk }}
              />
              {ilce.ilceAd}
            </span>
            <span className="font-bold">
              {ozet ? compactSayi(ozet.toplamIslem) : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
