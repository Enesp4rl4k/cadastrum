/**
 * useFiyatTahmin — FiyatTahminKarti iş logic'i hook'a çıkarıldı.
 *
 * Sorumluluklar:
 *   - Heuristik fiyat tahmini (fiyatTahminEt)
 *   - AI tahmin (Pro otomatik / free manuel)
 *   - AI sanity check (cross-validation)
 *   - Triangulation (70% statistical + 30% AI)
 *   - Milli Emlak cross-validation
 *   - Güven + cold-start türetme
 *
 * Component (FiyatTahminKarti.tsx) sadece render'dan sorumlu.
 */

import { useEffect, useState } from "react";
import {
  type FiyatTahmini,
  fiyatTahminEt,
} from "../lib/fiyat-tahmin";
import {
  type AiFiyatSonucu,
  aiTahmin,
  aiDurumGetir,
  type AiDurum,
  aiSanityCheck,
  type AiSanityCheckSonuc,
} from "../lib/ai-fiyat";
import { useAyarlar } from "../lib/ayarlar";
import { useLisans } from "../lib/lisans";
import type { Parsel } from "../types/tkgm";
import type { CevreAnalizi } from "../lib/osm";
import type { EgimAnalizi } from "../lib/elevation";
import type { EPlanImarVerisi } from "../lib/eplan";
import type { TucbsCdpSonuc } from "../lib/tucbs";
import type { MilliEmlakOzet } from "../lib/milli-emlak";
import type { HeyelanVerisi } from "../lib/heyelan";
import type { TaskinKoordSonuc } from "../lib/taskin-koord";

export interface FiyatTahminHookGiris {
  parsel: Parsel;
  cevre: CevreAnalizi | null;
  egim: EgimAnalizi | null;
  ePlan: EPlanImarVerisi | null;
  tucbs?: TucbsCdpSonuc | null;
  imarSkipEdildi: boolean;
  heyelan?: HeyelanVerisi | null;
  taskinKoord?: TaskinKoordSonuc | null;
  milliEmlakOzet?: MilliEmlakOzet | null;
  onTahminHesaplandi?: (tahmin: FiyatTahmini | null) => void;
}

export interface FiyatTahminHookCikis {
  /** Heuristik fiyat tahmini (hesaplanmamışsa null) */
  tahmin: FiyatTahmini | null;
  /** AI tahmin sonucu */
  aiSonuc: AiFiyatSonucu | null;
  /** AI yükleniyor mu */
  aiYukleniyor: boolean;
  /** AI hata mesajı */
  aiHata: string | null;
  /** AI sağlayıcı durum + kota bilgisi */
  aiDurum: AiDurum | null;
  /** AI sanity check (cross-validation) */
  sanityCheck: AiSanityCheckSonuc | null;
  /** Triangulation: AI + heuristik kombine (70/30) — AI makul aralıktaysa */
  kombineBeklenenPerM2: number | null;
  kombineBeklenenToplam: number | null;
  /** Düşük güven flag'i (guvenSkoru < 40) */
  dusukGuven: boolean;
  /** Cold-start: live emsal verisi yok, statik baseline kullanılıyor */
  coldStart: boolean;
  coldStartKaynak: string;
  coldStartHataPayi: string;
  /** Milli Emlak cross-validation */
  meOrtFiyat: number | null;
  meSapmaYuzde: number | null;
  meUyariGoster: boolean;
  /** Aktif AI sağlayıcı adı */
  aktifSaglayici: string;
  /** Pro AI yetkisi */
  proAi: boolean;
  /** Ayarlar — AI sağlayıcı seçimi vs. */
  ayarlar: import("./ayarlar").Ayarlar;
  /** Manuel AI tetikleyici (free kullanıcı için) */
  aiCalistir: () => Promise<void>;
}

const COLD_START_KAYNAK_ETIKET: Record<string, string> = {
  "mahalle-baseline":    "mahalle istatistik tablosu",
  "ilce-semt-baseline":  "semt ortalaması",
  "ilce-baseline":       "ilçe ortalaması",
  "il-baseline":         "il ortalaması (kaba)",
  "fallback":            "genel Türkiye ortalaması",
};

export function useFiyatTahmin({
  parsel,
  cevre,
  egim,
  ePlan,
  tucbs,
  imarSkipEdildi,
  heyelan,
  taskinKoord,
  milliEmlakOzet,
  onTahminHesaplandi,
}: FiyatTahminHookGiris): FiyatTahminHookCikis {
  const [tahmin, setTahmin] = useState<FiyatTahmini | null>(null);
  const [aiSonuc, setAiSonuc] = useState<AiFiyatSonucu | null>(null);
  const [aiYukleniyor, setAiYukleniyor] = useState(false);
  const [aiHata, setAiHata] = useState<string | null>(null);
  const [aiDurum, setAiDurumState] = useState<AiDurum | null>(null);
  const [sanityCheck, setSanityCheck] = useState<AiSanityCheckSonuc | null>(null);

  const [ayarlar] = useAyarlar();
  const lisans = useLisans();

  const proAi = lisans.can("ai-fiyat");
  const aktifSaglayici = ayarlar.aiSaglayici !== "yok"
    ? ayarlar.aiSaglayici
    : "cadastrum-proxy" as const;

  const imarVar = !!ePlan && !!(ePlan.kullanimKarari || ePlan.taks || ePlan.emsal);
  const hesaplanabilir = imarVar || imarSkipEdildi;

  // ── Heuristik fiyat tahmini ────────────────────────────────────────────────
  useEffect(() => {
    let iptal = false;
    if (!hesaplanabilir) {
      setTahmin(null);
      onTahminHesaplandi?.(null);
      setAiSonuc(null);
      setAiHata(null);
      return;
    }
    fiyatTahminEt(parsel, cevre, egim, ePlan, heyelan ?? null, taskinKoord ?? null).then((t) => {
      if (!iptal) {
        setTahmin(t);
        onTahminHesaplandi?.(t);
      }
    });
    setAiSonuc(null);
    setAiHata(null);
    return () => { iptal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsel, cevre, egim, ePlan, tucbs, heyelan, taskinKoord, hesaplanabilir]);

  // ── AI tahmin ──────────────────────────────────────────────────────────────
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

  // Pro: tahmin geldiğinde AI'yı otomatik tetikle
  useEffect(() => {
    if (!tahmin || !proAi) return;
    if (aiSonuc || aiYukleniyor || aiHata) return;
    void aiCalistir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tahmin, proAi]);

  // AI sağlayıcı kota bilgisi
  useEffect(() => {
    if (aktifSaglayici !== "cadastrum-proxy") return;
    void aiDurumGetir().then(setAiDurumState);
  }, [aktifSaglayici, aiSonuc]);

  // ── AI sanity check ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tahmin) { setSanityCheck(null); return; }
    void aiSanityCheck(
      { ilAd: parsel.ilAd, ilceAd: parsel.ilceAd, nitelik: parsel.nitelik, alan: parsel.alan },
      tahmin.beklenenPerM2,
      { milliEmlakOrtPerM2: milliEmlakOzet?.ort_fiyat_per_m2 ?? null },
      { saglayici: ayarlar.aiSaglayici !== "yok" ? ayarlar.aiSaglayici : undefined },
    ).then((r) => setSanityCheck(r ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tahmin?.beklenenPerM2, milliEmlakOzet?.ort_fiyat_per_m2]);

  // ── Triangulation ──────────────────────────────────────────────────────────
  const aiSapma = aiSonuc && tahmin
    ? Math.abs((aiSonuc.beklenenPerM2 - tahmin.beklenenPerM2) / tahmin.beklenenPerM2)
    : null;
  const aiKombineGecerli = aiSapma != null && aiSapma <= 0.30;
  const kombineBeklenenPerM2 = aiKombineGecerli && aiSonuc && tahmin
    ? Math.round(0.7 * tahmin.beklenenPerM2 + 0.3 * aiSonuc.beklenenPerM2)
    : null;
  const kombineBeklenenToplam = kombineBeklenenPerM2
    ? Math.round(kombineBeklenenPerM2 * parsel.alan)
    : null;

  // ── Türetilmiş değerler ────────────────────────────────────────────────────
  const dusukGuven = tahmin != null && tahmin.guvenSkoru < 40;

  const coldStart = tahmin != null
    && tahmin.baselineKaynak !== "ilanGozlem-mahalle"
    && tahmin.baselineKaynak !== "ilanGozlem-ilce"
    && tahmin.baselineKaynak !== "spatial-radius";

  const coldStartKaynak = tahmin
    ? (COLD_START_KAYNAK_ETIKET[tahmin.baselineKaynak] ?? tahmin.baselineKaynak)
    : "";

  const coldStartHataPayi = !tahmin ? "" :
    tahmin.baselineKaynak === "il-baseline" || tahmin.baselineKaynak === "fallback"
      ? "%50–80"
      : tahmin.baselineKaynak === "ilce-baseline"
      ? "%35–60"
      : "%25–50";

  const meOrtFiyat = milliEmlakOzet?.ort_fiyat_per_m2 ?? null;
  const meSapmaYuzde = meOrtFiyat && tahmin
    ? Math.round(((tahmin.beklenenPerM2 - meOrtFiyat) / meOrtFiyat) * 100)
    : null;
  const meUyariGoster = meSapmaYuzde != null && Math.abs(meSapmaYuzde) > 30;

  return {
    tahmin,
    aiSonuc,
    aiYukleniyor,
    aiHata,
    aiDurum,
    sanityCheck,
    kombineBeklenenPerM2,
    kombineBeklenenToplam,
    dusukGuven,
    coldStart,
    coldStartKaynak,
    coldStartHataPayi,
    meOrtFiyat,
    meSapmaYuzde,
    meUyariGoster,
    aktifSaglayici,
    proAi,
    ayarlar,
    aiCalistir,
  };
}
