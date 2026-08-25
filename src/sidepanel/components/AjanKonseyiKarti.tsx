import React, { useState } from "react";
import type { Parsel } from "../../types/tkgm";
import { MultiAgentOrkestrator } from "../../lib/ajanlar/multi-agent-orkestrator";
import { MultiAgentDebateProtokolu, type DebateSonucu } from "../../lib/ajanlar/debate-protokolu";
import { CitationGroundingGuardrail } from "../../lib/rag/citation-grounding";
import type { CokluAjanSentezRaporu } from "../../lib/ajanlar/ajan-tipleri";

interface Props {
  parsel: Parsel;
  ilanFiyatiTL?: number;
}

export const AjanKonseyiKarti: React.FC<Props> = ({ parsel, ilanFiyatiTL }) => {
  const [analiz, setAnaliz] = useState<CokluAjanSentezRaporu | null>(null);
  const [debate, setDebate] = useState<DebateSonucu | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [detayAcik, setDetayAcik] = useState(false);

  const analiziBaslat = async () => {
    setYukleniyor(true);
    try {
      const orkestrator = new MultiAgentOrkestrator();
      const debateEngine = new MultiAgentDebateProtokolu();
      const guardrail = new CitationGroundingGuardrail();

      const girdi = {
        il: parsel.ilAd,
        ilce: parsel.ilceAd,
        mahalle: parsel.mahalleAd,
        kategori: (parsel.nitelik?.toLowerCase().includes("tarla") ? "tarla" : "arsa") as "tarla" | "arsa",
        alanM2: parsel.alan,
        lat: parsel.merkezNokta?.lat,
        lng: parsel.merkezNokta?.lng,
        ilanFiyatiTL: ilanFiyatiTL ?? (parsel.alan * 5000),
        hisseliMi: (parsel.malikSayisi ?? 1) > 1,
        zeytinlikMi: parsel.nitelik?.toLowerCase().includes("zeytin"),
      };

      const sentez = await orkestrator.analizEt(girdi);
      const munazara = debateEngine.munazaraYurut(girdi, sentez.hukuk, sentez.firsat);

      const grounded = guardrail.dogrulaVeDipnotEkle(sentez.nihaiTavsiye);
      sentez.nihaiTavsiye = grounded.dipnotluMetin;

      setAnaliz(sentez);
      setDebate(munazara);
    } catch (e) {
      console.error("Ajan Konseyi hatası:", e);
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 font-sans">
      {/* 1. Header (Kurumsal Başlık) */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-900 text-3xs font-black text-white dark:bg-slate-100 dark:text-slate-900">
            C
          </span>
          <div>
            <h3 className="text-xs font-bold tracking-tight text-slate-900 dark:text-slate-100 uppercase">
              Ajan Konseyi • Çoklu Sentez
            </h3>
            <p className="text-3xs text-slate-500 font-medium">
              Değerleme + Hukuk & İmar + Fırsat Arbitrajı
            </p>
          </div>
        </div>

        {!analiz && (
          <button
            onClick={analiziBaslat}
            disabled={yukleniyor}
            className="rounded bg-slate-900 px-3 py-1.5 text-2xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {yukleniyor ? "Hesaplanıyor..." : "Analizi Başlat"}
          </button>
        )}
      </div>

      {/* Yükleniyor Durumu */}
      {yukleniyor && (
        <div className="p-6 text-center">
          <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent dark:border-slate-100"></div>
          <p className="mt-2 text-2xs font-medium text-slate-500">
            Emsal havuzu ve imar mevzuatı çapraz doğrulanıyor...
          </p>
        </div>
      )}

      {/* 2. Sonuç Vitrini */}
      {analiz && debate && !yukleniyor && (
        <div className="p-3.5 space-y-3">
          {/* Karar Banner'ı */}
          <div
            className={`rounded border p-3 ${
              debate.konsensusKarari === "guclu-al"
                ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30"
                : debate.konsensusKarari === "kesin-red"
                  ? "border-rose-200 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/30"
                  : "border-amber-200 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    debate.konsensusKarari === "guclu-al"
                      ? "bg-emerald-500"
                      : debate.konsensusKarari === "kesin-red"
                        ? "bg-rose-500"
                        : "bg-amber-500"
                  }`}
                />
                <span className="text-xs font-black tracking-wider uppercase text-slate-900 dark:text-slate-100">
                  {debate.konsensusKarari === "guclu-al" && "GÜÇLÜ AL — FIRSAT PARSELİ"}
                  {debate.konsensusKarari === "sartli-al" && "ŞARTLI ALIM — KONTROL GEREKLİ"}
                  {debate.konsensusKarari === "kesin-red" && "KESİN RED — HUKUKİ RİSK"}
                  {debate.konsensusKarari === "riskli-bekle" && "RİSKLİ / BEKLE"}
                </span>
              </div>

              <span className="font-mono text-2xs font-bold text-slate-700 dark:text-slate-300">
                Skor: {debate.efektifFirsatPuani}/100
              </span>
            </div>

            <p className="mt-1.5 text-2xs leading-relaxed text-slate-700 dark:text-slate-300 font-medium">
              {debate.uzlasmaOzeti}
            </p>
          </div>

          {/* 3 Sütunlu Yönetici Özeti (Metrics Grid) */}
          <div className="grid grid-cols-3 gap-2 text-2xs">
            <div className="rounded border border-slate-100 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="text-3xs uppercase font-bold text-slate-400">Piyasa Değeri</div>
              <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                {analiz.firsat.tahminiPiyasaDegeriTL.toLocaleString("tr-TR")} ₺
              </div>
              <div className="text-3xs text-slate-500 mt-0.5">
                {analiz.degerleme ? `${analiz.degerleme.beklenenPerM2.toLocaleString("tr-TR")} ₺/m²` : "-"}
              </div>
            </div>

            <div className="rounded border border-slate-100 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="text-3xs uppercase font-bold text-slate-400">İskonto / Kâr</div>
              <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                %{analiz.firsat.iskontoOraniYuzde}
              </div>
              <div className="text-3xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                +{analiz.firsat.potansiyelKarTL.toLocaleString("tr-TR")} ₺
              </div>
            </div>

            <div className="rounded border border-slate-100 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="text-3xs uppercase font-bold text-slate-400">Hukuk Risk Skoru</div>
              <div
                className={`font-mono font-bold mt-0.5 ${
                  analiz.hukuk.riskSkoru > 50
                    ? "text-rose-600 dark:text-rose-400"
                    : analiz.hukuk.riskSkoru > 20
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-slate-800 dark:text-slate-200"
                }`}
              >
                {analiz.hukuk.riskSkoru}/100
              </div>
              <div className="text-3xs text-slate-500 mt-0.5">
                {analiz.hukuk.tespitEdilenRiskler.length} Risk Şerhi
              </div>
            </div>
          </div>

          {/* 3. Ajan Münazara Tutanakları (Debate Timeline) */}
          <div className="rounded border border-slate-100 bg-slate-50/40 p-2.5 dark:border-slate-800 dark:bg-slate-800/30">
            <div className="text-3xs uppercase font-bold tracking-wider text-slate-400 mb-2">
              Münazara Tutanakları (Debate Log)
            </div>
            <div className="space-y-1.5 font-mono text-3xs">
              {debate.turlar.map((t, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="font-bold text-slate-500 shrink-0 w-24">
                    [{t.konusan === "firsat-avcisi" ? "FIRSAT" : t.konusan === "hukuk-denetmeni" ? "HUKUK" : "HAKEM"}]:
                  </span>
                  <span className="text-slate-700 dark:text-slate-300 font-sans text-2xs leading-tight">
                    {t.arguman}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Aksiyon Kontrol Listesi */}
          {debate.aksiyonMaddeleri.length > 0 && (
            <div className="rounded border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-3xs uppercase font-bold tracking-wider text-slate-500 mb-1.5">
                Öncelikli Aksiyon Listesi
              </div>
              <ul className="space-y-1 text-2xs text-slate-700 dark:text-slate-300 font-medium">
                {debate.aksiyonMaddeleri.map((madde, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-slate-900 dark:text-slate-100 font-bold">•</span>
                    <span>{madde}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Detay Aç/Kapa Butonu */}
          <button
            onClick={() => setDetayAcik(!detayAcik)}
            className="w-full text-center text-3xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 pt-1"
          >
            {detayAcik ? "Mevzuat Maddelerini Gizle ↑" : "İlgili Yasal Maddeleri ve Dipnotları İncele ↓"}
          </button>

          {detayAcik && analiz.hukuk.ilgiliMevzuat.length > 0 && (
            <div className="space-y-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
              {analiz.hukuk.ilgiliMevzuat.map((m, idx) => (
                <div
                  key={idx}
                  className="rounded border border-slate-200 bg-slate-50 p-2 text-3xs dark:border-slate-800 dark:bg-slate-800/50"
                >
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    {m.kanunAdi} • Madde {m.maddeNo}: {m.maddeBasligi}
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                    {m.ozet}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};