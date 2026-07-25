/**
 * UyduDegisimKarti — Sprint Sentinel S4
 *
 * Sentinel-2 L2A tabanlı NDVI analizi ve arazi değişim tespiti.
 *
 * Sekmeler:
 *   1. NDVI Özeti — mevcut vejetasyon skoru + tarla kalitesi + sınıf çubukları
 *   2. Değişim Analizi — son 2 yıl delta NDVI + yapılaşma/yeşillenme tespiti
 *   3. Sezonsal Trend — 12 ay NDVI grafiği (tarım mevsimselliği)
 *
 * Sadece tarla/arsa nitelikli parsellerde tam analiz yapar.
 * Diğer niteliklerde basit NDVI gösterir.
 *
 * Pro tier: tam analiz (değişim + sezonsal).
 * Free tier: sadece anlık NDVI özeti.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Satellite, Leaf, TrendingUp, TrendingDown,
  AlertTriangle, RefreshCw, Info, BarChart2,
} from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import {
  type NdviSonuc,
  type NdviDegisimSonuc,
  type SezonalNdvi,
  ndviHesapla,
  ndviDegisimHesapla,
  ndviYorumla,
  sezonalNdviGetir,
  sentinelGoruntuleriAra,
  bboxFromKoordlar,
} from "../../lib/sentinel2";
import { useLisans } from "../../lib/lisans";
import { Card, Section } from "../ui/Card";

// ── Renk yardımcıları ────────────────────────────────────────────────────────

function ndviRenk(ndvi: number): string {
  if (ndvi < 0)    return "#94a3b8"; // gri — bina/su
  if (ndvi < 0.1)  return "#d4a373"; // kahve — çıplak toprak
  if (ndvi < 0.2)  return "#a3b18a"; // açık yeşil
  if (ndvi < 0.35) return "#52b788"; // yeşil
  if (ndvi < 0.55) return "#2d6a4f"; // koyu yeşil
  return "#1b4332";                    // çok koyu yeşil — orman
}

// ── NDVI gauge ───────────────────────────────────────────────────────────────

function NdviGauge({ ndvi }: { ndvi: number }) {
  const clamp = Math.max(-1, Math.min(1, ndvi));
  const pct = Math.round(((clamp + 1) / 2) * 100); // -1..1 → 0..100%
  const renk = ndviRenk(ndvi);
  const yorum = ndviYorumla(ndvi);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-2xs">
        <span className="font-semibold text-slate-700 dark:text-slate-200">
          NDVI: <span style={{ color: renk }} className="tabular-nums">{ndvi.toFixed(3)}</span>
        </span>
        <span className="text-slate-500 dark:text-slate-400">{yorum.etiket}</span>
      </div>
      {/* Renk spektrum çubuğu */}
      <div className="relative h-3 rounded-full overflow-hidden" style={{
        background: "linear-gradient(to right, #94a3b8, #d4a373, #a3b18a, #52b788, #2d6a4f, #1b4332)",
      }}>
        <div
          className="absolute top-0 h-full w-1 rounded-full bg-white border border-slate-400 shadow"
          style={{ left: `calc(${pct}% - 2px)` }}
        />
      </div>
      <div className="flex justify-between text-3xs text-slate-400">
        <span>-1 (Su/Bina)</span>
        <span>0 (Toprak)</span>
        <span>+1 (Orman)</span>
      </div>
    </div>
  );
}

// ── Sınıf çubukları ──────────────────────────────────────────────────────────

function SinifCubuklar({ ndviSonuc }: { ndviSonuc: NdviSonuc }) {
  const siniflar = [
    { etiket: "Vejetasyon", yuzde: ndviSonuc.vejetasyonYuzde, renk: "bg-emerald-500" },
    { etiket: "Çıplak Toprak", yuzde: ndviSonuc.toprakYuzde, renk: "bg-amber-400" },
    { etiket: "Su/Bina/Diğer", yuzde: ndviSonuc.digerYuzde, renk: "bg-slate-400" },
  ];

  return (
    <div className="space-y-1.5">
      {siniflar.map((s) => (
        <div key={s.etiket} className="flex items-center gap-2">
          <span className="w-24 text-3xs text-slate-500 dark:text-slate-400 truncate">{s.etiket}</span>
          <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div className={`h-full rounded-full ${s.renk}`} style={{ width: `${s.yuzde}%` }} />
          </div>
          <span className="w-8 text-right text-3xs text-slate-600 dark:text-slate-300 tabular-nums">
            %{s.yuzde}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Delta badge ──────────────────────────────────────────────────────────────

function DeltaBadge({ degisim }: { degisim: NdviDegisimSonuc }) {
  const renkMap = {
    yesil:   "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/30 dark:text-emerald-300",
    sari:    "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/30 dark:text-amber-300",
    kirmizi: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950/30 dark:text-red-300",
    mavi:    "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950/30 dark:text-blue-300",
  };

  const Icon = degisim.deltaNdvi > 0.05 ? TrendingUp
    : degisim.deltaNdvi < -0.05 ? TrendingDown
    : null;

  return (
    <div className={`rounded-lg border px-3 py-2 ring-1 ring-inset ${renkMap[degisim.renk]}`}>
      <div className="flex items-start gap-2">
        {degisim.yapilasmaArtis ? (
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        ) : Icon ? (
          <Icon className="h-4 w-4 shrink-0 mt-0.5" />
        ) : null}
        <div className="min-w-0">
          <div className="text-2xs font-semibold mb-0.5">
            {degisim.donusumTip === "beton-artis" && "⚠ Yapılaşma / Arazi Dönüşümü Tespiti"}
            {degisim.donusumTip === "yesillendi" && "✓ Vejetasyon Artışı"}
            {degisim.donusumTip === "degismedi" && "— Stabil Arazi Kullanımı"}
            {degisim.donusumTip === "belirsiz" && "~ Orta Düzey Değişim"}
          </div>
          <p className="text-3xs leading-relaxed">{degisim.yorum}</p>
          <div className="mt-1.5 flex items-center gap-3 text-3xs">
            <span>Önceki: <b className="tabular-nums">{degisim.eski.ortalama.toFixed(3)}</b></span>
            <span>Güncel: <b className="tabular-nums">{degisim.yeni.ortalama.toFixed(3)}</b></span>
            <span>Δ: <b className="tabular-nums">{degisim.deltaNdvi > 0 ? "+" : ""}{degisim.deltaNdvi.toFixed(3)}</b></span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sezonsal grafik ──────────────────────────────────────────────────────────

function SezonalGrafik({ veri }: { veri: SezonalNdvi[] }) {
  if (veri.length === 0) return null;

  const maks = Math.max(...veri.map((v) => v.ndvi), 0.5);
  const W = 280, H = 80, padL = 28, padB = 18, padT = 4, padR = 4;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xAt = (i: number) => padL + (i / Math.max(veri.length - 1, 1)) * innerW;
  const yAt = (v: number) => padT + innerH - (v / Math.max(maks, 0.01)) * innerH;

  const points = veri.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v.ndvi).toFixed(1)}`).join(" ");
  const areaPoints = [
    `${xAt(0).toFixed(1)},${(padT + innerH).toFixed(1)}`,
    ...veri.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v.ndvi).toFixed(1)}`),
    `${xAt(veri.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)}`,
  ].join(" ");

  return (
    <div className="space-y-1">
      <div className="text-3xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        NDVI Sezonsal Trend (son 12 ay)
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sezonsal NDVI trend grafiği">
        {/* Grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={padL} x2={W - padR} y1={yAt(maks * f)} y2={yAt(maks * f)}
            stroke="#e2e8f0" strokeDasharray="2 2" strokeWidth={0.5} />
        ))}
        {/* Y etiket */}
        <text x={padL - 3} y={padT + 4} fontSize={8} textAnchor="end" fill="#94a3b8">
          {maks.toFixed(1)}
        </text>
        <text x={padL - 3} y={padT + innerH} fontSize={8} textAnchor="end" fill="#94a3b8">0</text>
        {/* Alan dolgu */}
        <polygon points={areaPoints} fill="#10b981" fillOpacity={0.12} />
        {/* Çizgi */}
        <polyline points={points} fill="none" stroke="#10b981" strokeWidth={2} strokeLinejoin="round" />
        {/* Noktalar */}
        {veri.map((v, i) => (
          <circle key={i} cx={xAt(i)} cy={yAt(v.ndvi)} r={2.5}
            fill={v.bulutOrani > 20 ? "#f59e0b" : "#10b981"}
            opacity={0.8}>
            <title>{v.ay}: NDVI {v.ndvi.toFixed(3)} · Bulut %{v.bulutOrani}</title>
          </circle>
        ))}
        {/* X etiketleri — 3 nokta */}
        {[0, Math.floor((veri.length - 1) / 2), veri.length - 1].map((idx) => {
          const v = veri[idx];
          if (!v) return null;
          return (
            <text key={idx} x={xAt(idx)} y={H - 4} fontSize={8} textAnchor="middle" fill="#64748b">
              {v.ay.slice(5)} {/* MM */}
            </text>
          );
        })}
      </svg>
      <p className="text-3xs text-slate-400 italic">
        Sarı nokta = bulut yüksek ({">"}%20). Zirve değerler aktif tarım dönemini gösterir.
      </p>
    </div>
  );
}

// ── Ana bileşen ──────────────────────────────────────────────────────────────

type Sekme = "ndvi" | "degisim" | "sezon";

interface Props {
  parsel: Parsel;
}

export function UyduDegisimKarti({ parsel }: Props) {
  const lisans = useLisans();
  const canDegisim = lisans.can("ai-fiyat"); // Pro tier
  const [sekme, setSekme] = useState<Sekme>("ndvi");

  const [ndviSonuc, setNdviSonuc] = useState<NdviSonuc | null>(null);
  const [degisim, setDegisim] = useState<NdviDegisimSonuc | null>(null);
  const [sezon, setSezon] = useState<SezonalNdvi[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const bbox = useMemo(() => {
    if (parsel.koordinatlar?.length) return bboxFromKoordlar(parsel.koordinatlar);
    if (parsel.merkezNokta) {
      return bboxFromKoordlar([parsel.merkezNokta, parsel.merkezNokta]);
    }
    return null;
  }, [parsel.adaNo, parsel.parselNo]);

  // Nitelik kontrolü — tarla/arsa değilse uyarı
  const nitelikTarlaArsa = useMemo(() => {
    const n = (parsel.nitelik ?? "").toLocaleLowerCase("tr");
    return n.includes("tarla") || n.includes("arsa") || n.includes("tarım") || n.includes("bağ") || n.includes("bahçe");
  }, [parsel.nitelik]);

  async function ndviYukle() {
    if (!bbox) {
      setHata("Parsel koordinatı yok — NDVI hesaplanamaz.");
      return;
    }
    setYukleniyor(true);
    setHata(null);
    setNdviSonuc(null);
    setDegisim(null);
    setSezon([]);

    try {
      // Anlık NDVI
      const goruntular = await sentinelGoruntuleriAra(bbox, { maks: 3, bulutEsigi: 20 });
      if (!goruntular.length) {
        setHata("Uygun bulut-temiz görüntü bulunamadı (son 2 yılda %20 altı bulut yok). Sonbaharda tekrar deneyin.");
        return;
      }
      const ndvi = await ndviHesapla(goruntular[0]!, bbox);
      setNdviSonuc(ndvi);

      // Pro: değişim + sezonsal paralel
      if (canDegisim) {
        const [deg, sez] = await Promise.allSettled([
          ndviDegisimHesapla(bbox),
          sezonalNdviGetir(bbox),
        ]);
        if (deg.status === "fulfilled") setDegisim(deg.value);
        if (sez.status === "fulfilled") setSezon(sez.value);
      }
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally {
      setYukleniyor(false);
    }
  }

  // Parsel değişince sıfırla
  useEffect(() => {
    setNdviSonuc(null);
    setDegisim(null);
    setSezon([]);
    setHata(null);
  }, [parsel.adaNo, parsel.parselNo]);

  const yorum = ndviSonuc ? ndviYorumla(ndviSonuc.ortalama) : null;

  // Başlangıç durumu
  if (!ndviSonuc && !yukleniyor && !hata) {
    return (
      <Section
        title="Uydu NDVI Analizi"
        icon={<Satellite className="h-3.5 w-3.5" />}
        accent="success"
        actions={
          <button
            type="button"
            onClick={() => void ndviYukle()}
            className="flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-2xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/40 dark:bg-emerald-950/20 dark:text-emerald-300 transition"
          >
            <Satellite className="h-3 w-3" />
            Analiz et
          </button>
        }
      >
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="flex items-start gap-2">
            <Leaf className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-2xs font-medium text-slate-700 dark:text-slate-200 mb-0.5">
                Sentinel-2 uydu görüntüsü ile NDVI analizi
              </p>
              <p className="text-3xs text-slate-500 dark:text-slate-400 leading-relaxed">
                ESA Copernicus 10m çözünürlüklü veri · Tarla verimliliği · Arazi değişim tespiti
                {canDegisim && " · 12 aylık sezonsal trend"}
              </p>
              {!nitelikTarlaArsa && (
                <p className="mt-1 text-3xs text-amber-700 dark:text-amber-400 italic">
                  Nitelik: {parsel.nitelik} — NDVI tarla/arsa parsellerde daha anlamlıdır.
                </p>
              )}
            </div>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="Uydu NDVI Analizi"
      icon={<Satellite className="h-3.5 w-3.5" />}
      accent="success"
      actions={
        <button type="button" onClick={() => void ndviYukle()} disabled={yukleniyor}
          className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-40 dark:hover:text-slate-300"
          title="Yenile">
          <RefreshCw className={`h-3.5 w-3.5 ${yukleniyor ? "animate-spin" : ""}`} />
        </button>
      }
    >
      {hata && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-2xs text-red-700 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-300">
          {hata}
        </div>
      )}

      {yukleniyor && !ndviSonuc && (
        <div className="flex items-center justify-center gap-2 py-6 text-2xs text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin text-emerald-500" />
          Sentinel-2 görüntüleri işleniyor…
        </div>
      )}

      {ndviSonuc && (
        <div className="space-y-3">
          {/* Sekme çubuğu */}
          <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" role="tablist">
            <button type="button" role="tab" onClick={() => setSekme("ndvi")}
              aria-selected={sekme === "ndvi"}
              className={`flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1 text-3xs font-medium transition ${
                sekme === "ndvi" ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-300" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}>
              <Leaf className="h-3 w-3" />NDVI
            </button>
            <button type="button" role="tab" onClick={() => setSekme("degisim")}
              aria-selected={sekme === "degisim"}
              disabled={!canDegisim}
              className={`flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1 text-3xs font-medium transition disabled:opacity-40 ${
                sekme === "degisim" ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-300" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}>
              <AlertTriangle className="h-3 w-3" />Değişim
            </button>
            <button type="button" role="tab" onClick={() => setSekme("sezon")}
              aria-selected={sekme === "sezon"}
              disabled={!canDegisim}
              className={`flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1 text-3xs font-medium transition disabled:opacity-40 ${
                sekme === "sezon" ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-300" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}>
              <BarChart2 className="h-3 w-3" />Sezon
            </button>
          </div>

          {/* NDVI sekmesi */}
          {sekme === "ndvi" && (
            <div className="space-y-3">
              <NdviGauge ndvi={ndviSonuc.ortalama} />
              {yorum && (
                <div className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-800/50">
                  <Info className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-2xs font-medium text-slate-700 dark:text-slate-200 mb-0.5">
                      {yorum.etiket}
                      <span className={`ml-2 text-3xs px-1.5 py-0.5 rounded font-medium ${
                        yorum.tarlaKalitesi === "mukemmel" ? "bg-emerald-100 text-emerald-700" :
                        yorum.tarlaKalitesi === "iyi" ? "bg-green-100 text-green-700" :
                        yorum.tarlaKalitesi === "orta" ? "bg-amber-100 text-amber-700" :
                        yorum.tarlaKalitesi === "dusuk" ? "bg-red-100 text-red-700" :
                        "bg-slate-100 text-slate-600"
                      }`}>
                        {yorum.tarlaKalitesi === "mukemmel" ? "Mükemmel" :
                         yorum.tarlaKalitesi === "iyi" ? "İyi" :
                         yorum.tarlaKalitesi === "orta" ? "Orta" :
                         yorum.tarlaKalitesi === "dusuk" ? "Düşük" : "—"}
                      </span>
                    </div>
                    <p className="text-3xs text-slate-500 dark:text-slate-400 leading-relaxed">{yorum.aciklama}</p>
                  </div>
                </div>
              )}
              <SinifCubuklar ndviSonuc={ndviSonuc} />
              <div className="text-3xs text-slate-400 dark:text-slate-500">
                Görüntü: {new Date(ndviSonuc.tarih).toLocaleDateString("tr-TR")} · Bulut: %{ndviSonuc.bulutOrani}
                {" · Kaynak: ESA Sentinel-2 L2A"}
              </div>
            </div>
          )}

          {/* Değişim sekmesi */}
          {sekme === "degisim" && (
            <div className="space-y-3">
              {!canDegisim ? (
                <p className="text-2xs text-slate-500 text-center py-4">Pro plan gerektirir.</p>
              ) : degisim ? (
                <DeltaBadge degisim={degisim} />
              ) : yukleniyor ? (
                <div className="flex items-center justify-center gap-2 py-4 text-2xs text-slate-500">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />Değişim hesaplanıyor…
                </div>
              ) : (
                <p className="text-2xs text-slate-500 text-center py-4 italic">
                  Değişim verisi mevcut değil (görüntü bulunamadı).
                </p>
              )}
            </div>
          )}

          {/* Sezonsal sekmesi */}
          {sekme === "sezon" && (
            <div>
              {!canDegisim ? (
                <p className="text-2xs text-slate-500 text-center py-4">Pro plan gerektirir.</p>
              ) : sezon.length > 0 ? (
                <SezonalGrafik veri={sezon} />
              ) : yukleniyor ? (
                <div className="flex items-center justify-center gap-2 py-4 text-2xs text-slate-500">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />Sezonsal veri hesaplanıyor…
                </div>
              ) : (
                <p className="text-2xs text-slate-500 text-center py-4 italic">
                  Sezonsal veri yok (bulutlu dönemler atlandı).
                </p>
              )}
            </div>
          )}

          <p className="text-3xs italic text-slate-400 dark:text-slate-500">
            Sentinel-2 analizi referans niteliğindedir. Tarımsal karar için agronomist görüşü alın.
          </p>
        </div>
      )}
    </Section>
  );
}
