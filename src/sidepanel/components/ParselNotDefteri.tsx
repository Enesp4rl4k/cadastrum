/**
 * N1 — Parsel Not Defteri
 *
 * Favori parseller için tarihli, renk etiketli not sistemi.
 * Tüm veri local IndexedDB (Dexie) — backend yok, offline çalışır.
 *
 * Özellikler:
 * - Not ekleme / düzenleme / silme
 * - 500 karakter sınırı + sayaç
 * - Renk etiketi (izleme durumu: yeşil=al, kırmızı=sat, sarı=bekle, vs.)
 * - Tarih damgası + düzenleme tarihi
 * - Favoriye ekli olmayan parselde "favoriye ekle" yönlendirmesi
 */
import { useState, useRef, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  NotebookPen as NotebookIcon,
  Plus as PlusIcon,
  Trash2 as TrashIcon,
  Pencil as PencilIcon,
  Check as CheckIcon,
  X as XIcon,
  Star as StarIcon,
} from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import { db, type FavoriParsel, type ParselNot, type ParselEtiket } from "../../lib/db";

// ── Etiket tanımları ─────────────────────────────────────────────────────────
const ETİKETLER: Array<{ id: ParselEtiket; label: string; bg: string; text: string; border: string }> = [
  { id: "yesil",  label: "Al",      bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-300 dark:border-emerald-700" },
  { id: "kirmizi",label: "Sat",     bg: "bg-red-100 dark:bg-red-900/40",         text: "text-red-700 dark:text-red-300",         border: "border-red-300 dark:border-red-700" },
  { id: "sari",   label: "Bekle",   bg: "bg-amber-100 dark:bg-amber-900/40",     text: "text-amber-700 dark:text-amber-300",     border: "border-amber-300 dark:border-amber-700" },
  { id: "mavi",   label: "İncele",  bg: "bg-blue-100 dark:bg-blue-900/40",       text: "text-blue-700 dark:text-blue-300",       border: "border-blue-300 dark:border-blue-700" },
  { id: "mor",    label: "Önemli",  bg: "bg-violet-100 dark:bg-violet-900/40",   text: "text-violet-700 dark:text-violet-300",   border: "border-violet-300 dark:border-violet-700" },
  { id: "gri",    label: "Pasif",   bg: "bg-slate-100 dark:bg-slate-700/60",     text: "text-slate-600 dark:text-slate-300",     border: "border-slate-300 dark:border-slate-600" },
];

export function etiketBul(id: ParselEtiket | null | undefined) {
  return ETİKETLER.find((e) => e.id === id) ?? null;
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────
function nanoid8(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

function tarihStr(ts: number): string {
  return new Date(ts).toLocaleString("tr-TR", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const MAX_KARAKTER = 500;

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  parsel: Parsel;
}

// ── Ana bileşen ──────────────────────────────────────────────────────────────
export function ParselNotDefteri({ parsel }: Props) {
  const parselKey = `${parsel.mahalleKodu}-${parsel.adaNo}-${parsel.parselNo}`;

  // Favori kaydını dinle
  const favori = useLiveQuery(
    () => db.favoriler
      .where("[adaNo+parselNo]")
      .equals([parsel.adaNo, parsel.parselNo])
      .first(),
    [parsel.adaNo, parsel.parselNo],
  );

  const [acik, setAcik] = useState(false);
  const [yeniNotMetin, setYeniNotMetin] = useState("");
  const [ekleniyor, setEkleniyor] = useState(false);
  const [duzenleId, setDuzenleId] = useState<string | null>(null);
  const [duzenleMetin, setDuzenleMetin] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Not ekle
  const notEkle = useCallback(async () => {
    const metin = yeniNotMetin.trim();
    if (!metin || !favori?.id) return;

    const yeniNot: ParselNot = {
      id: nanoid8(),
      metin,
      tarih: Date.now(),
    };

    const mevcutNotlar = favori.notlar ?? [];
    await db.favoriler.update(favori.id, {
      notlar: [...mevcutNotlar, yeniNot],
      not: metin, // geriye dönük uyumluluk
    });

    setYeniNotMetin("");
    setEkleniyor(false);
  }, [yeniNotMetin, favori]);

  // Not sil
  const notSil = useCallback(async (notId: string) => {
    if (!favori?.id) return;
    const mevcutNotlar = favori.notlar ?? [];
    await db.favoriler.update(favori.id, {
      notlar: mevcutNotlar.filter((n) => n.id !== notId),
    });
  }, [favori]);

  // Not düzenle — kaydet
  const duzenleKaydet = useCallback(async () => {
    if (!favori?.id || !duzenleId) return;
    const metin = duzenleMetin.trim();
    if (!metin) return;

    const mevcutNotlar = favori.notlar ?? [];
    await db.favoriler.update(favori.id, {
      notlar: mevcutNotlar.map((n) =>
        n.id === duzenleId ? { ...n, metin, duzenlemeTarihi: Date.now() } : n,
      ),
      not: metin,
    });
    setDuzenleId(null);
    setDuzenleMetin("");
  }, [favori, duzenleId, duzenleMetin]);

  // Etiket değiştir
  const etiketDegistir = useCallback(async (etiket: ParselEtiket | null) => {
    if (!favori?.id) return;
    await db.favoriler.update(favori.id, { etiket });
  }, [favori]);

  // Favoriye ekle yönlendirmesi
  if (favori === undefined) {
    return null; // Yükleniyor
  }

  if (!favori) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-card dark:border-slate-700/60 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setAcik((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        >
          <div className="flex items-center gap-1.5">
            <NotebookIcon className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">Not Defteri</h3>
          </div>
        </button>
        {acik && (
          <div className="px-3 pb-3">
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 px-2.5 py-2 text-3xs text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
              <StarIcon className="h-3.5 w-3.5 flex-shrink-0" />
              Not eklemek için önce bu parseli favorilere ekleyin.
            </div>
          </div>
        )}
      </div>
    );
  }

  const notlar = favori.notlar ?? [];
  const etiket = etiketBul(favori.etiket);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-card dark:border-slate-700/60 dark:bg-slate-900">
      {/* Başlık */}
      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        aria-expanded={acik}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <NotebookIcon className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            Not Defteri
          </h3>
          {notlar.length > 0 && (
            <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 dark:text-slate-300">
              {notlar.length}
            </span>
          )}
          {etiket && (
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${etiket.bg} ${etiket.text} ${etiket.border}`}>
              {etiket.label}
            </span>
          )}
        </div>
        <XIcon className={`h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform ${acik ? "" : "rotate-45"}`} />
      </button>

      {acik && (
        <div className="space-y-2.5 px-3 pb-3">
          {/* Etiket seçici */}
          <div>
            <p className="mb-1 text-3xs font-medium text-slate-500 dark:text-slate-400">Durum etiketi</p>
            <div className="flex flex-wrap gap-1">
              {ETİKETLER.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => etiketDegistir(favori.etiket === e.id ? null : e.id)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all ${
                    favori.etiket === e.id
                      ? `${e.bg} ${e.text} ${e.border} ring-1 ring-offset-1 ring-current`
                      : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300"
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notlar listesi */}
          {notlar.length > 0 && (
            <div className="space-y-1.5">
              {notlar
                .slice()
                .sort((a, b) => b.tarih - a.tarih)
                .map((not) => (
                  <NotKart
                    key={not.id}
                    not={not}
                    duzenleId={duzenleId}
                    duzenleMetin={duzenleMetin}
                    onDuzenleBasla={() => {
                      setDuzenleId(not.id);
                      setDuzenleMetin(not.metin);
                    }}
                    onDuzenleMetinDegis={setDuzenleMetin}
                    onDuzenleKaydet={duzenleKaydet}
                    onDuzenleIptal={() => { setDuzenleId(null); setDuzenleMetin(""); }}
                    onSil={() => notSil(not.id)}
                  />
                ))}
            </div>
          )}

          {/* Yeni not ekle */}
          {ekleniyor ? (
            <div className="space-y-1.5">
              <textarea
                ref={textareaRef}
                autoFocus
                value={yeniNotMetin}
                onChange={(e) => setYeniNotMetin(e.target.value.slice(0, MAX_KARAKTER))}
                placeholder="Notunuzu yazın… (örn: 'Sahibiyle görüştüm, 4.5M'ye düşer')"
                rows={3}
                className="w-full resize-none rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              <div className="flex items-center justify-between">
                <span className={`text-3xs ${yeniNotMetin.length > MAX_KARAKTER * 0.9 ? "text-amber-600" : "text-slate-400"}`}>
                  {yeniNotMetin.length}/{MAX_KARAKTER}
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setEkleniyor(false); setYeniNotMetin(""); }}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-3xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <XIcon className="h-3 w-3" />
                    İptal
                  </button>
                  <button
                    type="button"
                    onClick={notEkle}
                    disabled={!yeniNotMetin.trim()}
                    className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-3xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                  >
                    <CheckIcon className="h-3 w-3" />
                    Kaydet
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setEkleniyor(true); setTimeout(() => textareaRef.current?.focus(), 50); }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 py-2 text-3xs text-slate-500 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:bg-blue-950/20 dark:hover:text-blue-400 transition-colors"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Not ekle
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Not kartı bileşeni ────────────────────────────────────────────────────────
function NotKart({
  not,
  duzenleId,
  duzenleMetin,
  onDuzenleBasla,
  onDuzenleMetinDegis,
  onDuzenleKaydet,
  onDuzenleIptal,
  onSil,
}: {
  not: ParselNot;
  duzenleId: string | null;
  duzenleMetin: string;
  onDuzenleBasla: () => void;
  onDuzenleMetinDegis: (v: string) => void;
  onDuzenleKaydet: () => void;
  onDuzenleIptal: () => void;
  onSil: () => void;
}) {
  const aktifDuzenle = duzenleId === not.id;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 px-2.5 py-2">
      {aktifDuzenle ? (
        <div className="space-y-1.5">
          <textarea
            autoFocus
            value={duzenleMetin}
            onChange={(e) => onDuzenleMetinDegis(e.target.value.slice(0, MAX_KARAKTER))}
            rows={3}
            className="w-full resize-none rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          <div className="flex items-center justify-between">
            <span className="text-3xs text-slate-400">{duzenleMetin.length}/{MAX_KARAKTER}</span>
            <div className="flex gap-1.5">
              <button type="button" onClick={onDuzenleIptal}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-3xs text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700">
                <XIcon className="h-3 w-3" /> İptal
              </button>
              <button type="button" onClick={onDuzenleKaydet} disabled={!duzenleMetin.trim()}
                className="flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-3xs text-white hover:bg-blue-700 disabled:opacity-40">
                <CheckIcon className="h-3 w-3" /> Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
            {not.metin}
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="text-[10px] text-slate-400 dark:text-slate-500">
              {tarihStr(not.tarih)}
              {not.duzenlemeTarihi && (
                <span className="ml-1 italic">(düzenlendi)</span>
              )}
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={onDuzenleBasla}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                title="Düzenle">
                <PencilIcon className="h-3 w-3" />
              </button>
              <button type="button" onClick={onSil}
                className="rounded p-0.5 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                title="Sil">
                <TrashIcon className="h-3 w-3" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
