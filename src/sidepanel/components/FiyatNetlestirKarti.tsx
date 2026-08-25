import {
  CheckCircle2 as CheckIcon,
  CircleDashed as MissingIcon,
  ExternalLink as ExternalLinkIcon,
  Sparkles as SparklesIcon,
  TrendingDown as TrendingDownIcon,
  Info as InfoIcon,
} from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import type { EPlanImarVerisi } from "../../lib/eplan";
import type { FiyatTahmini } from "../../lib/fiyat-tahmin";
import { Card } from "../ui/Card";
import { iskontoGetir } from "../../lib/satis-iskonto";
import { normalizeYerAdi } from "../../lib/tkgm-api";

interface Props {
  parsel: Parsel;
  imar: EPlanImarVerisi | null;
  manuelEmsalAdet: number;
  onDetayAc: () => void;
  /** Fiyat tahmini — satış iskontosu gösterimi için */
  tahmin?: FiyatTahmini | null;
}

export function FiyatNetlestirKarti({ parsel, imar, manuelEmsalAdet, onDetayAc, tahmin }: Props) {
  // Satış iskontosu — asking price → gerçek satış fiyatı farkı
  const ilNorm = parsel.ilAd ? normalizeYerAdi(parsel.ilAd) : null;
  const tarımsalMi = /tarla|bahçe|bahce|bağ|bag|zeytin/iu.test(parsel.nitelik ?? "");
  const iskontoSonuc = ilNorm ? iskontoGetir(ilNorm, tarımsalMi ? "tarla" : "arsa") : null;
  // İskonto bileşeni fiyat-tahmin.ts tarafından uygulandıysa göster
  const iskontoUygulandıMi = tahmin?.bilesenler.some((b) => b.ad === "Satış iskontosu") ?? false;
  const kullanimHazir = !!(imar?.kullanimKarari || imar?.planKarari);
  const yapilanmaHazir = imar?.taks != null || imar?.emsal != null;
  const katNizamHazir = imar?.maksKat != null || !!imar?.yapiNizami;
  const emsalHazir = manuelEmsalAdet > 0;
  const imarliProfil = /arsa|imar|konut|ticaret|sanayi|villa/i.test(
    `${imar?.kullanimKarari ?? ""} ${imar?.planKarari ?? ""} ${parsel.nitelik ?? ""}`,
  );

  const maddeler = [
    {
      hazir: kullanimHazir,
      baslik: "Kullanım kararı",
      aciklama: kullanimHazir
        ? imar?.kullanimKarari ?? imar?.planKarari ?? "hazır"
        : "Konut, ticaret, sanayi, tarım gibi ana sınıf fiyatı en sert etkiler.",
      onem: "çok yüksek etki",
    },
    {
      hazir: yapilanmaHazir,
      baslik: "TAKS / Emsal",
      aciklama: yapilanmaHazir
        ? [imar?.taks != null ? `TAKS ${imar.taks}` : null, imar?.emsal != null ? `Emsal ${imar.emsal}` : null]
            .filter(Boolean)
            .join(" · ")
        : "Yapılaşma hakkı aynı mahalledeki iki arsanın fiyatını ciddi ayırır.",
      onem: "yüksek etki",
    },
    {
      hazir: !imarliProfil || katNizamHazir,
      baslik: "Kat / nizam",
      aciklama: !imarliProfil
        ? "Bu parsel şu an tarımsal profile daha yakın görünüyor."
        : katNizamHazir
          ? [imar?.maksKat != null ? `${imar.maksKat} kat` : null, imar?.yapiNizami ?? null]
              .filter(Boolean)
              .join(" · ")
          : "Özellikle imarlı arsalarda ayrık-bitişik ve kat hakkı fiyatı netleştirir.",
      onem: imarliProfil ? "orta-yüksek etki" : "opsiyonel",
    },
    {
      hazir: emsalHazir,
      baslik: "Yakın gerçek emsal",
      aciklama: emsalHazir
        ? `${manuelEmsalAdet} manuel emsal kayıtlı`
        : "1-3 yakın satış veya ilan girdisi, bölge baseline'ını ciddi düzeltir.",
      onem: "yüksek etki",
    },
  ];

  const eksikAdet = maddeler.filter((m) => !m.hazir).length;

  return (
    <Card accent={eksikAdet === 0 ? "success" : "warning"} className="dark:border-slate-700 dark:bg-slate-900">
      <div className="space-y-2.5 px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
              <SparklesIcon className="h-3.5 w-3.5 text-amber-500" />
              Fiyatı Netleştir
            </div>
            <div className="mt-0.5 text-2xs leading-relaxed text-slate-600 dark:text-slate-300">
              Sistem çevre, eğim ve emsalleri topluyor. Aşağıdaki birkaç bilgi tamamlanırsa tavsiye fiyat daha dar ve daha güvenli olur.
            </div>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            eksikAdet === 0
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200"
              : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
          }`}>
            {eksikAdet === 0 ? "hazır" : `${eksikAdet} kritik eksik`}
          </span>
        </div>

        <div className="grid gap-1.5">
          {maddeler.map((madde) => (
            <div
              key={madde.baslik}
              className={`rounded-md border px-2 py-1.5 ${
                madde.hazir
                  ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-500/30 dark:bg-emerald-950/20"
                  : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80"
              }`}
            >
              <div className="flex items-start gap-2">
                {madde.hazir ? (
                  <CheckIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600 dark:text-emerald-300" />
                ) : (
                  <MissingIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-2xs font-semibold text-slate-800 dark:text-slate-100">{madde.baslik}</span>
                    <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-200">
                      {madde.onem}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
                    {madde.aciklama}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Satış İskontosu Bilgisi */}
        {iskontoSonuc && (
          <div className={`rounded-md border px-2.5 py-2 text-[10px] ${
            iskontoUygulandıMi
              ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-500/30 dark:bg-emerald-950/20"
              : "border-blue-200 bg-blue-50/80 dark:border-blue-500/30 dark:bg-blue-950/20"
          }`}>
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDownIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" aria-hidden="true" />
              <span className="font-semibold text-slate-700 dark:text-slate-200">Satış İskontosu</span>
              {iskontoUygulandıMi && (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  uygulandı
                </span>
              )}
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {parsel.ilAd} bölgesi için tahmini satış iskontosu:{" "}
              <strong className="text-slate-800 dark:text-slate-100">
                %{Math.round(iskontoSonuc.oran * 100)}
              </strong>
              {" "}— ilan fiyatından gerçek satışa bu kadar fark beklenir.
            </p>
            {!iskontoUygulandıMi && tahmin && (
              <p className="text-slate-500 dark:text-slate-400 mt-0.5 flex items-start gap-1">
                <InfoIcon className="h-3 w-3 flex-shrink-0 mt-0.5" aria-hidden="true" />
                Mahalle bazlı güçlü emsal varsa iskonto otomatik atlanır.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white/80 px-2 py-2 dark:border-slate-700 dark:bg-slate-800/80">
          <div className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">
            En pratik yol: aşağıdaki <strong>İmar & Manuel Veri</strong> bölümünü açıp resmi imar alanlarını ve bildiğin yakın emsalleri gir.
          </div>
          <button
            type="button"
            onClick={onDetayAc}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
          >
            Bölümü aç
            <ExternalLinkIcon className="h-3 w-3" />
          </button>
        </div>
      </div>
    </Card>
  );
}
