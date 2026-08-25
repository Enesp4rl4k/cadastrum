import React, { useState } from "react";
import {
  MimariFizibiliteMotoru,
  type ImarFizibiliteGirdisi,
  type MimariFizibiliteRaporu,
} from "../../lib/insaat/mimari-fizibilite";

interface Props {
  parselAlaniM2: number;
  bolgeKonutM2FiyatiTL?: number;
  varsayilanTaks?: number;
  varsayilanKaks?: number;
  varsayilanKat?: number;
}

export const MimariFizibiliteKarti: React.FC<Props> = ({
  parselAlaniM2,
  bolgeKonutM2FiyatiTL = 45_000,
  varsayilanTaks = 0.35,
  varsayilanKaks = 1.40,
  varsayilanKat = 4,
}) => {
  const [taks, setTaks] = useState(varsayilanTaks);
  const [kaks, setKaks] = useState(varsayilanKaks);
  const [kat, setKat] = useState(varsayilanKat);
  const [katKarsiligi, setKatKarsiligi] = useState(45);
  const [konutM2Fiyat, setKonutM2Fiyat] = useState(bolgeKonutM2FiyatiTL);

  const motor = new MimariFizibiliteMotoru();
  const rapor: MimariFizibiliteRaporu = motor.fizibiliteHesapla({
    parselAlaniM2,
    taks,
    kaks,
    maksKat: kat,
    bolgeKonutSatisM2TL: konutM2Fiyat,
    katKarsiligiOraniYuzde: katKarsiligi,
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 font-sans text-xs">
      {/* 1. Başlık */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3 dark:border-slate-800">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
            Mimari Kütle & İnşaat Fizibilitesi
          </h3>
          <p className="text-3xs text-slate-500 font-medium">
            İmar haklarına göre üretilebilecek konut hacmi ve müteahhit kârlılığı
          </p>
        </div>
        <span className="font-mono text-3xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {parselAlaniM2.toLocaleString("tr-TR")} m² PARSEL
        </span>
      </div>

      {/* 2. İnteraktif İmar & Kat Parametreleri */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 bg-slate-50/70 p-2.5 rounded border border-slate-100 dark:bg-slate-800/40 dark:border-slate-800">
        <div>
          <label className="block text-3xs font-bold uppercase text-slate-500 mb-0.5">
            TAKS ({taks.toFixed(2)})
          </label>
          <input
            type="range"
            min="0.15"
            max="0.50"
            step="0.05"
            value={taks}
            onChange={(e) => setTaks(parseFloat(e.target.value))}
            className="w-full accent-slate-900 dark:accent-slate-100"
          />
        </div>

        <div>
          <label className="block text-3xs font-bold uppercase text-slate-500 mb-0.5">
            KAKS / Emsal ({kaks.toFixed(2)})
          </label>
          <input
            type="range"
            min="0.40"
            max="3.00"
            step="0.10"
            value={kaks}
            onChange={(e) => setKaks(parseFloat(e.target.value))}
            className="w-full accent-slate-900 dark:accent-slate-100"
          />
        </div>

        <div>
          <label className="block text-3xs font-bold uppercase text-slate-500 mb-0.5">
            Kat Karşılığı (%{katKarsiligi})
          </label>
          <input
            type="range"
            min="30"
            max="60"
            step="5"
            value={katKarsiligi}
            onChange={(e) => setKatKarsiligi(parseInt(e.target.value))}
            className="w-full accent-slate-900 dark:accent-slate-100"
          />
        </div>

        <div>
          <label className="block text-3xs font-bold uppercase text-slate-500 mb-0.5">
            Konut Satış (₺/m²)
          </label>
          <input
            type="number"
            value={konutM2Fiyat}
            onChange={(e) => setKonutM2Fiyat(parseInt(e.target.value) || 30000)}
            className="w-full rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-3xs dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
      </div>

      {/* 3. Metraj ve Finansal Sentez (Metrics Grid) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div className="rounded border border-slate-100 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-800/30">
          <div className="text-3xs uppercase font-bold text-slate-400">Toplam Konut</div>
          <div className="font-mono font-bold text-slate-900 dark:text-slate-100 text-xs mt-0.5">
            {rapor.toplamUretilenKonutAdedi} Daire
          </div>
          <div className="text-3xs text-slate-500 mt-0.5">
            {rapor.imarMetraj.toplamBrutInsaatAlaniM2.toLocaleString("tr-TR")} m² İnşaat
          </div>
        </div>

        <div className="rounded border border-slate-100 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-800/30">
          <div className="text-3xs uppercase font-bold text-slate-400">İnşaat Maliyeti</div>
          <div className="font-mono font-bold text-slate-900 dark:text-slate-100 text-xs mt-0.5">
            {rapor.finansalAnaliz.toplamInsaatMaliyetiTL.toLocaleString("tr-TR")} ₺
          </div>
          <div className="text-3xs text-slate-500 mt-0.5">2026 ÇŞB Referans</div>
        </div>

        <div className="rounded border border-slate-100 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-800/30">
          <div className="text-3xs uppercase font-bold text-slate-400">Satış Hasılatı</div>
          <div className="font-mono font-bold text-slate-900 dark:text-slate-100 text-xs mt-0.5">
            {rapor.finansalAnaliz.toplamSatisHasilatiTL.toLocaleString("tr-TR")} ₺
          </div>
          <div className="text-3xs text-emerald-600 dark:text-emerald-400 mt-0.5 font-bold">
            +{rapor.finansalAnaliz.brutProjeKariTL.toLocaleString("tr-TR")} ₺ Brüt Kâr
          </div>
        </div>

        <div className="rounded border border-slate-100 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-800/30">
          <div className="text-3xs uppercase font-bold text-slate-400">Müteahhit Net ROI</div>
          <div
            className={`font-mono font-bold text-xs mt-0.5 ${
              rapor.finansalAnaliz.muteahhitKariRoiYuzde >= 25
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
          >
            %{rapor.finansalAnaliz.muteahhitKariRoiYuzde} KÂR
          </div>
          <div className="text-3xs text-slate-500 mt-0.5">
            +{rapor.finansalAnaliz.muteahhitNetKariTL.toLocaleString("tr-TR")} ₺ Net
          </div>
        </div>
      </div>

      {/* 4. Kat Karşılığı Paylaşım Özeti */}
      <div className="rounded border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/50 space-y-1.5 text-2xs">
        <div className="flex justify-between items-center font-bold text-slate-800 dark:text-slate-200">
          <span>🤝 Kat Karşılığı Paylaşım Dağılımı:</span>
          <span className="font-mono text-3xs">
            Arsa: %{katKarsiligi} • Müteahhit: %{100 - katKarsiligi}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-3xs font-mono">
          <div className="bg-white p-2 rounded border border-slate-200 dark:bg-slate-900 dark:border-slate-700">
            <span className="text-slate-400 block uppercase">Arsa Sahibine Düşen:</span>
            <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
              {rapor.finansalAnaliz.arsaSahibineKalanDaireAdedi} Daire
            </span>
            <span className="text-slate-500 block">
              ({rapor.finansalAnaliz.arsaSahibiHasilatTL.toLocaleString("tr-TR")} ₺ Değer)
            </span>
          </div>

          <div className="bg-white p-2 rounded border border-slate-200 dark:bg-slate-900 dark:border-slate-700">
            <span className="text-slate-400 block uppercase">Müteahhide Kalan:</span>
            <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
              {rapor.finansalAnaliz.muteahhitKalanDaireAdedi} Daire
            </span>
            <span className="text-slate-500 block">
              ({rapor.finansalAnaliz.muteahhitHasilatTL.toLocaleString("tr-TR")} ₺ Satış)
            </span>
          </div>
        </div>

        <p className="text-3xs font-sans text-slate-600 dark:text-slate-400 pt-1 leading-relaxed">
          {rapor.uygunlukOzeti}
        </p>
      </div>
    </div>
  );
};