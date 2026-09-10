import type { CevreAnalizi } from "../../lib/osm";
import { Section, KV } from "./AnalizAltComponents";

interface Props {
  cevre: CevreAnalizi;
  nitelik?: string | null;
}

const yolTipleri = ["motorway", "trunk", "primary", "secondary", "tertiary"];
const tipAd: Record<string, string> = {
  motorway: "Otoyol",
  trunk: "Devlet Yolu",
  primary: "Anayol",
  secondary: "İkincil yol",
  tertiary: "Üçüncü yol",
};

export function CevreDetayKarti({ cevre, nitelik }: Props) {
  const yollar = cevre.enYakinlar.filter((p) => yolTipleri.includes(p.tip));
  const isKirsal = nitelik && /tarla|bahçe|bahce|zeytinlik|bağ\b|bag\b/i.test(nitelik);

  return (
    <>
      <Section title="🛣 Yol Analizi (OSM)">
        {yollar.length === 0 ? (
          <div className="text-[10px] text-slate-500 italic">30km içinde önemli yol bulunamadı</div>
        ) : (
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
        )}
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

      {isKirsal && (
        <Section title="🌾 Kırsal Analiz">
          <KV
            k="Kadastral Yol"
            v={
              cevre.kirsal.yolaCepheM != null
                ? cevre.kirsal.yolaCepheM <= 15
                  ? "Yola cephe"
                  : `${Math.round(cevre.kirsal.yolaCepheM)} m`
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
  );
}
