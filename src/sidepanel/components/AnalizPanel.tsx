import { useEffect, useRef, useState, useCallback } from "react";
import { RiskKarti } from "./RiskKarti";
import {
  Truck as TruckIcon,
  Mountain as MountainIcon,
  Footprints as FootprintsIcon,
  Zap as ZapIcon,
  BarChart3 as BarChart3Icon,
  MapPin as MapPinIcon,
  Link2 as Link2Icon,
} from "lucide-react";
import { analizet } from "../../lib/analiz";
import { adresGetir, cevreAnaliziGetir, type CevreAnalizi } from "../../lib/osm";
import { egimAnaliziGetir, type EgimAnalizi } from "../../lib/elevation";
import { tumSkorlariHesapla } from "../../lib/skor";
import type { Parsel } from "../../types/tkgm";
import { SkorBadge } from "./SkorBadge";
import { Fizibilite } from "./Fizibilite";
import { TkgmAnaliz } from "./TkgmAnaliz";
import { BelediyeImar } from "./BelediyeImar";
import { FiyatTahminKarti } from "./FiyatTahminKarti";
import { RiskUyariKarti } from "./RiskUyariKarti";
import { RaporExportButonu } from "./RaporExportButonu";
import { ManuelImarKarti } from "./ManuelImarKarti";
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
import { YatirimSkoruKarti } from "./YatirimSkoruKarti";
import { BildirimKurali } from "./BildirimKurali";
import { DogalVeriKarti } from "./DogalVeriKarti";
import { BagimsizBolumKarti } from "./BagimsizBolumKarti";
import { GunesEnerjisiKarti } from "./GunesEnerjisiKarti";
import { TarimAnalizKarti } from "./TarimAnalizKarti";
import { PaywallKilit } from "./PaywallKilit";
import { useLisans } from "../../lib/lisans";
import { useAyarlar } from "../../lib/ayarlar";
import { EPLAN_URL } from "../../lib/eplan";
import { useEPlanVerisi } from "../../lib/use-eplan";
import { useTucbsCdp } from "../../lib/use-tucbs";
import { CdpKarti } from "./CdpKarti";
import { ScorecardKarti } from "./ScorecardKarti";

interface Props {
  parsel: Parsel;
  /** Cevre analizi tamamlanınca harita üstünde POI'leri çizmek için MapView'e pas et */
  onYakinPoiler?: (poiler: import("../../lib/osm").YakinNoktaMesafesi[] | null) => void;
}

export function AnalizPanel({ parsel, onYakinPoiler }: Props) {
  const analiz = analizet(parsel);
  const [ayarlar] = useAyarlar();
  const acikModuller = ayarlar.acikModuller;
  const lisansBilgi = useLisans();
  const [cevre, setCevre] = useState<CevreAnalizi | null>(null);
  const [egim, setEgim] = useState<EgimAnalizi | null>(null);
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
      } else {
        hatalar.push(
          `Çevre (Overpass): ${cevreRes.reason instanceof Error ? cevreRes.reason.message : String(cevreRes.reason)}`,
        );
      }
      if (egimRes.status === "fulfilled") {
        setEgim(egimRes.value);
      } else {
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
  }, [parsel.adaNo, parsel.parselNo, parsel.mahalleKodu, parsel.merkezNokta, parsel.koordinatlar]);

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

  return (
    <div className="space-y-2.5 border-t border-slate-200 pt-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <BarChart3Icon className="h-4 w-4 text-slate-500" />
          Analiz
        </h3>
        <div className="flex items-center gap-2">
          {cevre && cevre.elementSayisi > 0 && (
            <label className="flex cursor-pointer items-center gap-1 text-3xs text-slate-500 hover:text-slate-700">
              <input
                type="checkbox"
                checked={yakinlarHaritada}
                onChange={(e) => setYakinlarHaritada(e.target.checked)}
                className="h-3 w-3 cursor-pointer accent-tkgm-primary"
              />
              <Link2Icon className="h-3 w-3" />
              <span>Yakınları haritada</span>
            </label>
          )}
          {(!cevre || !egim) && (
            <button
              type="button"
              onClick={cevreyiAnalizEt}
              disabled={loading}
              className="cursor-pointer rounded-md bg-tkgm-primary px-2.5 py-1 text-2xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? "Analiz ediliyor…" : cevre || egim ? "Eksik veriyi tamamla" : "Çevreyi analiz et"}
            </button>
          )}
        </div>
      </div>

      {/* 4 ana skor — loading/hata/sonuç state'leri SkorBadge'in kendi mantığıyla */}
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

      {/* Lokal analizler — her zaman gösterilir */}
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
      <DogalVeriKarti parsel={parsel} />

      {/* İmar & Üst Plan — e-Plan KAKS + TUCBS ÇDP birleşik kart */}
      {acikModuller.includes("cdp-tucbs") && (
        <CdpKarti
          veri={tucbsVerisi}
          loading={tucbsLoading}
          ePlan={birlesikImar ?? ePlanVerisi}
          ePlanLoading={ePlanLoading}
        />
      )}

      {/* Risk taraması — fiyat tahmin kartından ÖNCE: yatırım öncesi kritik */}
      <RiskUyariKarti
        parsel={parsel}
        ePlan={birlesikImar ?? ePlanVerisi}
        tucbs={tucbsVerisi}
      />

      {/* Likidite — TKGM yıllık işlem yoğunluğu (otomatik fetch) */}
      {parsel.ilceKodu != null && (
        <LikiditeKarti ilceKodu={parsel.ilceKodu} ilceAd={parsel.ilceAd ?? ""} />
      )}

      {acikModuller.includes("fiyat-tahmin") && (
        <FiyatNetlestirKarti
          parsel={parsel}
          imar={birlesikImar ?? ePlanVerisi}
          manuelEmsalAdet={manuelVeri.emsaller.length}
          onDetayAc={() => setImarDetayAcik(true)}
        />
      )}

      {/* Tahmini piyasa fiyatı — imar bilinmeden hesaplanmaz; e-Plan fail olursa hızlı imar prompt'u gösterilir */}
      {acikModuller.includes("fiyat-tahmin") && (
        <FiyatTahminKarti
          parsel={parsel}
          cevre={cevre}
          egim={egim}
          ePlan={birlesikImar ?? ePlanVerisi}
          tucbs={tucbsVerisi}
          ePlanLoading={ePlanLoading}
          imarSkipEdildi={imarSkipEdildi}
          onImarKaydedildi={() => {
            manuelTetikle();
            setImarSkipEdildi(false);
          }}
          onImarSkip={() => setImarSkipEdildi(true)}
          onImarTekrarSor={() => setImarSkipEdildi(false)}
          onTahminHesaplandi={setHesaplananFiyat}
        />
      )}

      {/* PDF Rapor — tüm analizi yazdırılabilir tek dokümana topla */}
      <RaporExportButonu parsel={parsel} cevre={cevre} egim={egim} ePlan={(birlesikImar as any) ?? ePlanVerisi ?? null} />

      {/* ── İMAR & MANUEL VERİ — collapsed grup ────────────────────── */}
      <DetayGrup
        baslik="İmar & Manuel Veri"
        ikon="🏛️"
        ozet={[
          ePlanVerisi ? "e-Plan ✓" : "e-Plan eksik",
          manuelVeri.imar ? "manuel imar ✓" : null,
          manuelVeri.emsaller.length > 0 ? `${manuelVeri.emsaller.length} emsal` : null,
        ].filter(Boolean).join(" · ")}
        renk="amber"
        defaultAcik={!ePlanVerisi}
        acik={imarDetayAcik}
        onAcikDegisimi={setImarDetayAcik}
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
      </DetayGrup>

      {/* ── DETAYLI ANALİZ — emsal mukayese vs ─────────────────────── */}
      <DetayGrup
        baslik="Detaylı Analiz"
        ikon="🔬"
        ozet="e-Plan · emsal · TKGM yoğunluk · doğal risk"
        renk="slate"
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
        {acikModuller.includes("fiyat-tahmin") && <EmsalRadiusSlider parsel={parsel} />}
        {acikModuller.includes("fiyat-tahmin") && (
          <YatirimSkoruKarti
            parsel={parsel}
            fiyat={hesaplananFiyat}
            cevre={cevre}
            ePlan={birlesikImar ?? ePlanVerisi}
          />
        )}
        {acikModuller.includes("fiyat-tahmin") && <BildirimKurali parsel={parsel} />}

        {parsel.ilceKodu != null && (
          <TkgmAnaliz ilceKodu={parsel.ilceKodu} ilceAd={parsel.ilceAd} />
        )}

        {/* Bağımsız bölüm (kat mülkiyeti) — apartman/bina nitelikli parsellerde otomatik */}
        <BagimsizBolumKarti parsel={parsel} />

        <Section title="🌍 Doğal Risk Değerlendirmesi">
          <RiskKarti ilAd={parsel.ilAd} />
        </Section>
      </DetayGrup>

      {/* ── PRO MODÜLLER — Güneş + Tarım ────────────────────────────── */}
      {(acikModuller.includes("gunes-enerjisi") || acikModuller.includes("tarim")) && (
        <DetayGrup
          baslik="Pro Modüller"
          ikon="✨"
          ozet="güneş · tarım"
          renk="violet"
        >
          {acikModuller.includes("gunes-enerjisi") &&
            (lisansBilgi.can("gunes-modulu") ? (
              <GunesEnerjisiKarti parsel={parsel} />
            ) : (
              <PaywallKilit
                gerekliTier={lisansBilgi.yukseltGerekli("gunes-modulu") ?? "bireysel-pro"}
                ozellik="☀ Güneş Enerjisi PV Modülü"
                kompakt
              />
            ))}

          {acikModuller.includes("tarim") &&
            (lisansBilgi.can("tarim-modulu") ? (
              <TarimAnalizKarti parsel={parsel} />
            ) : (
              <PaywallKilit
                gerekliTier={lisansBilgi.yukseltGerekli("tarim-modulu") ?? "bireysel-pro"}
                ozellik="🌱 Tarımsal Yatırım Modülü"
                kompakt
              />
            ))}
        </DetayGrup>
      )}

      {/* ── AI SCORECARD — 5 boyutlu uygunluk analizi ───────────────────── */}
      <DetayGrup baslik="AI Arazi Scorecard" ikon="🤖" renk="violet">
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
      </DetayGrup>

      {/* ── FİZİBİLİTE — bağımsız grup (yatırım hesabı odaklı) ─────────── */}
      <DetayGrup baslik="Fizibilite Hesaplayıcı" ikon="🧮" renk="slate">
        <Fizibilite parsel={parsel} />
      </DetayGrup>
    </div>
  );
}

function Section({
  title,
  children,
  loz,
  right,
}: {
  title: string;
  children: React.ReactNode;
  loz?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border shadow-card transition-shadow hover:shadow-card-hover ${loz ? "border-dashed border-slate-300 bg-slate-50/50" : "border-slate-200 bg-white"}`}
    >
      <header className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
        <h4 className="text-2xs font-semibold text-slate-700">{title}</h4>
        {right}
      </header>
      <div className="px-3 pb-2">{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 text-2xs">
      <span className="text-slate-500">{k}</span>
      <span className="font-medium tabular-nums text-slate-700">{v}</span>
    </div>
  );
}

function Poi({ label, sayi, enYakinM }: { label: string; sayi: number; enYakinM?: number | null }) {
  // POI 1.5km içinde varsa sayı + yeşil; yoksa en yakın mesafe (5km'ye kadar) + nötr
  const farUstu = sayi === 0 && enYakinM != null;
  const hicYok = sayi === 0 && (enYakinM == null);

  return (
    <div
      className={`rounded-md border px-1.5 py-1.5 text-center transition-colors ${
        sayi > 0
          ? "border-emerald-200 bg-emerald-50/70 text-accent-success"
          : farUstu
          ? "border-amber-200 bg-amber-50/70 text-amber-700"
          : "border-slate-200 bg-white text-slate-400"
      }`}
      title={
        sayi > 0
          ? `1.5km içinde ${sayi} ${label.toLowerCase()}`
          : farUstu && enYakinM != null
          ? `En yakın ${label.toLowerCase()} ${(enYakinM / 1000).toFixed(1)}km'de`
          : `5km içinde ${label.toLowerCase()} bulunamadı`
      }
    >
      {sayi > 0 ? (
        <>
          <div className="text-base font-bold leading-none">{sayi}</div>
          <div className="text-[9px] uppercase tracking-wide">{label}</div>
        </>
      ) : farUstu && enYakinM != null ? (
        <>
          <div className="text-sm font-bold leading-none">{(enYakinM / 1000).toFixed(1)}<span className="text-[8px] font-normal">km</span></div>
          <div className="text-[9px] uppercase tracking-wide">{label}</div>
        </>
      ) : (
        <>
          <div className="text-sm font-bold leading-none">—</div>
          <div className="text-[9px] uppercase tracking-wide">{label}</div>
        </>
      )}
    </div>
  );
}

function Bilesenler({
  bilesenler,
}: {
  bilesenler: { ad: string; puan: number; not: string }[];
}) {
  return (
    <div className="space-y-1">
      {bilesenler.map((b) => (
        <div key={b.ad} className="text-[11px]">
          <div className="flex justify-between gap-2">
            <span className="text-tkgm-muted">{b.ad}</span>
            <span className="font-medium">{b.puan}/100 · {b.not}</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded bg-slate-200">
            <div
              className={`h-full ${b.puan >= 75 ? "bg-emerald-500" : b.puan >= 50 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${b.puan}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
