import { useMemo, useState } from "react";
import {
  type YapiTipi,
  YAPI_PRESETLERI,
  fizibiliteHesapla,
  trFmt,
} from "../../lib/fizibilite";
import type { Parsel } from "../../types/tkgm";

interface Props {
  parsel: Parsel;
}

export function Fizibilite({ parsel }: Props) {
  const [arsaMaliyet, setArsaMaliyet] = useState<number>(parsel.alan * 5000);
  const [yapiTipi, setYapiTipi] = useState<YapiTipi>("apartman");
  const [hedef, setHedef] = useState<"satis" | "kira">("satis");
  const preset = YAPI_PRESETLERI[yapiTipi];
  const [insaatBirim, setInsaatBirim] = useState(preset.insaatBirimMaliyet);
  const [satisBirim, setSatisBirim] = useState(preset.satisBirimFiyat);
  const [kiraBirim, setKiraBirim] = useState(preset.kiraAylikBirim);
  const [kullanim, setKullanim] = useState(preset.kullanimOranı);

  function presetDegistir(t: YapiTipi) {
    setYapiTipi(t);
    const p = YAPI_PRESETLERI[t];
    setInsaatBirim(p.insaatBirimMaliyet);
    setSatisBirim(p.satisBirimFiyat);
    setKiraBirim(p.kiraAylikBirim);
    setKullanim(p.kullanimOranı);
  }

  const sonuc = useMemo(
    () =>
      fizibiliteHesapla({
        arsaAlani: parsel.alan,
        arsaMaliyet,
        yapiTipi,
        preset: {
          ad: preset.ad,
          insaatBirimMaliyet: insaatBirim,
          satisBirimFiyat: satisBirim,
          kiraAylikBirim: kiraBirim,
          kullanimOranı: kullanim,
        },
        hedef,
      }),
    [parsel.alan, arsaMaliyet, yapiTipi, insaatBirim, satisBirim, kiraBirim, kullanim, hedef, preset.ad],
  );

  return (
    <div className="space-y-2 rounded border border-slate-200 bg-white p-2">
      <div className="grid grid-cols-2 gap-2">
        <Input label="Arsa alanı (m²)" value={parsel.alan} readOnly />
        <Input
          label="Arsa maliyeti (TL)"
          value={arsaMaliyet}
          onChange={setArsaMaliyet}
        />
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-[10px] font-medium text-tkgm-muted">
            Yapı tipi
          </span>
          <select
            value={yapiTipi}
            onChange={(e) => presetDegistir(e.target.value as YapiTipi)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            {Object.entries(YAPI_PRESETLERI).map(([k, v]) => (
              <option key={k} value={k}>
                {v.ad}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="İnşaat birim maliyet (TL/m²)"
          value={insaatBirim}
          onChange={setInsaatBirim}
        />
        <Input
          label="Kullanım oranı (emsal)"
          value={kullanim}
          step={0.1}
          onChange={setKullanim}
        />
        {hedef === "satis" ? (
          <Input
            label="Satış birim fiyat (TL/m²)"
            value={satisBirim}
            onChange={setSatisBirim}
          />
        ) : (
          <Input
            label="Kira aylık (TL/m²/ay)"
            value={kiraBirim}
            onChange={setKiraBirim}
          />
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-tkgm-muted">Hedef</span>
          <select
            value={hedef}
            onChange={(e) => setHedef(e.target.value as "satis" | "kira")}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            <option value="satis">Sat (geliştir-sat)</option>
            <option value="kira">Kirala (yıllık getiri)</option>
          </select>
        </label>
      </div>

      <div className="rounded bg-slate-50 p-2 text-[11px]">
        <Row k="İnşaat alanı" v={`${trFmt(sonuc.insaatAlani)} m²`} />
        <Row k="İnşaat maliyeti" v={`${trFmt(sonuc.insaatMaliyet)} TL`} />
        <Row k="Toplam maliyet" v={`${trFmt(sonuc.toplamMaliyet)} TL`} />
        {hedef === "satis" && (
          <>
            <Row
              k="Beklenen satış"
              v={`${trFmt(sonuc.beklenenSatis ?? 0)} TL`}
            />
            <Row
              k="Net kâr"
              v={`${trFmt(sonuc.netKar ?? 0)} TL`}
              renk={(sonuc.netKar ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"}
            />
            <Row k="Kâr marjı" v={`%${sonuc.karMarji}`} />
          </>
        )}
        {hedef === "kira" && (
          <>
            <Row k="Aylık kira" v={`${trFmt(sonuc.aylikKira ?? 0)} TL`} />
            <Row
              k="Yıllık getiri"
              v={`%${sonuc.yillikGetiri}`}
              renk={(sonuc.yillikGetiri ?? 0) >= 8 ? "text-emerald-700" : "text-amber-700"}
            />
            <Row
              k="Geri ödeme süresi"
              v={`${sonuc.geriOdemeYil} yıl`}
            />
          </>
        )}
        <div className="mt-2 italic text-tkgm-muted">{sonuc.not}</div>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  step,
  readOnly,
}: {
  label: string;
  value: number;
  onChange?: (n: number) => void;
  step?: number;
  readOnly?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium text-tkgm-muted">{label}</span>
      <input
        type="number"
        value={value}
        step={step ?? 100}
        readOnly={readOnly}
        onChange={(e) => onChange?.(Number(e.target.value))}
        className={`rounded border border-slate-300 px-2 py-1 text-xs ${readOnly ? "bg-slate-100" : "bg-white"}`}
      />
    </label>
  );
}

function Row({
  k,
  v,
  renk,
}: {
  k: string;
  v: string;
  renk?: string;
}) {
  return (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-tkgm-muted">{k}</span>
      <span className={`font-medium ${renk ?? "text-tkgm-ink"}`}>{v}</span>
    </div>
  );
}
