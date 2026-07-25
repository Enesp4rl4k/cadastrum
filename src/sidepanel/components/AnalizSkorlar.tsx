/**
 * AnalizSkorlar — 4 temel skor badge'i (Lojistik, Fiziksel, Erişim, Altyapı)
 * AnalizPanel'den çıkarıldı; kendi render sorumluluğu var.
 */
import { memo } from "react";
import {
  Truck as TruckIcon,
  Mountain as MountainIcon,
  Footprints as FootprintsIcon,
  Zap as ZapIcon,
} from "lucide-react";
import { SkorBadge } from "./SkorBadge";
import type { TumSkorlar } from "../../lib/skor";

interface Props {
  skorlar: TumSkorlar;
  loading: boolean;
  cevre: import("../../lib/osm").CevreAnalizi | null;
  egim: import("../../lib/elevation").EgimAnalizi | null;
  error: string | null;
  onRetry: () => void;
}

export const AnalizSkorlar = memo(function AnalizSkorlar({
  skorlar,
  loading,
  cevre,
  egim,
  error,
  onRetry,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <SkorBadge
        ad="Lojistik"
        icon={<TruckIcon className="h-4 w-4" />}
        skor={skorlar.lojistik}
        loading={loading && !cevre}
        hata={!loading && !cevre && error ? "Veri alınamadı" : null}
        onRetry={onRetry}
        bosAciklama="Bu bölgede yeterli veri tespit edilemedi"
      />
      <SkorBadge
        ad="Fiziksel"
        icon={<MountainIcon className="h-4 w-4" />}
        skor={skorlar.fiziksel}
        loading={loading && !egim}
        hata={!loading && !egim && error ? "Veri alınamadı" : null}
        onRetry={onRetry}
        bosAciklama="Yükseklik/eğim verisi henüz çekilmedi"
      />
      <SkorBadge
        ad="Erişim"
        icon={<FootprintsIcon className="h-4 w-4" />}
        skor={skorlar.erisim}
        loading={loading && !cevre}
        hata={!loading && !cevre && error ? "Veri alınamadı" : null}
        onRetry={onRetry}
        bosAciklama="Bu bölgede yeterli veri tespit edilemedi"
      />
      <SkorBadge
        ad="Altyapı"
        icon={<ZapIcon className="h-4 w-4" />}
        skor={skorlar.altyapi}
        loading={loading && !cevre}
        hata={!loading && !cevre && error ? "Veri alınamadı" : null}
        onRetry={onRetry}
        bosAciklama="Bu bölgede yeterli veri tespit edilemedi"
      />
    </div>
  );
});
