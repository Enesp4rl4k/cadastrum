/**
 * Hızlı İmar Prompt
 *
 * e-Plan otomatik sorgu boş döndüğünde fiyat tahmini ÖNCE imar bilgisi ister.
 * Tek dropdown (kullanım kararı) yeterli — fiyat çarpanı için bu ana sinyal.
 * Detay (TAKS/Emsal/Kat) opsiyonel; mevcut ManuelImarKarti'ndan girilir.
 *
 * "Bilmiyorum, devam et" linki TKGM nitelik (Tarla/Arsa) fallback'i ile
 * düşük güvenli fiyat hesaplamasına izin verir — kullanıcı engellenmez.
 */

import { useState } from "react";
import { AlertTriangle as AlertIcon, Loader2 as LoaderIcon } from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import { Card } from "../ui/Card";
import { manuelImarKaydet } from "../../lib/manuel-veri";
import { KULLANIM_SECENEKLER } from "./ManuelImarKarti";

interface Props {
  parsel: Parsel;
  onKaydedildi: () => void;
  onSkip: () => void;
  /** e-Plan otomatik sorgu durumu — rate-limit / boş / ağ ayrımı */
  ePlanMesaj?: string | null;
}

export function HizliImarPrompt({ parsel, onKaydedildi, onSkip, ePlanMesaj }: Props) {
  const [kullanim, setKullanim] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  async function kaydet() {
    if (!kullanim) return;
    setKaydediliyor(true);
    try {
      await manuelImarKaydet(parsel, {
        kullanimKarari: kullanim,
        kaynak: "Hızlı imar girişi",
      });
      onKaydedildi();
    } finally {
      setKaydediliyor(false);
    }
  }

  return (
    <Card accent="warning">
      <div className="space-y-2.5 px-3 py-3">
        <div className="flex items-start gap-2">
          <AlertIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <div>
            <div className="text-xs font-semibold text-slate-800">
              İmar bilgisi gerekli
            </div>
            <div className="mt-0.5 text-2xs leading-relaxed text-slate-600">
              {ePlanMesaj ??
                "e-Plan otomatik sorgu sonuç vermedi. Doğru fiyat tahmini için arsanın kullanım kararını seçin — imar fiyatı %20–%80 etkiler."}
            </div>
          </div>
        </div>

        <label className="block">
          <span className="block text-2xs font-medium text-slate-700">
            Kullanım kararı
          </span>
          <select
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            value={kullanim}
            onChange={(e) => setKullanim(e.target.value)}
            disabled={kaydediliyor}
          >
            <option value="">— Seçin —</option>
            {KULLANIM_SECENEKLER.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={onSkip}
            disabled={kaydediliyor}
            className="text-2xs text-slate-500 underline hover:text-slate-700 disabled:opacity-50"
          >
            Bilmiyorum, devam et
          </button>
          <button
            type="button"
            onClick={kaydet}
            disabled={!kullanim || kaydediliyor}
            className="inline-flex items-center gap-1.5 rounded bg-amber-600 px-3 py-1.5 text-2xs font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {kaydediliyor && <LoaderIcon className="h-3 w-3 animate-spin" />}
            Kaydet ve fiyatı hesapla
          </button>
        </div>

        <div className="text-[10px] text-slate-400">
          TAKS / Emsal / Kat detayı için: aşağıdaki "İmar & Manuel Veri"
          grubunu açıp tam form girişi yapabilirsin.
        </div>
      </div>
    </Card>
  );
}
