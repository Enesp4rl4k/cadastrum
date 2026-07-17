/**
 * BağımsızBölüm Kartı — TKGM Kat Mülkiyeti Verisi
 *
 * TKGM API: /parsel/blok/{mah}/{ada}/{parsel} → Blok listesi
 *           /parsel/bagimsizbolum/{mah}/{ada}/{parsel}/{blok} → BB listesi
 *
 * Yalnızca apartman/mesken/bina nitelikli parsellerde gösterilir.
 * Kullanıcı bloka tıklayınca o bloğun BB listesi lazy açılır.
 */

import { useEffect, useState } from "react";
import {
  Building2 as BuildingIcon,
  ChevronDown as ChevronIcon,
  Loader2 as LoaderIcon,
  AlertTriangle as AlertIcon,
  Home as HomeIcon,
  Layers as LayersIcon,
} from "lucide-react";
import type { Parsel, Blok, BagimsizBolum } from "../../types/tkgm";
import { getParselBlokListesi, getBagimsizBolumListesi } from "../../lib/tkgm-api";
import { Section } from "../ui/Card";

interface Props {
  parsel: Parsel;
}

/** Parsel niteliği kat mülkiyeti bilgisine değer mi? */
function nitelikKatMulkiyetiGoster(nitelik: string): boolean {
  return /apartman|mesken|bina|konut|daire|villa|residans|ticari|plaza|ofis|is merkezi|iş merkezi/i.test(
    nitelik,
  );
}

// ─── Bağımsız Bölüm Satırı ────────────────────────────────────────────────────

function BBSatiri({ bb }: { bb: BagimsizBolum }) {
  const durumRenk =
    bb.durum === "Aktif"
      ? "text-emerald-600"
      : bb.durum === "Pasif"
        ? "text-red-500"
        : "text-slate-500";

  return (
    <div className="flex items-center gap-2 py-1 border-b border-slate-100 last:border-0 text-2xs">
      <span className="w-6 text-center font-mono text-slate-500">{bb.no}</span>
      <span className="w-10 text-slate-600">{bb.kat || "—"}</span>
      <span className="flex-1 text-slate-700 truncate">{bb.nitelik || bb.tip || "—"}</span>
      <span className={`shrink-0 font-medium ${durumRenk}`}>{bb.durum || "—"}</span>
    </div>
  );
}

// ─── Blok Satırı ─────────────────────────────────────────────────────────────

function BlokSatiri({
  blok,
  parsel,
}: {
  blok: Blok;
  parsel: Parsel;
}) {
  const [acik, setAcik] = useState(false);
  const [bbListesi, setBbListesi] = useState<BagimsizBolum[]>([]);
  const [loading, setLoading] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function bbYukle() {
    if (bbListesi.length > 0) return; // zaten yüklendi
    if (!parsel.mahalleKodu || !parsel.adaNo || !parsel.parselNo) return;
    setLoading(true);
    setHata(null);
    try {
      const liste = await getBagimsizBolumListesi(
        parsel.mahalleKodu,
        parsel.adaNo,
        parsel.parselNo,
        blok.blok,
      );
      setBbListesi(liste);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Bağımsız bölüm listesi alınamadı");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const yeniAcik = !acik;
    setAcik(yeniAcik);
    if (yeniAcik && bbListesi.length === 0 && !loading) {
      void bbYukle();
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      {/* Blok başlık satırı */}
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-2 px-2.5 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <LayersIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className="flex-1 text-xs font-semibold text-slate-700">
          Blok {blok.blok || "–"}
        </span>
        <span className="text-2xs text-slate-500 tabular-nums">
          {blok.bagimsizBolumSayisi} BB
        </span>
        {blok.zeminKmdurum && (
          <span className="text-2xs text-slate-400">· {blok.zeminKmdurum}</span>
        )}
        <ChevronIcon
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
            acik ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Bağımsız bölüm listesi */}
      {acik && (
        <div className="px-2.5 py-1.5">
          {loading && (
            <div className="flex items-center gap-1.5 py-2 text-2xs text-slate-500">
              <LoaderIcon className="h-3 w-3 animate-spin" />
              Bağımsız bölümler yükleniyor…
            </div>
          )}
          {hata && (
            <div className="flex items-center gap-1.5 py-2 text-2xs text-red-600">
              <AlertIcon className="h-3 w-3 shrink-0" />
              {hata}
            </div>
          )}
          {!loading && !hata && bbListesi.length === 0 && (
            <div className="py-2 text-2xs text-slate-400 italic">
              Bu blokta bağımsız bölüm kaydı bulunamadı.
            </div>
          )}
          {bbListesi.length > 0 && (
            <div>
              {/* Tablo başlığı */}
              <div className="flex items-center gap-2 pb-1 border-b border-slate-200 text-3xs font-semibold text-slate-400 uppercase tracking-wide">
                <span className="w-6 text-center">No</span>
                <span className="w-10">Kat</span>
                <span className="flex-1">Nitelik</span>
                <span className="shrink-0">Durum</span>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {bbListesi.map((bb, i) => (
                  <BBSatiri key={`${bb.blok}-${bb.no}-${i}`} bb={bb} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

export function BagimsizBolumKarti({ parsel }: Props) {
  const [bloklar, setBloklar] = useState<Blok[]>([]);
  const [loading, setLoading] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [yuklendi, setYuklendi] = useState(false);

  // Nitelik uygun değilse bileşeni gizle
  if (!nitelikKatMulkiyetiGoster(parsel.nitelik)) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    setBloklar([]);
    setHata(null);
    setYuklendi(false);
  }, [parsel.adaNo, parsel.parselNo, parsel.mahalleKodu]);

  async function bloklariYukle() {
    if (!parsel.mahalleKodu || !parsel.adaNo || !parsel.parselNo) {
      setHata("Parsel kodu eksik — blok sorgusu yapılamıyor.");
      return;
    }
    setLoading(true);
    setHata(null);
    try {
      const liste = await getParselBlokListesi(
        parsel.mahalleKodu,
        parsel.adaNo,
        parsel.parselNo,
      );
      setBloklar(liste);
      setYuklendi(true);
      if (liste.length === 0) {
        setHata("Bu parselde kayıtlı blok/kat mülkiyeti bulunamadı.");
      }
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Blok listesi alınamadı");
    } finally {
      setLoading(false);
    }
  }

  const toplamBB = bloklar.reduce((s, b) => s + b.bagimsizBolumSayisi, 0);

  return (
    <Section
      title="Kat Mülkiyeti"
      icon={<BuildingIcon className="h-3.5 w-3.5" />}
      accent="info"
      subtitle={
        yuklendi ? (
          <span className="text-slate-500">
            {bloklar.length} blok · {toplamBB} bağımsız bölüm
          </span>
        ) : (
          <span className="text-slate-400">TKGM kat mülkiyeti verisi</span>
        )
      }
    >
      <div className="space-y-2">
        {/* Yükle butonu — henüz yüklenmediyse */}
        {!yuklendi && !loading && (
          <button
            type="button"
            onClick={() => void bloklariYukle()}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <HomeIcon className="h-3.5 w-3.5" />
            Blok &amp; Bağımsız Bölüm Verisi Yükle
          </button>
        )}

        {/* Yükleniyor */}
        {loading && (
          <div className="flex items-center gap-1.5 py-3 justify-center text-2xs text-slate-500">
            <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
            TKGM blok listesi alınıyor…
          </div>
        )}

        {/* Hata */}
        {hata && (
          <div className="flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-2 text-2xs text-amber-700">
            <AlertIcon className="h-3 w-3 shrink-0" />
            {hata}
          </div>
        )}

        {/* Blok listesi */}
        {yuklendi && bloklar.length > 0 && (
          <div className="space-y-1.5">
            {bloklar.map((blok, i) => (
              <BlokSatiri key={`${blok.blok}-${i}`} blok={blok} parsel={parsel} />
            ))}
          </div>
        )}

        {/* Yasal uyarı */}
        {yuklendi && (
          <p className="text-3xs italic text-slate-400">
            Kaynak: TKGM MEGSİS · Bağımsız bölüm sayısı tapu sicil kaydına göre değişebilir.
          </p>
        )}
      </div>
    </Section>
  );
}
