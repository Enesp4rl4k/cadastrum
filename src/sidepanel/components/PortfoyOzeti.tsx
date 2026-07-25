/**
 * Portföy Özeti Bileşeni — Sprint 4-A
 *
 * Favorilerdeki parsellerin toplu portföy analizi:
 *   - Toplam tahmini değer (TL)
 *   - Ortalama fiyat TL/m²
 *   - Risk dağılımı (düşük/orta/yüksek)
 *   - Kategori dağılımı (arsa/tarla/konut)
 *   - Toplam alan (m²)
 *   - Fiyat snapshot delta (toplam portföy değişimi)
 *
 * FavorilerView'ın üstünde özet kartı olarak gösterilir.
 */
import { useMemo } from "react";
import {
  TrendingUp as TrendIcon,
  TrendingDown as TrendDownIcon,
  Minus as MinusIcon,
  PieChart as PieIcon,
  SquareStack as StackIcon,
} from "lucide-react";
import { type FavoriParsel } from "../../lib/db";

interface Props {
  favoriler: FavoriParsel[];
}

interface PortfoyMetrik {
  toplamParseSayisi: number;
  toplamAlanM2: number;
  // Fiyat snapshot verileri olan parseller
  fiyatliParsel: number;
  toplamTahminiTL: number;
  ortalamaFiyatTlm2: number;
  // Değişim — tüm snapshot deltaları ortalaması
  ortalamaDeltaPct: number | null;
  // Kategori dağılımı
  kategoriler: Record<string, number>;
  // Risk dağılımı (tahmini — nitelikten)
  riskler: { dusuk: number; orta: number; yuksek: number };
}

function hesaplaMetrikler(favoriler: FavoriParsel[]): PortfoyMetrik {
  let toplamAlanM2 = 0;
  let toplamTahminiTL = 0;
  let toplamM2FiyatAlan = 0;
  let fiyatliParsel = 0;
  const deltalar: number[] = [];
  const kategoriler: Record<string, number> = {};
  const riskler = { dusuk: 0, orta: 0, yuksek: 0 };

  for (const f of favoriler) {
    const alan = f.parsel?.alan ?? 0;
    toplamAlanM2 += alan;

    // Kategori
    const nitelik = (f.parsel?.nitelik ?? "bilinmiyor").toLowerCase();
    const kategori = nitelik.includes("tarla")
      ? "Tarla"
      : nitelik.includes("arsa")
      ? "Arsa"
      : nitelik.includes("konut") || nitelik.includes("bina")
      ? "Konut"
      : "Diğer";
    kategoriler[kategori] = (kategoriler[kategori] ?? 0) + 1;

    // Snapshot fiyat
    const snap = f.fiyatSnapshot;
    if (snap && snap.beklenenPerM2 > 0 && alan > 0) {
      const toplamFiyat = snap.beklenenPerM2 * alan;
      toplamTahminiTL += toplamFiyat;
      toplamM2FiyatAlan += alan;
      fiyatliParsel++;
    }

    // Risk tahmini — nitelikten basit heuristik
    if (nitelik.includes("orman") || nitelik.includes("koru") || nitelik.includes("hazine")) {
      riskler.yuksek++;
    } else if (nitelik.includes("tarla") || nitelik.includes("bahçe") || nitelik.includes("zeytinlik")) {
      riskler.orta++;
    } else {
      riskler.dusuk++;
    }
  }

  const ortalamaFiyatTlm2 = toplamM2FiyatAlan > 0
    ? toplamTahminiTL / toplamM2FiyatAlan
    : 0;

  return {
    toplamParseSayisi: favoriler.length,
    toplamAlanM2,
    fiyatliParsel,
    toplamTahminiTL,
    ortalamaFiyatTlm2,
    ortalamaDeltaPct: deltalar.length > 0
      ? deltalar.reduce((s, v) => s + v, 0) / deltalar.length
      : null,
    kategoriler,
    riskler,
  };
}

function fmtTL(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} Milyar ₺`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} Milyon ₺`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} bin ₺`;
  return `${Math.round(n).toLocaleString("tr-TR")} ₺`;
}

function fmtM2(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(2)} ha`;
  return `${n.toLocaleString("tr-TR")} m²`;
}

// Mini pasta grafik SVG
function MiniPie({
  dusuk,
  orta,
  yuksek,
}: {
  dusuk: number;
  orta: number;
  yuksek: number;
}) {
  const toplam = dusuk + orta + yuksek;
  if (toplam === 0) return null;

  const dilimler = [
    { deger: dusuk, renk: "#10b981", etiket: "Düşük" },
    { deger: orta, renk: "#f59e0b", etiket: "Orta" },
    { deger: yuksek, renk: "#ef4444", etiket: "Yüksek" },
  ].filter((d) => d.deger > 0);

  const r = 18;
  const cx = 20;
  const cy = 20;
  let acikli = -Math.PI / 2; // 12 o'clock'tan başla

  const paths = dilimler.map((d) => {
    const oran = d.deger / toplam;
    const aci = oran * 2 * Math.PI;
    const x1 = cx + r * Math.cos(acikli);
    const y1 = cy + r * Math.sin(acikli);
    acikli += aci;
    const x2 = cx + r * Math.cos(acikli);
    const y2 = cy + r * Math.sin(acikli);
    const largeArc = aci > Math.PI ? 1 : 0;
    return `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z" fill="${d.renk}" />`;
  });

  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      dangerouslySetInnerHTML={{ __html: paths.join("") }}
    />
  );
}

export function PortfoyOzeti({ favoriler }: Props) {
  const metrik = useMemo(() => hesaplaMetrikler(favoriler), [favoriler]);

  if (favoriler.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-imperial/20 bg-gradient-to-br from-imperial-50 to-white p-3 shadow-sm dark:border-imperial-700/40 dark:from-imperial-950/20 dark:to-slate-900">
      {/* Başlık */}
      <div className="flex items-center gap-1.5">
        <StackIcon className="h-3.5 w-3.5 text-imperial-600 dark:text-imperial-400" />
        <h3 className="text-2xs font-bold text-imperial-800 dark:text-imperial-200">
          Portföy Özeti
        </h3>
        <span className="ml-auto text-3xs text-slate-400">
          {metrik.toplamParseSayisi} parsel
        </span>
      </div>

      {/* Ana metrikler */}
      <div className="grid grid-cols-2 gap-2">
        {/* Toplam tahmini değer */}
        <div className="rounded-lg border border-imperial/15 bg-white px-2.5 py-2 dark:border-imperial-800/40 dark:bg-slate-900">
          <div className="text-3xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">Tahmini Toplam</div>
          {metrik.fiyatliParsel > 0 ? (
            <>
              <div className="text-sm font-bold text-imperial-800 dark:text-imperial-200 mt-0.5 tabular-nums">
                {fmtTL(metrik.toplamTahminiTL)}
              </div>
              <div className="text-3xs text-slate-400 mt-0.5">
                {metrik.fiyatliParsel}/{metrik.toplamParseSayisi} parselde fiyat var
              </div>
            </>
          ) : (
            <div className="text-2xs text-slate-400 italic mt-1">
              Fiyat verisi yok
            </div>
          )}
        </div>

        {/* Toplam alan + ortalama fiyat */}
        <div className="rounded-lg border border-slate-100 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-3xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">Toplam Alan</div>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5 tabular-nums">
            {fmtM2(metrik.toplamAlanM2)}
          </div>
          {metrik.ortalamaFiyatTlm2 > 0 && (
            <div className="text-3xs text-slate-400 mt-0.5 tabular-nums">
              ort. {Math.round(metrik.ortalamaFiyatTlm2).toLocaleString("tr-TR")} ₺/m²
            </div>
          )}
        </div>
      </div>

      {/* Risk + Kategori dağılımı */}
      <div className="flex items-center gap-3">
        {/* Risk pasta */}
        <div className="flex items-center gap-2">
          <MiniPie
            dusuk={metrik.riskler.dusuk}
            orta={metrik.riskler.orta}
            yuksek={metrik.riskler.yuksek}
          />
          <div className="space-y-0.5">
            <div className="text-3xs font-medium text-slate-600 dark:text-slate-400 mb-0.5">Risk Dağılımı</div>
            {metrik.riskler.dusuk > 0 && (
              <div className="flex items-center gap-1 text-3xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400">Düşük: {metrik.riskler.dusuk}</span>
              </div>
            )}
            {metrik.riskler.orta > 0 && (
              <div className="flex items-center gap-1 text-3xs">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400">Orta: {metrik.riskler.orta}</span>
              </div>
            )}
            {metrik.riskler.yuksek > 0 && (
              <div className="flex items-center gap-1 text-3xs">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400">Yüksek: {metrik.riskler.yuksek}</span>
              </div>
            )}
          </div>
        </div>

        {/* Dikey ayırıcı */}
        <div className="h-14 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />

        {/* Kategori dağılımı */}
        <div className="flex-1 min-w-0">
          <div className="text-3xs font-medium text-slate-600 dark:text-slate-400 mb-1">Kategori</div>
          <div className="space-y-0.5">
            {Object.entries(metrik.kategoriler)
              .sort((a, b) => b[1] - a[1])
              .map(([kat, sayi]) => {
                const oran = (sayi / metrik.toplamParseSayisi) * 100;
                return (
                  <div key={kat} className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-imperial-500 dark:bg-imperial-400 rounded-full"
                        style={{ width: `${oran}%` }}
                      />
                    </div>
                    <span className="text-3xs text-slate-500 dark:text-slate-400 w-12 shrink-0 truncate">
                      {kat} ({sayi})
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Değişim özeti */}
      {metrik.ortalamaDeltaPct !== null && (
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-100 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900">
          {metrik.ortalamaDeltaPct > 0 ? (
            <TrendIcon className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          ) : metrik.ortalamaDeltaPct < 0 ? (
            <TrendDownIcon className="h-3.5 w-3.5 text-red-500 shrink-0" />
          ) : (
            <MinusIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          )}
          <span className="text-2xs text-slate-600 dark:text-slate-300">
            Ortalama portföy değişimi:
          </span>
          <span className={`text-2xs font-semibold tabular-nums ${
            metrik.ortalamaDeltaPct > 0 ? "text-emerald-600" :
            metrik.ortalamaDeltaPct < 0 ? "text-red-600" : "text-slate-400"
          }`}>
            {metrik.ortalamaDeltaPct > 0 ? "+" : ""}
            {metrik.ortalamaDeltaPct.toFixed(1)}%
          </span>
        </div>
      )}

      <p className="text-3xs italic text-slate-400 dark:text-slate-500">
        Toplam değer, snapshot fiyatları × parsel alanından hesaplanır. Resmi değerleme yerine geçmez.
      </p>
    </div>
  );
}
