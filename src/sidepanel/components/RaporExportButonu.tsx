import { useState } from "react";
import { FileDown as DownloadIcon, Loader2 as LoaderIcon, Lock as LockIcon, Printer as PrintIcon } from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import type { CevreAnalizi } from "../../lib/osm";
import type { EgimAnalizi } from "../../lib/elevation";
import type { EPlanImarVerisi } from "../../lib/eplan";
import { fiyatTahminEt } from "../../lib/fiyat-tahmin";
import { riskleriTara } from "../../lib/risk-uyarilari";
import { raporVerisiniSakla, type RaporVerisi } from "../../lib/rapor-data";
import { aiTahmin, type AiFiyatSonucu } from "../../lib/ai-fiyat";
import { useAyarlar } from "../../lib/ayarlar";
import { useLisans } from "../../lib/lisans";
import {
  type AnalizTip,
  ANALIZ_TIPI_ETIKETLERI,
  analizOzetCikar,
  getYilSerisi,
  tkgmAnalizGetir,
} from "../../lib/tkgm-analiz";

interface Props {
  parsel: Parsel;
  cevre: CevreAnalizi | null;
  egim: EgimAnalizi | null;
  ePlan: EPlanImarVerisi | null;
}

const SITE_URL = "https://cadastrum.com.tr";

/**
 * Parsel + analiz verisini chrome.storage.local'a kaydedip yeni tab'da
 * rapor sayfasını açar. Rapor sayfası kullanıcıyı print dialog'una yönlendirir.
 *
 * Free: HTML özet / yazdır (fiyat + risk; AI/TKGM yok).
 * Pro: PDF rapor + AI / TKGM zenginleştirme.
 */
export function RaporExportButonu({ parsel, cevre, egim, ePlan }: Props) {
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [ayarlar] = useAyarlar();
  const lisans = useLisans();

  const pdfRaporAcik = lisans.can("pdf-rapor");

  const proAi = lisans.can("ai-fiyat");
  const aktifSaglayici = proAi && ayarlar.aiSaglayici === "yok"
    ? "cadastrum-proxy" as const
    : ayarlar.aiSaglayici;

  async function raporuAc(opts: { zengin: boolean }) {
    setYukleniyor(true);
    setHata(null);
    try {
      const fiyat = await fiyatTahminEt(parsel, cevre, egim, ePlan);
      const riskler = riskleriTara({ parsel, ePlan });

      let tkgmAnaliz: RaporVerisi["tkgmAnaliz"] = null;
      let aiSonuc: AiFiyatSonucu | null = null;

      if (opts.zengin) {
        const isProPlus = lisans.tier === "kurumsal-standart" || lisans.tier === "kurumsal-pro";
        if (isProPlus && parsel.ilceKodu != null && parsel.ilceAd) {
          try {
            const yil = new Date().getFullYear() - 1;
            const tipler = await Promise.all(
              ([1, 2, 3, 4, 5] as AnalizTip[]).map(async (tip) => {
                try {
                  const noktalar = await tkgmAnalizGetir({ analizTip: tip, yil, ilceKodu: parsel.ilceKodu! });
                  const ozet = analizOzetCikar(noktalar);
                  return {
                    tip: tip as number,
                    etiket: ANALIZ_TIPI_ETIKETLERI[tip],
                    toplamIslem: ozet.toplamIslem,
                    toplamParsel: ozet.toplamNokta,
                  };
                } catch {
                  return { tip: tip as number, etiket: ANALIZ_TIPI_ETIKETLERI[tip], toplamIslem: 0, toplamParsel: 0 };
                }
              }),
            );
            const anaSatis = tipler.find(t => t.tip === 2)?.toplamIslem ?? 0;
            const ipotekli = tipler.find(t => t.tip === 3)?.toplamIslem ?? 0;
            const ipotekOrani = anaSatis > 0 ? (ipotekli / anaSatis) * 100 : 0;
            const ye = yil;
            const yb = ye - 4;
            let trend: { yil: number; sayi: number }[] = [];
            try {
              const seri = await getYilSerisi(parsel.ilceKodu, 1, yb, ye);
              trend = seri.map(s => ({ yil: s.yil, sayi: s.toplamIslem }));
            } catch { /* ignore */ }
            tkgmAnaliz = { yil, ilceAd: parsel.ilceAd, tipler, ipotekOrani, trend };
          } catch (e) {
            console.warn("[rapor] TKGM analiz başarısız:", e);
          }
        }

        if (proAi && fiyat && aktifSaglayici !== "yok") {
          try {
            aiSonuc = await aiTahmin(parsel, cevre, egim, fiyat, {
              saglayici: aktifSaglayici,
              ollamaModel: ayarlar.aiOllamaModel,
              ollamaUrl: ayarlar.aiOllamaUrl,
              geminiApiKey: ayarlar.aiGeminiApiKey,
            });
          } catch (e) {
            console.warn("[rapor] AI tahmini başarısız, atlanıyor:", e);
          }
        }
      }

      const veri: RaporVerisi = {
        schema: 1,
        uretildiAt: Date.now(),
        baslik: opts.zengin ? undefined : "Cadastrum özet rapor (Free)",
        parsel,
        cevre,
        egim,
        ePlan: ePlan ?? null,
        fiyat,
        riskler,
        aiSonuc,
        tkgmAnaliz,
        tier: lisans.tier === "bireysel-pro" ? "pro"
          : lisans.tier === "kurumsal-standart" ? "pro_plus"
          : lisans.tier === "kurumsal-pro" ? "kurumsal"
          : "free",
      };

      await raporVerisiniSakla(veri);
      const raporUrl = chrome.runtime.getURL("src/rapor/index.html");
      await chrome.tabs.create({ url: raporUrl });
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally {
      setYukleniyor(false);
    }
  }

  if (!pdfRaporAcik) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => void raporuAc({ zengin: false })}
          disabled={yukleniyor}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-imperial/20 bg-white px-3 py-2 text-2xs font-semibold text-imperial-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-champagne-300"
          title="Yeni sekmede yazdırılabilir özet açar (Free)"
        >
          {yukleniyor ? (
            <>
              <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
              Özet hazırlanıyor…
            </>
          ) : (
            <>
              <PrintIcon className="h-3.5 w-3.5" />
              Özet raporu yazdır
            </>
          )}
        </button>
        <button
          type="button"
          disabled
          className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-2xs font-semibold text-slate-400"
          title="PDF rapor Pro plan gerektirir"
        >
          <LockIcon className="h-3.5 w-3.5" />
          PDF Rapor (Pro)
        </button>
        <button
          type="button"
          onClick={() => {
            if (typeof chrome !== "undefined" && chrome?.tabs) {
              chrome.tabs.create({ url: `${SITE_URL}/fiyat?plan=pro&source=extension-rapor` });
            }
          }}
          className="w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-2xs font-medium text-amber-800 hover:bg-amber-100 transition"
        >
          Pro'ya geç — zengin PDF + AI
        </button>
        {hata && (
          <div className="rounded-md bg-red-50 px-2 py-1 text-3xs text-red-700">{hata}</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => void raporuAc({ zengin: true })}
        disabled={yukleniyor}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-imperial/20 bg-imperial px-3 py-2 text-2xs font-semibold text-white shadow-sm transition-colors hover:bg-imperial-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-imperial-200/30"
        title="Yeni sekmede yazdırılabilir rapor açar; PDF olarak kaydedebilirsiniz"
      >
        {yukleniyor ? (
          <>
            <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
            Rapor hazırlanıyor…
          </>
        ) : (
          <>
            <DownloadIcon className="h-3.5 w-3.5" />
            PDF Rapor İndir
          </>
        )}
      </button>
      {hata && (
        <div className="rounded-md bg-red-50 px-2 py-1 text-3xs text-red-700">{hata}</div>
      )}
      <p className="text-3xs italic text-slate-500">
        Yeni sekmede açılır → tarayıcıdan &quot;PDF olarak kaydet&quot; yapın
      </p>
    </div>
  );
}
