import {
  Map as MapIcon,
  Loader2 as LoaderIcon,
  AlertTriangle as AlertIcon,
  Info as InfoIcon,
  Building2 as BuildingIcon,
  Sprout as SproutIcon,
  Factory as FactoryIcon,
  ShoppingBag as ShopIcon,
  HelpCircle as HelpIcon,
  Shield as ShieldIcon,
  Zap as ZapIcon,
  FileCheck as FileCheckIcon,
  Layers as LayersIcon,
  ExternalLink as ExternalLinkIcon,
} from "lucide-react";
import type { TucbsCdpSonuc, TucbsCdpKategori } from "../../lib/tucbs";
import type { EPlanImarVerisi } from "../../lib/eplan";
import { Section } from "../ui/Card";
import {
  belediyePortalBul,
  tkgmParselsorguUrl,
  EPLAN_IMAR_URL,
} from "../../lib/belediye-imar";

interface Props {
  veri: TucbsCdpSonuc | null;
  loading: boolean;
  /** e-Plan imar verisi — KAKS/TAKS/maks kat görsel özeti için */
  ePlan?: EPlanImarVerisi | null;
  ePlanLoading?: boolean;
  /** Belediye portal linkleri için parsel bilgisi */
  ilAd?: string;
  mahalleKodu?: number | null;
  adaNo?: number;
  parselNo?: number;
}

// ─── Kategori konfigürasyonu ──────────────────────────────────────────────────

interface KategoriConfig {
  icon: React.ReactNode;
  bg: string;
  border: string;
  text: string;
  etiket: string;
  aciklama: string;
}

function kategoriConfig(kategori: TucbsCdpKategori | undefined): KategoriConfig {
  switch (kategori) {
    case "konut-gelisme":
      return {
        icon: <BuildingIcon className="h-4 w-4" />,
        bg: "bg-amber-50",
        border: "border-amber-200",
        text: "text-amber-900",
        etiket: "Konut / Gelişme Alanı",
        aciklama: "İmar planına alınabilir veya gelişme konut bölgesi. Yüksek dönüşüm potansiyeli.",
      };
    case "koy-yerlesik":
      return {
        icon: <BuildingIcon className="h-4 w-4" />,
        bg: "bg-orange-50",
        border: "border-orange-200",
        text: "text-orange-900",
        etiket: "Köy / Kırsal Yerleşik Alan",
        aciklama: "Mevcut köy yerleşim alanı. Bölgeye göre yapılaşma koşulları farklıdır.",
      };
    case "tarim-koruma":
      return {
        icon: <SproutIcon className="h-4 w-4" />,
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        text: "text-emerald-900",
        etiket: "Tarım / Koruma Alanı",
        aciklama: "Tarımsal üretim veya doğal koruma alanı. Yapılaşma ciddi kısıtlı veya yasak.",
      };
    case "sanayi":
      return {
        icon: <FactoryIcon className="h-4 w-4" />,
        bg: "bg-violet-50",
        border: "border-violet-200",
        text: "text-violet-900",
        etiket: "Sanayi / Depolama Alanı",
        aciklama: "Endüstriyel kullanım veya OSB bölgesi. Konut projesi için uygun değil.",
      };
    case "ticari-turizm":
      return {
        icon: <ShopIcon className="h-4 w-4" />,
        bg: "bg-rose-50",
        border: "border-rose-200",
        text: "text-rose-900",
        etiket: "Ticaret / Turizm Alanı",
        aciklama: "Ticari veya turizm fonksiyonu planlanmış alan. Karma kullanım mümkün.",
      };
    default:
      return {
        icon: <HelpIcon className="h-4 w-4" />,
        bg: "bg-slate-50",
        border: "border-slate-200",
        text: "text-slate-800",
        etiket: "Diğer Plan Kararı",
        aciklama: "Sınıflandırılmamış veya özel plan kararı.",
      };
  }
}

// ─── e-Plan KAKS özet satırı ──────────────────────────────────────────────────

function ImarOzetSatiri({ ePlan }: { ePlan: EPlanImarVerisi }) {
  const parcalar = [
    ePlan.kullanimKarari ?? ePlan.planKarari,
    ePlan.yapiNizami,
    ePlan.emsal  != null ? `Emsal ${ePlan.emsal}`   : null,
    ePlan.taks   != null ? `TAKS ${ePlan.taks}`     : null,
    ePlan.maksKat != null ? `Maks ${ePlan.maksKat} kat` : null,
  ].filter(Boolean);

  if (parcalar.length === 0) return null;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 space-y-2">
      <div className="flex items-center gap-1.5">
        <FileCheckIcon className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
        <span className="text-xs font-semibold text-emerald-800">Resmi e-Plan İmar Verisi</span>
      </div>

      {/* KAKS metrikleri — grid */}
      {(ePlan.emsal != null || ePlan.taks != null || ePlan.maksKat != null) && (
        <div className="grid grid-cols-3 gap-1.5">
          {ePlan.emsal != null && (
            <div className="rounded-md bg-white border border-emerald-200 px-2 py-1.5 text-center">
              <div className="text-2xs text-emerald-600 font-medium uppercase tracking-wide">Emsal</div>
              <div className="text-sm font-bold text-emerald-800">{ePlan.emsal.toFixed(2)}</div>
              <div className="text-3xs text-slate-400">KAKS</div>
            </div>
          )}
          {ePlan.taks != null && (
            <div className="rounded-md bg-white border border-emerald-200 px-2 py-1.5 text-center">
              <div className="text-2xs text-emerald-600 font-medium uppercase tracking-wide">TAKS</div>
              <div className="text-sm font-bold text-emerald-800">{ePlan.taks.toFixed(2)}</div>
              <div className="text-3xs text-slate-400">taban oran</div>
            </div>
          )}
          {ePlan.maksKat != null && (
            <div className="rounded-md bg-white border border-emerald-200 px-2 py-1.5 text-center">
              <div className="text-2xs text-emerald-600 font-medium uppercase tracking-wide">Maks Kat</div>
              <div className="text-sm font-bold text-emerald-800">{ePlan.maksKat}</div>
              <div className="text-3xs text-slate-400">izin verilen</div>
            </div>
          )}
        </div>
      )}

      {/* Kullanım kararı + yapı nizamı */}
      <div className="space-y-0.5">
        {ePlan.kullanimKarari && (
          <div className="flex gap-1 text-3xs">
            <span className="text-emerald-600 font-medium shrink-0">Kullanım:</span>
            <span className="text-slate-700">{ePlan.kullanimKarari}</span>
          </div>
        )}
        {ePlan.planKarari && ePlan.planKarari !== ePlan.kullanimKarari && (
          <div className="flex gap-1 text-3xs">
            <span className="text-emerald-600 font-medium shrink-0">Plan kararı:</span>
            <span className="text-slate-700">{ePlan.planKarari}</span>
          </div>
        )}
        {ePlan.yapiNizami && (
          <div className="flex gap-1 text-3xs">
            <span className="text-emerald-600 font-medium shrink-0">Yapı nizamı:</span>
            <span className="text-slate-700">{ePlan.yapiNizami}</span>
          </div>
        )}
        {ePlan.planNotu && (
          <div className="flex gap-1 text-3xs">
            <span className="text-emerald-600 font-medium shrink-0">Not:</span>
            <span className="text-slate-600 italic">{ePlan.planNotu}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Güven göstergesi ─────────────────────────────────────────────────────────

function GuvenBar({ skor }: { skor: number }) {
  const renk =
    skor >= 85 ? "bg-emerald-500" :
    skor >= 60 ? "bg-amber-500" :
    "bg-red-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${renk}`} style={{ width: `${skor}%` }} />
      </div>
      <span className="text-3xs text-slate-500 font-medium w-7 text-right">{skor}%</span>
    </div>
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

export function CdpKarti({ veri, loading, ePlan, ePlanLoading, ilAd, mahalleKodu, adaNo, parselNo }: Props) {
  const ePlanVar = ePlan && (
    ePlan.kullanimKarari || ePlan.planKarari ||
    ePlan.emsal != null || ePlan.taks != null || ePlan.maksKat != null
  );

  // Belediye portalları (il-eksik durumunda gösterilir)
  const belediyePortallari = ilAd ? belediyePortalBul(ilAd) : [];
  const tkgmUrl = tkgmParselsorguUrl(mahalleKodu, adaNo, parselNo);

  // Yükleniyor
  if (loading || ePlanLoading) {
    return (
      <Section
        title="İmar & Üst Plan"
        icon={<LayersIcon className="h-3.5 w-3.5" />}
        accent="info"
        subtitle={
          <span className="inline-flex items-center gap-1 text-slate-500">
            <LoaderIcon className="h-3 w-3 animate-spin" />
            {ePlanLoading ? "e-Plan sorgulanıyor…" : "ÇDP sorgulanıyor…"}
          </span>
        }
      >
        <div className="space-y-1.5">
          <div className="h-12 bg-slate-100 rounded-md animate-pulse" />
          <div className="h-4 w-2/3 bg-slate-100 rounded animate-pulse" />
        </div>
      </Section>
    );
  }

  // İkisi de yok
  if (!veri && !ePlanVar) return null;

  return (
    <Section
      title="İmar & Üst Plan"
      icon={<LayersIcon className="h-3.5 w-3.5" />}
      accent="info"
      subtitle={
        <span className="text-slate-500">
          {[
            ePlanVar ? "e-Plan ✓" : null,
            veri?.kapsam === "tam" ? "TUCBS ÇDP ✓" : null,
          ].filter(Boolean).join(" · ") || "İmar bilgisi"}
        </span>
      }
    >
      <div className="space-y-2.5">

        {/* ── e-Plan KAKS/imar özeti (varsa önce göster) ── */}
        {ePlanVar && <ImarOzetSatiri ePlan={ePlan!} />}

        {/* ── TUCBS Çevre Düzeni Planı ── */}
        {veri && veri.kapsam === "tam" && veri.araziKullanimi && (() => {
          const arazi = veri.araziKullanimi;
          const cfg = kategoriConfig(arazi.kategori);
          const ekUyarilar = [
            veri.sitAlani ? "Sit / Koruma Alanı" : null,
            veri.endustriBolgesi ? "Endüstri / OSB Bölgesi" : null,
          ].filter((x): x is string => x !== null);

          return (
            <div className={`rounded-lg border ${cfg.border} ${cfg.bg} p-2.5 space-y-2`}>
              <div className="flex items-start gap-2">
                <span className={`shrink-0 mt-0.5 ${cfg.text}`}>{cfg.icon}</span>
                <div className="min-w-0">
                  <div className="text-3xs text-slate-500 uppercase tracking-wide font-medium mb-0.5">
                    TUCBS Çevre Düzeni Planı · 1/100.000
                  </div>
                  <div className={`text-xs font-semibold ${cfg.text}`}>{cfg.etiket}</div>
                  <div className="text-3xs text-slate-600 mt-0.5 leading-relaxed">{cfg.aciklama}</div>
                </div>
              </div>

              {/* Resmi plan metni */}
              <div className={`rounded-md border ${cfg.border} bg-white/70 px-2 py-1.5`}>
                <div className="text-3xs text-slate-500 mb-0.5 font-medium">Plan kararı</div>
                <div className={`text-xs font-medium ${cfg.text}`}>{arazi.metin}</div>
                {arazi.eskiMetin && arazi.eskiMetin !== arazi.metin && (
                  <div className="text-3xs text-slate-400 mt-0.5">Eski: {arazi.eskiMetin}</div>
                )}
                {arazi.kod && (
                  <div className="text-3xs text-slate-400 mt-0.5 font-mono">Kod: {arazi.kod}</div>
                )}
              </div>

              {/* Ek uyarılar */}
              {ekUyarilar.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {ekUyarilar.map((u) => (
                    <span key={u} className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-3xs font-semibold text-amber-800">
                      <AlertIcon className="h-2.5 w-2.5" />{u}
                    </span>
                  ))}
                </div>
              )}

              {/* Meta */}
              <div className="space-y-1 pt-0.5 border-t border-slate-200/60">
                {(veri.il || veri.ilce) && (
                  <div className="flex items-center gap-1 text-3xs text-slate-500">
                    <MapIcon className="h-2.5 w-2.5 shrink-0" />
                    Plan kaydı: {[veri.ilce, veri.il].filter(Boolean).join(" / ")}
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <ShieldIcon className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                  <span className="text-3xs text-slate-500 w-14 shrink-0">Güven skoru</span>
                  <GuvenBar skor={veri.guvenSkoru} />
                </div>
                {veri.bolge && (
                  <div className="flex items-center gap-1 text-3xs text-slate-400">
                    <ZapIcon className="h-2.5 w-2.5 shrink-0" />
                    WMS bölgesi: {veri.bolge}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ÇDP kapsam dışı — belediye portalları + ePlan + TKGM linkleri */}
        {veri && veri.kapsam === "il-eksik" && (
          <div className="space-y-2">
            {/* Başlık */}
            <div className="rounded-md bg-slate-50 border border-slate-200 p-2.5 space-y-1">
              <div className="flex items-center gap-1.5">
                <InfoIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="text-xs font-medium text-slate-700">
                  {veri.il ?? "Bu il"} — TUCBS kapsam dışında
                </span>
              </div>
              <p className="text-3xs text-slate-500 leading-relaxed">
                CSB'nin açık WMS servisi bu ili kapsamıyor. e-Plan verisini aşağıda görebilirsiniz;
                detaylı imar durumu için belediye portalarına gidin.
              </p>
            </div>

            {/* Aksiyon butonları */}
            <div className="space-y-1.5">
              {/* e-Plan — CSB üzerinden imar sorgusu */}
              <a
                href={EPLAN_IMAR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 hover:bg-emerald-100 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <FileCheckIcon className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <div>
                    <div className="text-2xs font-semibold text-emerald-800">CSB e-Plan Portal</div>
                    <div className="text-3xs text-emerald-600">Resmi ücretsiz imar sorgusu — eplan.csb.gov.tr</div>
                  </div>
                </div>
                <ExternalLinkIcon className="h-3 w-3 text-emerald-500 shrink-0" />
              </a>

              {/* TKGM Parselsorgu */}
              <a
                href={tkgmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 hover:bg-sky-100 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <MapIcon className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                  <div>
                    <div className="text-2xs font-semibold text-sky-800">TKGM Parsel Sorgu</div>
                    <div className="text-3xs text-sky-600">Tapu ve kadastro bilgileri — parselsorgu.tkgm.gov.tr</div>
                  </div>
                </div>
                <ExternalLinkIcon className="h-3 w-3 text-sky-500 shrink-0" />
              </a>

              {/* Belediye portalları */}
              {belediyePortallari.map((portal) => (
                <a
                  key={portal.url}
                  href={portal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 hover:bg-violet-100 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <BuildingIcon className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                    <div>
                      <div className="text-2xs font-semibold text-violet-800">{portal.ad}</div>
                      <div className="text-3xs text-violet-600">{new URL(portal.url).hostname}</div>
                    </div>
                  </div>
                  <ExternalLinkIcon className="h-3 w-3 text-violet-500 shrink-0" />
                </a>
              ))}

              {belediyePortallari.length === 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
                  <div className="text-2xs text-amber-700">
                    Bu il için belediye portalı kayıtlı değil. e-Plan CSB'den imar durumu sorgulayabilirsiniz.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ÇDP veri yok */}
        {veri && (veri.kapsam === "veri-yok" || (!veri.araziKullanimi && veri.kapsam !== "il-eksik")) && (
          <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 space-y-1">
            <div className="flex items-center gap-1.5">
              <AlertIcon className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span className="text-xs font-medium text-amber-800">ÇDP plan kaydı bulunamadı</span>
            </div>
            <p className="text-3xs text-amber-700 leading-relaxed">
              {veri.hata ?? "Parsel koordinatı plan poligonu dışında kalıyor olabilir."}
            </p>
          </div>
        )}

        {/* Yasal uyarı */}
        <p className="text-3xs italic text-slate-400 leading-relaxed">
          e-Plan verisi parsel bazlı resmi imar planıdır. TUCBS ÇDP 1/100.000 üst plan kararıdır;
          ikisi çelişiyorsa belediyeden yazılı imar durumu belgesi alın.
        </p>
      </div>
    </Section>
  );
}
