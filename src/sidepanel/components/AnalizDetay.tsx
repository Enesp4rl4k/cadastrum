/**
 * AnalizDetay — Çevre POI, yol erişimi, altyapı, kırsal analiz, adres
 * + Skor bileşen detayları (lojistik/fiziksel/erişim/altyapı açıklamaları)
 *
 * AnalizPanel'den çıkarıldı. Yalnızca cevre/egim/skorlar/adres verisi alır.
 */
import { memo } from "react";
import type { CevreAnalizi } from "../../lib/osm";
import type { EgimAnalizi } from "../../lib/elevation";
import type { TumSkorlar } from "../../lib/skor";

interface Props {
  cevre: CevreAnalizi | null;
  egim: EgimAnalizi | null;
  skorlar: TumSkorlar;
  adres: string | null;
  nitelik: string;
}

export const AnalizDetay = memo(function AnalizDetay({
  cevre,
  egim,
  skorlar,
  adres,
  nitelik,
}: Props) {
  return (
    <div className="space-y-2.5">
      {/* ── Skor detayları ──────────────────────────────────────── */}
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

      {/* ── OSM verisi uyarıları ────────────────────────────────── */}
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

      {/* ── Çevre POI ──────────────────────────────────────────── */}
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
              v={cevre.altyapi.elektrikHattiM != null
                ? `${Math.round(cevre.altyapi.elektrikHattiM)} m`
                : "2km içinde yok"}
            />
            <KV
              k="Su hattı"
              v={cevre.altyapi.suBoruM != null
                ? `${Math.round(cevre.altyapi.suBoruM)} m`
                : "OSM'de işaretli yok"}
            />
            <KV
              k="Demiryolu"
              v={cevre.altyapi.demiryoluM != null
                ? `${Math.round(cevre.altyapi.demiryoluM)} m`
                : "2km içinde yok"}
            />
          </Section>

          {/tarla|bahçe|bahce|zeytinlik|bağ\b|bag\b/i.test(nitelik) && (
            <Section title="🌾 Kırsal Analiz">
              <KV
                k="Kadastral Yol"
                v={cevre.kirsal.yolaCepheM != null
                  ? cevre.kirsal.yolaCepheM <= 15 ? "Yola cephe" : `${Math.round(cevre.kirsal.yolaCepheM)} m`
                  : "OSM'de işaretli değil"}
              />
              <KV
                k="Su Kaynağı"
                v={cevre.kirsal.suKaynagiM != null
                  ? `${Math.round(cevre.kirsal.suKaynagiM)} m`
                  : "1km içinde yok"}
              />
              <KV
                k="Köy Merkezi"
                v={cevre.kirsal.koyMerkeziM != null
                  ? `${Math.round(cevre.kirsal.koyMerkeziM)} m`
                  : "3km içinde yok"}
              />
            </Section>
          )}
        </>
      )}

      {/* ── Adres ──────────────────────────────────────────────── */}
      {adres && (
        <Section title="📍 Adres (Nominatim)">
          <p className="text-[11px]">{adres}</p>
        </Section>
      )}
    </div>
  );
});

// ─── Yardımcı bileşenler ─────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-card transition-shadow hover:shadow-card-hover">
      <header className="flex items-center gap-2 px-3 pt-2 pb-1">
        <h4 className="text-2xs font-semibold text-slate-700">{title}</h4>
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

function Poi({
  label,
  sayi,
  enYakinM,
}: {
  label: string;
  sayi: number;
  enYakinM?: number | null;
}) {
  const farUstu = sayi === 0 && enYakinM != null;

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
          <div className="text-sm font-bold leading-none">
            {(enYakinM / 1000).toFixed(1)}<span className="text-[8px] font-normal">km</span>
          </div>
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
