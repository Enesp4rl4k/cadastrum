/**
 * VeriKatkiSkoru — Sprint 4 D3
 *
 * Extension veri katkısı gamification bileşeni.
 * Katkı sayacı ve fonksiyonları src/lib/veri-katki.ts'te.
 */

import { useEffect, useMemo, useState } from "react";
import { Award, TrendingUp, Users, Zap } from "lucide-react";
import {
  type KatkiSayaci,
  katkiSayaciniOku,
} from "../../lib/veri-katki";

export interface KatkiSkorHesap {
  toplamPuan: number;
  rozet: string;
  rozetEmoji: string;
  sonrakiRozet: string;
  sonrakiRozetPuan: number;
  ilerlemeYuzde: number;
}

// ── Skor hesaplama ───────────────────────────────────────────────────────

interface RozetSeviye { min: number; ad: string; emoji: string }

const ROZET_SEVIYELERI: RozetSeviye[] = [
  { min: 0,    ad: "Başlangıç",        emoji: "🌱" },
  { min: 10,   ad: "Katkıda Bulunan",  emoji: "🏅" },
  { min: 50,   ad: "Veri Uzmanı",      emoji: "🔍" },
  { min: 200,  ad: "Arsa Dedektifi",   emoji: "🕵️" },
  { min: 1000, ad: "Cadastrum Elcisi", emoji: "🏆" },
];

export function katkiSkoruHesapla(sayac: KatkiSayaci): KatkiSkorHesap {
  const puan =
    sayac.toplamIlan * 1 +
    sayac.mahalleliIlan * 1 +
    sayac.koordinatliIlan * 2;

  let simdi: RozetSeviye = ROZET_SEVIYELERI[0]!;
  for (const r of ROZET_SEVIYELERI) {
    if (r.min <= puan) simdi = r;
  }
  const sonraki = ROZET_SEVIYELERI.find((r) => r.min > puan);

  const ilerleme = sonraki
    ? Math.round(((puan - simdi.min) / (sonraki.min - simdi.min)) * 100)
    : 100;

  return {
    toplamPuan: puan,
    rozet: simdi.ad,
    rozetEmoji: simdi.emoji,
    sonrakiRozet: sonraki?.ad ?? simdi.ad,
    sonrakiRozetPuan: sonraki?.min ?? simdi.min,
    ilerlemeYuzde: ilerleme,
  };
}

// ── Mini sparkline (son 7 gün) ──────────────────────────────────────────

function MiniSparkline({ gunluk }: { gunluk: Record<string, number> }) {
  const son7 = useMemo(() => {
    const bugunden = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(bugunden);
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().slice(0, 10);
      return gunluk[key] ?? 0;
    });
  }, [gunluk]);

  const maks = Math.max(...son7, 1);
  const W = 56, H = 20;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-label="Son 7 gün katkı grafiği">
      {son7.map((v, i) => {
        const barH = Math.max(2, (v / maks) * (H - 2));
        const x = i * (W / 7) + 1;
        return (
          <rect
            key={i}
            x={x}
            y={H - barH}
            width={W / 7 - 2}
            height={barH}
            rx={1}
            fill={v > 0 ? "#7c3aed" : "#e2e8f0"}
            className="dark:fill-violet-400"
          />
        );
      })}
    </svg>
  );
}

// ── Ana bileşen ──────────────────────────────────────────────────────────

interface Props {
  /** Compact mod — sadece badge gösterir (sidepanel üst barı için) */
  compact?: boolean;
}

export function VeriKatkiSkoru({ compact = false }: Props) {
  const [sayac, setSayac] = useState<KatkiSayaci | null>(null);

  useEffect(() => {
    katkiSayaciniOku().then(setSayac).catch(() => {});

    // storage değişince yenile (arka plan scrape bitti sinyali)
    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      const KATKI_KEY = "cadastrum_katki_sayaci";
      const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
        if (KATKI_KEY in changes) {
          const yeni = changes[KATKI_KEY]?.newValue as KatkiSayaci | undefined;
          if (yeni) setSayac(yeni);
        }
      };
      chrome.storage.onChanged.addListener(handler);
      return () => chrome.storage.onChanged.removeListener(handler);
    }
  }, []);

  const skor = useMemo(
    () => (sayac ? katkiSkoruHesapla(sayac) : null),
    [sayac],
  );

  if (!sayac || !skor) return null;

  // Compact mod: sadece rozet badge
  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-3xs font-medium text-violet-700 dark:border-violet-800/40 dark:bg-violet-950/20 dark:text-violet-300"
        title={`Katkı skoru: ${skor.toplamPuan} puan · ${skor.rozet}`}
      >
        <span>{skor.rozetEmoji}</span>
        <span>{skor.toplamPuan} puan</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-3 dark:border-violet-800/40 dark:from-violet-950/20 dark:to-slate-900">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Award className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
          <span className="text-2xs font-bold text-violet-800 dark:text-violet-200">
            Veri Katkı Skoru
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-lg">{skor.rozetEmoji}</span>
          <span className="text-2xs font-semibold text-violet-700 dark:text-violet-300">
            {skor.rozet}
          </span>
        </div>
      </div>

      {/* Puan */}
      <div className="flex items-end gap-3 mb-2">
        <div>
          <div className="text-2xl font-black tabular-nums text-violet-800 dark:text-violet-200">
            {skor.toplamPuan}
          </div>
          <div className="text-3xs text-slate-500 dark:text-slate-400">toplam puan</div>
        </div>

        {/* İlerleme bar */}
        {skor.ilerlemeYuzde < 100 && (
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-3xs text-slate-500 mb-0.5">
              <span>→ {skor.sonrakiRozet}</span>
              <span>{skor.sonrakiRozetPuan - skor.toplamPuan} puan kaldı</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-500 dark:bg-violet-400 transition-all duration-700"
                style={{ width: `${skor.ilerlemeYuzde}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* İstatistikler */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5 text-center dark:border-slate-700 dark:bg-slate-800">
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            {sayac.toplamIlan}
          </div>
          <div className="text-3xs text-slate-500 dark:text-slate-400">ilan</div>
        </div>
        <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5 text-center dark:border-slate-700 dark:bg-slate-800">
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            {sayac.mahalleliIlan}
          </div>
          <div className="text-3xs text-slate-500 dark:text-slate-400">mahalleli</div>
        </div>
        <div className="rounded-lg bg-white border border-slate-100 px-2 py-1.5 text-center dark:border-slate-700 dark:bg-slate-800">
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
            {sayac.koordinatliIlan}
          </div>
          <div className="text-3xs text-slate-500 dark:text-slate-400">koordinatlı</div>
        </div>
      </div>

      {/* Sparkline + son ekleme */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3 text-slate-400 shrink-0" />
          <span className="text-3xs text-slate-500 dark:text-slate-400">Son 7 gün</span>
          <MiniSparkline gunluk={sayac.gunlukGecmis} />
        </div>
        <div className="flex items-center gap-1 text-3xs text-slate-400">
          <Users className="h-2.5 w-2.5" />
          <span>Veri flywheel</span>
        </div>
      </div>

      {/* Teşvik metni */}
      {sayac.toplamIlan === 0 && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-violet-100 bg-violet-50/50 px-2 py-1.5 dark:border-violet-800/20 dark:bg-violet-950/10">
          <Zap className="h-3 w-3 text-violet-500 shrink-0" />
          <p className="text-3xs text-violet-700 dark:text-violet-400">
            Sahibinden veya Hepsiemlak'ta ilan sayfası açınca otomatik katkı sayılır.
          </p>
        </div>
      )}
    </div>
  );
}
