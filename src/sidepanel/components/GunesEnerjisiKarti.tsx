import { useEffect, useState } from "react";
import {
  Sun as SunIcon,
  Loader2 as LoaderIcon,
  AlertCircle as AlertIcon,
} from "lucide-react";
import {
  type GunesAnalizi,
  type PvProjeksiyonu,
  gunesAnalizGetir,
  gunesKalitesiSiniflandir,
  pvProjeksiyonHesapla,
} from "../../lib/gunes-enerjisi";
import type { Parsel } from "../../types/tkgm";
import { Card, Section, Row } from "../ui/Card";
import { fmtTL } from "../../lib/fiyat-tahmin";

interface Props {
  parsel: Parsel;
}

const AY_KISALTMA = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export function GunesEnerjisiKarti({ parsel }: Props) {
  const [analiz, setAnaliz] = useState<GunesAnalizi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [kaplama, setKaplama] = useState(0.5);
  const [tarife, setTarife] = useState(3.0);

  useEffect(() => {
    setAnaliz(null);
    setHata(null);
  }, [parsel.adaNo, parsel.parselNo]);

  async function calistir() {
    setYukleniyor(true);
    setHata(null);
    try {
      const a = await gunesAnalizGetir(
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
        title="Güneş Enerjisi (PV)"
        icon={<SunIcon className="h-3.5 w-3.5" />}
        accent="warning"
        actions={
          <button
            type="button"
            onClick={calistir}
            className="cursor-pointer rounded-md bg-amber-500 px-2 py-0.5 text-3xs font-medium text-white hover:bg-amber-600"
          >
            Hesapla
          </button>
        }
      >
        <p className="text-3xs text-slate-500">
          PVGIS verisiyle bu noktanın yıllık güneş enerjisi potansiyelini ve
          arsanın PV yatırım gelirini hesapla.
        </p>
      </Section>
    );
  }

  if (yukleniyor) {
    return (
      <Section
        title="Güneş Enerjisi (PV)"
        icon={<SunIcon className="h-3.5 w-3.5" />}
        accent="warning"
      >
        <div className="flex items-center gap-2 text-2xs text-slate-500">
          <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
          PVGIS hesaplıyor… (~3 sn)
        </div>
      </Section>
    );
  }

  if (hata) {
    return (
      <Section
        title="Güneş Enerjisi (PV)"
        icon={<SunIcon className="h-3.5 w-3.5" />}
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

  const sinif = gunesKalitesiSiniflandir(analiz.yillikKwhPerKwp);
  const projeksiyon = pvProjeksiyonHesapla(parsel.alan, analiz.yillikKwhPerKwp, {
    kaplamaOrani: kaplama,
    tarifeTlKwh: tarife,
  });
  const maksKwh = Math.max(...analiz.aylikUretim.map((m) => m.kwh));

  return (
    <Section
      title="Güneş Enerjisi (PV)"
      icon={<SunIcon className="h-3.5 w-3.5" />}
      accent="warning"
      subtitle={
        <span
          className={`font-medium ${
            sinif.renk === "success"
              ? "text-accent-success"
              : sinif.renk === "warning"
                ? "text-accent-warning"
                : "text-accent-danger"
          }`}
        >
          {sinif.sinif}
        </span>
      }
    >
      <div className="space-y-2">
        {/* Bölgenin güneş kalitesi */}
        <div className="rounded-md bg-amber-50 p-2">
          <Row
            label="Yıllık üretim (1 kWp/m²)"
            value={`${analiz.yillikKwhPerKwp.toLocaleString("tr-TR")} kWh`}
          />
          <Row
            label="Yıllık radyasyon"
            value={`${analiz.yillikRadyasyonKwhM2.toLocaleString("tr-TR")} kWh/m²`}
          />
          <Row label="Optimal panel açısı" value={`${analiz.optimalAci}°`} />
          <p className="mt-1 text-3xs italic text-slate-600">{sinif.not}</p>
        </div>

        {/* Aylık dağılım mini bar chart */}
        <div className="rounded-md border border-slate-200 bg-white p-2">
          <div className="mb-1 text-3xs font-semibold text-slate-600">
            Aylık üretim (kWh/kWp)
          </div>
          <div className="flex h-12 items-end gap-0.5">
            {analiz.aylikUretim.map((m) => (
              <div
                key={m.ay}
                className="flex flex-1 flex-col items-center gap-0.5"
                title={`${AY_KISALTMA[m.ay - 1]}: ${m.kwh} kWh`}
              >
                <div
                  className="w-full rounded-t bg-amber-400 transition-all"
                  style={{ height: `${(m.kwh / maksKwh) * 100}%` }}
                />
                <span className="text-[8px] text-slate-400">
                  {AY_KISALTMA[m.ay - 1]?.[0]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Bu arsada PV yatırım projeksiyonu */}
        <div className="rounded-md border-2 border-amber-200 bg-amber-50/60 p-2">
          <div className="mb-1.5 text-3xs font-semibold uppercase tracking-wide text-accent-warning">
            Bu arsada PV yatırım
          </div>

          <div className="mb-2 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-3xs text-slate-500">Kaplama oranı</span>
              <select
                value={kaplama}
                onChange={(e) => setKaplama(Number(e.target.value))}
                className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-2xs"
              >
                <option value={0.3}>%30 (yapı + yol)</option>
                <option value={0.5}>%50 (önerilen)</option>
                <option value={0.7}>%70 (yoğun)</option>
                <option value={0.85}>%85 (boş arazi)</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-3xs text-slate-500">Tarife (TL/kWh)</span>
              <input
                type="number"
                value={tarife}
                step={0.1}
                onChange={(e) => setTarife(Number(e.target.value))}
                className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-2xs"
              />
            </label>
          </div>

          <Row
            label="Kurulu güç"
            value={`${projeksiyon.kuruluKwp.toLocaleString("tr-TR")} kWp`}
          />
          <Row
            label="Yıllık üretim"
            value={`${projeksiyon.yillikUretimKwh.toLocaleString("tr-TR")} kWh`}
          />
          <Row
            label="Yatırım (panel + invertör)"
            value={fmtTL(projeksiyon.yatirimTl)}
          />
          <Row
            label="Yıllık brüt gelir"
            value={fmtTL(projeksiyon.yillikGelirTl)}
            tone="success"
          />
          <Row
            label="Geri ödeme süresi"
            value={
              isFinite(projeksiyon.geriOdemeYil)
                ? `${projeksiyon.geriOdemeYil} yıl`
                : "—"
            }
            tone={
              projeksiyon.geriOdemeYil < 8
                ? "success"
                : projeksiyon.geriOdemeYil < 12
                  ? "warning"
                  : "danger"
            }
          />
        </div>

        <p className="text-3xs italic text-slate-500">
          Veri: {analiz.kaynak} · Yöntem: {analiz.metod}
        </p>
      </div>
    </Section>
  );
}
