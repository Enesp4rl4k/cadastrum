/**
 * Altyapı Mesafe Kartı — OSB, havalimanı, liman, nüfus yoğunluğu
 *
 * Tüm veriler statik dataset'lerden (sıfır API çağrısı):
 *   - OSBLAR       → src/lib/data/osblar.ts
 *   - HAVALIMANLARITÜMÜ → src/lib/data/havalimanları.ts
 *   - LIMANLAR     → src/lib/data/limanlar.ts
 *   - IL_NUFUS_YOGUNLUGU → src/lib/data/il-nufus.ts
 *
 * Mesafe hesabı: Haversine (src/lib/analiz.ts → haversineM)
 */
import {
  Factory as FactoryIcon,
  Plane as PlaneIcon,
  Anchor as AnchorIcon,
  Users as UsersIcon,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { useState } from "react";
import type { Parsel } from "../../types/tkgm";
import { haversineM } from "../../lib/analiz";
import { OSBLAR } from "../../lib/data/osblar";
import { HAVALIMANLARITÜMÜ } from "../../lib/data/havalimanları";
import { LIMANLAR } from "../../lib/data/limanlar";
import { IL_NUFUS_YOGUNLUGU } from "../../lib/data/il-nufus";
import { normalizeYerAdi } from "../../lib/tkgm-api";
import { Section } from "../ui/Card";

interface Nokta {
  ad: string;
  il: string;
  lat: number;
  lng: number;
}

interface YakinSonuc {
  ad: string;
  il: string;
  kmMesafe: number;
}

function enYakin(noktalar: ReadonlyArray<Nokta>, lat: number, lng: number): YakinSonuc | null {
  if (!noktalar.length || !lat || !lng) return null;
  let enIyi: YakinSonuc | null = null;
  for (const n of noktalar) {
    const m = haversineM(lat, lng, n.lat, n.lng);
    const km = m / 1000;
    if (!enIyi || km < enIyi.kmMesafe) {
      enIyi = { ad: n.ad, il: n.il, kmMesafe: Math.round(km * 10) / 10 };
    }
  }
  return enIyi;
}

function kmEtiket(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function mesafeRenk(km: number, esikler: [number, number]): string {
  if (km <= esikler[0]) return "text-emerald-700";
  if (km <= esikler[1]) return "text-amber-700";
  return "text-slate-500";
}

function nufusYogKategori(yogunluk: number): { etiket: string; renk: string; aciklama: string } {
  if (yogunluk >= 500)
    return { etiket: "Çok yoğun", renk: "text-emerald-700", aciklama: "Yüksek talep baskısı, likit piyasa" };
  if (yogunluk >= 150)
    return { etiket: "Yoğun", renk: "text-emerald-600", aciklama: "Aktif emlak piyasası" };
  if (yogunluk >= 60)
    return { etiket: "Orta", renk: "text-amber-700", aciklama: "Orta düzey altyapı ve talep" };
  if (yogunluk >= 20)
    return { etiket: "Seyrek", renk: "text-slate-600", aciklama: "Düşük talep, uzun likidite süresi" };
  return { etiket: "Çok seyrek", renk: "text-slate-500", aciklama: "Kırsal — piyasa derinliği düşük" };
}

interface Props {
  parsel: Parsel;
}

export function AltyapiMesafeKarti({ parsel }: Props) {
  const [acik, setAcik] = useState(false);

  const { lat, lng } = parsel.merkezNokta;
  if (!lat || !lng) return null;

  const osb = enYakin(OSBLAR, lat, lng);
  const havalimanı = enYakin(HAVALIMANLARITÜMÜ, lat, lng);
  const liman = enYakin(LIMANLAR, lat, lng);

  const ilNorm = normalizeYerAdi(parsel.ilAd ?? "");
  const nufusYog = IL_NUFUS_YOGUNLUGU[ilNorm] ?? null;
  const nufusKat = nufusYog != null ? nufusYogKategori(nufusYog) : null;

  return (
    <Section
      title="Altyapı & Konum Değeri"
      icon={<FactoryIcon className="h-3.5 w-3.5" />}
      accent="info"
    >
      <div className="space-y-2 px-1 pb-1">
        {/* Nüfus yoğunluğu — en üstte çünkü piyasa likiditesini anlatıyor */}
        {nufusKat && nufusYog != null && (
          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50/80 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex items-center gap-2">
              <UsersIcon className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
              <div>
                <div className="text-2xs font-medium text-slate-700 dark:text-slate-300">
                  Nüfus Yoğunluğu
                </div>
                <div className="text-3xs text-slate-500 dark:text-slate-400">
                  {nufusKat.aciklama}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-2xs font-semibold tabular-nums ${nufusKat.renk}`}>
                {nufusYog.toLocaleString("tr-TR")} kişi/km²
              </div>
              <div className={`text-3xs font-medium ${nufusKat.renk}`}>
                {nufusKat.etiket}
              </div>
            </div>
          </div>
        )}

        {/* OSB mesafesi */}
        {osb && (
          <MesafeRow
            icon={<FactoryIcon className="h-3.5 w-3.5 text-orange-600" />}
            baslik="En Yakın OSB"
            ad={osb.ad}
            il={osb.il}
            km={osb.kmMesafe}
            esikler={[30, 80]}
            aciklama={osb.kmMesafe <= 30
              ? "Sanayi yakınlığı — lojistik ve işgücü avantajı"
              : osb.kmMesafe <= 80
              ? "Orta mesafe — ulaşılabilir sanayi bölgesi"
              : "Uzak sanayi — sanayiye yönelik değerleme düşük"
            }
          />
        )}

        {/* Havalimanı mesafesi */}
        {havalimanı && (
          <MesafeRow
            icon={<PlaneIcon className="h-3.5 w-3.5 text-sky-600" />}
            baslik="En Yakın Havalimanı"
            ad={havalimanı.ad}
            il={havalimanı.il}
            km={havalimanı.kmMesafe}
            esikler={[20, 60]}
            aciklama={havalimanı.kmMesafe <= 20
              ? "Havalimanına çok yakın — turizm ve lojistik premium"
              : havalimanı.kmMesafe <= 60
              ? "Erişilebilir havalimanı"
              : "Havalimanına uzak"
            }
          />
        )}

        {/* Liman mesafesi */}
        {liman && (
          <MesafeRow
            icon={<AnchorIcon className="h-3.5 w-3.5 text-blue-700" />}
            baslik="En Yakın Liman"
            ad={liman.ad}
            il={liman.il}
            km={liman.kmMesafe}
            esikler={[20, 80]}
            aciklama={liman.kmMesafe <= 20
              ? "Liman yakınlığı — ihracat/ithalat lojistik premium"
              : liman.kmMesafe <= 80
              ? "Orta mesafe liman erişimi"
              : "Limana uzak — deniz yolu dezavantajı"
            }
          />
        )}

        {/* Detay toggle — diğer yakın noktalar */}
        <button
          type="button"
          onClick={() => setAcik((v) => !v)}
          className="flex w-full items-center justify-between rounded border border-slate-200 bg-white px-2 py-1.5 text-3xs font-medium text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <span>Diğer yakın noktalar</span>
          {acik
            ? <ChevronDownIcon className="h-3 w-3" />
            : <ChevronRightIcon className="h-3 w-3" />
          }
        </button>

        {acik && (
          <YakinListesi lat={lat} lng={lng} />
        )}

        <p className="text-[10px] italic text-slate-400 px-0.5">
          Kaynak: OSBÜK, DHMİ, UDHB — statik koordinat dataset'i (±3 km hassasiyet)
        </p>
      </div>
    </Section>
  );
}

function MesafeRow({
  icon,
  baslik,
  ad,
  il,
  km,
  esikler,
  aciklama,
}: {
  icon: React.ReactNode;
  baslik: string;
  ad: string;
  il: string;
  km: number;
  esikler: [number, number];
  aciklama: string;
}) {
  const renk = mesafeRenk(km, esikler);
  return (
    <div className="flex items-start justify-between rounded-md border border-slate-200 bg-slate-50/80 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="flex items-start gap-2 min-w-0">
        <div className="mt-0.5 flex-shrink-0">{icon}</div>
        <div className="min-w-0">
          <div className="text-2xs font-medium text-slate-700 dark:text-slate-300 truncate">
            {baslik}
          </div>
          <div className="text-3xs text-slate-600 dark:text-slate-400 truncate">
            {ad}
            {il && ad !== il ? <span className="text-slate-400"> · {il}</span> : null}
          </div>
          <div className="text-3xs italic text-slate-500 dark:text-slate-400 mt-0.5">
            {aciklama}
          </div>
        </div>
      </div>
      <div className={`ml-2 text-right flex-shrink-0`}>
        <span className={`text-2xs font-bold tabular-nums ${renk}`}>
          {kmEtiket(km)}
        </span>
      </div>
    </div>
  );
}

/** İkincil liste — top-3 yakın OSB/havalimanı/liman */
function YakinListesi({ lat, lng }: { lat: number; lng: number }) {
  const osbTop3 = [...OSBLAR]
    .map((n) => ({ ...n, km: haversineM(lat, lng, n.lat, n.lng) / 1000 }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 3);

  const havTop3 = [...HAVALIMANLARITÜMÜ]
    .map((n) => ({ ...n, km: haversineM(lat, lng, n.lat, n.lng) / 1000 }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 3);

  const limTop3 = [...LIMANLAR]
    .map((n) => ({ ...n, km: haversineM(lat, lng, n.lat, n.lng) / 1000 }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 3);

  return (
    <div className="rounded-md border border-slate-200 bg-white px-2 py-2 text-3xs space-y-2 dark:border-slate-700 dark:bg-slate-800">
      <ListeGrubu baslik="🏭 Yakın OSB'ler" noktalar={osbTop3} />
      <ListeGrubu baslik="✈ Yakın Havalimanları" noktalar={havTop3} />
      <ListeGrubu baslik="⚓ Yakın Limanlar" noktalar={limTop3} />
    </div>
  );
}

function ListeGrubu({
  baslik,
  noktalar,
}: {
  baslik: string;
  noktalar: Array<{ ad: string; il: string; km: number }>;
}) {
  return (
    <div>
      <div className="font-semibold text-slate-600 dark:text-slate-300 mb-1">{baslik}</div>
      <div className="space-y-0.5">
        {noktalar.map((n, i) => (
          <div key={i} className="flex items-baseline justify-between gap-2">
            <span className="text-slate-700 dark:text-slate-300 truncate">
              {n.ad}
              {n.il ? <span className="text-slate-400"> · {n.il}</span> : null}
            </span>
            <span className="tabular-nums font-medium text-slate-500 flex-shrink-0">
              {kmEtiket(n.km)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
