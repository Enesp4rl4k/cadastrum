/**
 * W6 — Canlı İhale Takibi
 *
 * Yaklaşan Milli Emlak ihalelerini listeler ve chrome.alarms ile
 * ihale gününden 1 gün önce hatırlatıcı kurar.
 *
 * Veri: GET /v1/milli-emlak/yaklasan?il=&ilce=&gun=90
 * Cache: 1 saat TTL (milli-emlak.ts)
 */
import { useEffect, useState, useCallback } from "react";
import {
  Bell as BellIcon,
  BellOff as BellOffIcon,
  CalendarClock as CalendarClockIcon,
  ExternalLink as ExternalLinkIcon,
  Loader2 as LoaderIcon,
  RefreshCw as RefreshIcon,
} from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import {
  milliEmlakYaklasanGetir,
  fmtTL,
  fmtTLm2,
  type MilliEmlakIhale,
} from "../../lib/milli-emlak";
import { normalizeYerAdi } from "../../lib/tkgm-api";
import { Section } from "../ui/Card";

interface Props {
  parsel: Parsel;
}

// Alarm adı — ihale id bazlı tekil
function alarmAdi(ihaleId: number): string {
  return `ihale_alarm_${ihaleId}`;
}

// Alarm kurulmuş mu kontrol
async function alarmKurulmuMu(ihaleId: number): Promise<boolean> {
  try {
    if (typeof chrome === "undefined" || !chrome.alarms) return false;
    const alarm = await chrome.alarms.get(alarmAdi(ihaleId));
    return alarm != null;
  } catch {
    return false;
  }
}

// Alarm kur — ihale_tarihi'nden 1 gün önce
async function alarmKur(ilan: MilliEmlakIhale): Promise<boolean> {
  try {
    if (typeof chrome === "undefined" || !chrome.alarms) return false;
    if (!ilan.ihale_tarihi) return false;

    const hatirlatmaZamani = ilan.ihale_tarihi - 24 * 60 * 60 * 1000; // 1 gün önce
    if (hatirlatmaZamani <= Date.now()) return false; // geçmiş zaman

    await chrome.alarms.create(alarmAdi(ilan.id), {
      when: hatirlatmaZamani,
    });

    // Alarm meta verisini storage'a kaydet
    const key = `ihale_alarm_meta_${ilan.id}`;
    await chrome.storage.local.set({
      [key]: {
        ihaleId: ilan.id,
        ihale_tarihi: ilan.ihale_tarihi,
        il_norm: ilan.il_norm,
        ilce_norm: ilan.ilce_norm,
        nitelik: ilan.nitelik,
        ada_no: ilan.ada_no,
        parsel_no: ilan.parsel_no,
        muhammen_bedel: ilan.muhammen_bedel,
        olusturuldu: Date.now(),
      },
    });

    return true;
  } catch {
    return false;
  }
}

// Alarmı iptal et
async function alarmIptalEt(ihaleId: number): Promise<void> {
  try {
    if (typeof chrome === "undefined" || !chrome.alarms) return;
    await chrome.alarms.clear(alarmAdi(ihaleId));
    await chrome.storage.local.remove(`ihale_alarm_meta_${ihaleId}`);
  } catch {
    // sessiz hata
  }
}

// Kaç gün kaldı
function gunKaldi(ihale_tarihi: number): number {
  return Math.ceil((ihale_tarihi - Date.now()) / (24 * 60 * 60 * 1000));
}

// Renk — aciliyet
function aciliyetRenk(gun: number): { bg: string; text: string; border: string } {
  if (gun <= 3)  return { bg: "bg-red-50 dark:bg-red-950/30",    text: "text-red-700 dark:text-red-300",    border: "border-red-200 dark:border-red-800/50" };
  if (gun <= 7)  return { bg: "bg-amber-50 dark:bg-amber-950/20", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-800/40" };
  if (gun <= 30) return { bg: "bg-blue-50 dark:bg-blue-950/20",   text: "text-blue-700 dark:text-blue-300",   border: "border-blue-200 dark:border-blue-800/40" };
  return { bg: "bg-slate-50 dark:bg-slate-800/40", text: "text-slate-600 dark:text-slate-400", border: "border-slate-200 dark:border-slate-700" };
}

export function IhaleAlarmKarti({ parsel }: Props) {
  const [ilanlar, setIlanlar] = useState<MilliEmlakIhale[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [alarmlar, setAlarmlar] = useState<Record<number, boolean>>({});
  const [alarmIsleniyor, setAlarmIsleniyor] = useState<Record<number, boolean>>({});
  const [yenilendi, setYenilendi] = useState<number | null>(null);

  const ilNorm = normalizeYerAdi(parsel.ilAd ?? "");
  const ilceNorm = normalizeYerAdi(parsel.ilceAd ?? "");

  const yukle = useCallback(async (forceRefresh = false) => {
    if (!ilNorm || !ilceNorm) return;
    setYukleniyor(true);
    setHata(null);

    // Force refresh için cache'i temizle
    if (forceRefresh) {
      try {
        await chrome.storage.local.remove(`milli_emlak_yaklasan__${ilNorm}__${ilceNorm}`);
      } catch { /* sessiz */ }
    }

    try {
      const sonuc = await milliEmlakYaklasanGetir(ilNorm, ilceNorm, 90);
      if (sonuc) {
        setIlanlar(sonuc.ilanlar);
        setYenilendi(sonuc.fetchedAt);

        // Mevcut alarm durumlarını kontrol et
        const durumlar: Record<number, boolean> = {};
        for (const ilan of sonuc.ilanlar) {
          durumlar[ilan.id] = await alarmKurulmuMu(ilan.id);
        }
        setAlarmlar(durumlar);
      } else {
        setIlanlar([]);
      }
    } catch {
      setHata("İhale verileri yüklenemedi.");
    } finally {
      setYukleniyor(false);
    }
  }, [ilNorm, ilceNorm]);

  useEffect(() => {
    yukle();
  }, [yukle]);

  async function toggleAlarm(ilan: MilliEmlakIhale) {
    setAlarmIsleniyor((prev) => ({ ...prev, [ilan.id]: true }));
    try {
      if (alarmlar[ilan.id]) {
        await alarmIptalEt(ilan.id);
        setAlarmlar((prev) => ({ ...prev, [ilan.id]: false }));
      } else {
        const basarili = await alarmKur(ilan);
        setAlarmlar((prev) => ({ ...prev, [ilan.id]: basarili }));
      }
    } finally {
      setAlarmIsleniyor((prev) => ({ ...prev, [ilan.id]: false }));
    }
  }

  // Hiç ilan yoksa ve yükleme bittiyse gösterme
  if (!yukleniyor && ilanlar.length === 0 && !hata) return null;

  return (
    <Section
      title="Yaklaşan İhaleler"
      icon={<CalendarClockIcon className="h-3.5 w-3.5" />}
      accent="warning"
    >
      <div className="space-y-2 px-1 pb-1">
        {/* Başlık alanı */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-3xs text-slate-500 dark:text-slate-400">
            {ilceNorm && parsel.ilceAd
              ? `${parsel.ilceAd} ilçesindeki yaklaşan Milli Emlak ihaleleri`
              : "Yaklaşan ihaleler"}
          </p>
          <button
            type="button"
            onClick={() => yukle(true)}
            disabled={yukleniyor}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-3xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            title="Yenile"
          >
            <RefreshIcon className={`h-3 w-3 ${yukleniyor ? "animate-spin" : ""}`} />
            Yenile
          </button>
        </div>

        {/* Yükleniyor */}
        {yukleniyor && (
          <div className="flex items-center gap-2 py-2 text-3xs text-slate-500">
            <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
            Yaklaşan ihaleler kontrol ediliyor…
          </div>
        )}

        {/* Hata */}
        {hata && (
          <div className="rounded-md bg-red-50 px-2 py-1.5 text-3xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
            {hata}
          </div>
        )}

        {/* İhale listesi */}
        {!yukleniyor && ilanlar.length > 0 && (
          <div className="space-y-1.5">
            {ilanlar.map((ilan) => (
              <YaklasanIhaleRow
                key={ilan.id}
                ilan={ilan}
                alarmKurulu={alarmlar[ilan.id] ?? false}
                isleniyor={alarmIsleniyor[ilan.id] ?? false}
                onToggle={() => toggleAlarm(ilan)}
              />
            ))}
          </div>
        )}

        {/* Güncelleme zamanı */}
        {yenilendi && (
          <p className="text-[10px] italic text-slate-400 px-0.5">
            Son güncelleme:{" "}
            {new Date(yenilendi).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
            {" "}— Kaynak: milliemlak.gov.tr
          </p>
        )}

        {/* Chrome alarms açıklaması */}
        {ilanlar.length > 0 && (
          <div className="rounded bg-blue-50/80 border border-blue-100 px-2 py-1 text-3xs text-blue-700 dark:bg-blue-950/20 dark:border-blue-800/30 dark:text-blue-300">
            🔔 Hatırlatıcı kurulduğunda ihale gününden 1 gün önce bildirim alırsınız.
          </div>
        )}
      </div>
    </Section>
  );
}

function YaklasanIhaleRow({
  ilan,
  alarmKurulu,
  isleniyor,
  onToggle,
}: {
  ilan: MilliEmlakIhale;
  alarmKurulu: boolean;
  isleniyor: boolean;
  onToggle: () => void;
}) {
  const gun = ilan.ihale_tarihi ? gunKaldi(ilan.ihale_tarihi) : null;
  const renk = gun != null ? aciliyetRenk(gun) : aciliyetRenk(999);
  const gecmisMi = gun != null && gun < 0;
  const bugun = gun === 0;

  const tarihStr = ilan.ihale_tarihi
    ? new Date(ilan.ihale_tarihi).toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  // Alarm kurulabilir mi? Sadece gelecekteki ihaleler için
  const alarmKurulabilir = ilan.ihale_tarihi != null && ilan.ihale_tarihi - Date.now() > 2 * 60 * 60 * 1000;

  return (
    <div className={`rounded-md border px-2.5 py-2 ${renk.bg} ${renk.border}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* Üst satır: nitelik + gün badge */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {ilan.nitelik && (
              <span className={`text-3xs font-semibold ${renk.text}`}>
                {ilan.nitelik}
              </span>
            )}
            {ilan.ada_no && ilan.parsel_no && (
              <span className="text-[10px] text-slate-500 font-mono dark:text-slate-400">
                Ada {ilan.ada_no} / Parsel {ilan.parsel_no}
              </span>
            )}
            {ilan.m2 && (
              <span className="text-3xs text-slate-500 dark:text-slate-400">
                {ilan.m2.toLocaleString("tr-TR")} m²
              </span>
            )}
          </div>

          {/* Alt satır: fiyat + tarih */}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-3xs text-slate-600 dark:text-slate-300">
              Muhammen:{" "}
              <strong className={renk.text}>{fmtTL(ilan.muhammen_bedel)}</strong>
            </span>
            {ilan.fiyat_per_m2 && (
              <span className="text-3xs text-slate-500 dark:text-slate-400">
                ({fmtTLm2(ilan.fiyat_per_m2)})
              </span>
            )}
          </div>

          {/* Tarih + gün sayacı */}
          {tarihStr && (
            <div className="flex items-center gap-1.5 mt-1">
              <CalendarClockIcon className={`h-3 w-3 flex-shrink-0 ${renk.text}`} />
              <span className={`text-3xs font-medium ${renk.text}`}>
                {tarihStr}
              </span>
              {gun != null && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                  gecmisMi
                    ? "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                    : bugun
                    ? "bg-red-500 text-white"
                    : gun <= 3
                    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                    : gun <= 7
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                }`}>
                  {gecmisMi ? "Geçti" : bugun ? "Bugün!" : `${gun} gün`}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Sağ: alarm + link butonları */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {alarmKurulabilir && (
            <button
              type="button"
              onClick={onToggle}
              disabled={isleniyor}
              title={alarmKurulu ? "Hatırlatıcıyı kaldır" : "1 gün önce hatırlat"}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-50 ${
                alarmKurulu
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "border border-slate-300 bg-white text-slate-600 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {isleniyor ? (
                <LoaderIcon className="h-3 w-3 animate-spin" />
              ) : alarmKurulu ? (
                <BellIcon className="h-3 w-3" />
              ) : (
                <BellOffIcon className="h-3 w-3" />
              )}
              {alarmKurulu ? "Alarm var" : "Hatırlat"}
            </button>
          )}

          {ilan.kaynak_url && (
            <a
              href={ilan.kaynak_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline dark:text-blue-400"
            >
              <ExternalLinkIcon className="h-2.5 w-2.5" />
              İlan
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
