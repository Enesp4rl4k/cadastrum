/**
 * ParselOzetKarti — Parsel bulununca ilk gösterilen hızlı özet kartı.
 *
 * Kullanıcı bir parsele haritadan tıkladığında veya ilan sitesinden
 * extension ile çektiğinde, detaylı analiz yüklenmeden önce bu kart
 * hemen görünür ve temel bilgileri tek bakışta sunar.
 *
 * Tasarım ilkesi: Önce en kritik bilgi (nitelik + konum + fiyat),
 * sonra özellikler (alan / imar / hisse / deprem), en sonda riskler.
 * Riskler tek bir bölümde toplanır, tekrar yok.
 */

import { type ReactNode, useEffect, useState } from "react";
import {
  MapPin as MapPinIcon,
  Ruler as RulerIcon,
  Users as UsersIcon,
  AlertTriangle as AlertIcon,
  CheckCircle2 as CheckIcon,
  XCircle as XIcon,
  Waves as WavesIcon,
  Building2 as BuildingIcon,
  TrendingUp as TrendingUpIcon,
  Activity as ActivityIcon,
} from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import type { EPlanImarVerisi } from "../../lib/eplan";
import type { TkgmKisitVerisi } from "../../content/tkgm-parsel";
import { depremRiskiGetir } from "../../lib/data/deprem-zonlari";
import { normalizeYerAdi } from "../../lib/tkgm-api";
import { mahalleBaselineGetirAsync } from "../../lib/baseline-engine";
import { taskinRiskKoordGetir } from "../../lib/taskin-koord";

interface Props {
  parsel: Parsel;
  /** e-Plan verisi hazır olunca üst bileşenden geçirilir — imar özetini günceller */
  ePlan?: EPlanImarVerisi | null;
  /** Tapu kısıt verisi — şerh/ipotek/haciz; chrome.storage'tan gelir */
  kisitlar?: TkgmKisitVerisi | null;
}

/* ─── Nitelik → renk token ────────────────────────────────────────────────── */

function nitelikStil(nitelik: string) {
  const t = nitelik.toLocaleLowerCase("tr");
  if (/arsa/.test(t))
    return { bgCls: "bg-blue-50 dark:bg-blue-950/40", textCls: "text-blue-700 dark:text-blue-300", ringCls: "ring-blue-200 dark:ring-blue-800", emoji: "🏗" };
  if (/tarla/.test(t))
    return { bgCls: "bg-amber-50 dark:bg-amber-950/40", textCls: "text-amber-700 dark:text-amber-300", ringCls: "ring-amber-200 dark:ring-amber-800", emoji: "🌾" };
  if (/konut|mesken|bina/.test(t))
    return { bgCls: "bg-emerald-50 dark:bg-emerald-950/40", textCls: "text-emerald-700 dark:text-emerald-300", ringCls: "ring-emerald-200 dark:ring-emerald-800", emoji: "🏠" };
  if (/bahçe|bahce/.test(t))
    return { bgCls: "bg-green-50 dark:bg-green-950/40", textCls: "text-green-700 dark:text-green-300", ringCls: "ring-green-200 dark:ring-green-800", emoji: "🌳" };
  if (/zeytin/.test(t))
    return { bgCls: "bg-lime-50 dark:bg-lime-950/40", textCls: "text-lime-700 dark:text-lime-300", ringCls: "ring-lime-200 dark:ring-lime-800", emoji: "🫒" };
  return { bgCls: "bg-slate-100 dark:bg-slate-800", textCls: "text-slate-600 dark:text-slate-400", ringCls: "ring-slate-200 dark:ring-slate-700", emoji: "📍" };
}

/* ─── Deprem zonu → metin + renk ────────────────────────────────────────── */

function depremLabel(zon: string): { kisa: string; uzun: string; cls: string } {
  const map: Record<string, { kisa: string; uzun: string; cls: string }> = {
    Z1: { kisa: "Z1", uzun: "Çok Yüksek", cls: "text-red-600 dark:text-red-400" },
    Z2: { kisa: "Z2", uzun: "Yüksek",     cls: "text-orange-600 dark:text-orange-400" },
    Z3: { kisa: "Z3", uzun: "Orta",        cls: "text-amber-600 dark:text-amber-400" },
    Z4: { kisa: "Z4", uzun: "Düşük",       cls: "text-blue-600 dark:text-blue-400" },
    Z5: { kisa: "Z5", uzun: "Çok Düşük",  cls: "text-emerald-600 dark:text-emerald-400" },
  };
  return map[zon] ?? { kisa: zon, uzun: "Bilinmiyor", cls: "text-slate-500" };
}

/* ─── Alan formatla ─────────────────────────────────────────────────────── */

function fmtAlan(alan: number): string {
  if (alan <= 0) return "—";
  if (alan >= 10_000) return `${(alan / 10_000).toFixed(2)} ha`;
  return `${alan.toLocaleString("tr-TR")} m²`;
}

/* ─── TL formatla ───────────────────────────────────────────────────────── */

function fmtTL(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} Mr ₺`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)} M ₺`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)} K ₺`;
  return `${n.toLocaleString("tr-TR")} ₺`;
}

/* ─── Nitelik → fiyat kategorisi ────────────────────────────────────────── */

function nitelikKategori(nitelik: string): "arsa" | "konut" | "tarla" {
  const t = nitelik.toLocaleLowerCase("tr");
  if (/tarla|bahçe|bahce|zeytin|bağ|bag|mera/.test(t)) return "tarla";
  if (/konut|mesken|bina|daire|villa/.test(t))          return "konut";
  return "arsa";
}

/* ─── Küçük yardımcı bileşen: bilgi kutusu ─────────────────────────────── */

function InfoBox({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2">
      <div className="flex items-center gap-1">
        <span className="text-slate-400" aria-hidden="true">{icon}</span>
        <span className="text-[9px] uppercase tracking-wide font-semibold text-slate-400">{label}</span>
      </div>
      <div className="text-[12px] font-semibold text-slate-800 dark:text-slate-100 leading-snug">
        {children}
      </div>
    </div>
  );
}

/* ─── Bileşen ───────────────────────────────────────────────────────────── */

export function ParselOzetKarti({ parsel, ePlan, kisitlar }: Props) {
  const stil = nitelikStil(parsel.nitelik);
  const depremRiski = parsel.ilAd ? depremRiskiGetir(normalizeYerAdi(parsel.ilAd)) : null;
  const dLabel = depremRiski ? depremLabel(depremRiski.zon) : null;

  /* Baseline fiyat — async */
  const [baselineFiyat, setBaselineFiyat] = useState<{
    altTL: number; beklenenTL: number; ustTL: number;
    beklenenPerM2: number; guven: number;
    ilceFarkYuzde: number | null;  // ilçe ortalamasına göre % fark
  } | null>(null);
  const [fiyatYukleniyor, setFiyatYukleniyor] = useState(true);

  useEffect(() => {
    let iptal = false;
    setFiyatYukleniyor(true);
    setBaselineFiyat(null);

    (async () => {
      try {
        const kategori = nitelikKategori(parsel.nitelik);
        const sonuc = await mahalleBaselineGetirAsync(
          parsel.ilAd ?? "",
          parsel.ilceAd ?? "",
          parsel.mahalleAd ?? "",
          kategori,
        );
        if (iptal || !sonuc) return;
        const alan = parsel.alan > 0 ? parsel.alan : 0;
        const bant = sonuc.guven < 40 ? 0.5 : sonuc.guven < 70 ? 0.3 : 0.2;
        const pm2 = Math.round(sonuc.baseline);
        // İlçe ortalamasına göre fark — kullanıcıya bağlam verir
        const ilceFarkYuzde =
          sonuc.ilceFallback && sonuc.ilceFallback > 0
            ? Math.round(((pm2 - sonuc.ilceFallback) / sonuc.ilceFallback) * 100)
            : null;
        setBaselineFiyat({
          altTL: Math.round(pm2 * (1 - bant) * alan),
          beklenenTL: Math.round(pm2 * alan),
          ustTL: Math.round(pm2 * (1 + bant) * alan),
          beklenenPerM2: pm2,
          guven: sonuc.guven,
          ilceFarkYuzde,
        });
      } catch {
        /* sessiz — fiyat kutusu boş kalır */
      } finally {
        if (!iptal) setFiyatYukleniyor(false);
      }
    })();

    return () => { iptal = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsel.mahalleKodu, parsel.adaNo, parsel.parselNo]);

  /* Taşkın riski — koordinat bazlı (GloFAS) */
  const [taskinRisk, setTaskinRisk] = useState<"yuksek" | "orta" | "dusuk" | null>(null);

  useEffect(() => {
    let iptal = false;
    const lat = parsel.merkezNokta?.lat;
    const lng = parsel.merkezNokta?.lng;
    if (!lat || !lng) return;

    const ctrl = new AbortController();
    taskinRiskKoordGetir(lat, lng, ctrl.signal)
      .then((r) => { if (!iptal && r) setTaskinRisk(r.risk); })
      .catch(() => {});

    return () => { iptal = true; ctrl.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsel.merkezNokta?.lat, parsel.merkezNokta?.lng]);

  /* Risk listesi — tek kaynaktan topla */
  type Risk = { etiket: string; seviye: "kritik" | "uyari" };
  const riskler: Risk[] = [];
  if (parsel.malikSayisi != null && parsel.malikSayisi > 1)
    riskler.push({ etiket: `Hisseli tapu (${parsel.malikSayisi} malik)`, seviye: "uyari" });
  if (parsel.gittigiParseller.length > 0)
    riskler.push({ etiket: "Parsel dönüşümü mevcut", seviye: "uyari" });
  if (depremRiski?.zon === "Z1")
    riskler.push({ etiket: "Çok yüksek deprem riski", seviye: "kritik" });
  else if (depremRiski?.zon === "Z2")
    riskler.push({ etiket: "Yüksek deprem riski", seviye: "uyari" });
  if (taskinRisk === "yuksek")
    riskler.push({ etiket: "Yüksek taşkın riski", seviye: "kritik" });
  else if (taskinRisk === "orta")
    riskler.push({ etiket: "Orta taşkın riski", seviye: "uyari" });
  // Tapu kısıtları — chrome.storage'tan gelen veri
  if (kisitlar?.hacizler && kisitlar.hacizler.length > 0)
    riskler.push({ etiket: `Haciz (${kisitlar.hacizler.length})`, seviye: "kritik" });
  if (kisitlar?.ipotekler && kisitlar.ipotekler.length > 0)
    riskler.push({ etiket: `İpotek (${kisitlar.ipotekler.length})`, seviye: "uyari" });
  if (kisitlar?.serhler && kisitlar.serhler.length > 0)
    riskler.push({ etiket: `Şerh (${kisitlar.serhler.length})`, seviye: kisitlar.kritikKisitVar ? "kritik" : "uyari" });

  const kritikVar = riskler.some((r) => r.seviye === "kritik");
  const riskYok   = riskler.length === 0;

  /* İmar özeti */
  const imarVar = ePlan && (ePlan.taks != null || ePlan.emsal != null || ePlan.kullanimKarari);

  // İnşaat alanı hesabı — TAKS × parsel alanı
  const insaatAlani =
    imarVar && ePlan.taks != null && parsel.alan > 0
      ? Math.round(ePlan.taks * parsel.alan)
      : null;

  return (
    <div
      className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm content-enter"
      role="region"
      aria-label="Parsel özeti"
    >
      {/* ── Başlık satırı: nitelik badge + risk göstergesi ── */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 dark:bg-slate-950">
        {/* Nitelik badge */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${stil.bgCls} ${stil.textCls} ${stil.ringCls}`}
        >
          <span aria-hidden="true">{stil.emoji}</span>
          {parsel.nitelik || "Bilinmiyor"}
        </span>

        {/* Risk özeti — tek badge */}
        {riskYok ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
            <CheckIcon className="h-3 w-3" aria-hidden="true" />
            Temiz
          </span>
        ) : (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              kritikVar
                ? "bg-red-500/15 text-red-300"
                : "bg-amber-500/15 text-amber-300"
            }`}
          >
            <AlertIcon className="h-3 w-3" aria-hidden="true" />
            {riskler.length} risk
          </span>
        )}
      </div>

      {/* ── Lokasyon + Ada/Parsel ── */}
      <div className="flex items-start gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
        <MapPinIcon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100 leading-tight truncate">
            {[parsel.mahalleAd, parsel.ilceAd, parsel.ilAd].filter(Boolean).join(", ") || "Konum bilinmiyor"}
          </p>
          <p className="mt-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">
            Ada {parsel.adaNo} · Parsel {parsel.parselNo}
            {parsel.pafta ? ` · Pafta ${parsel.pafta}` : ""}
          </p>
        </div>
      </div>

      {/* ── Tahmini değer ── */}
      <div className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1">
            <TrendingUpIcon className="h-3 w-3 text-slate-400" aria-hidden="true" />
            <span className="text-[9px] uppercase tracking-wide font-semibold text-slate-400">Tahmini Değer</span>
          </div>
          {baselineFiyat && (
            <span
              className={`text-[9px] rounded-full px-1.5 py-0.5 font-medium ${
                baselineFiyat.guven >= 70
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : baselineFiyat.guven >= 40
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              }`}
              title="Güven skoru: veri yoğunluğuna göre hesaplanır"
            >
              %{baselineFiyat.guven} güven
            </span>
          )}
        </div>

        {fiyatYukleniyor ? (
          <div className="h-6 w-28 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
        ) : baselineFiyat && parsel.alan > 0 ? (
          <>
            <div className="flex items-baseline gap-2">
              <p className="text-[16px] font-bold tabular-nums text-slate-800 dark:text-slate-100 leading-none">
                {fmtTL(baselineFiyat.beklenenTL)}
              </p>
              {baselineFiyat.ilceFarkYuzde !== null && Math.abs(baselineFiyat.ilceFarkYuzde) >= 5 && (
                <span
                  className={`text-[10px] font-semibold tabular-nums ${
                    baselineFiyat.ilceFarkYuzde > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-500 dark:text-red-400"
                  }`}
                  title="İlçe ortalamasına göre fark"
                >
                  {baselineFiyat.ilceFarkYuzde > 0 ? "↑" : "↓"}
                  %{Math.abs(baselineFiyat.ilceFarkYuzde)} ilçe ort.
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
              {fmtTL(baselineFiyat.altTL)} – {fmtTL(baselineFiyat.ustTL)}
              <span className="ml-1.5 text-slate-400">
                · {baselineFiyat.beklenenPerM2.toLocaleString("tr-TR")} ₺/m²
              </span>
            </p>
          </>
        ) : (
          <p className="text-[11px] italic text-slate-400">Fiyat verisi yok</p>
        )}
      </div>

      {/* ── 4 bilgi kutusu: Alan · İmar · Hisse · Deprem ── */}
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 dark:divide-slate-800">
        {/* Alan */}
        <InfoBox icon={<RulerIcon className="h-3 w-3" />} label="Alan">
          {fmtAlan(parsel.alan)}
        </InfoBox>

        {/* İmar */}
        <InfoBox icon={<BuildingIcon className="h-3 w-3" />} label="İmar">
          {imarVar ? (
            <span>
              {ePlan.kullanimKarari
                ? <span className="block truncate">{ePlan.kullanimKarari.slice(0, 22)}</span>
                : null}
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 block">
                {[
                  ePlan.taks  != null ? `TAKS ${ePlan.taks.toFixed(2)}`   : "",
                  ePlan.emsal != null ? `E ${ePlan.emsal.toFixed(2)}`      : "",
                  ePlan.maksKat != null ? `${ePlan.maksKat}K`              : "",
                ].filter(Boolean).join(" · ")}
              </span>
              {insaatAlani != null && insaatAlani > 0 && (
                <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 block mt-0.5">
                  Yapılabilir: {insaatAlani.toLocaleString("tr-TR")} m²
                </span>
              )}
            </span>
          ) : ePlan === null ? (
            <span className="text-[11px] italic text-amber-600 dark:text-amber-400">Bilgi yok</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
              <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600 animate-pulse inline-block" />
              Sorgulanıyor…
            </span>
          )}
        </InfoBox>

        {/* Hisse */}
        <InfoBox icon={<UsersIcon className="h-3 w-3" />} label="Hisse">
          {parsel.malikSayisi == null ? (
            <span className="text-slate-400">Bilinmiyor</span>
          ) : parsel.malikSayisi > 1 ? (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <XIcon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
              {parsel.malikSayisi} malik
              {parsel.payBilgisi ? ` · ${parsel.payBilgisi}` : ""}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckIcon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
              Müstakil
            </span>
          )}
        </InfoBox>

        {/* Deprem */}
        <InfoBox icon={<ActivityIcon className="h-3 w-3" />} label="Deprem">
          {dLabel ? (
            <span className={dLabel.cls}>
              {dLabel.kisa} — {dLabel.uzun}
            </span>
          ) : (
            <span className="text-slate-400">Bilinmiyor</span>
          )}
        </InfoBox>
      </div>

      {/* ── Risk listesi — tek bölüm, taşkın dahil ── */}
      {riskler.length > 0 && (
        <div
          className={`px-3 py-2 border-t ${
            kritikVar
              ? "bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30"
              : "bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30"
          }`}
          role="alert"
          aria-label="Risk uyarıları"
        >
          <div className="flex items-start gap-1.5">
            <AlertIcon
              className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${
                kritikVar ? "text-red-500" : "text-amber-500"
              }`}
              aria-hidden="true"
            />
            <div className="flex flex-wrap gap-1">
              {riskler.map((r, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                    r.seviye === "kritik"
                      ? "bg-red-100 text-red-700 ring-red-600/20 dark:bg-red-900/30 dark:text-red-300"
                      : "bg-amber-100 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-300"
                  }`}
                >
                  {r.seviye === "kritik"
                    ? <XIcon className="h-2.5 w-2.5" aria-hidden="true" />
                    : <WavesIcon className="h-2.5 w-2.5" aria-hidden="true" />}
                  {r.etiket}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
