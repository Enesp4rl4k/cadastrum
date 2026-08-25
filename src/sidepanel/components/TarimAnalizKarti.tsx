import { useEffect, useMemo, useState } from "react";
import {
  Sprout as SproutIcon,
  Loader2 as LoaderIcon,
  AlertCircle as AlertIcon,
  Droplets as DropletsIcon,
  Snowflake as SnowflakeIcon,
  Mountain as MountainIcon,
  CloudRain as CloudRainIcon,
  Thermometer as ThermometerIcon,
} from "lucide-react";
import {
  type TarimAnalizi,
  tarimAnalizGetir,
  tarimGelirHesapla,
} from "../../lib/tarim-analiz";
import type { Parsel } from "../../types/tkgm";
import { Section, Row } from "../ui/Card";
import { fmtTL } from "../../lib/fiyat-tahmin";
import { tarimselDegerHesapla } from "../../lib/tarimsal-deger-motoru";
import { toprakVerisiGetir } from "../../lib/toprak";
import { sulamaAltyapisiniGetir } from "../../lib/sulama";

interface Props {
  parsel: Parsel;
}

export function TarimAnalizKarti({ parsel }: Props) {
  const [analiz, setAnaliz] = useState<TarimAnalizi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  // Ek veri katmanları — tarimsal-deger-motoru için
  const [toprak, setToprak] = useState<import("../../lib/toprak").ToprakVerisi | null>(null);
  const [sulama, setSulama] = useState<import("../../lib/sulama").SulamaAltyapisi | null>(null);

  // Toprak + sulama verisini arka planda çek
  useEffect(() => {
    let iptal = false;
    toprakVerisiGetir(parsel.merkezNokta.lat, parsel.merkezNokta.lng)
      .then((v) => { if (!iptal) setToprak(v); }).catch(() => {});
    sulamaAltyapisiniGetir(parsel.merkezNokta.lat, parsel.merkezNokta.lng)
      .then((v) => { if (!iptal) setSulama(v); }).catch(() => {});
    return () => { iptal = true; };
  }, [parsel.merkezNokta.lat, parsel.merkezNokta.lng]);

  // Tarımsal değer motoru — toprak + sulama + iklim sentezi
  const tarimDeger = useMemo(() => {
    if (!analiz) return null;
    return tarimselDegerHesapla({
      alanM2: parsel.alan ?? 0,
      nitelik: parsel.nitelik ?? "Tarla",
      toprak,
      sulama,
      tarimAnaliz: analiz,
    });
  }, [analiz, toprak, sulama, parsel.alan, parsel.nitelik]);

  useEffect(() => {
    setAnaliz(null);
    setHata(null);
  }, [parsel.adaNo, parsel.parselNo]);

  async function calistir() {
    setYukleniyor(true);
    setHata(null);
    try {
      const a = await tarimAnalizGetir(
        parsel.merkezNokta.lat,
        parsel.merkezNokta.lng,
      );
      setAnaliz(a);
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally {
      setYukleniyor(false);
    }
  }

  if (!analiz && !yukleniyor && !hata) {
    return (
      <Section
        title="Tarımsal Yatırım"
        icon={<SproutIcon className="h-3.5 w-3.5" />}
        accent="success"
        actions={
          <button
            type="button"
            onClick={calistir}
            className="cursor-pointer rounded-md bg-emerald-500 px-2 py-0.5 text-3xs font-medium text-white hover:bg-emerald-600"
          >
            Hesapla
          </button>
        }
      >
        <p className="text-3xs text-slate-500">
          5 yıllık iklim verisiyle bölgenin yağış / sıcaklık / don profili ve
          önerilen ürün listesi (TL/dönüm gelir tahminleriyle).
        </p>
      </Section>
    );
  }

  if (yukleniyor) {
    return (
      <Section
        title="Tarımsal Yatırım"
        icon={<SproutIcon className="h-3.5 w-3.5" />}
        accent="success"
      >
        <div className="flex items-center gap-2 text-2xs text-slate-500">
          <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
          Open-Meteo iklim verisi çekiliyor… (~5 sn)
        </div>
      </Section>
    );
  }

  if (hata) {
    return (
      <Section
        title="Tarımsal Yatırım"
        icon={<SproutIcon className="h-3.5 w-3.5" />}
        accent="danger"
      >
        <div className="flex items-start gap-1.5 text-3xs text-accent-danger">
          <AlertIcon className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span>{hata}</span>
        </div>
        <button
          type="button"
          onClick={calistir}
          className="mt-1 cursor-pointer text-3xs text-tkgm-primary hover:underline"
        >
          Tekrar dene
        </button>
      </Section>
    );
  }

  if (!analiz) return null;

  return (
    <Section
      title="Tarımsal Yatırım"
      icon={<SproutIcon className="h-3.5 w-3.5" />}
      accent="success"
      subtitle={
        <span className="font-medium text-accent-success">
          {analiz.iklimKusagi}
        </span>
      }
    >
      <div className="space-y-2">
        {/* İklim ufak grid */}
        <div className="grid grid-cols-2 gap-1.5 text-3xs">
          <IklimChip
            icon={<ThermometerIcon className="h-3 w-3" />}
            label="Ort. sıcaklık"
            value={`${analiz.iklim.ortSicaklikC}°C`}
          />
          <IklimChip
            icon={<CloudRainIcon className="h-3 w-3" />}
            label="Yıllık yağış"
            value={`${analiz.iklim.yillikYagisMm} mm`}
          />
          <IklimChip
            icon={<SnowflakeIcon className="h-3 w-3" />}
            label="Donlu gün/yıl"
            value={String(analiz.iklim.donluGunSayisi)}
          />
          <IklimChip
            icon={<MountainIcon className="h-3 w-3" />}
            label="Rakım"
            value={`${analiz.iklim.rakimM} m`}
          />
        </div>

        {/* İklim notu */}
        <div className="rounded-md bg-slate-50 p-2 text-3xs">
          <div className="font-medium text-slate-700">{analiz.iklimKusagi}</div>
          <div className="text-slate-500">{analiz.iklimNotu}</div>
          <div className="mt-1 flex gap-2 text-slate-500">
            <span className="flex items-center gap-0.5">
              <DropletsIcon className="h-3 w-3" />
              Sulama: <strong>{analiz.sulamaIhtiyaci}</strong>
            </span>
            <span className="flex items-center gap-0.5">
              <SnowflakeIcon className="h-3 w-3" />
              Don riski: <strong>{analiz.donmaRiski}</strong>
            </span>
          </div>
        </div>

        {/* Önerilen ürünler */}
        <div className="rounded-md border-2 border-emerald-200 bg-emerald-50/60 p-2">
          <div className="mb-1.5 text-3xs font-semibold uppercase tracking-wide text-accent-success">
            Önerilen ürünler ({parsel.alan.toLocaleString("tr-TR")} m² ={" "}
            {(parsel.alan / 1000).toFixed(1)} dönüm)
          </div>
          <div className="space-y-1">
            {analiz.oneriUrunler.map((u) => {
              const gelir = tarimGelirHesapla(parsel.alan, u.brutGelirTlDonum);
              const tone =
                u.uygunluk === "yuksek"
                  ? "text-accent-success"
                  : u.uygunluk === "orta"
                    ? "text-accent-warning"
                    : "text-slate-500";
              return (
                <div
                  key={u.urun}
                  className="rounded border border-slate-200 bg-white p-1.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span>{u.ikon}</span>
                      <span className="text-2xs font-medium text-slate-800 truncate">
                        {u.urun}
                      </span>
                      <span
                        className={`flex-shrink-0 text-3xs uppercase font-bold ${tone}`}
                      >
                        {u.uygunluk}
                      </span>
                    </div>
                    <div className="text-2xs font-semibold tabular-nums text-accent-success whitespace-nowrap">
                      {fmtTL(gelir.netGelirTahmini)}/yıl
                    </div>
                  </div>
                  <div className="text-3xs text-slate-500">{u.not}</div>
                  <div className="mt-0.5 text-3xs text-slate-400">
                    Brüt: {u.brutGelirTlDonum.toLocaleString("tr-TR")} TL/dönüm
                    × {gelir.donum.toFixed(1)} dönüm = {fmtTL(gelir.yillikBrutGelir)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tarımsal Değer Motoru Özeti — yeni */}
        {tarimDeger && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-2 space-y-1 dark:border-emerald-800 dark:bg-emerald-950/20">
            <div className="flex items-center justify-between">
              <span className="text-2xs font-semibold text-emerald-800 dark:text-emerald-200">
                🌱 Verimlilik Skoru
              </span>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                {tarimDeger.verimliliSkoru}<span className="text-xs font-normal opacity-60">/100</span>
              </span>
            </div>
            <div className="text-3xs text-emerald-700 dark:text-emerald-300">{tarimDeger.ozet}</div>
            {tarimDeger.toplamYillikGeliTL != null && (
              <div className="text-3xs text-slate-600 dark:text-slate-400">
                Tahmini yıllık gelir: <strong>{fmtTL(tarimDeger.toplamYillikGeliTL)}</strong>
              </div>
            )}
            {tarimDeger.riskler.length > 0 && (
              <ul className="text-3xs text-amber-700 dark:text-amber-400 list-disc list-inside space-y-0.5">
                {tarimDeger.riskler.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
            <div className="text-3xs font-medium text-emerald-700 dark:text-emerald-300 border-t border-emerald-200 dark:border-emerald-800 pt-1">
              Fiyat çarpanı: <strong>×{tarimDeger.fiyatCarpani.toFixed(2)}</strong>
            </div>
          </div>
        )}

        <p className="text-3xs italic text-slate-500">
          Veri: {analiz.iklim.veriKaynagi} ({analiz.iklim.donemBaslangic} →{" "}
          {analiz.iklim.donemBitis})
        </p>
      </div>
    </Section>
  );
}

function IklimChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1">
      <span className="text-slate-500">{icon}</span>
      <div className="min-w-0">
        <div className="text-3xs text-slate-500 leading-tight">{label}</div>
        <div className="text-2xs font-semibold tabular-nums text-slate-800 leading-tight">
          {value}
        </div>
      </div>
    </div>
  );
}
