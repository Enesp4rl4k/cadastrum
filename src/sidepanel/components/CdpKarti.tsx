import {
  Map as MapIcon,
  Loader2 as LoaderIcon,
  AlertTriangle as AlertIcon,
  Info as InfoIcon,
} from "lucide-react";
import type { TucbsCdpSonuc } from "../../lib/tucbs";
import { Section } from "../ui/Card";

interface Props {
  veri: TucbsCdpSonuc | null;
  loading: boolean;
}

function kategoriRenkSinifi(kategori: string | undefined): string {
  switch (kategori) {
    case "konut-gelisme":
      return "bg-amber-100 text-amber-900 border-amber-300";
    case "koy-yerlesik":
      return "bg-orange-100 text-orange-900 border-orange-300";
    case "tarim-koruma":
      return "bg-emerald-100 text-emerald-900 border-emerald-300";
    case "sanayi":
      return "bg-violet-100 text-violet-900 border-violet-300";
    case "ticari-turizm":
      return "bg-rose-100 text-rose-900 border-rose-300";
    default:
      return "bg-slate-100 text-slate-800 border-slate-300";
  }
}

export function CdpKarti({ veri, loading }: Props) {
  if (loading) {
    return (
      <Section
        title="Çevre Düzeni Planı (TUCBS)"
        icon={<MapIcon className="h-3.5 w-3.5" />}
        accent="info"
        subtitle={
          <span className="inline-flex items-center gap-1 text-slate-500">
            <LoaderIcon className="h-3 w-3 animate-spin" />
            Üst plan sorgulanıyor…
          </span>
        }
      >
        <p className="text-3xs text-slate-500">
          1/100.000 ölçekli Çevre Düzeni Planı — resmi e-Plan imar planından farklıdır.
        </p>
      </Section>
    );
  }

  if (!veri) return null;

  if (veri.kapsam === "il-eksik") {
    return (
      <Section
        title="Çevre Düzeni Planı (TUCBS)"
        icon={<InfoIcon className="h-3.5 w-3.5" />}
        accent="info"
        subtitle={<span className="text-slate-500">Bu il henüz kapsam dışı</span>}
      >
        <p className="text-3xs text-slate-600">
          {veri.hata ??
            `${veri.il ?? "Bu il"} için TUCBS açık ÇDP servisi henüz yayınlanmıyor. Ankara, İstanbul, Bursa gibi iller şu an listede yok.`}
        </p>
      </Section>
    );
  }

  if (veri.kapsam === "veri-yok" || !veri.araziKullanimi) {
    return (
      <Section
        title="Çevre Düzeni Planı (TUCBS)"
        icon={<AlertIcon className="h-3.5 w-3.5" />}
        accent="warning"
        subtitle={<span className="text-amber-700">Plan verisi bulunamadı</span>}
      >
        <p className="text-3xs text-slate-600">
          {veri.hata ??
            "Bu koordinat için ÇDP katmanında kayıt dönmedi. Parsel sınırı plan poligonu dışında olabilir."}
        </p>
        {veri.bolge && (
          <p className="mt-1 text-3xs text-slate-500">Bölge servisi: {veri.bolge}</p>
        )}
      </Section>
    );
  }

  const arazi = veri.araziKullanimi;
  const ekSinyaller = [
    veri.sitAlani ? "Sit / koruma alanı" : null,
    veri.endustriBolgesi ? "Endüstri / OSB bölgesi" : null,
  ].filter(Boolean);

  return (
    <Section
      title="Çevre Düzeni Planı (TUCBS)"
      icon={<MapIcon className="h-3.5 w-3.5" />}
      accent="info"
      subtitle={
        <span className="text-slate-600">
          {veri.bolge ?? "ÇDP"} · güven %{veri.guvenSkoru}
        </span>
      }
    >
      <div
        className={`rounded-md border px-2.5 py-2 text-xs font-medium ${kategoriRenkSinifi(arazi.kategori)}`}
      >
        {arazi.metin}
      </div>
      <p className="mt-1.5 text-3xs text-slate-600">{arazi.renkEtiket}</p>
      {arazi.eskiMetin && arazi.eskiMetin !== arazi.metin && (
        <p className="mt-1 text-3xs text-slate-500">Eski sınıflandırma: {arazi.eskiMetin}</p>
      )}
      {(veri.il || veri.ilce) && (
        <p className="mt-1 text-3xs text-slate-500">
          Plan kaydı: {[veri.ilce, veri.il].filter(Boolean).join(" / ")}
        </p>
      )}
      {ekSinyaller.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {ekSinyaller.map((s) => (
            <li key={s} className="text-3xs font-medium text-amber-800">
              ⚠ {s}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-3xs italic text-slate-500">
        1/100.000 üst plan kararıdır; parsel bazlı imar planı (e-Plan) değildir. Yatırım öncesi
        belediyeden yazılı imar durumu belgesi alın.
      </p>
    </Section>
  );
}
