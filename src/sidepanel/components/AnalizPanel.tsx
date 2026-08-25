import { lazy, Suspense, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { normalizeYerAdi } from "../../lib/tkgm-api";
import { RiskKarti } from "./RiskKarti";
import { AnalizIlerlemeBar } from "./AnalizIlerlemeBar";
import { Section, KV, Poi, Bilesenler } from "./AnalizAltComponents";
import {
  Truck as TruckIcon,
  Mountain as MountainIcon,
  Footprints as FootprintsIcon,
  Zap as ZapIcon,
  BarChart3 as BarChart3Icon,
  MapPin as MapPinIcon,
  Link2 as Link2Icon,
  CheckCircle2 as CheckCircle2Icon,
  FolderPlus as FolderPlusIcon,
} from "lucide-react";
import { analizet } from "../../lib/analiz";
import { adresGetir, cevreAnaliziGetir, type CevreAnalizi } from "../../lib/osm";
import { egimAnaliziGetir, type EgimAnalizi } from "../../lib/elevation";
import { tumSkorlariHesapla } from "../../lib/skor";
import type { Parsel } from "../../types/tkgm";
import { SkorBadge } from "./SkorBadge";
import { Fizibilite } from "./Fizibilite";
import { BolgeSkorKarti } from "./BolgeSkorKarti";
import { BelediyeImar } from "./BelediyeImar";
import { FiyatTahminKarti } from "./FiyatTahminKarti";
import { RiskUyariKarti } from "./RiskUyariKarti";
import { RaporExportButonu } from "./RaporExportButonu";
import { ManuelImarKarti } from "./ManuelImarKarti";
import { KomsuParselKarti } from "./KomsuParselKarti";
import { LikiditeKarti } from "./LikiditeKarti";
import { ManuelEmsalKarti } from "./ManuelEmsalKarti";
import { FiyatNetlestirKarti } from "./FiyatNetlestirKarti";
import { DetayGrup } from "./DetayGrup";
import { imarBirlestir } from "../../lib/manuel-veri";
import { depremRiskiGetir } from "../../lib/data/deprem-zonlari";
import { imarTahminEt } from "../../lib/imar-tahmin";
import { useManuelVeri } from "../../lib/use-manuel-veri";
import { EmsalMukayeseKarti } from "./EmsalMukayeseKarti";
import { EmsalRadiusSlider } from "./EmsalRadiusSlider";
import { BildirimKurali } from "./BildirimKurali";
import { DogalVeriKarti } from "./DogalVeriKarti";
import { AltyapiMesafeKarti } from "./AltyapiMesafeKarti";
import { MilliEmlakKarti } from "./MilliEmlakKarti";
import {
  katmanlarOlustur,
  type KatmanBilgi,
  type KatmanDurum,
} from "../../lib/analiz-orkestrator";
import { BagimsizBolumKarti } from "./BagimsizBolumKarti";
import { PaywallKilit } from "./PaywallKilit";
import { useLisans } from "../../lib/lisans";
import { useAyarlar } from "../../lib/ayarlar";
import { EPLAN_URL } from "../../lib/eplan";
import { useEPlanVerisi } from "../../lib/use-eplan";
import { useTucbsCdp } from "../../lib/use-tucbs";
import { CdpKarti } from "./CdpKarti";
import { useKarsilastirma, parselKarsilastirmaKey, MAX_PORTFOY } from "../../lib/karsilastirma-store";
import { PortfoyPanel } from "./PortfoyPanel";
import { AccordionSection } from "./AccordionSection";
import { MekansalKarsilastirmaKarti } from "./MekansalKarsilastirmaKarti";
import { EndeksGrafigiKarti } from "./EndeksGrafigiKarti";

// ── Pro / nadir componentler — lazy loaded (bundle boyutu optimizasyonu) ──────
const TkgmAnaliz        = lazy(() => import("./TkgmAnaliz").then(m => ({ default: m.TkgmAnaliz })));
const TkgmKarsilastirma = lazy(() => import("./TkgmKarsilastirma").then(m => ({ default: m.TkgmKarsilastirma })));
const YatirimSkoruKarti = lazy(() => import("./YatirimSkoruKarti").then(m => ({ default: m.YatirimSkoruKarti })));
const GunesEnerjisiKarti = lazy(() => import("./GunesEnerjisiKarti").then(m => ({ default: m.GunesEnerjisiKarti })));
const TarimAnalizKarti  = lazy(() => import("./TarimAnalizKarti").then(m => ({ default: m.TarimAnalizKarti })));
const ScorecardKarti    = lazy(() => import("./ScorecardKarti").then(m => ({ default: m.ScorecardKarti })));
const HavaFotoTimeline  = lazy(() => import("./HavaFotoTimeline").then(m => ({ default: m.HavaFotoTimeline })));
const UyduAnaliz        = lazy(() => import("./UyduAnaliz").then(m => ({ default: m.UyduAnaliz })));
const UyduAnalizKarti   = lazy(() => import("./UyduAnalizKarti").then(m => ({ default: m.UyduAnalizKarti })));

/** Hafif lazy fallback — büyük componentlerin yüklenmesi sırasında */
function LazyFallback() {
  return (
    <div className="flex items-center justify-center py-4 text-xs text-slate-400">
      <div className="animate-pulse">Yükleniyor…</div>
    </div>
  );
}

// Harita POI tipi — drawYakinPoiler ile uyumlu
type HaritaPoiler = { tip: string; ad: string; lat: number; lng: number; mesafeM: number; ikon?: string }[];

interface Props {
  parsel: Parsel;
  /** Cevre analizi tamamlanınca harita üstünde POI'leri çizmek için MapView'e pas et */
  onYakinPoiler?: (poiler: import("../../lib/osm").YakinNoktaMesafesi[] | null) => void;
  /** Altyapı statik POI'ler (OSB/Havalimanı/Liman) — harita çizgisi için MapView'e pas et */
  onAltyapiPoiler?: (poiler: HaritaPoiler | null) => void;
}

export function AnalizPanel({ parsel, onYakinPoiler, onAltyapiPoiler }: Props) {
  const analiz = analizet(parsel);
  const [ayarlar] = useAyarlar();
  const acikModuller = ayarlar.acikModuller;
  const lisansBilgi = useLisans();
  const [cevre, setCevre] = useState<CevreAnalizi | null>(null);
  const [egim, setEgim] = useState<EgimAnalizi | null>(null);
  // Doğal risk verileri — DogalVeriKarti callback'leriyle güncellenir, fiyat motoruna iletilir
  const [heyelanVerisi, setHeyelanVerisi] = useState<import("../../lib/heyelan").HeyelanVerisi | null>(null);
  const [taskinKoordVerisi, setTaskinKoordVerisi] = useState<import("../../lib/taskin-koord").TaskinKoordSonuc | null>(null);
  // Fiyat tahmini — FiyatTahminKarti tarafından hesaplanır, YatirimSkoruKarti'na geçirilir
  const [hesaplananFiyat, setHesaplananFiyat] = useState<import("../../lib/fiyat-tahmin").FiyatTahmini | null>(null);
  const [adres, setAdres] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fizibiliteAcik, setFizibiliteAcik] = useState(false);
  const [yakinlarHaritada, setYakinlarHaritada] = useState(true);
  const [imarDetayAcik, setImarDetayAcik] = useState(false);
  /** Kullanıcı "Bilmiyorum, devam et" dediyse fiyat TKGM nitelik fallback'iyle hesaplanır. Parsel başına sıfırlanır. */
  const [imarSkipEdildi, setImarSkipEdildi] = useState(false);

  // Orkestrasyon state — tüm katmanların yüklenme durumu
  const [katmanlar, setKatmanlar] = useState<KatmanBilgi[]>(() => katmanlarOlustur({
    tkgm: "tamam", // Parsel zaten geldi
  }));
  const analizBaslangicRef = useRef<number>(Date.now());
  const [gecenMs, setGecenMs] = useState(0);

  // Katman durumunu güncelle
  const katmanGuncelle = useCallback((id: string, durum: KatmanDurum) => {
    setKatmanlar((prev) =>
      prev.map((k) =>
        k.id === id
          ? { ...k, durum, sure: durum === "tamam" || durum === "hata"
              ? Date.now() - analizBaslangicRef.current
              : k.sure }
          : k
      )
    );
  }, []);
  const skorlar = tumSkorlariHesapla(analiz, cevre, egim);
  const autoAnalizKeyRef = useRef<string | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);
  const { veri: ePlanVerisi, loading: ePlanLoading } = useEPlanVerisi(parsel);
  const { veri: tucbsVerisi, loading: tucbsLoading } = useTucbsCdp(parsel);
  const { veri: manuelVeri, tetikle: manuelTetikle } = useManuelVeri(parsel);
  // Manuel + ePlan birleşik imar — manuel öncelikli alan bazında override eder
  const birlesikImar = imarBirlestir(ePlanVerisi, manuelVeri.imar);

  // cevreyiAnalizEt — useCallback burada (useEffect'lerden önce) tanımlanmalı
  const cevreyiAnalizEt = useCallback(async () => {
    // Önceki çağrı varsa iptal et
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
    }
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    setLoading(true);
    setError(null);

    // Orkestrasyon: OSM + eğim yükleniyor
    katmanGuncelle("osm", "yukleniyor");
    katmanGuncelle("egim", "yukleniyor");

    try {
      const ring = parsel.koordinatlar;
      const k1 = ring[0] ?? parsel.merkezNokta;
      const k2 = ring[Math.floor(ring.length / 4)] ?? parsel.merkezNokta;
      const k3 = ring[Math.floor(ring.length / 2)] ?? parsel.merkezNokta;
      const k4 = ring[Math.floor((3 * ring.length) / 4)] ?? parsel.merkezNokta;

      const [cevreRes, egimRes, adresRes] = await Promise.allSettled([
        cevreAnaliziGetir(parsel.merkezNokta.lat, parsel.merkezNokta.lng, ctrl.signal),
        egimAnaliziGetir(parsel.merkezNokta, k1, k2, k3, k4, ctrl.signal),
        adresGetir(parsel.merkezNokta.lat, parsel.merkezNokta.lng, ctrl.signal),
      ]);

      const hatalar: string[] = [];
      if (cevreRes.status === "fulfilled") {
        setCevre(cevreRes.value);
        katmanGuncelle("osm", "tamam");
      } else {
        katmanGuncelle("osm", "hata");
        hatalar.push(
          `Çevre (Overpass): ${cevreRes.reason instanceof Error ? cevreRes.reason.message : String(cevreRes.reason)}`,
        );
      }
      if (egimRes.status === "fulfilled") {
        setEgim(egimRes.value);
        katmanGuncelle("egim", "tamam");
      } else {
        katmanGuncelle("egim", "hata");
        hatalar.push(
          `Eğim (Open-Meteo): ${egimRes.reason instanceof Error ? egimRes.reason.message : String(egimRes.reason)}`,
        );
      }
      if (adresRes.status === "fulfilled") setAdres(adresRes.value);

      // Tüm servisler başarısızsa hata göster; bir tanesi başarılıysa partial göster
      if (cevreRes.status === "rejected" && egimRes.status === "rejected") {
        setError(
          `Hiçbir servis yanıt vermedi:\n${hatalar.join("\n")}\n\nİpucu: birkaç dakika bekle (rate limit), tekrar dene.`,
        );
      } else if (hatalar.length > 0) {
        setError(`Kısmi hata (diğer veriler geldi):\n${hatalar.join("\n")}`);
      }
    } finally {
      // Sadece bu ctrl hâlâ geçerliyse loading'i kapat
      if (abortCtrlRef.current === ctrl) {
        setLoading(false);
        abortCtrlRef.current = null;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsel.adaNo, parsel.parselNo, parsel.mahalleKodu, parsel.merkezNokta, parsel.koordinatlar, katmanGuncelle]);

  // Yeni parsel gelince eski enrichment'ı sıfırla ve devam eden async işlemi iptal et
  useEffect(() => {
    // Önceki parsel için devam eden Overpass/Open-Meteo/Nominatim isteklerini iptal et
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }
    setCevre(null);
    setEgim(null);
    setAdres(null);
    setError(null);
    setHesaplananFiyat(null);
    // Orkestrasyon sıfırla
    analizBaslangicRef.current = Date.now();
    setGecenMs(0);
    setKatmanlar(katmanlarOlustur({ tkgm: "tamam" }));
    setImarSkipEdildi(false);
    setImarDetayAcik(false);
    autoAnalizKeyRef.current = null;
    onYakinPoiler?.(null);
  }, [parsel.adaNo, parsel.parselNo, parsel.mahalleKodu]);

  useEffect(() => {
    if (loading) return;
    if (cevre && egim) return;
    const analizKey = `${parsel.mahalleKodu ?? "x"}:${parsel.adaNo}:${parsel.parselNo}`;
    if (autoAnalizKeyRef.current === analizKey) return;
    autoAnalizKeyRef.current = analizKey;
    void cevreyiAnalizEt();
  }, [parsel.adaNo, parsel.parselNo, parsel.mahalleKodu, cevre, egim, loading, cevreyiAnalizEt]);

  // Cevre veya toggle değişince haritaya bildirim
  useEffect(() => {
    if (yakinlarHaritada && cevre) {
      onYakinPoiler?.(cevre.enYakinlar.filter((p) => p.lat !== 0));
    } else {
      onYakinPoiler?.(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cevre, yakinlarHaritada]);

  // e-Plan katman durumu
  useEffect(() => {
    if (ePlanLoading) {
      katmanGuncelle("eplan", "yukleniyor");
    } else if (ePlanVerisi) {
      katmanGuncelle("eplan", "tamam");
    } else {
      katmanGuncelle("eplan", "hata");
    }
  }, [ePlanLoading, ePlanVerisi, katmanGuncelle]);

  // Fiyat tahmini katman durumu — hesaplananFiyat set edilince tamamlandı
  useEffect(() => {
    if (hesaplananFiyat) {
      katmanGuncelle("fiyat", "tamam");
    }
  }, [hesaplananFiyat, katmanGuncelle]);

  // Deprem/risk katmanları — cevre geldiğinde "tamam" (DogalVeriKarti kendi yönetiyor ama
  // orkestrator için yeterli sinyal: parsel koordinatları varsa "yükleniyor" say)
  useEffect(() => {
    if (parsel.merkezNokta.lat && parsel.merkezNokta.lng) {
      katmanGuncelle("deprem", "yukleniyor");
      katmanGuncelle("taskin", "yukleniyor");
      katmanGuncelle("heyelan", "yukleniyor");
      katmanGuncelle("milli-emlak", "yukleniyor");
      // 5 saniye sonra fallback tamam — bu katmanlar kendi içlerinde yönetiliyor
      const t = setTimeout(() => {
        setKatmanlar((prev) =>
          prev.map((k) =>
            ["deprem", "taskin", "heyelan", "milli-emlak"].includes(k.id) && k.durum === "yukleniyor"
              ? { ...k, durum: "tamam" as const }
              : k
          )
        );
      }, 5000);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsel.adaNo, parsel.parselNo, parsel.mahalleKodu]);

  // gecenMs timer — analiz süresini göster, tüm katmanlar tamamlanınca durdur
  useEffect(() => {
    const tumTamamlandi = katmanlar.every(
      (k) => k.durum === "tamam" || k.durum === "hata",
    );
    if (tumTamamlandi) {
      setGecenMs(Date.now() - analizBaslangicRef.current);
      return;
    }
    const interval = setInterval(() => {
      setGecenMs(Date.now() - analizBaslangicRef.current);
    }, 500);
    return () => clearInterval(interval);
  }, [katmanlar]);

  return (
    <div className="space-y-2.5 border-t border-slate-200 pt-2.5">
      {/* ── ÖNCELİKLİ: Fiyat + Risk — scroll gerekmeden görünsün ───────────── */}
      {acikModuller.includes("fiyat-tahmin") && (
        <FiyatTahminKarti
          parsel={parsel}
          cevre={cevre}
          egim={egim}
          ePlan={birlesikImar ?? ePlanVerisi}
          tucbs={tucbsVerisi}
          ePlanLoading={ePlanLoading}
          imarSkipEdildi={imarSkipEdildi}
          heyelan={heyelanVerisi}
          taskinKoord={taskinKoordVerisi}
          onImarKaydedildi={() => {
            manuelTetikle();
            setImarSkipEdildi(false);
          }}
          onImarSkip={() => setImarSkipEdildi(true)}
          onImarTekrarSor={() => setImarSkipEdildi(false)}
          onTahminHesaplandi={setHesaplananFiyat}
        />
      )}

      <RiskUyariKarti
        parsel={parsel}
        ePlan={birlesikImar ?? ePlanVerisi}
        tucbs={tucbsVerisi}
      />

      {/* Analiz orkestrasyon ilerleme çubuğu */}
      <AnalizIlerlemeBar
        katmanlar={katmanlar}
        gecenMs={gecenMs}
        gizleTamamlandiktan={3000}
      />
      <AccordionSection
        title="Konum & Çevre Analizi"
        badge={cevre
          ? `Lojistik ${skorlar.lojistik.toplam ?? "—"} · Erişim ${skorlar.erisim.toplam ?? "—"}`
          : loading ? "yükleniyor…" : "analiz bekleniyor"
        }
        badgeTone={cevre ? "info" : "muted"}
        defaultOpen={false}
        actions={
          (!cevre || !egim) ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void cevreyiAnalizEt(); }}
              disabled={loading}
              className="rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "…" : cevre || egim ? "Tamamla" : "Analiz Et"}
            </button>
          ) : undefined
        }
      >
        {/* Haritada göster toggle */}
        {cevre && cevre.elementSayisi > 0 && (
          <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-700 pb-1">
            <input
              type="checkbox"
              checked={yakinlarHaritada}
              onChange={(e) => setYakinlarHaritada(e.target.checked)}
              className="h-3 w-3 cursor-pointer accent-blue-600"
            />
            <Link2Icon className="h-3 w-3" />
            <span>Yakınları haritada göster</span>
          </label>
        )}

        {/* 4 ana skor */}
        <div className="grid grid-cols-2 gap-2">
          <SkorBadge
            ad="Lojistik"
            icon={<TruckIcon className="h-4 w-4" />}
            skor={skorlar.lojistik}
            loading={loading && !cevre}
            hata={!loading && !cevre && error ? "Veri alınamadı" : null}
            onRetry={() => void cevreyiAnalizEt()}
            bosAciklama="Bu bölgede yeterli veri tespit edilemedi"
          />
          <SkorBadge
            ad="Fiziksel"
            icon={<MountainIcon className="h-4 w-4" />}
            skor={skorlar.fiziksel}
            loading={loading && !egim}
            hata={!loading && !egim && error ? "Veri alınamadı" : null}
            onRetry={() => void cevreyiAnalizEt()}
            bosAciklama="Yükseklik/eğim verisi henüz çekilmedi"
          />
          <SkorBadge
            ad="Erişim"
            icon={<FootprintsIcon className="h-4 w-4" />}
            skor={skorlar.erisim}
            loading={loading && !cevre}
            hata={!loading && !cevre && error ? "Veri alınamadı" : null}
            onRetry={() => void cevreyiAnalizEt()}
            bosAciklama="Bu bölgede yeterli veri tespit edilemedi"
          />
          <SkorBadge
            ad="Altyapı"
            icon={<ZapIcon className="h-4 w-4" />}
            skor={skorlar.altyapi}
            loading={loading && !cevre}
            hata={!loading && !cevre && error ? "Veri alınamadı" : null}
            onRetry={() => void cevreyiAnalizEt()}
            bosAciklama="Bu bölgede yeterli veri tespit edilemedi"
          />
        </div>

        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-2 text-[11px] text-red-700">
            {error}
          </div>
        )}

        {/* Lokal analizler */}
        <Section title={`${analiz.nitelik.ikon} Nitelik & Konum`}>
        <p className="text-[11px]">{analiz.nitelik.not}</p>
        <p className="mt-1 text-[11px] text-tkgm-muted">{analiz.konum.not}</p>
      </Section>

      <Section title="📐 Boyut & Şekil">
        <KV k="Alan" v={analiz.boyut.alanLabel} />
        <KV k="Çevre" v={`${analiz.boyut.cevreM} m`} />
        <KV k="Boyutlar" v={`${analiz.boyut.enM} × ${analiz.boyut.boyM} m`} />
        <KV k="En/boy oranı" v={`${analiz.boyut.enBoyOrani} : 1`} />
        <KV k="Şekil" v={analiz.boyut.sekilNotu} />
      </Section>

      {/* Skorların açıklamaları */}
      {skorlar.lojistik.toplam != null && (
        <Section title="🚚 Lojistik detay">
          <p className="mb-1 text-[11px]">{skorlar.lojistik.aciklama}</p>
          <Bilesenler bilesenler={skorlar.lojistik.bilesenler} />
        </Section>
      )}
      {skorlar.fiziksel.toplam != null && egim && (
        <Section title="🏗️ Fiziksel detay">
          <p className="mb-1 text-[11px]">{skorlar.fiziksel.aciklama}</p>
          <Bilesenler bilesenler={skorlar.fiziksel.bilesenler} />
          <p className="mt-2 text-[11px] text-tkgm-muted">
            Yükseklik: {egim.merkezYukseklikM} m · {egim.egimNotu}
          </p>
        </Section>
      )}
      {skorlar.erisim.toplam != null && (
        <Section title="🚶 Erişim detay">
          <p className="mb-1 text-[11px]">{skorlar.erisim.aciklama}</p>
          <Bilesenler bilesenler={skorlar.erisim.bilesenler} />
        </Section>
      )}
      {skorlar.altyapi.toplam != null && (
        <Section title="🔌 Altyapı detay">
          <p className="mb-1 text-[11px]">{skorlar.altyapi.aciklama}</p>
          <Bilesenler bilesenler={skorlar.altyapi.bilesenler} />
        </Section>
      )}

      {cevre && cevre.elementSayisi === 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800">
          ℹ️ <strong>Overpass'tan 0 element geldi.</strong> Bölgede OSM'de
          işaretli POI/yol/altyapı yok ya da çok az. Kırsal Türkiye'de OSM
          verisi seyrektir. Lojistik / Erişim / Altyapı skorları "0" olabilir —
          bu API hatası değil, veri eksikliği.
        </div>
      )}
      {cevre && cevre.elementSayisi > 0 && cevre.elementSayisi < 5 && (
        <div className="rounded border border-amber-200 bg-amber-50/50 p-2 text-[10px] text-amber-700">
          ℹ️ Overpass {cevre.elementSayisi} element döndü — bölgede OSM kapsama
          sınırlı. Bu skorları temkinli yorumla.
        </div>
      )}

      {cevre && (
        <>
          <Section title="🏙️ Çevre POI">
            <div className="grid grid-cols-3 gap-1 text-[11px]">
              <Poi label="Eğitim" sayi={cevre.poi.okul} enYakinM={cevre.poi.okulMinM} />
              <Poi label="Sağlık" sayi={cevre.poi.hastane} enYakinM={cevre.poi.hastaneMinM} />
              <Poi label="Durak" sayi={cevre.poi.duraklar} enYakinM={cevre.poi.durakMinM} />
            </div>
            <div className="mt-1 text-[9px] text-slate-400 text-center">
              1.5km içinde sayı · değilse en yakın mesafe (5km'ye kadar)
            </div>
          </Section>

          <Section title="🛣 Yol Erişimi">
            {(() => {
              const yolTipleri = ["motorway", "trunk", "primary", "secondary", "tertiary"];
              const yollar = cevre.enYakinlar.filter(p => yolTipleri.includes(p.tip));
              if (yollar.length === 0) {
                return <div className="text-[10px] text-slate-500 italic">30km içinde önemli yol bulunamadı</div>;
              }
              const tipAd: Record<string, string> = {
                motorway: "Otoyol", trunk: "Devlet Yolu",
                primary: "Anayol", secondary: "İkincil yol",
                tertiary: "Üçüncü yol",
              };
              return (
                <div className="space-y-1">
                  {yollar.slice(0, 4).map((y, i) => {
                    const km = y.mesafeM >= 1000 ? `${(y.mesafeM / 1000).toFixed(1)} km` : `${y.mesafeM} m`;
                    return (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <span>{y.ikon ?? "🛣"}</span>
                          <span>{tipAd[y.tip] ?? y.tip}</span>
                          <span className="text-slate-500">· {y.ad}</span>
                        </span>
                        <span className="font-semibold text-tkgm-primary tabular-nums">{km}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </Section>

          <Section title="🔌 Altyapı">
            <KV
              k="Elektrik hattı"
              v={
                cevre.altyapi.elektrikHattiM != null
                  ? `${Math.round(cevre.altyapi.elektrikHattiM)} m`
                  : "2km içinde yok"
              }
            />
            <KV
              k="Su hattı"
              v={
                cevre.altyapi.suBoruM != null
                  ? `${Math.round(cevre.altyapi.suBoruM)} m`
                  : "OSM'de işaretli yok"
              }
            />
            <KV
              k="Demiryolu"
              v={
                cevre.altyapi.demiryoluM != null
                  ? `${Math.round(cevre.altyapi.demiryoluM)} m`
                  : "2km içinde yok"
              }
            />
          </Section>

          {/tarla|bahçe|bahce|zeytinlik|bağ\b|bag\b/i.test(parsel.nitelik) && (
            <Section title="🌾 Kırsal Analiz">
              <KV
                k="Kadastral Yol"
                v={
                  cevre.kirsal.yolaCepheM != null
                    ? cevre.kirsal.yolaCepheM <= 15 ? "Yola cephe" : `${Math.round(cevre.kirsal.yolaCepheM)} m`
                    : "OSM'de işaretli değil"
                }
              />
              <KV
                k="Su Kaynağı"
                v={
                  cevre.kirsal.suKaynagiM != null
                    ? `${Math.round(cevre.kirsal.suKaynagiM)} m`
                    : "1km içinde yok"
                }
              />
              <KV
                k="Köy Merkezi"
                v={
                  cevre.kirsal.koyMerkeziM != null
                    ? `${Math.round(cevre.kirsal.koyMerkeziM)} m`
                    : "3km içinde yok"
                }
              />
            </Section>
          )}
        </>
      )}

      {adres && (
        <Section title="📍 Adres (Nominatim)">
          <p className="text-[11px]">{adres}</p>
        </Section>
      )}

      {/* Doğal veri katmanı — AFAD deprem + iklim + toprak (Cadastrum içinde) */}
      <DogalVeriKarti
        parsel={parsel}
        onHeyelanChange={setHeyelanVerisi}
        onTaskinKoordChange={setTaskinKoordVerisi}
      />

        {/* Altyapı mesafe katmanı — OSB, havalimanı, liman, nüfus yoğunluğu (statik, sıfır API) */}
        <AltyapiMesafeKarti parsel={parsel} onYakinPoiler={onAltyapiPoiler} />
      </AccordionSection>

      {/* İmar & Üst Plan — e-Plan KAKS + TUCBS ÇDP birleşik kart */}
      {acikModuller.includes("cdp-tucbs") && (
        <CdpKarti
          veri={tucbsVerisi}
          loading={tucbsLoading}
          ePlan={birlesikImar ?? ePlanVerisi}
          ePlanLoading={ePlanLoading}
        />
      )}

      {/* RiskUyariKarti ve FiyatTahminKarti yukarıya taşındı (return bloğunun başına) */}

      {/* Likidite — TKGM yıllık işlem yoğunluğu (otomatik fetch) */}
      {parsel.ilceKodu != null && (
        <LikiditeKarti ilceKodu={parsel.ilceKodu} ilceAd={parsel.ilceAd ?? ""} />
      )}

      {/* Milli Emlak ihale fiyatları — gerçek devlet ihale kapanış fiyatları (listing değil) */}
      <MilliEmlakKarti parsel={parsel} />

      {/* Cadex Fiyat Endeksi & Zaman Serisi Trendi */}
      <EndeksGrafigiKarti parsel={parsel} />

      {acikModuller.includes("fiyat-tahmin") && (
        <FiyatNetlestirKarti
          parsel={parsel}
          imar={birlesikImar ?? ePlanVerisi}
          manuelEmsalAdet={manuelVeri.emsaller.length}
          onDetayAc={() => setImarDetayAcik(true)}
        />
      )}


      {/* W3 — Ada İçi Komşu Parsel Karşılaştırması */}
      {parsel.mahalleKodu && parsel.adaNo && (
        <KomsuParselKarti parsel={parsel} />
      )}

      {/* ── İMAR & MANUEL VERİ ── */}
      <AccordionSection
        title="İmar & Manuel Veri"
        badge={[
          ePlanVerisi ? "e-Plan ✓" : "e-Plan eksik",
          manuelVeri.imar ? "manuel ✓" : null,
          manuelVeri.emsaller.length > 0 ? `${manuelVeri.emsaller.length} emsal` : null,
        ].filter(Boolean).join(" · ")}
        badgeTone={ePlanVerisi ? "success" : "warning"}
        defaultOpen={!ePlanVerisi}
        open={imarDetayAcik}
        onOpenChange={setImarDetayAcik}
      >
        {/* Belediye + İmar bağlantıları */}
        {parsel.ilAd && parsel.ilceAd && (
          <BelediyeImar
            ilAd={parsel.ilAd}
            ilceAd={parsel.ilceAd}
            adaNo={parsel.adaNo}
            parselNo={parsel.parselNo}
            ePlanVerisi={ePlanVerisi}
          />
        )}

        {/* Manuel imar girişi — e-Plan eksikse veya override etmek isterse */}
        <ManuelImarKarti parsel={parsel} ePlanVerisi={ePlanVerisi} onDegisti={manuelTetikle} />

        {/* Manuel emsal listesi */}
        <ManuelEmsalKarti parsel={parsel} onDegisti={manuelTetikle} />
      </AccordionSection>

      {/* ── DETAYLI ANALİZ ── */}
      <AccordionSection
        title="Detaylı Analiz"
        badge="emsal · TKGM · bölge skoru · uydu"
        badgeTone="default"
        defaultOpen={false}
      >
        {/* e-Plan özeti */}
        <div className="rounded border border-slate-200 bg-white p-2 text-[11px]">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold text-slate-700">🏛️ e-Plan</span>
            <a
              href={EPLAN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-tkgm-primary hover:underline"
            >
              Resmi sorgu →
            </a>
          </div>
          {ePlanLoading ? (
            <p className="animate-pulse text-slate-500">Resmi e-Plan sorgulanıyor…</p>
          ) : ePlanVerisi ? (
            <div className="space-y-0.5 text-slate-700">
              <p className="font-medium text-emerald-700">Resmi e-Plan verisi yakalandı</p>
              <p>{ePlanVerisi.kullanimKarari ?? ePlanVerisi.planKarari ?? "Kullanım kararı özeti sınırlı."}</p>
              <p className="text-tkgm-muted">
                {[
                  ePlanVerisi.yapiNizami,
                  ePlanVerisi.emsal != null ? `Emsal ${ePlanVerisi.emsal}` : null,
                  ePlanVerisi.taks != null ? `TAKS ${ePlanVerisi.taks}` : null,
                  ePlanVerisi.maksKat != null ? `Maks kat ${ePlanVerisi.maksKat}` : null,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 text-slate-700">
              <p className="text-amber-700">⚠ Resmi e-Plan verisi yok.</p>
              {(() => {
                const tahmin = imarTahminEt(parsel);
                if (tahmin.taks == null && tahmin.emsal == null && !tahmin.kullanimKarari) {
                  return (
                    <p className="text-[10px] text-slate-600">
                      Manuel imar bilgisi girip override edebilirsiniz veya{" "}
                      <a href={EPLAN_URL} target="_blank" rel="noopener noreferrer" className="text-tkgm-primary hover:underline">
                        e-Plan'da manuel sorgu yapın
                      </a>.
                    </p>
                  );
                }
                return (
                  <div className="space-y-1 rounded border border-amber-200 bg-amber-50 p-1.5">
                    <p className="text-[10px] font-semibold text-amber-900">
                      📊 Tahmini İmar (mahalle profili — %{tahmin.guven} güven)
                    </p>
                    <p className="text-[10px] text-amber-900">
                      {tahmin.kullanimKarari ?? "—"}
                      {(tahmin.taks != null || tahmin.emsal != null || tahmin.maksKat != null) && (
                        <> · {[
                          tahmin.taks != null ? `TAKS ${tahmin.taks.toFixed(2)}` : null,
                          tahmin.emsal != null ? `Emsal ${tahmin.emsal.toFixed(2)}` : null,
                          tahmin.maksKat != null ? `${tahmin.maksKat} kat` : null,
                          tahmin.yapiNizami,
                        ].filter(Boolean).join(" · ")}</>
                      )}
                    </p>
                    <p className="text-[9px] italic text-amber-800 leading-snug">{tahmin.gerekce}</p>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {acikModuller.includes("fiyat-tahmin") && <EmsalMukayeseKarti parsel={parsel} />}
        {acikModuller.includes("fiyat-tahmin") && <MekansalKarsilastirmaKarti parsel={parsel} />}
        {acikModuller.includes("fiyat-tahmin") && <EmsalRadiusSlider parsel={parsel} />}
        {acikModuller.includes("fiyat-tahmin") && (
          <Suspense fallback={<LazyFallback />}>
            <YatirimSkoruKarti
              parsel={parsel}
              fiyat={hesaplananFiyat}
              cevre={cevre}
              ePlan={birlesikImar ?? ePlanVerisi}
            />
          </Suspense>
        )}
        {acikModuller.includes("fiyat-tahmin") && <BildirimKurali parsel={parsel} />}

        {parsel.ilceKodu != null && (
          <Suspense fallback={<LazyFallback />}>
            <TkgmAnaliz ilceKodu={parsel.ilceKodu} ilceAd={parsel.ilceAd} />
          </Suspense>
        )}

        {/* Tarihsel karşılaştırma — 2 yıl yan yana */}
        {parsel.ilceKodu != null && (
          <Suspense fallback={<LazyFallback />}>
            <TkgmKarsilastirma ilceKodu={parsel.ilceKodu} ilceAd={parsel.ilceAd} />
          </Suspense>
        )}

        {/* Bölge Gelişim Skoru — 5 boyutlu öngörü */}
        {parsel.ilceKodu != null && parsel.merkezNokta != null && (
          <BolgeSkorKarti
            ilNorm={normalizeYerAdi(parsel.ilAd ?? "")}
            ilceNorm={normalizeYerAdi(parsel.ilceAd ?? "")}
            ilceKodu={parsel.ilceKodu}
            lat={parsel.merkezNokta.lat}
            lng={parsel.merkezNokta.lng}
          />
        )}

        {/* AI Uydu Görüntü Analizi — ESRI World Imagery + Gemini Vision */}
        {parsel.merkezNokta != null && (
          <Suspense fallback={<LazyFallback />}>
            <UyduAnaliz
              lat={parsel.merkezNokta.lat}
              lng={parsel.merkezNokta.lng}
              zoom={16}
            />
          </Suspense>
        )}

        {/* Sentinel-2 Uydu Görüntüsü — Copernicus + bant seçici (Pro) */}
        <Suspense fallback={<LazyFallback />}>
          <UyduAnalizKarti parsel={parsel} />
        </Suspense>

        {/* Bağımsız bölüm (kat mülkiyeti) — apartman/bina nitelikli parsellerde otomatik */}
        <BagimsizBolumKarti parsel={parsel} />

        <Section title="🌍 Doğal Risk Değerlendirmesi">
          <RiskKarti ilAd={parsel.ilAd} />
        </Section>
      </AccordionSection>

      {/* ── PRO MODÜLLER — Güneş + Tarım ── */}
      {(acikModuller.includes("gunes-enerjisi") || acikModuller.includes("tarim")) && (
        <AccordionSection
          title="Pro Modüller"
          badge="güneş · tarım"
          badgeTone="ai"
          defaultOpen={false}
          pro
        >
          {acikModuller.includes("gunes-enerjisi") &&
            (lisansBilgi.can("gunes-modulu") ? (
              <Suspense fallback={<LazyFallback />}>
                <GunesEnerjisiKarti parsel={parsel} />
              </Suspense>
            ) : (
              <PaywallKilit
                gerekliTier={lisansBilgi.yukseltGerekli("gunes-modulu") ?? "bireysel-pro"}
                ozellik="☀ Güneş Enerjisi PV Modülü"
                kompakt
              />
            ))}

          {acikModuller.includes("tarim") &&
            (lisansBilgi.can("tarim-modulu") ? (
              <Suspense fallback={<LazyFallback />}>
                <TarimAnalizKarti parsel={parsel} />
              </Suspense>
            ) : (
              <PaywallKilit
                gerekliTier={lisansBilgi.yukseltGerekli("tarim-modulu") ?? "bireysel-pro"}
                ozellik="🌱 Tarımsal Yatırım Modülü"
                kompakt
              />
            ))}
        </AccordionSection>
      )}

      {/* ── AI SCORECARD ── */}
      <AccordionSection title="AI Arazi Scorecard" badge="5 boyutlu" badgeTone="ai" defaultOpen={false} pro>
        <Suspense fallback={<LazyFallback />}>
        <ScorecardKarti
          parsel={parsel}
          egim={egim}
          depremPga={depremRiskiGetir(
            (parsel.ilAd ?? "")
              .toLowerCase()
              .replace(/[ğ]/g, "g").replace(/[ü]/g, "u").replace(/[ş]/g, "s")
              .replace(/[ı]/g, "i").replace(/[ö]/g, "o").replace(/[ç]/g, "c")
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
              .replace(/\s+/g, "-")
          )?.pga ?? null}
          taskinRisk={null}
          otoyolKm={cevre?.enYakinlar.find(p => p.tip === "motorway" || p.tip === "trunk")
            ? cevre.enYakinlar.find(p => p.tip === "motorway" || p.tip === "trunk")!.mesafeM / 1000
            : undefined}
          osbKm={cevre?.enYakinlar.find(p => p.tip === "osb")
            ? cevre.enYakinlar.find(p => p.tip === "osb")!.mesafeM / 1000
            : undefined}
          havalimanKm={cevre?.enYakinlar.find(p => p.tip === "airport")
            ? cevre.enYakinlar.find(p => p.tip === "airport")!.mesafeM / 1000
            : undefined}
          limanKm={cevre?.enYakinlar.find(p => p.tip === "port")
            ? cevre.enYakinlar.find(p => p.tip === "port")!.mesafeM / 1000
            : undefined}
          serbestBolgeKm={cevre?.enYakinlar.find(p => p.tip === "serbest-bolge")
            ? cevre.enYakinlar.find(p => p.tip === "serbest-bolge")!.mesafeM / 1000
            : undefined}
          lisansliDepoKm={cevre?.enYakinlar.find(p => p.tip === "lisansli-depo")
            ? cevre.enYakinlar.find(p => p.tip === "lisansli-depo")!.mesafeM / 1000
            : undefined}
          elektrikHattiM={cevre?.altyapi.elektrikHattiM ?? undefined}
          baselineTlm2={hesaplananFiyat?.beklenenPerM2 ?? undefined}
        />
        </Suspense>
      </AccordionSection>

      {/* ── ARAÇLAR: Hava Fotoğrafı + Fizibilite + Eylemler ── */}
      <AccordionSection title="Araçlar" badge="hava foto · fizibilite · rapor" badgeTone="default" defaultOpen={false}>
        {parsel.koordinatlar && parsel.koordinatlar.length >= 3 && (
          <Suspense fallback={<LazyFallback />}>
            <HavaFotoTimeline parsel={parsel} />
          </Suspense>
        )}
        <Fizibilite parsel={parsel} />
        <PortfoyEkleButonu parsel={parsel} fiyat={hesaplananFiyat} ePlan={birlesikImar ?? ePlanVerisi ?? null} />
        <RaporExportButonu parsel={parsel} cevre={cevre} egim={egim} ePlan={birlesikImar ?? ePlanVerisi ?? null} />
      </AccordionSection>
    </div>
  );
}

// ─── Portföye Ekle Butonu ─────────────────────────────────────────────────────

function PortfoyEkleButonu({
  parsel,
  fiyat,
  ePlan,
}: {
  parsel: import("../../types/tkgm").Parsel;
  fiyat: import("../../lib/fiyat-tahmin").FiyatTahmini | null;
  ePlan: import("../../lib/eplan").EPlanImarVerisi | null;
}) {
  const { ekle, cikar, varMi, guncelleiFiyat, guncellePlan } = useKarsilastirma();
  const [eklendi, setEklendi] = useState(false);
  const portfoydeMi = varMi(parsel);

  function toggle() {
    const key = parselKarsilastirmaKey(parsel);
    if (portfoydeMi) {
      cikar(key);
    } else {
      ekle(parsel);
      // Fiyat ve ePlan varsa hemen güncelle
      if (fiyat) setTimeout(() => guncelleiFiyat(key, fiyat), 50);
      if (ePlan) setTimeout(() => guncellePlan(key, ePlan), 50);
      setEklendi(true);
      setTimeout(() => setEklendi(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-2xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        portfoydeMi
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
      }`}
      title={portfoydeMi ? "Portföyden çıkar" : `Portföye ekle (max ${MAX_PORTFOY} parsel)`}
      aria-pressed={portfoydeMi}
    >
      {portfoydeMi
        ? <CheckCircle2Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        : <FolderPlusIcon   className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      }
      {eklendi ? "Portföye eklendi!" : portfoydeMi ? "Portföyde" : "Portföye Ekle"}
    </button>
  );
}
