/**
 * Manuel Emsal Listesi
 *
 * Kullanıcı yakında bildiği bir satışı/ilanı emsal olarak ekler.
 * Bu emsaller fiyat motoruna karışır ve tahmine etki eder.
 */

import { useEffect, useState } from "react";
import type { Parsel } from "../../types/tkgm";
import {
  manuelVeriOku,
  manuelEmsalEkle,
  manuelEmsalSil,
  type ManuelEmsal,
} from "../../lib/manuel-veri";

interface Props {
  parsel: Parsel;
  onDegisti?: () => void;
}

export function ManuelEmsalKarti({ parsel, onDegisti }: Props) {
  const [acik, setAcik] = useState(false);
  const [formAcik, setFormAcik] = useState(false);
  const [emsaller, setEmsaller] = useState<ManuelEmsal[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  // Form state
  const [fiyatTL, setFiyatTL] = useState("");
  const [m2, setM2] = useState("");
  const [kategori, setKategori] = useState<"arsa" | "tarla" | "konut">("arsa");
  const [konum, setKonum] = useState("");
  const [notlar, setNotlar] = useState("");
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    setYukleniyor(true);
    manuelVeriOku(parsel).then(v => {
      setEmsaller(v.emsaller ?? []);
      setYukleniyor(false);
    });
  }, [parsel.adaNo, parsel.parselNo, parsel.mahalleKodu]);

  // Hesaplanan TL/m²
  const tahminiTLM2 = (() => {
    const f = parseFloat(fiyatTL.replace(/\./g, "").replace(",", ".")) || 0;
    const a = parseFloat(m2.replace(/\./g, "").replace(",", ".")) || 0;
    if (f > 0 && a > 0) return Math.round(f / a);
    return null;
  })();

  async function ekle() {
    setHata(null);
    const f = parseFloat(fiyatTL.replace(/\./g, "").replace(",", ".")) || 0;
    const a = parseFloat(m2.replace(/\./g, "").replace(",", ".")) || 0;
    if (f <= 0) { setHata("Fiyat geçerli olmalı"); return; }
    if (a <= 0) { setHata("m² geçerli olmalı"); return; }

    const yeni = await manuelEmsalEkle(parsel, {
      fiyatTL: f,
      m2: a,
      kategori,
      konum: konum || undefined,
      notlar: notlar || undefined,
    });
    setEmsaller([...emsaller, yeni]);
    setFiyatTL(""); setM2(""); setKonum(""); setNotlar("");
    setFormAcik(false);
    onDegisti?.();
  }

  async function sil(id: string) {
    if (!confirm("Bu emsali silmek istediğinizden emin misiniz?")) return;
    await manuelEmsalSil(parsel, id);
    setEmsaller(emsaller.filter(e => e.id !== id));
    onDegisti?.();
  }

  if (yukleniyor) return null;

  return (
    <div className="rounded border-2 border-emerald-300 bg-emerald-50 p-2.5 text-xs dark:border-emerald-500/70 dark:bg-slate-900 dark:text-slate-100">
      <button
        type="button"
        onClick={() => setAcik(!acik)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex items-center gap-1.5 font-semibold text-emerald-900 dark:text-emerald-300">
          📝 Manuel Emsal Listesi
          {emsaller.length > 0 && (
            <span className="rounded-full bg-emerald-200 px-1.5 py-0.5 text-[9px] font-medium text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200">
              {emsaller.length}
            </span>
          )}
        </span>
        <span className="text-emerald-700 dark:text-emerald-300">{acik ? "▴" : "▾"}</span>
      </button>

      {acik && (
        <div className="mt-2.5 space-y-2">
          {emsaller.length === 0 && !formAcik && (
            <div className="rounded bg-white px-2 py-1.5 text-[10px] text-slate-600 leading-relaxed dark:bg-slate-800 dark:text-slate-200">
              💡 Bölgeden bildiğin bir satış veya ilan ekle. Fiyat tahminine emsal olarak girer ve sonucu daha doğru yapar.
            </div>
          )}

          {/* Mevcut emsaller */}
          {emsaller.length > 0 && (
            <div className="space-y-1.5">
              {emsaller.map(e => (
                <div key={e.id} className="rounded border border-emerald-200 bg-white p-2 text-[10px] dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                        {e.fiyatPerM2.toLocaleString("tr-TR")} TL/m²
                        <span className="ml-1.5 font-normal text-slate-500 dark:text-slate-400">
                          ({(e.fiyatTL).toLocaleString("tr-TR")} TL · {e.m2.toLocaleString("tr-TR")} m²)
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1.5 text-[9px] text-slate-600 dark:text-slate-300">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700 dark:text-slate-200">{e.kategori}</span>
                        {e.konum && <span>📍 {e.konum}</span>}
                        <span className="text-slate-400">{new Date(e.girilmeTarihi).toLocaleDateString("tr-TR")}</span>
                      </div>
                      {e.notlar && (
                        <div className="mt-1 text-[9px] italic text-slate-600 dark:text-slate-300">{e.notlar}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => sil(e.id)}
                      className="rounded p-0.5 text-red-500 hover:bg-red-50"
                      title="Sil"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Ekleme formu */}
          {formAcik ? (
            <div className="rounded border border-emerald-300 bg-white p-2 space-y-1.5 dark:border-slate-700 dark:bg-slate-800">
              <div className="grid grid-cols-2 gap-1.5">
                <Field label="Fiyat (TL)" value={fiyatTL} onChange={setFiyatTL} placeholder="500000" decimal />
                <Field label="Alan (m²)" value={m2} onChange={setM2} placeholder="2000" decimal />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium text-emerald-900">Kategori</label>
                  <select
                    value={kategori}
                    onChange={(e) => setKategori(e.target.value as "arsa" | "tarla" | "konut")}
                    className="w-full rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] focus:border-emerald-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="arsa">Arsa</option>
                    <option value="tarla">Tarla</option>
                    <option value="konut">Konut</option>
                  </select>
                </div>
                <Field label="Konum (ops.)" value={konum} onChange={setKonum} placeholder="aynı sokak" />
              </div>

              {tahminiTLM2 && (
                <div className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                  → Hesaplanan birim fiyat: {tahminiTLM2.toLocaleString("tr-TR")} TL/m²
                </div>
              )}

              <div>
                <label className="mb-0.5 block text-[10px] font-medium text-emerald-900">Not (ops.)</label>
                <input
                  type="text"
                  value={notlar}
                  onChange={(e) => setNotlar(e.target.value)}
                  placeholder="örn. 2 ay önce satıldı"
                  className="w-full rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] focus:border-emerald-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {hata && <div className="text-[10px] text-red-600 dark:text-red-300">{hata}</div>}

              <div className="flex justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => { setFormAcik(false); setHata(null); }}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={ekle}
                  className="rounded bg-emerald-600 px-3 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700"
                >
                  Emsal ekle
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFormAcik(true)}
              className="w-full rounded border border-dashed border-emerald-400 bg-white px-2 py-1.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/70 dark:bg-slate-800 dark:text-emerald-200 dark:hover:bg-slate-700"
            >
              + Emsal ekle
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, decimal = false }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; decimal?: boolean;
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] font-medium text-emerald-900 dark:text-emerald-200">{label}</label>
      <input
        type="text"
        inputMode={decimal ? "decimal" : "text"}
        value={value}
        onChange={(e) => {
          let v = e.target.value;
          if (decimal) v = v.replace(/[^0-9.,]/g, "");
          onChange(v);
        }}
        placeholder={placeholder}
        className="w-full rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] focus:border-emerald-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
    </div>
  );
}
