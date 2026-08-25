/**
 * StatsBlogu — Bölge tarama istatistikleri özet bloğu
 *
 * BolgeView.tsx'den çıkarıldı (SRP).
 * Bağımlılıklar: bolge-profili, Charts, nitelikRenkBul, tkgm-analiz, SaveScanDugmesi.
 */

import { Sun as SunIcon, Sprout as SproutIcon } from "lucide-react";
import { nitelikRenkBul, type BolgeStats } from "../../lib/bolge-profili";
import { PieChart, PieLegend, Histogram } from "./Charts";
import type { Parsel } from "../../types/tkgm";
import type { AnalizNoktasi } from "../../lib/tkgm-analiz";
import { SaveScanDugmesi } from "./SaveScanDugmesi";

interface Props {
  stats: BolgeStats;
  ilanSayisi: number;
  parsellerForSave: Parsel[];
  bolgeGunes: { kwhKwp: number; sinif: string } | null;
  bolgeTarim: {
    kusak: string;
    yagis: number;
    sicaklik: number;
    enUygunUrunler: string[];
  } | null;
  tkgmHeatNoktalari: AnalizNoktasi[] | null;
  sahibindenJoin: { mahalle: string; ortPerM2: number; adet: number; renkSiniri: number }[] | null;
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2 py-0.5 text-[11px]">
      <span className="text-tkgm-muted">{k}</span>
      <span className="font-medium text-tkgm-ink">{v}</span>
    </div>
  );
}

export function StatsBlogu({
  stats,
  ilanSayisi,
  parsellerForSave,
  bolgeGunes,
  bolgeTarim,
  tkgmHeatNoktalari,
  sahibindenJoin,
}: Props) {
  const verim =
    stats.toplamSorgu > 0
      ? Math.round((stats.basariliSorgu / stats.toplamSorgu) * 100)
      : 0;

  return (
    <div className="space-y-2">
      <div className="rounded border border-slate-200 bg-white p-2">
        <div className="font-semibold text-tkgm-ink">📊 Bölge Profili</div>
        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
          <KV k="Eşsiz parsel" v={String(stats.parselSayisi)} />
          <KV k="Toplam alan" v={`${(stats.toplamAlanM2 / 10_000).toFixed(1)} ha`} />
          <KV k="Ortalama" v={`${stats.ortalamaAlanM2.toLocaleString("tr-TR")} m²`} />
          <KV k="Medyan" v={`${stats.medyanAlanM2.toLocaleString("tr-TR")} m²`} />
          <KV k="En küçük" v={`${stats.enKucukAlanM2.toLocaleString("tr-TR")} m²`} />
          <KV k="En büyük" v={`${stats.enBuyukAlanM2.toLocaleString("tr-TR")} m²`} />
          <KV k="Tarama süresi" v={`${Math.round(stats.taramaSureSn)} sn`} />
          <KV k="Sorgu verimi" v={`%${verim}`} />
          <KV k="Cache hit" v={`${stats.cacheHit} parsel`} />
        </div>
      </div>

      {ilanSayisi > 0 && (
        <div className="rounded border border-orange-200 bg-orange-50 p-2">
          <div className="font-medium text-orange-800">
            💡 İlan gözlemi: {ilanSayisi} sahibinden ilanı kayıtlı
          </div>
          <div className="text-[10px] text-orange-700">
            Bu bbox'taki TKGM parsellerini ilanlarla eşleyip TL/m² heatmap'i v0.5'te gelecek.
          </div>
        </div>
      )}

      {stats.nitelikDagilimi.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-card">
          <div className="mb-2 text-2xs font-semibold text-slate-700">
            Nitelik dağılımı
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <PieChart
                size={90}
                strokeWidth={16}
                toplamLabel={String(stats.parselSayisi)}
                dilimler={stats.nitelikDagilimi.map((n) => {
                  const { renk } = nitelikRenkBul(n.nitelik);
                  return { label: n.nitelik || "—", value: n.sayi, renk };
                })}
              />
            </div>
            <div className="min-w-0 flex-1">
              <PieLegend
                dilimler={stats.nitelikDagilimi.map((n) => {
                  const { renk } = nitelikRenkBul(n.nitelik);
                  return { label: n.nitelik || "—", value: n.sayi, renk };
                })}
              />
            </div>
          </div>
        </div>
      )}

      {stats.alanHistogram.some((h) => h.sayi > 0) && (
        <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-card">
          <div className="mb-2 text-2xs font-semibold text-slate-700">
            Alan dağılımı (m²)
          </div>
          <Histogram
            bins={stats.alanHistogram.map((h) => ({
              label: h.aralik,
              value: h.sayi,
            }))}
            color="#3b82f6"
          />
        </div>
      )}

      {stats.mahalleDagilimi.length > 1 && (
        <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-card">
          <div className="mb-1 text-2xs font-semibold text-slate-700">
            Mahalle dağılımı
          </div>
          <div className="space-y-0.5 text-2xs">
            {stats.mahalleDagilimi.slice(0, 5).map((m) => (
              <div key={m.mahalle} className="flex items-baseline justify-between">
                <span className="truncate text-slate-600">{m.mahalle}</span>
                <span className="font-medium tabular-nums text-slate-700">
                  {m.sayi}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {bolgeGunes && (
        <div className="rounded-lg border-2 border-amber-200 bg-amber-50/60 p-2 shadow-card">
          <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold text-accent-warning">
            <SunIcon className="h-3.5 w-3.5" />
            Bölge güneş enerjisi
          </div>
          <div className="grid grid-cols-2 gap-x-3 text-2xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Yıllık üretim</span>
              <span className="font-semibold tabular-nums text-slate-800">
                {bolgeGunes.kwhKwp.toLocaleString("tr-TR")} kWh/kWp
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Sınıf</span>
              <span className="font-semibold text-accent-warning">
                {bolgeGunes.sinif}
              </span>
            </div>
          </div>
        </div>
      )}

      {bolgeTarim && (
        <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/60 p-2 shadow-card">
          <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold text-accent-success">
            <SproutIcon className="h-3.5 w-3.5" />
            Bölge tarım profili
          </div>
          <div className="grid grid-cols-2 gap-x-3 text-2xs">
            <div className="flex justify-between">
              <span className="text-slate-500">İklim kuşağı</span>
              <span className="font-semibold text-slate-800">
                {bolgeTarim.kusak}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Sıcaklık</span>
              <span className="font-semibold tabular-nums text-slate-800">
                {bolgeTarim.sicaklik}°C
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Yıllık yağış</span>
              <span className="font-semibold tabular-nums text-slate-800">
                {bolgeTarim.yagis} mm
              </span>
            </div>
          </div>
          {bolgeTarim.enUygunUrunler.length > 0 && (
            <div className="mt-1 text-2xs">
              <span className="text-slate-500">En uygun ürünler: </span>
              <span className="font-medium text-accent-success">
                {bolgeTarim.enUygunUrunler.join(", ")}
              </span>
            </div>
          )}
        </div>
      )}

      {tkgmHeatNoktalari && tkgmHeatNoktalari.length > 0 && (
        <div className="rounded-lg border-2 border-purple-200 bg-purple-50/60 p-2 shadow-card">
          <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold text-accent-ai">
            🔥 TKGM resmi alım-satım heatmap
          </div>
          <div className="text-2xs">
            <span className="text-slate-500">Bbox içinde:</span>{" "}
            <span className="font-semibold tabular-nums text-slate-800">
              {tkgmHeatNoktalari.length} parsel
            </span>{" "}
            <span className="text-slate-500">·</span>{" "}
            <span className="font-semibold tabular-nums text-slate-800">
              {tkgmHeatNoktalari.reduce((s, n) => s + n.sayi, 0)} işlem
            </span>{" "}
            <span className="text-slate-500">son 2 yıl</span>
          </div>
          <p className="mt-1 text-3xs italic text-slate-500">
            Harita üstünde mor→kırmızı gradient. Yoğunluk yüksek = likit bölge.
          </p>
        </div>
      )}

      {sahibindenJoin && sahibindenJoin.length > 0 && (
        <div className="rounded-lg border-2 border-orange-200 bg-orange-50/60 p-2 shadow-card">
          <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold text-accent-ilan">
            📡 Sahibinden mahalle TL/m² join
          </div>
          <div className="space-y-0.5 text-3xs">
            {sahibindenJoin.map((s) => {
              const renkClass =
                s.renkSiniri === 3
                  ? "bg-red-100 text-red-700"
                  : s.renkSiniri === 1
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700";
              return (
                <div
                  key={s.mahalle}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="truncate text-slate-700">{s.mahalle}</span>
                  <span className="flex-shrink-0 text-slate-500">n={s.adet}</span>
                  <span className={`flex-shrink-0 rounded px-1.5 py-0.5 font-bold tabular-nums ${renkClass}`}>
                    {s.ortPerM2.toLocaleString("tr-TR")} TL/m²
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-3xs italic text-slate-500">
            Yeşil = ucuz bölge, kırmızı = pahalı (3-tile bölünmüş). Sahibinden
            ilan gözlemlerinden lokal birikim.
          </p>
        </div>
      )}

      <SaveScanDugmesi stats={stats} parseller={stats.parselSayisi > 0 ? parsellerForSave : []} />
    </div>
  );
}
