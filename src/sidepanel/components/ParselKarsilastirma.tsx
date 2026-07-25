/**
 * ParselKarsilastirma — Sprint 3 M2
 *
 * 4 parseli yan yana karşılaştırma paneli:
 *   - Favorilerden seçim veya aktif parsel ekleme
 *   - Fiyat tahmini (TL/m², toplam)
 *   - İmar (TAKS, KAKS, emsal, kat)
 *   - Risk skoru, AI skoru
 *   - Alan, nitelik
 *   - Sütun renk kodlaması (en iyi = yeşil vurgu)
 *
 * Mevcut KarsilastirmaPanel (ilçe TKGM analiz) değiştirilmez —
 * bu bileşen parsel detayı seviyesinde çalışır.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Plus, X, Trophy, TrendingUp, AlertTriangle, MapPin,
  Layers, BarChart2, Maximize2,
} from "lucide-react";
import { db, type FavoriParsel } from "../../lib/db";
import { fiyatTahminEt, type FiyatTahmini } from "../../lib/fiyat-tahmin";
import type { Parsel } from "../../types/tkgm";

// Renk paleti — 4 slot
const SLOT_RENKLER = [
  { text: "text-violet-700", bg: "bg-violet-50", border: "border-violet-300", ring: "ring-violet-400", dot: "bg-violet-500" },
  { text: "text-teal-700",   bg: "bg-teal-50",   border: "border-teal-300",   ring: "ring-teal-400",   dot: "bg-teal-500"   },
  { text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-300", ring: "ring-orange-400", dot: "bg-orange-500" },
  { text: "text-pink-700",   bg: "bg-pink-50",   border: "border-pink-300",   ring: "ring-pink-400",   dot: "bg-pink-500"   },
] as const;

const MAKS_SLOT = 4;

// ── Veri tipleri ─────────────────────────────────────────────────

interface SlotVeri {
  parsel: Parsel;
  etiket: string;         // "Ada 123/4" veya özel ad
  favoriId?: number;
  tahmin: FiyatTahmini | null;
  yukleniyor: boolean;
  hata: string | null;
}

// ── Yardımcılar ──────────────────────────────────────────────────

function fmtTL(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}Mr`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}Mn`;
  if (n >= 1_000)         return `${Math.round(n / 1_000)}bin`;
  return `${Math.round(n).toLocaleString("tr-TR")}`;
}

function fmtM2(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)} ha`;
  return `${n.toLocaleString("tr-TR")} m²`;
}

/** Dizi içinde en büyük değerin indeksini döner (eşitlik = tümü). */
function enIyiIndex(dizi: (number | null)[], yuksekIyi = true): number[] {
  const gecerli = dizi.filter((v): v is number => v !== null);
  if (gecerli.length === 0) return [];
  const hedef = yuksekIyi ? Math.max(...gecerli) : Math.min(...gecerli);
  return dizi.reduce<number[]>((acc, v, i) => {
    if (v === hedef) acc.push(i);
    return acc;
  }, []);
}

// ── Metrik Satırı ────────────────────────────────────────────────

interface MetrikSatirProps {
  etiket: string;
  degerler: (string | null)[];
  sayisalDegerler?: (number | null)[];
  yuksekIyi?: boolean;
  vurgu?: boolean;
}

function MetrikSatir({
  etiket, degerler, sayisalDegerler, yuksekIyi = true, vurgu = false,
}: MetrikSatirProps) {
  const enIyiler = sayisalDegerler ? enIyiIndex(sayisalDegerler, yuksekIyi) : [];

  return (
    <tr className={vurgu ? "bg-slate-50 dark:bg-slate-800/50" : ""}>
      <td className="py-1.5 pr-2 text-3xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap w-20 align-top">
        {etiket}
      </td>
      {degerler.map((d, i) => (
        <td key={i} className="py-1.5 px-1 text-center align-top">
          {d === null ? (
            <span className="text-3xs text-slate-300">—</span>
          ) : (
            <span className={`text-2xs tabular-nums font-medium ${
              enIyiler.includes(i)
                ? "text-emerald-700 dark:text-emerald-400 font-semibold"
                : "text-slate-700 dark:text-slate-200"
            }`}>
              {enIyiler.includes(i) && <Trophy className="inline h-2.5 w-2.5 mb-0.5 mr-0.5 text-emerald-500" />}
              {d}
            </span>
          )}
        </td>
      ))}
      {/* Boş sütunlar doldurucu */}
      {Array.from({ length: MAKS_SLOT - degerler.length }).map((_, i) => (
        <td key={`empty-${i}`} className="py-1.5 px-1" />
      ))}
    </tr>
  );
}

// ── Slot Başlık ──────────────────────────────────────────────────

function SlotBaslik({
  slot, index, onSil,
}: {
  slot: SlotVeri;
  index: number;
  onSil: (index: number) => void;
}) {
  const renk = SLOT_RENKLER[index]!;
  return (
    <th className="pb-2 px-1 text-center">
      <div className={`rounded-lg px-1.5 py-1 ${renk.bg} border ${renk.border}`}>
        <div className="flex items-center justify-between gap-1">
          <span className={`h-2 w-2 rounded-full shrink-0 ${renk.dot}`} />
          <span className={`text-3xs font-bold ${renk.text} truncate flex-1 text-left`}>
            {slot.etiket}
          </span>
          <button
            type="button"
            onClick={() => onSil(index)}
            className="text-slate-400 hover:text-slate-600 shrink-0"
            aria-label="Çıkar"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <div className="text-3xs text-slate-500 mt-0.5 truncate text-left">
          {slot.parsel.mahalleAd ?? ""} · {slot.parsel.ilceAd ?? ""}
        </div>
      </div>
    </th>
  );
}

// ── Favori Seçici ────────────────────────────────────────────────

function FavoriSecici({
  mevcutParseller,
  onSec,
  onKapat,
}: {
  mevcutParseller: Parsel[];
  onSec: (favori: FavoriParsel) => void;
  onKapat: () => void;
}) {
  const [favoriler, setFavoriler] = useState<FavoriParsel[]>([]);
  const [arama, setArama] = useState("");

  useEffect(() => {
    db.favoriler.orderBy("eklenmeTarihi").reverse().limit(50).toArray()
      .then(setFavoriler).catch(() => {});
  }, []);

  const mevcutAdaParseller = new Set(
    mevcutParseller.map((p) => `${p.adaNo}:${p.parselNo}:${p.mahalleKodu ?? 0}`)
  );

  const filtrelenmis = favoriler.filter((f) => {
    const key = `${f.adaNo}:${f.parselNo}:${f.mahalleKodu}`;
    if (mevcutAdaParseller.has(key)) return false;
    if (!arama) return true;
    const ara = arama.toLocaleLowerCase("tr");
    return (
      f.mahalleAd.toLocaleLowerCase("tr").includes(ara) ||
      f.ilceAd.toLocaleLowerCase("tr").includes(ara) ||
      String(f.adaNo).includes(ara) ||
      String(f.parselNo).includes(ara)
    );
  });

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold text-slate-700 dark:text-slate-200">Favori seç</span>
        <button type="button" onClick={onKapat} className="text-slate-400 hover:text-slate-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <input
        type="text"
        placeholder="Mahalle, ilçe veya ada/parsel"
        value={arama}
        onChange={(e) => setArama(e.target.value)}
        className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-2xs dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        autoFocus
      />
      <div className="max-h-48 overflow-y-auto space-y-1">
        {filtrelenmis.length === 0 ? (
          <p className="text-3xs text-slate-400 italic text-center py-2">
            {favoriler.length === 0 ? "Favori yok" : "Eşleşen bulunamadı"}
          </p>
        ) : (
          filtrelenmis.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onSec(f)}
              className="w-full text-left rounded px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              <div className="text-2xs font-medium text-slate-700 dark:text-slate-200">
                Ada {f.adaNo} / Parsel {f.parselNo}
              </div>
              <div className="text-3xs text-slate-500 dark:text-slate-400">
                {f.mahalleAd}, {f.ilceAd} · {f.parsel?.alan ? fmtM2(f.parsel.alan) : "?"}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Ana Bileşen ──────────────────────────────────────────────────

interface Props {
  /** Aktif parsel — otomatik ilk slot olarak eklenir */
  aktifParsel?: Parsel | null;
}

export function ParselKarsilastirma({ aktifParsel }: Props) {
  const [acik, setAcik] = useState(false);
  const [slotlar, setSlotlar] = useState<SlotVeri[]>([]);
  const [seciciAcik, setSeciciAcik] = useState(false);

  // Aktif parsel gelince otomatik ekle
  useEffect(() => {
    if (!aktifParsel) return;
    setSlotlar((mevcut) => {
      const key = `${aktifParsel.adaNo}:${aktifParsel.parselNo}:${aktifParsel.mahalleKodu ?? 0}`;
      if (mevcut.some((s) => `${s.parsel.adaNo}:${s.parsel.parselNo}:${s.parsel.mahalleKodu ?? 0}` === key)) {
        return mevcut;
      }
      const yeni: SlotVeri = {
        parsel: aktifParsel,
        etiket: `Ada ${aktifParsel.adaNo}/${aktifParsel.parselNo}`,
        tahmin: null,
        yukleniyor: false,
        hata: null,
      };
      return [...mevcut.slice(0, MAKS_SLOT - 1), yeni];
    });
  }, [aktifParsel?.adaNo, aktifParsel?.parselNo, aktifParsel?.mahalleKodu]);

  // Slot eklenince fiyat tahmini yükle
  useEffect(() => {
    slotlar.forEach((slot, i) => {
      if (!slot.yukleniyor && slot.tahmin === null && slot.hata === null) {
        setSlotlar((mevcut) => {
          const kopya = [...mevcut];
          if (kopya[i]) kopya[i] = { ...kopya[i]!, yukleniyor: true };
          return kopya;
        });
        fiyatTahminEt(slot.parsel, null, null, null)
          .then((tahmin) => {
            setSlotlar((mevcut) => {
              const kopya = [...mevcut];
              if (kopya[i]) kopya[i] = { ...kopya[i]!, tahmin, yukleniyor: false };
              return kopya;
            });
          })
          .catch((e) => {
            setSlotlar((mevcut) => {
              const kopya = [...mevcut];
              if (kopya[i]) kopya[i] = { ...kopya[i]!, hata: String(e), yukleniyor: false };
              return kopya;
            });
          });
      }
    });
  // Her slot değişiminde kontrol
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotlar.length]);

  function slotEkle(parsel: Parsel, etiket: string, favoriId?: number) {
    if (slotlar.length >= MAKS_SLOT) return;
    const yeni: SlotVeri = { parsel, etiket, favoriId, tahmin: null, yukleniyor: false, hata: null };
    setSlotlar((m) => [...m, yeni]);
  }

  function slotSil(index: number) {
    setSlotlar((m) => m.filter((_, i) => i !== index));
  }

  function favoriSec(f: FavoriParsel) {
    slotEkle(f.parsel, `Ada ${f.adaNo}/${f.parselNo}`, f.id);
    setSeciciAcik(false);
  }

  // Hesaplanan metrik dizileri
  const metrikler = useMemo(() => {
    return slotlar.map((s) => ({
      alan: s.parsel.alan ?? null,
      beklenenM2: s.tahmin?.beklenenPerM2 ?? null,
      altM2: s.tahmin?.altPerM2 ?? null,
      ustM2: s.tahmin?.ustPerM2 ?? null,
      toplamTahmin: (s.tahmin?.beklenenPerM2 && s.parsel.alan)
        ? s.tahmin.beklenenPerM2 * s.parsel.alan
        : null,
      nitelik: s.parsel.nitelik ?? null,
    }));
  }, [slotlar]);

  if (!acik) {
    return (
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="flex w-full items-center justify-center gap-2 rounded border border-dashed border-slate-300 bg-white px-2 py-1.5 text-2xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        Parsel karşılaştırma aç (4'e kadar)
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-700">
        <div className="flex items-center gap-1.5">
          <BarChart2 className="h-3.5 w-3.5 text-violet-600" />
          <span className="text-2xs font-semibold text-slate-700 dark:text-slate-200">
            Parsel Karşılaştırma
          </span>
          <span className="text-3xs text-slate-400">{slotlar.length}/{MAKS_SLOT}</span>
        </div>
        <button
          type="button"
          onClick={() => setAcik(false)}
          className="text-2xs text-slate-400 hover:underline"
        >
          Kapat
        </button>
      </div>

      <div className="p-3">
        {slotlar.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <MapPin className="mb-2 h-6 w-6 text-slate-300" />
            <p className="text-2xs text-slate-500 dark:text-slate-400">
              Parseli otomatik eklendi. Karşılaştırmak için favori ekleyin.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-left">
              <thead>
                <tr>
                  {/* Boş etiket sütunu */}
                  <th className="w-20 pb-2" />
                  {slotlar.map((slot, i) => (
                    <SlotBaslik key={i} slot={slot} index={i} onSil={slotSil} />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {/* Yükleniyor göstergesi */}
                {slotlar.some((s) => s.yukleniyor) && (
                  <tr>
                    <td colSpan={MAKS_SLOT + 1} className="py-1.5 text-center text-3xs italic text-slate-400">
                      Fiyat tahminleri hesaplanıyor…
                    </td>
                  </tr>
                )}

                {/* Alan */}
                <MetrikSatir
                  etiket="Alan"
                  degerler={metrikler.map((m) => m.alan != null ? fmtM2(m.alan) : null)}
                  sayisalDegerler={metrikler.map((m) => m.alan)}
                  yuksekIyi={true}
                />

                {/* Nitelik */}
                <MetrikSatir
                  etiket="Nitelik"
                  degerler={metrikler.map((m) => m.nitelik ?? null)}
                  vurgu={true}
                />

                {/* Beklenen TL/m² */}
                <MetrikSatir
                  etiket="Beklenen ₺/m²"
                  degerler={metrikler.map((m) =>
                    m.beklenenM2 != null ? `${Math.round(m.beklenenM2).toLocaleString("tr-TR")} ₺` : null
                  )}
                  sayisalDegerler={metrikler.map((m) => m.beklenenM2)}
                  yuksekIyi={true}
                />

                {/* Alt bant */}
                <MetrikSatir
                  etiket="Alt Bant"
                  degerler={metrikler.map((m) =>
                    m.altM2 != null ? `${Math.round(m.altM2).toLocaleString("tr-TR")} ₺` : null
                  )}
                  sayisalDegerler={metrikler.map((m) => m.altM2)}
                  yuksekIyi={true}
                  vurgu={true}
                />

                {/* Üst bant */}
                <MetrikSatir
                  etiket="Üst Bant"
                  degerler={metrikler.map((m) =>
                    m.ustM2 != null ? `${Math.round(m.ustM2).toLocaleString("tr-TR")} ₺` : null
                  )}
                  sayisalDegerler={metrikler.map((m) => m.ustM2)}
                  yuksekIyi={true}
                />

                {/* Tahmini toplam değer */}
                <MetrikSatir
                  etiket="Toplam Değer"
                  degerler={metrikler.map((m) =>
                    m.toplamTahmin != null ? `${fmtTL(m.toplamTahmin)} ₺` : null
                  )}
                  sayisalDegerler={metrikler.map((m) => m.toplamTahmin)}
                  yuksekIyi={true}
                  vurgu={true}
                />

                {/* Hata satırı */}
                {slotlar.some((s) => s.hata) && (
                  <tr>
                    <td className="py-1 text-3xs text-slate-500 font-medium">Durum</td>
                    {slotlar.map((s, i) => (
                      <td key={i} className="py-1 px-1 text-center">
                        {s.hata ? (
                          <span className="text-3xs text-red-500 flex items-center justify-center gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" />Hata
                          </span>
                        ) : (
                          <span className="text-3xs text-emerald-500">✓</span>
                        )}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Slot ekle / favori seç */}
        {slotlar.length < MAKS_SLOT && (
          <div className="relative mt-3">
            <button
              type="button"
              onClick={() => setSeciciAcik(!seciciAcik)}
              className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-slate-300 bg-slate-50 px-3 py-1.5 text-2xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
            >
              <Plus className="h-3.5 w-3.5" />
              Favorilerden ekle ({MAKS_SLOT - slotlar.length} slot boş)
            </button>

            {seciciAcik && (
              <div className="absolute bottom-full left-0 right-0 mb-1 z-20">
                <FavoriSecici
                  mevcutParseller={slotlar.map((s) => s.parsel)}
                  onSec={favoriSec}
                  onKapat={() => setSeciciAcik(false)}
                />
              </div>
            )}
          </div>
        )}

        <p className="mt-2 text-3xs italic text-slate-400 text-center">
          Fiyat tahmini model bazlı; resmi değerleme yerine geçmez.
        </p>
      </div>
    </div>
  );
}
