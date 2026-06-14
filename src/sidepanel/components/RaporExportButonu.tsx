import { useState } from "react";
import { FileDown as DownloadIcon, Loader2 as LoaderIcon } from "lucide-react";
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

/**
 * Parsel + analiz verisini chrome.storage.local'a kaydedip yeni tab'da
 * rapor sayfasını açar. Rapor sayfası kullanıcıyı print dialog'una yönlendirir.
 */
export function RaporExportButonu({ parsel, cevre, egim, ePlan }: Props) {
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [ayarlar] = useAyarlar();
  const lisans = useLisans();

  // Pro tier'da AI özeti dahil et — Cadastrum proxy varsayılan
  const proAi = lisans.can("ai-fiyat");
  const aktifSaglayici = proAi && ayarlar.aiSaglayici === "yok"
    ? "cadastrum-proxy" as const
    : ayarlar.aiSaglayici;

  async function raporuAc() {
    setYukleniyor(true);
    setHata(null);
    try {
      // Fiyat tahmini ve riskleri rapor için yeniden compute et (canlı analiz garantisi)
      const fiyat = await fiyatTahminEt(parsel, cevre, egim, ePlan);
      const riskler = riskleriTara({ parsel, ePlan });

      // Pro+: TKGM yıllık analizi 5 tipi paralel çek (önceki yıl)
      let tkgmAnaliz: import("../../lib/rapor-data").RaporVerisi["tkgmAnaliz"] = null;
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
          // 5 yıllık trend (alım-satım yoğunluğu)
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

      // Pro: AI tahmini de paralel al (sessiz başarısız ol — rapor üretiminde block etme)
      let aiSonuc: AiFiyatSonucu | null = null;
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

      const veri: RaporVerisi = {
        schema: 1,
        uretildiAt: Date.now(),
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

      // Yeni tab'da rapor sayfasını aç
      const raporUrl = chrome.runtime.getURL("src/rapor/index.html");
      await chrome.tabs.create({ url: raporUrl });
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={raporuAc}
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
        Yeni sekmede açılır → tarayıcıdan "PDF olarak kaydet" yapın
      </p>
    </div>
  );
}
