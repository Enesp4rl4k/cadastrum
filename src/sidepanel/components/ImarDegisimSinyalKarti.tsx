/**
 * İmar Değişikliği Sinyal Kartı — Faz C2
 * Proxy sinyallerden imar dönüşüm olasılığı göstergesi.
 * Resmi plan hükmü değildir.
 */
import { useEffect, useState } from "react";
import {
  TrendingUp as TrendIcon,
  Loader2 as LoaderIcon,
  AlertTriangle as WarnIcon,
} from "lucide-react";
import { Section } from "../ui/Card";

// ── Inline tipler (lib/imar-degisim-sinyal.ts ile senkron) ───────────────────
interface ImarDegisimBilesen {
  id: string;
  ad: string;
  puan: number;
  max: number;
  yorum: string;
}

interface ImarDegisimSonuc {
  skor: number;
  olasılik: string;
  bilesenler: ImarDegisimBilesen[];
  gerekce: string;
  disclaimer: string;
}

interface ImarDegisimGirdi {
  gelisimSkoru?: number | null;
  tkgmSatisYogunlugu?: number | null;
  komsuemsalDegisimYuzde?: number | null;
  cdpMesafeKm?: number | null;
  imarTipi?: string | null;
  emsal?: number | null;
  bolgeselTrendYuzde?: number | null;
}

// ── Hesaplama — lib/imar-degisim-sinyal.ts'den inline edildi ─────────────────
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function imarDegisimHesapla(g: ImarDegisimGirdi): ImarDegisimSonuc {
  const gs = g.gelisimSkoru;
  const sy = g.tkgmSatisYogunlugu;
  const ked = g.komsuemsalDegisimYuzde;
  const cdp = g.cdpMesafeKm;
  const tip = (g.imarTipi ?? "belirsiz").toLowerCase();

  const pGelisim = gs != null && Number.isFinite(gs) ? clamp(Math.round(10 + gs * 0.2), 0, 30) : 10;
  const pSatis   = sy != null && Number.isFinite(sy) && sy >= 0 ? clamp(Math.round(sy * 200), 0, 20) : 7;
  const pEmsal   = ked != null && Number.isFinite(ked) ? clamp(Math.round(Math.max(0, ked) * 0.5), 0, 20) : 5;
  const pCdp     = cdp != null && Number.isFinite(cdp) && cdp >= 0 ? clamp(Math.round(15 - cdp * 2), 0, 15) : 5;
  let pImar = tip.includes("tar") || tip === "tarim" ? 12
    : tip === "belirsiz" || tip === "" ? 10
    : tip === "konut" && g.emsal != null && g.emsal < 0.5 ? 8
    : tip === "konut" ? 5 : tip === "ticari" ? 3 : 5;
  if (g.bolgeselTrendYuzde != null && g.bolgeselTrendYuzde > 20) pImar += 3;
  pImar = clamp(pImar, 0, 15);

  const bilesenler: ImarDegisimBilesen[] = [
    { id: "gelisim", ad: "Uydu gelişim",           puan: pGelisim, max: 30,
      yorum: gs != null && gs > 30 ? `Çevre hızla yapılaşıyor (skor +${Math.round(gs)})` : "Uydu sinyali yok / düşük" },
    { id: "satis",   ad: "TKGM satış yoğunluğu",   puan: pSatis,   max: 20,
      yorum: sy != null && sy > 0.05 ? "Yüksek satış yoğunluğu" : "Normal işlem hacmi" },
    { id: "emsal",   ad: "Komşu emsal sıçraması",  puan: pEmsal,   max: 20,
      yorum: ked != null ? `Komşu değişim %${Math.round(ked)}` : "Veri yok" },
    { id: "cdp",     ad: "ÇDP mesafesi",            puan: pCdp,     max: 15,
      yorum: cdp != null ? `${cdp.toFixed(1)} km` : "Veri yok" },
    { id: "imar",    ad: "İmar dönüşüm potansiyeli", puan: pImar,   max: 15,
      yorum: tip.includes("tar") ? "Tarımsal parsel" : `${tip} imarı` },
  ];

  const skor = clamp(bilesenler.reduce((s, b) => s + b.puan, 0), 0, 100);
  const olasılik = skor >= 60 ? "yuksek" : skor >= 35 ? "orta" : "dusuk";
  const sorted  = [...bilesenler].sort((a, b) => b.puan / b.max - a.puan / a.max);
  const gucluB  = sorted[0]!;
  const olasılikTr = olasılik === "yuksek" ? "Yüksek" : olasılik === "orta" ? "Orta" : "Düşük";
  const gerekce = `İmar değişikliği olasılığı: ${olasılikTr} (skor ${skor}/100). Güçlü sinyal: ${gucluB.ad}.`;
  const disclaimer = "Proxy sinyallere dayalı model çıktısıdır. Resmi imar planı için yetkili belediyeye başvurun.";

  return { skor, olasılik, bilesenler, gerekce, disclaimer };
}

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

interface Props {
  il: string;
  ilce: string;
  mahalle?: string;
  imarTipi?: string | null;
  emsal?: number | null;
  gelisimSkoru?: number | null;
  tkgmSatisYogunlugu?: number | null;
  cdpMesafeKm?: number | null;
}

interface SinyalStil {
  bg: string;
  text: string;
  border: string;
  etiket: string;
  emoji: string;
}

function stilGetir(olasılik: string): SinyalStil {
  if (olasılik === "yuksek") {
    return {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      text: "text-emerald-700 dark:text-emerald-300",
      border: "border-emerald-200 dark:border-emerald-800",
      etiket: "Yüksek",
      emoji: "🟢",
    };
  }
  if (olasılik === "orta") {
    return {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      text: "text-amber-700 dark:text-amber-300",
      border: "border-amber-200 dark:border-amber-800",
      etiket: "Orta",
      emoji: "🟡",
    };
  }
  return {
    bg: "bg-slate-50 dark:bg-slate-800/50",
    text: "text-slate-600 dark:text-slate-400",
    border: "border-slate-200 dark:border-slate-700",
    etiket: "Düşük",
    emoji: "⚪",
  };
}

function BilesBar({ b }: { b: ImarDegisimBilesen }) {
  const oran = b.puan / b.max;
  const barCls = oran >= 0.6
    ? "h-full rounded-full bg-emerald-500"
    : oran >= 0.3
      ? "h-full rounded-full bg-amber-500"
      : "h-full rounded-full bg-slate-400";

  return (
    <div className="flex items-center gap-2 text-[10px]">
      <div className="w-28 truncate text-slate-600 dark:text-slate-400">{b.ad}</div>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={barCls}
          style={{ width: `${oran * 100}%` }}
          role="progressbar"
          aria-valuenow={b.puan}
          aria-valuemin={0}
          aria-valuemax={b.max}
          aria-label={`${b.ad}: ${b.puan}/${b.max}`}
        />
      </div>
      <div className="w-8 text-right tabular-nums font-medium text-slate-700 dark:text-slate-300">
        {b.puan}/{b.max}
      </div>
    </div>
  );
}

export function ImarDegisimSinyalKarti({
  il,
  ilce,
  mahalle,
  imarTipi,
  emsal,
  gelisimSkoru,
  tkgmSatisYogunlugu,
  cdpMesafeKm,
}: Props) {
  const [sonuc, setSonuc] = useState<ImarDegisimSonuc | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  // Lokal hesaplama — anında sonuç
  useEffect(() => {
    if (!il || !ilce) return;
    setYukleniyor(true);
    setHata(null);
    const t = setTimeout(() => {
      try {
        setSonuc(imarDegisimHesapla({
          gelisimSkoru:           gelisimSkoru ?? null,
          tkgmSatisYogunlugu:     tkgmSatisYogunlugu ?? null,
          komsuemsalDegisimYuzde: null,
          cdpMesafeKm:            cdpMesafeKm ?? null,
          imarTipi:               imarTipi ?? null,
          emsal:                  emsal ?? null,
          bolgeselTrendYuzde:     null,
        }));
      } catch {
        setHata("Sinyal hesaplanamadı");
      } finally {
        setYukleniyor(false);
      }
    }, 50);
    return () => clearTimeout(t);
  }, [il, ilce, imarTipi, emsal, gelisimSkoru, tkgmSatisYogunlugu, cdpMesafeKm]);

  // BUG-3 fix: tam dependency array — her parametre değişince backend'i de güncelle
  useEffect(() => {
    if (!il || !ilce) return;
    let iptal = false;
    fetch(`${API_BASE}/imar-degisim/sinyal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        il, ilce, mahalle,
        imar_tipi: imarTipi,
        emsal,
        gelisim_skoru: gelisimSkoru,
        tkgm_satis_yogunlugu: tkgmSatisYogunlugu,
        cdp_mesafe_km: cdpMesafeKm,
      }),
      signal: AbortSignal.timeout(8_000),
    })
      .then((r) => r.ok ? r.json() as Promise<ImarDegisimSonuc & { ok?: boolean }> : null)
      .then((d) => {
        if (iptal || !d?.bilesenler) return;
        setSonuc(d);
      })
      .catch(() => { /* sessizce kal — lokal hesap yeterli */ });
    return () => { iptal = true; };
  }, [il, ilce, mahalle, imarTipi, emsal, gelisimSkoru, tkgmSatisYogunlugu, cdpMesafeKm]);

  return (
    <Section
      title="İmar değişim sinyali"
      icon={<TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />}
      accent="warning"
    >
      <div className="space-y-2 p-2">
        {yukleniyor && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400" role="status" aria-live="polite">
            <LoaderIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            <span>Sinyal hesaplanıyor…</span>
          </div>
        )}

        {hata && (
          <div
            className="flex items-center gap-1.5 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400"
            role="alert"
          >
            <WarnIcon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            {hata}
          </div>
        )}

        {sonuc && !yukleniyor && (
          <SinyalIcerik sonuc={sonuc} />
        )}
      </div>
    </Section>
  );
}

function SinyalIcerik({ sonuc }: { sonuc: ImarDegisimSonuc }) {
  const stil = stilGetir(sonuc.olasılik);

  return (
    <>
      {/* Olasılık rozeti */}
      <div className={`flex items-center gap-2 rounded-lg border p-3 ${stil.bg} ${stil.border}`}>
        <span className="text-xl" aria-hidden="true">{stil.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className={`text-xs font-semibold ${stil.text}`}>
            {stil.etiket} olasılık · {sonuc.skor}/100
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-600 dark:text-slate-400">
            {sonuc.gerekce}
          </p>
        </div>
      </div>

      {/* Sinyal çubukları */}
      <div className="space-y-1">
        {sonuc.bilesenler.map((b) => (
          <BilesBar key={b.id} b={b} />
        ))}
      </div>

      {/* Detay toggle */}
      <details className="text-[9px] text-slate-500 dark:text-slate-500">
        <summary className="cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-300">
          Sinyal detayları
        </summary>
        <ul className="mt-1 space-y-0.5 list-disc list-inside">
          {sonuc.bilesenler.map((b) => (
            <li key={b.id}>
              <strong>{b.ad}:</strong> {b.yorum}
            </li>
          ))}
        </ul>
      </details>

      {/* Disclaimer */}
      <p className="text-[9px] italic leading-snug text-slate-400">
        {sonuc.disclaimer}
      </p>
    </>
  );
}
