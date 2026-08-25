/**
 * Gerçek Fiyat Giriş Kartı — kullanıcı gerçek satış/alış fiyatını girer.
 *
 * Tetikleme: FiyatTahminKarti'nda "Gerçek fiyatı gir" butonu.
 * Form basit: fiyat + alan + işlem tipi + opsiyonel not.
 * Heuristic tahminle karşılaştırma sonucu gösterilir.
 */

import { useState, type FormEvent } from "react";
import { CheckCircle, XCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  gercekFiyatKaydet,
  tahminGercekKarsilastir,
  type GercekFiyatGiris,
} from "../../lib/gercek-fiyat";
import type { Parsel } from "../../types/tkgm";

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface Props {
  parsel: Parsel;
  /** Heuristic motor tahmini TL/m² (varsa, karşılaştırma için) */
  heuristicTahminPerM2: number | null;
  onKaydet?: (gercekPerM2: number) => void;
  onIptal?: () => void;
}

type Durum = "giriş" | "kaydediliyor" | "tamam" | "hata";

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function fmtTL(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M₺`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)} B₺`;
  return `${n} ₺`;
}

// ─── Bileşen ──────────────────────────────────────────────────────────────────

export function GercekFiyatGirisKarti({
  parsel,
  heuristicTahminPerM2,
  onKaydet,
  onIptal,
}: Props) {
  const [durum, setDurum] = useState<Durum>("giriş");
  const [hata, setHata] = useState<string | null>(null);

  // Form state
  const [fiyatTL, setFiyatTL] = useState("");
  const [alanM2, setAlanM2] = useState(
    parsel.alan != null ? String(Math.round(parsel.alan)) : "",
  );
  const [tip, setTip] = useState<GercekFiyatGiris["tip"]>("satin-alindi");
  const [not, setNot] = useState("");
  const [backendGonder, setBackendGonder] = useState(true);

  // Gerçek per m² hesapla (anlık önizleme)
  const fiyatNum = Number(fiyatTL.replace(/\D/g, ""));
  const alanNum = Number(alanM2);
  const gercekPerM2 = fiyatNum > 0 && alanNum > 0 ? Math.round(fiyatNum / alanNum) : null;

  // Karşılaştırma (preview)
  const karsilastirma = gercekPerM2 != null && heuristicTahminPerM2 != null
    ? tahminGercekKarsilastir(gercekPerM2, heuristicTahminPerM2)
    : null;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!fiyatNum || !alanNum) {
      setHata("Fiyat ve alan zorunlu");
      return;
    }
    if (fiyatNum < 1000) {
      setHata("Fiyat çok düşük — TL cinsinden girin");
      return;
    }

    setDurum("kaydediliyor");
    setHata(null);

    try {
      const kayit = await gercekFiyatKaydet(parsel, {
        gercekFiyatTL: fiyatNum,
        alanM2: alanNum,
        tip,
        tahminGorulduMu: heuristicTahminPerM2 != null,
        heuristicTahminPerM2,
        not: not.trim() || undefined,
        backendGonder,
      });

      setDurum("tamam");
      onKaydet?.(kayit.gercekPerM2);
    } catch (e) {
      setDurum("hata");
      setHata(String(e));
    }
  };

  // ─── Tamam ekranı ─────────────────────────────────────────────────────────

  if (durum === "tamam" && gercekPerM2 != null) {
    const k = karsilastirma ?? tahminGercekKarsilastir(gercekPerM2, heuristicTahminPerM2);
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950">
        <div className="mb-2 flex items-center gap-2">
          <CheckCircle aria-hidden="true" className="h-5 w-5 text-emerald-600" />
          <span className="font-semibold text-emerald-800 dark:text-emerald-200">
            Fiyat kaydedildi
          </span>
        </div>

        <div className="space-y-1 text-sm">
          <p className="text-emerald-700 dark:text-emerald-300">
            Gerçek fiyat: <strong>{fmtTL(fiyatNum)}</strong>
            {" "}— <strong>{gercekPerM2.toLocaleString("tr-TR")} ₺/m²</strong>
          </p>

          {k.hataorani != null && (
            <div className={`flex items-center gap-1.5 text-xs font-medium ${
              k.yon === "dogru" ? "text-emerald-600" :
              k.yon === "fazla" ? "text-amber-600" : "text-blue-600"
            }`}>
              {k.yon === "fazla" ? (
                <TrendingUp aria-hidden="true" className="h-3.5 w-3.5" />
              ) : k.yon === "eksik" ? (
                <TrendingDown aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <Minus aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {k.aciklama}
            </div>
          )}

          {backendGonder && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Anonim olarak paylaşıldı — model iyileştirmesine katkı sağladı.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onIptal}
          className="mt-3 text-xs text-emerald-700 underline hover:no-underline dark:text-emerald-300"
        >
          Kapat
        </button>
      </div>
    );
  }

  // ─── Giriş formu ──────────────────────────────────────────────────────────

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h4 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
        Gerçek Fiyatı Gir
      </h4>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Satın aldığınız veya sattığınız gerçek fiyatı girerek modelin daha iyi
        kalibre olmasına katkı sağlayın.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Fiyat */}
        <div>
          <label htmlFor="gercek-fiyat-tl" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Gerçek Satış Fiyatı (₺) *
          </label>
          <input
            id="gercek-fiyat-tl"
            type="text"
            inputMode="numeric"
            placeholder="ör: 1500000"
            value={fiyatTL}
            onChange={(e) => setFiyatTL(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            required
          />
          {fiyatNum > 0 && (
            <p className="mt-0.5 text-xs text-slate-500">{fmtTL(fiyatNum)}</p>
          )}
        </div>

        {/* Alan */}
        <div>
          <label htmlFor="gercek-fiyat-alan" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Parsel Alanı (m²) *
          </label>
          <input
            id="gercek-fiyat-alan"
            type="number"
            min="1"
            step="1"
            placeholder="ör: 1200"
            value={alanM2}
            onChange={(e) => setAlanM2(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            required
          />
        </div>

        {/* İşlem tipi */}
        <div>
          <label htmlFor="gercek-fiyat-tip" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            İşlem Tipi
          </label>
          <select
            id="gercek-fiyat-tip"
            value={tip}
            onChange={(e) => setTip(e.target.value as GercekFiyatGiris["tip"])}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="satin-alindi">Satın Aldım</option>
            <option value="satildi">Sattım</option>
            <option value="bilgi">Bilgi Amaçlı</option>
          </select>
        </div>

        {/* Anlık karşılaştırma */}
        {karsilastirma && (
          <div className={`rounded-md px-3 py-2 text-xs ${
            karsilastirma.yon === "dogru" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" :
            karsilastirma.yon === "fazla" ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" :
            "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
          }`}>
            <strong>Tahmin vs Gerçek:</strong> {karsilastirma.aciklama}
            <span className="block text-slate-500 dark:text-slate-400">
              Gerçek: {gercekPerM2?.toLocaleString("tr-TR")} ₺/m²
              {" vs "}
              Tahmin: {heuristicTahminPerM2?.toLocaleString("tr-TR")} ₺/m²
            </span>
          </div>
        )}

        {/* Opsiyonel not */}
        <div>
          <label htmlFor="gercek-fiyat-not" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Not (opsiyonel)
          </label>
          <input
            id="gercek-fiyat-not"
            type="text"
            maxLength={200}
            placeholder="ör: köşe parsel, imar çıktı"
            value={not}
            onChange={(e) => setNot(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        {/* Paylaşım onayı */}
        <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={backendGonder}
            onChange={(e) => setBackendGonder(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
          />
          <span>
            Anonim olarak paylaş (mahalle bazlı, parsel no gönderilmez) — modeli
            iyileştirmeye katkı sağlar.
          </span>
        </label>

        {/* Hata mesajı */}
        {hata && (
          <div className="flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            <XCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            {hata}
          </div>
        )}

        {/* Butonlar */}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={durum === "kaydediliyor" || !fiyatNum || !alanNum}
            className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {durum === "kaydediliyor" ? "Kaydediliyor…" : "Kaydet"}
          </button>
          {onIptal && (
            <button
              type="button"
              onClick={onIptal}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              İptal
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
