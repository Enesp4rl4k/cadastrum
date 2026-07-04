import { useEffect, useState } from "react";
import {
  Wallet as WalletIcon,
  Sparkles as SparklesIcon,
  ChevronRight as ChevronRightIcon,
  ChevronDown as ChevronDownIcon,
  Loader2 as LoaderIcon,
  AlertCircle as AlertIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ExternalLink as ExternalLinkIcon,
  Database as DatabaseIcon,
} from "lucide-react";
import {
  type FiyatTahmini,
  fiyatTahminEt,
  fmtTL,
  fmtTLM2,
} from "../../lib/fiyat-tahmin";
import type { Parsel } from "../../types/tkgm";
import type { CevreAnalizi } from "../../lib/osm";
import type { EgimAnalizi } from "../../lib/elevation";
import type { EPlanImarVerisi } from "../../lib/eplan";
import type { TucbsCdpSonuc } from "../../lib/tucbs";
import { ePlanOzet } from "../../lib/eplan";
import { type AiFiyatSonucu, aiTahmin, chromeBuiltinAiVarMi, aiDurumGetir, type AiDurum } from "../../lib/ai-fiyat";
import { useAyarlar } from "../../lib/ayarlar";
import { useLisans } from "../../lib/lisans";
import { Card, Section } from "../ui/Card";
import { HizliImarPrompt } from "./HizliImarPrompt";

interface Props {
  parsel: Parsel;
  cevre: CevreAnalizi | null;
  egim: EgimAnalizi | null;
  ePlan: EPlanImarVerisi | null;
  tucbs?: TucbsCdpSonuc | null;
  /** e-Plan sorgu hâlâ yapılıyor mu? — yapılıyorsa imar promptu gösterme, bekle. */
  ePlanLoading: boolean;
  /** Kullanıcı "Bilmiyorum, devam et" dediyse fiyatı TKGM nitelik fallback'iyle hesapla. */
  imarSkipEdildi: boolean;
  onImarKaydedildi: () => void;
  onImarSkip: () => void;
  /** Skip sonrası warn banner'dan "İmar gir" — skip'i geri çevirir, prompt'u tekrar açar. */
  onImarTekrarSor: () => void;
}

export function FiyatTahminKarti({
  parsel,
  cevre,
  egim,
  ePlan,
  tucbs,
  ePlanLoading,
  imarSkipEdildi,
  onImarKaydedildi,
  onImarSkip,
  onImarTekrarSor,
}: Props) {
  const [tahmin, setTahmin] = useState<FiyatTahmini | null>(null);
  const [acik, setAcik] = useState(false);
  const [aiSonuc, setAiSonuc] = useState<AiFiyatSonucu | null>(null);
  const [aiYukleniyor, setAiYukleniyor] = useState(false);
  const [aiHata, setAiHata] = useState<string | null>(null);
  const [aiDurum, setAiDurum] = useState<AiDurum | null>(null);
  const [ayarlar] = useAyarlar();
  const lisans = useLisans();

  // AI sağlayıcısı:
  // - Pro user: kullanıcı sağlayıcı seçtiyse onunla, yoksa cadastrum-proxy (otomatik)
  // - Free user: cadastrum-proxy günlük 3 deneme hakkı (manuel button ile tetiklenir)
  const proAi = lisans.can("ai-fiyat");
  const aktifSaglayici = ayarlar.aiSaglayici !== "yok"
    ? ayarlar.aiSaglayici
    : "cadastrum-proxy" as const;

  // İmar gating — fiyat ancak resmi imar VEYA kullanıcının açık skip'i ile hesaplanır.
  const imarVar = !!ePlan && !!(ePlan.kullanimKarari || ePlan.taks || ePlan.emsal);
  const hesaplanabilir = imarVar || imarSkipEdildi;

  useEffect(() => {
    let iptal = false;
    if (!hesaplanabilir) {
      // İmar yoksa eski tahmini temizle — yanıltıcı stale değer kalmasın
      setTahmin(null);
      setAiSonuc(null);
      setAiHata(null);
      return;
    }
    // NOT: fiyatTahminEt(4 param) tucbs almıyor (TÜCBS imar threading fiyat-tahmin.ts'te
    // henüz tamamlanmadı). tucbs prop'u deps'te kalıyor; imar threading eklenince buraya geçilir.
    fiyatTahminEt(parsel, cevre, egim, ePlan).then((t) => {
      if (!iptal) setTahmin(t);
    });
    setAiSonuc(null);
    setAiHata(null);
    return () => {
      iptal = true;
    };
  }, [parsel, cevre, egim, ePlan, tucbs, hesaplanabilir]);

  async function aiCalistir() {
    if (!tahmin) return;
    setAiYukleniyor(true);
    setAiHata(null);
    try {
      const sonuc = await aiTahmin(parsel, cevre, egim, tahmin, {
        saglayici: aktifSaglayici,
        ollamaModel: ayarlar.aiOllamaModel,
        ollamaUrl: ayarlar.aiOllamaUrl,
        geminiApiKey: ayarlar.aiGeminiApiKey,
      });
      setAiSonuc(sonuc);
    } catch (e) {
      setAiHata(e instanceof Error ? e.message : String(e));
    } finally {
      setAiYukleniyor(false);
    }
  }

  // Pro otomatik tetikleme — istatistik tahmin geldiğinde AI'yı arka planda çalıştır
  useEffect(() => {
    if (!tahmin || !proAi) return;
    if (aiSonuc || aiYukleniyor || aiHata) return;
    void aiCalistir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tahmin, proAi]);

  // AI kullanım durumunu (kalan kota) periyodik tazele
  useEffect(() => {
    if (aktifSaglayici !== "cadastrum-proxy") return;
    void aiDurumGetir().then(setAiDurum);
  }, [aktifSaglayici, aiSonuc]);

  // Triangulation: AI sonucu makul aralıktaysa kombine beklenen göster (70% statistical + 30% AI)
  const aiSapma = aiSonuc && tahmin
    ? Math.abs((aiSonuc.beklenenPerM2 - tahmin.beklenenPerM2) / tahmin.beklenenPerM2)
    : null;
  const aiKombineGecerli = aiSapma != null && aiSapma <= 0.30;
  const kombineBeklenenPerM2 = aiKombineGecerli && aiSonuc && tahmin
    ? Math.round(0.7 * tahmin.beklenenPerM2 + 0.3 * aiSonuc.beklenenPerM2)
    : null;
  const kombineBeklenenToplam = kombineBeklenenPerM2 ? Math.round(kombineBeklenenPerM2 * parsel.alan) : null;

  // İmar gating UI'ı — sıralama: e-Plan yükleniyor > imar yok > skip > tahmin yükleniyor
  if (ePlanLoading && !imarVar && !imarSkipEdildi) {
    return (
      <Card accent="success">
        <div className="flex items-center gap-2 px-3 py-3 text-2xs text-slate-500">
          <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
          İmar sorgulanıyor…
        </div>
      </Card>
    );
  }

  if (!hesaplanabilir) {
    return (
      <HizliImarPrompt
        parsel={parsel}
        onKaydedildi={onImarKaydedildi}
        onSkip={onImarSkip}
      />
    );
  }

  if (!tahmin) {
    return (
      <Card accent="success">
        <div className="flex items-center gap-2 px-3 py-3 text-2xs text-slate-500">
          <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
          Fiyat tahmini hesaplanıyor…
        </div>
      </Card>
    );
  }

  const coldStart = tahmin.baselineKaynak !== "ilanGozlem-mahalle"
    && tahmin.baselineKaynak !== "ilanGozlem-ilce"
    && tahmin.baselineKaynak !== "spatial-radius";
  const { guvenIcon, guvenLabel, guvenClass } = guvenStyle(tahmin.guven);

  return (
    <Section
      title={coldStart ? "Bölge Ortalaması (tahmini)" : "Tahmini Piyasa Fiyatı"}
      icon={<WalletIcon className="h-3.5 w-3.5" />}
      accent="success"
      subtitle={
        <span className={`inline-flex items-center gap-0.5 ${guvenClass}`}>
          {guvenIcon} {guvenLabel}
        </span>
      }
      bare
    >
      <div className="space-y-2 px-3 pb-3">
        {/* İmar bilinmeden hesaplanmış (skip edilmiş) → büyük dikkat banner'ı */}
        {imarSkipEdildi && !imarVar && (
          <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-2xs text-amber-900">
            <AlertIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
            <div>
              <div className="font-semibold">Düşük güven — imar bilinmiyor</div>
              <div className="mt-0.5 leading-relaxed">
                Bu tahmin TKGM niteliği ({parsel.nitelik || "bilinmiyor"}) ile yapıldı.
                İmar farklıysa fiyat %20–%80 sapabilir.{" "}
                <button
                  type="button"
                  onClick={onImarTekrarSor}
                  className="underline hover:text-amber-700"
                >
                  İmar gir →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cold-start: gerçek ilan verisi yok → metodoloji uyarısı */}
        {coldStart && (
          <div className="flex items-start gap-2 rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-2xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <span className="mt-0.5 flex-shrink-0 text-slate-400">⚠</span>
            <div className="leading-relaxed">
              <span className="font-medium">Bu bölgede gerçek ilan verisi yok.</span>{" "}
              Tahmin, komşu mahallelerden istatistiksel çıkarım ile üretildi — medyan hata %45–65 civarında olabilir.
              {(tahmin.imarOzeti.sinif === "konut-imarli" || tahmin.imarOzeti.sinif === "yapi-mevcut") && (
                <> Konut/yapı imar için gerçek konut emsal verisi bulunmadığından arsa bazlı tahmin üzerine imar çarpanı uygulandı.</>
              )}{" "}
              Yatırım kararı için bölgede gerçek emsal araştırmanızı öneririz.
            </div>
          </div>
        )}

        {/* Beklenen — büyük vurgu (AI kombine varsa üstte gösterilir) */}
        <div className="flex items-baseline justify-between border-b border-slate-100 pb-2">
          <div>
            <div className="text-3xs uppercase tracking-wide text-slate-500 flex items-center gap-1">
              {kombineBeklenenPerM2 ? (
                <>
                  <SparklesIcon className="h-3 w-3 text-accent-ai" />
                  AI + İstatistik Kombine
                </>
              ) : (
                "Beklenen"
              )}
            </div>
            <div className="text-3xs text-slate-500 tabular-nums">
              {fmtTLM2(kombineBeklenenPerM2 ?? tahmin.beklenenPerM2)} × {parsel.alan.toLocaleString("tr-TR")} m²
            </div>
          </div>
          <div className="text-xl font-bold tabular-nums text-accent-success">
            {fmtTL(kombineBeklenenToplam ?? tahmin.toplamBeklenen)}
          </div>
        </div>

        {/* Alt-Üst aralık */}
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-md bg-slate-50 px-2 py-1.5">
            <div className="text-3xs uppercase tracking-wide text-slate-500">
              Alt sınır
            </div>
            <div className="text-xs font-semibold tabular-nums text-slate-700">
              {fmtTL(tahmin.toplamAlt)}
            </div>
            <div className="text-3xs text-slate-400 tabular-nums">
              {fmtTLM2(tahmin.altPerM2)}
            </div>
          </div>
          <div className="rounded-md bg-slate-50 px-2 py-1.5">
            <div className="text-3xs uppercase tracking-wide text-slate-500">
              Üst sınır
            </div>
            <div className="text-xs font-semibold tabular-nums text-slate-700">
              {fmtTL(tahmin.toplamUst)}
            </div>
            <div className="text-3xs text-slate-400 tabular-nums">
              {fmtTLM2(tahmin.ustPerM2)}
            </div>
          </div>
        </div>

        {/* Veri kaynağı + Sahibinden ara butonu */}
        <div className="rounded-md border border-slate-200 bg-white/80 px-2 py-1.5 text-3xs dark:border-slate-700 dark:bg-slate-800/80">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-slate-700 dark:text-slate-100">Tahmin bandı</span>
            <span className="font-mono text-slate-500 dark:text-slate-300">%{tahmin.aralikGenisligiYuzde}</span>
          </div>
          <div className="mt-0.5 text-slate-500 dark:text-slate-300">
            Daha düşük yüzde daha dar ve daha güvenli fiyat aralığı demek.
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="flex-1 text-3xs italic text-slate-500">{tahmin.guvenAciklama}</p>
          {(tahmin.baselineKaynak === "il-baseline"
            || tahmin.baselineKaynak === "fallback"
            || tahmin.baselineKaynak === "ilce-baseline"
            || tahmin.baselineKaynak === "ilce-semt-baseline") && (
            <a
              href={sahibindenAraUrl(parsel)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-shrink-0 items-center gap-1 rounded-md border border-orange-300 bg-orange-50 px-2 py-1 text-3xs font-medium text-orange-700 hover:bg-orange-100"
              title="Bu sayfada gezinirken fiyatlar otomatik biriktirilir"
            >
              <ExternalLinkIcon className="h-3 w-3" />
              Sahibinden'de Ara
            </a>
          )}
        </div>

        {/* Kaç ilanGozlem verisi var + tazelik */}
        {tahmin.baselineKaynak === "spatial-radius" && (
          <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-3xs text-emerald-900">
            <span className="font-semibold">🎯 Spatial Emsal</span>{" "}
            {tahmin.baselineAdet} koordinatlı ilan · radius decay weighted median
          </div>
        )}
        {tahmin.baselineAdet > 0 && (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1 text-3xs text-slate-400">
              <DatabaseIcon className="h-3 w-3" />
              {tahmin.baselineAdet} Sahibinden ilanı · {
              tahmin.baselineKaynak === "ilanGozlem-mahalle" ? "mahalle" :
                tahmin.baselineKaynak === "ilanGozlem-ilce" ? "ilçe" :
                tahmin.baselineKaynak === "ilce-semt-baseline" ? "semt" :
                tahmin.baselineKaynak === "ilce-baseline" ? "ilçe" : ""
              } verisi
            </div>
            {tahmin.tazelikOzeti && <TazelikBadge ozet={tahmin.tazelikOzeti} />}
          </div>
        )}

        {tahmin.emsalOzeti && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-2 py-1.5 text-3xs text-emerald-800">
            <div className="font-medium">
              Emsal havuzu: {tahmin.emsalOzeti.secilenAdet} kayıt
            </div>
            <div className="mt-0.5">
              {tahmin.emsalOzeti.mahalleAdet} mahalle · {tahmin.emsalOzeti.ilceAdet} ilçe desteği ·
              {` `}benzerlik %{Math.round(tahmin.emsalOzeti.ortalamaBenzerlik * 100)}
            </div>
            <div className="mt-0.5">
              Weighted asking: {fmtTLM2(tahmin.emsalOzeti.weightedAsking)}
              {tahmin.emsalOzeti.dogrulanabilirAdet > 0
                ? ` · ${tahmin.emsalOzeti.dogrulanabilirAdet} kayıt ada/parsel içeriyor`
                : ""}
            </div>
            {/* Şeffaflık chips: outlier ve döviz dönüşüm */}
            {(tahmin.emsalOzeti.outlierAdet > 0 || tahmin.emsalOzeti.dovizDonusturulenAdet > 0) && (
              <div className="mt-1 flex flex-wrap gap-1">
                {tahmin.emsalOzeti.outlierAdet > 0 && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-3xs font-medium text-amber-800"
                    title="Tukey IQR yöntemiyle aykırı bulunan ilanlar havuzdan çıkarıldı (örn. yanlış girilmiş fiyat)"
                  >
                    <span className="h-1 w-1 rounded-full bg-amber-600" />
                    {tahmin.emsalOzeti.outlierAdet} aykırı atıldı
                  </span>
                )}
                {tahmin.emsalOzeti.dovizDonusturulenAdet > 0 && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-3xs font-medium text-sky-800"
                    title="USD/EUR/GBP ilanları güncel kurla TL'ye çevrildi"
                  >
                    <span className="h-1 w-1 rounded-full bg-sky-600" />
                    {tahmin.emsalOzeti.dovizDonusturulenAdet} dövizli TL'ye çevrildi
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <div className="rounded-md border border-amber-200 bg-amber-50/70 px-2 py-1.5 text-3xs text-amber-800">
          <div className="font-medium">İmar sinyali: {tahmin.imarOzeti.sinif}</div>
          <div className="mt-0.5">
            Kaynak: {tahmin.imarOzeti.kaynak === "eplan-resmi"
              ? "resmi e-Plan sonucu"
              : tahmin.imarOzeti.kaynak === "ilan-imar"
                ? "ilan imar açıklaması"
                : "parsel niteliği"}
          </div>
          <div className="mt-0.5">{tahmin.imarOzeti.not}</div>
          {tahmin.imarOzeti.resmiDetay && (
            <div className="mt-1 rounded border border-amber-300/70 bg-white/80 px-2 py-1.5 text-[10px] text-amber-900">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Resmi e-Plan kaydı</span>
                <span className="text-amber-700/70 tabular-nums">
                  Güven %{tahmin.imarOzeti.resmiDetay.guvenSkoru ?? 0}
                </span>
              </div>

              {/* Yapılaşma KPI grid — TAKS / Emsal / MaksKat / Yapı Nizamı */}
              {(() => {
                const d = tahmin.imarOzeti.resmiDetay!;
                const hasYapilanma = d.taks != null || d.emsal != null || d.maksKat != null || d.yapiNizami;
                if (!hasYapilanma) return null;
                return (
                  <div className="mt-1.5 grid grid-cols-4 gap-1 rounded bg-amber-100/60 p-1">
                    <ImarKpi
                      label="TAKS"
                      value={d.taks != null ? d.taks.toFixed(2) : "—"}
                      hint="Taban Alan Kat Sayısı"
                    />
                    <ImarKpi
                      label="Emsal"
                      value={d.emsal != null ? d.emsal.toFixed(2) : "—"}
                      hint="KAKS — Kat Alan Kat Sayısı"
                    />
                    <ImarKpi
                      label="Maks Kat"
                      value={d.maksKat != null ? String(d.maksKat) : "—"}
                      hint="İzin verilen maksimum kat"
                    />
                    <ImarKpi
                      label="Nizam"
                      value={d.yapiNizami ? kisaltNizam(d.yapiNizami) : "—"}
                      hint={d.yapiNizami ?? "Yapı düzeni"}
                    />
                  </div>
                );
              })()}

              {/* Kullanım/plan kararı text özet */}
              {(tahmin.imarOzeti.resmiDetay.kullanimKarari ||
                tahmin.imarOzeti.resmiDetay.planKarari) && (
                <div className="mt-1.5 space-y-0.5">
                  {tahmin.imarOzeti.resmiDetay.kullanimKarari && (
                    <div>
                      <span className="text-amber-700/80 font-medium">Kullanım: </span>
                      {tahmin.imarOzeti.resmiDetay.kullanimKarari}
                    </div>
                  )}
                  {tahmin.imarOzeti.resmiDetay.planKarari &&
                    tahmin.imarOzeti.resmiDetay.planKarari !== tahmin.imarOzeti.resmiDetay.kullanimKarari && (
                      <div>
                        <span className="text-amber-700/80 font-medium">Plan: </span>
                        {tahmin.imarOzeti.resmiDetay.planKarari}
                      </div>
                    )}
                </div>
              )}

              {tahmin.imarOzeti.resmiDetay.yakalandiAt && (
                <div className="mt-1 text-[9px] text-amber-700/60">
                  Yakalandı: {new Date(tahmin.imarOzeti.resmiDetay.yakalandiAt).toLocaleString("tr-TR")}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-3xs">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-medium text-slate-700">Veri kalitesi</span>
            <span className="font-mono text-slate-500">Skor {tahmin.guvenSkoru}/100</span>
          </div>
          <div className="mb-1.5 flex flex-wrap gap-1">
            {tahmin.guvenKirilimi.slice(0, 6).map((kalem) => (
              <span
                key={`${kalem.etiket}-${kalem.puan}`}
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  kalem.durum === "pozitif"
                    ? "bg-emerald-100 text-emerald-800"
                    : kalem.durum === "uyari"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-slate-200 text-slate-700"
                }`}
              >
                <span>{kalem.puan > 0 ? "+" : ""}{kalem.puan}</span>
                <span>{kalem.etiket}</span>
              </span>
            ))}
          </div>
          <div className="space-y-0.5 text-slate-500">
            {tahmin.veriKalitesiNotlari.slice(0, 4).map((not, i) => (
              <div key={i}>• {not}</div>
            ))}
          </div>
        </div>

        {/* Hesap detayı toggle */}
        {tahmin.sonrakiHamleler.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50/70 px-2 py-1.5 text-3xs text-amber-900">
            <div className="font-medium">GÃ¼veni artÄ±rmak iÃ§in</div>
            <div className="mt-1 space-y-0.5">
              {tahmin.sonrakiHamleler.map((adim, i) => (
                <div key={i}>â€¢ {adim}</div>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setAcik((v) => !v)}
          className="flex w-full cursor-pointer items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1.5 text-2xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          <span>Hesap detayı ({tahmin.bilesenler.length} bileşen)</span>
          {acik ? (
            <ChevronDownIcon className="h-3.5 w-3.5" />
          ) : (
            <ChevronRightIcon className="h-3.5 w-3.5" />
          )}
        </button>

        {acik && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-3xs">
            {tahmin.bilesenler.map((b, i) => (
              <div
                key={i}
                className="flex items-baseline justify-between gap-2 border-b border-slate-200/50 py-1 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-700 truncate">
                    {b.ad}
                  </div>
                  <div className="text-slate-500 truncate">{b.not}</div>
                </div>
                <div className="font-mono font-semibold tabular-nums text-accent-success whitespace-nowrap">
                  {i === 0
                    ? fmtTLM2(Math.round(b.carpan))
                    : `× ${b.carpan.toFixed(2)}`}
                </div>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t-2 border-accent-success/30 pt-1.5 text-2xs font-bold">
              <span className="text-slate-700">= Beklenen</span>
              <span className="font-mono tabular-nums text-accent-success">
                {fmtTLM2(tahmin.beklenenPerM2)}
              </span>
            </div>
          </div>
        )}

        {/* AI bölümü — cold start'ta daha vurgulu CTA */}
        <div className="space-y-1.5 border-t border-slate-100 pt-2">
          {ayarlar.aiSaglayici === "yok" ? null : !aiSonuc && !aiYukleniyor && !proAi ? (
            <button
              type="button"
              onClick={aiCalistir}
              className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-accent-ai px-2 py-1.5 text-2xs font-medium text-white transition-colors hover:bg-violet-700"
              title="Free planda günde 3 ücretsiz AI analizi"
            >
              <SparklesIcon className="h-3.5 w-3.5" />
              AI ile analiz et
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px]">
                {aiDurum ? `${aiDurum.kalan}/${aiDurum.kota}` : "3 ücretsiz/gün"}
              </span>
            </button>
          ) : null}

          {/* AI kullanım durumu (kalan kota) — Pro proxy aktifken göster */}
          {aiSonuc && aktifSaglayici === "cadastrum-proxy" && aiDurum && (
            <div className="flex items-center justify-between text-[9px] text-slate-500 px-1">
              <span>
                AI: <strong className="text-violet-600">{aiDurum.kullanilan}</strong> / {aiDurum.kota} kullanıldı
              </span>
              {aiDurum.kalan === 0 && aiDurum.tier === "free" && (
                <a href="https://cadastrum.com.tr/fiyat" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">
                  Pro'ya geç →
                </a>
              )}
            </div>
          )}

          {aiYukleniyor && (
            <div className="flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-2 py-2 text-2xs text-accent-ai">
              <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
              <span className="flex-1">
                {proAi ? "Pro otomatik analiz" : "AI analiz ediyor"}…
                {ayarlar.aiSaglayici === "ollama" ? " (lokal 5–30 sn)" : ""}
              </span>
            </div>
          )}

          {aiHata && (
            <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-3xs text-accent-danger">
              <div className="flex items-start gap-1.5 mb-1">
                <AlertIcon className="mt-0.5 h-3 w-3 flex-shrink-0" />
                <span className="break-words">{aiHata}</span>
              </div>
              {/giriş yap|Pro plan|Pro\/Pro\+|Pro üye|oturum/i.test(aiHata) && (
                <div className="mt-1.5 flex gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => chrome.tabs.create({ url: "https://cadastrum.com.tr/giris?source=extension" })}
                    className="rounded bg-imperial px-2 py-1 text-white text-3xs font-medium hover:bg-imperial-700 transition"
                  >
                    Giriş Yap →
                  </button>
                  <button
                    type="button"
                    onClick={() => chrome.tabs.create({ url: "https://cadastrum.com.tr/kayit?source=extension" })}
                    className="rounded border border-imperial bg-white text-imperial px-2 py-1 text-3xs font-medium hover:bg-imperial-50 transition"
                  >
                    Hesap aç (ücretsiz)
                  </button>
                  <button
                    type="button"
                    onClick={() => chrome.tabs.create({ url: "https://cadastrum.com.tr/fiyat" })}
                    className="rounded border border-champagne-500 bg-champagne-50 text-champagne-700 px-2 py-1 text-3xs font-medium hover:bg-champagne-100 transition"
                  >
                    Pro'ya geç
                  </button>
                </div>
              )}
            </div>
          )}

          {aiSonuc && tahmin && (
            <AiSonucKart aiSonuc={aiSonuc} heuristic={tahmin} />
          )}
        </div>
      </div>
    </Section>
  );
}

function AiSonucKart({
  aiSonuc,
  heuristic,
}: {
  aiSonuc: AiFiyatSonucu;
  heuristic: FiyatTahmini;
}) {
  const fark =
    heuristic.beklenenPerM2 > 0
      ? Math.round(
          ((aiSonuc.beklenenPerM2 - heuristic.beklenenPerM2) /
            heuristic.beklenenPerM2) *
            100,
        )
      : 0;
  const FarkIcon = fark > 0 ? TrendingUpIcon : fark < 0 ? TrendingDownIcon : null;
  const farkColor =
    fark > 5
      ? "text-accent-success"
      : fark < -5
        ? "text-accent-danger"
        : "text-slate-500";

  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/50 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1 text-3xs font-medium text-accent-ai">
          <SparklesIcon className="h-3 w-3" />
          {aiSonuc.modelAd}
        </span>
        <span className="text-3xs text-slate-400 tabular-nums">
          {aiSonuc.sureMs}ms
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-center">
        <div className="rounded bg-white px-1 py-1">
          <div className="text-3xs text-slate-500">Alt</div>
          <div className="text-2xs font-semibold tabular-nums text-slate-700">
            {fmtTLM2(aiSonuc.altPerM2)}
          </div>
        </div>
        <div className="rounded bg-violet-100 px-1 py-1">
          <div className="text-3xs text-accent-ai">AI Tahmin</div>
          <div className="text-2xs font-bold tabular-nums text-accent-ai">
            {fmtTLM2(aiSonuc.beklenenPerM2)}
          </div>
        </div>
        <div className="rounded bg-white px-1 py-1">
          <div className="text-3xs text-slate-500">Üst</div>
          <div className="text-2xs font-semibold tabular-nums text-slate-700">
            {fmtTLM2(aiSonuc.ustPerM2)}
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-1 text-3xs">
        <span className="text-slate-500">Heuristic ile fark:</span>
        {FarkIcon && <FarkIcon className={`h-3 w-3 ${farkColor}`} />}
        <span className={`font-semibold tabular-nums ${farkColor}`}>
          {fark > 0 ? "+" : ""}
          {fark}%
        </span>
      </div>
      {aiSonuc.gerekce && (
        <p className="mt-1.5 rounded bg-white p-1.5 text-3xs italic text-slate-700">
          "{aiSonuc.gerekce}"
        </p>
      )}
    </div>
  );
}

/** Parsel il/ilçe'sine göre Sahibinden arsa arama URL'i üretir */
function sahibindenAraUrl(parsel: Parsel): string {
  const slug = (s: string) =>
    s
      .toLocaleLowerCase("tr")
      .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c)
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  const il = parsel.ilAd ? slug(parsel.ilAd) : "";
  const ilce = parsel.ilceAd ? slug(parsel.ilceAd) : "";
  if (il && ilce) return `https://www.sahibinden.com/arsa-${il}-${ilce}`;
  if (il) return `https://www.sahibinden.com/arsa-${il}`;
  return "https://www.sahibinden.com/arsa";
}

/**
 * AI Onboarding — vendor-free seçenekleri öne çıkar, Gemini API'yi yedek olarak göster.
 *
 * Sıralama (vendor-lock riski azdan çoğa):
 *  1. Chrome built-in AI (Gemini Nano) — browser içinde, Google bile tek başına kapatamaz
 *  2. Ollama localhost — tamamen lokal, hiç API yok
 *  3. Gemini API — cloud, key gerekir (vendor riski var)
 *
 * Cold start durumunda büyük CTA, normal durumda subtle hint.
 */
function AiOnboardingKarti({ coldStart }: { coldStart: boolean }) {
  const builtinVar = chromeBuiltinAiVarMi();

  if (coldStart) {
    return (
      <div className="rounded-md border border-violet-200 bg-violet-50/70 p-2.5 space-y-1.5">
        <div className="flex items-start gap-1.5">
          <SparklesIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-accent-ai" />
          <div className="text-3xs leading-relaxed text-slate-700">
            <strong className="text-accent-ai">Bu bölge için canlı emsal yok.</strong>
            {" "}AI ile derin analiz %15-25 daha doğru sonuç üretir. {builtinVar ? <strong className="text-emerald-700">Chrome'unuzda zaten yerel AI var — kurulum gerektirmez.</strong> : "Aşağıdan vendor-free seçenekler:"}
          </div>
        </div>

        {/* Vendor-free seçenekler önce */}
        <div className="space-y-1">
          {builtinVar && (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                const btn = document.querySelector<HTMLButtonElement>('button[title="Ayarlar"]');
                btn?.click();
              }}
              className="flex items-center justify-between gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 text-3xs font-semibold text-white"
              title="Chrome'un built-in AI'ı — sıfır kurulum, sıfır key, çevrimdışı çalışır"
            >
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                ⚡ Chrome AI'ı kullan (önerilen, sıfır kurulum)
              </span>
              <span>→</span>
            </a>
          )}

          <details className="rounded-md border border-slate-200 bg-white px-2 py-1 dark:bg-slate-800 dark:border-slate-700">
            <summary className="cursor-pointer text-3xs font-medium text-slate-700 dark:text-slate-300 py-0.5">
              Diğer seçenekler {builtinVar ? "(opsiyonel)" : ""}
            </summary>
            <div className="space-y-1.5 pt-2 pb-1 text-3xs">
              <div className="flex items-start gap-1.5">
                <span className="text-slate-400 font-mono">2.</span>
                <div className="flex-1">
                  <strong className="text-slate-700 dark:text-slate-200">Ollama lokal</strong>
                  {" "}— tamamen lokal kurulum, vendor-free, internet gerektirmez.{" "}
                  <a
                    href="https://ollama.com/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-ai hover:underline"
                  >
                    indir →
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="text-slate-400 font-mono">3.</span>
                <div className="flex-1">
                  <strong className="text-slate-700 dark:text-slate-200">Gemini API</strong>
                  {" "}— cloud, ücretsiz key (vendor riski var).{" "}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-ai hover:underline"
                  >
                    key al →
                  </a>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    );
  }

  // Normal güven (subtle hint)
  return (
    <p className="flex items-start gap-1 text-3xs italic text-slate-500">
      <SparklesIcon className="mt-0.5 h-3 w-3 flex-shrink-0" />
      Derin analiz için AI bağla — ⚙ Ayarlar {">"} AI Sağlayıcı.
      {builtinVar ? (
        <span className="text-emerald-700 ml-0.5"> Chrome AI mevcut, sıfır kurulum.</span>
      ) : null}
    </p>
  );
}

/**
 * Tazelik göstergesi — son 30/90 gün dağılımını ve ortalama yaşı gösterir.
 * Renk kodlaması: ≤30g yeşil (taze), ≤60g sarı (orta), >60g gri (eski).
 */
function TazelikBadge({ ozet }: { ozet: NonNullable<FiyatTahmini["tazelikOzeti"]> }) {
  const yas = ozet.ortalamaYasGun;
  const renk =
    yas <= 30 ? "text-emerald-600" : yas <= 60 ? "text-amber-600" : "text-slate-400";
  const ikon = yas <= 30 ? "🟢" : yas <= 60 ? "🟡" : "⚪";

  // Detay metni: "3 son 30g · 5 son 90g"
  const detay: string[] = [];
  if (ozet.son30Gun > 0) detay.push(`${ozet.son30Gun} son 30g`);
  if (ozet.son90Gun > ozet.son30Gun) detay.push(`${ozet.son90Gun - ozet.son30Gun} son 90g`);
  const eskirek = ozet.tazeAdet - ozet.son90Gun;
  if (eskirek > 0) detay.push(`${eskirek} eskirek`);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-3xs">
      <span className={`flex items-center gap-1 font-medium ${renk}`}>
        <span>{ikon}</span>
        Tazelik: ~{yas} gün ortalama
      </span>
      {detay.length > 0 && (
        <span className="text-slate-400 tabular-nums">{detay.join(" · ")}</span>
      )}
      {ozet.stalAdet > 0 && (
        <span
          className="text-slate-400 italic"
          title={`${ozet.stalAdet} ilan 180+ gün eski olduğu için havuz dışı`}
        >
          {ozet.stalAdet} stale atıldı
        </span>
      )}
    </div>
  );
}

/**
 * e-Plan KPI hücresi — TAKS/Emsal/MaksKat/Nizam gibi sayısal göstergeler.
 * Tooltip ile uzun açıklama. Compact 4-column grid içinde kullanılır.
 */
function ImarKpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div
      className="rounded bg-white/80 px-1.5 py-1 text-center"
      title={hint}
    >
      <div className="text-[8px] uppercase tracking-wider text-amber-700/70 font-semibold leading-none mb-0.5">
        {label}
      </div>
      <div className="text-[11px] font-bold tabular-nums text-amber-900 leading-none">
        {value}
      </div>
    </div>
  );
}

/**
 * Yapı nizamını kısa formata çevir — UI'da yer az.
 * "Ayrık Nizam" → "Ayrık", "Bitişik Nizam" → "Bitişik", "Blok" → "Blok"
 */
function kisaltNizam(nizam: string): string {
  const t = nizam.toLocaleLowerCase("tr");
  if (/ayrık|ayrik/.test(t)) return "Ayrık";
  if (/bitişik|bitisik/.test(t)) return "Bitişik";
  if (/ikiz/.test(t)) return "İkiz";
  if (/blok/.test(t)) return "Blok";
  if (/serbest/.test(t)) return "Serbest";
  // Fallback: ilk kelimenin ilk 7 harfi
  return nizam.split(/\s+/)[0]?.slice(0, 7) ?? nizam.slice(0, 7);
}

function guvenStyle(guven: FiyatTahmini["guven"]) {
  if (guven === "yuksek")
    return {
      guvenIcon: "★★★",
      guvenLabel: "yüksek güven",
      guvenClass: "text-accent-success",
    };
  if (guven === "orta")
    return {
      guvenIcon: "★★",
      guvenLabel: "orta güven",
      guvenClass: "text-accent-warning",
    };
  return {
    guvenIcon: "★",
    guvenLabel: "düşük güven",
    guvenClass: "text-slate-400",
  };
}
