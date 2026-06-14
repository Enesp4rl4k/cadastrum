/**
 * Manuel İmar Girişi Kartı
 *
 * e-Plan verisi gelmediğinde veya kısmen geldiğinde kullanıcı kendi
 * belediye/imar kaynağından TAKS, Emsal, Kat, Nizam bilgisini girer.
 * Veri parsel başına chrome.storage.local'da saklanır.
 */

import { useEffect, useState } from "react";
import type { Parsel } from "../../types/tkgm";
import {
  manuelVeriOku,
  manuelImarKaydet,
  manuelImarSil,
  type ManuelImar,
} from "../../lib/manuel-veri";
import type { EPlanImarVerisi } from "../../lib/eplan";

interface Props {
  parsel: Parsel;
  ePlanVerisi: EPlanImarVerisi | null | undefined;
  onDegisti?: () => void; // Manuel veri değiştiğinde parent yenilensin diye
}

const NIZAM_SECENEKLER = ["Bitişik nizam", "Ayrık nizam", "Blok", "Taksir"];
export const KULLANIM_SECENEKLER = ["Konut", "Ticaret", "Ticaret + Konut", "Sanayi", "Tarım", "Turizm", "Eğitim", "Sağlık", "Yeşil alan", "Diğer"];

export function ManuelImarKarti({ parsel, ePlanVerisi, onDegisti }: Props) {
  const [acik, setAcik] = useState(false);
  const [mevcutManuel, setMevcutManuel] = useState<ManuelImar | undefined>(undefined);
  const [yukleniyor, setYukleniyor] = useState(true);

  // Form state
  const [taks, setTaks] = useState("");
  const [emsal, setEmsal] = useState("");
  const [maksKat, setMaksKat] = useState("");
  const [yapiNizami, setYapiNizami] = useState("");
  const [kullanimKarari, setKullanimKarari] = useState("");
  const [kaynak, setKaynak] = useState("");
  const [notlar, setNotlar] = useState("");
  const [kaydetDurumu, setKaydetDurumu] = useState<"idle" | "kaydediliyor" | "kaydedildi">("idle");

  useEffect(() => {
    setYukleniyor(true);
    manuelVeriOku(parsel).then(v => {
      const m = v.imar;
      setMevcutManuel(m);
      if (m) {
        setTaks(m.taks?.toString() ?? "");
        setEmsal(m.emsal?.toString() ?? "");
        setMaksKat(m.maksKat?.toString() ?? "");
        setYapiNizami(m.yapiNizami ?? "");
        setKullanimKarari(m.kullanimKarari ?? "");
        setKaynak(m.kaynak ?? "");
        setNotlar(m.notlar ?? "");
      }
      setYukleniyor(false);
    });
  }, [parsel.adaNo, parsel.parselNo, parsel.mahalleKodu]);

  // ePlan eksikse veya manuel veri varsa öneri göster
  const ePlanEksik = !ePlanVerisi || (!ePlanVerisi.taks && !ePlanVerisi.emsal && !ePlanVerisi.maksKat);
  const oneriliGoster = ePlanEksik || mevcutManuel != null;

  if (!oneriliGoster && !acik) {
    // ePlan tam ve manuel yok → kompakt link
    return (
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="text-[10px] text-slate-400 hover:text-slate-600 underline"
      >
        Manuel imar bilgisi ekle (e-Plan'ı geçersiz kıl)
      </button>
    );
  }

  async function kaydet() {
    setKaydetDurumu("kaydediliyor");
    const veri: Omit<ManuelImar, "girilmeTarihi"> = {
      taks: taks ? parseFloat(taks) : undefined,
      emsal: emsal ? parseFloat(emsal) : undefined,
      maksKat: maksKat ? parseInt(maksKat, 10) : undefined,
      yapiNizami: yapiNizami || undefined,
      kullanimKarari: kullanimKarari || undefined,
      kaynak: kaynak || undefined,
      notlar: notlar || undefined,
    };
    await manuelImarKaydet(parsel, veri);
    setMevcutManuel({ ...veri, girilmeTarihi: Date.now() });
    setKaydetDurumu("kaydedildi");
    setTimeout(() => setKaydetDurumu("idle"), 1500);
    onDegisti?.();
  }

  async function sil() {
    if (!confirm("Manuel imar bilgisi silinsin mi?")) return;
    await manuelImarSil(parsel);
    setMevcutManuel(undefined);
    setTaks(""); setEmsal(""); setMaksKat("");
    setYapiNizami(""); setKullanimKarari(""); setKaynak(""); setNotlar("");
    onDegisti?.();
  }

  if (yukleniyor) {
    return <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">Yükleniyor…</div>;
  }

  return (
    <div className="rounded border-2 border-amber-300 bg-amber-50 p-2.5 text-xs dark:border-amber-500/70 dark:bg-slate-900 dark:text-slate-100">
      <button
        type="button"
        onClick={() => setAcik(!acik)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-300">
          ✏️ Manuel İmar Bilgisi
          {mevcutManuel && (
            <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px] font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
              kayıtlı
            </span>
          )}
        </span>
        <span className="text-amber-700 dark:text-amber-300">{acik ? "▴" : "▾"}</span>
      </button>

      {!acik && mevcutManuel && (
        <div className="mt-1 text-[10px] text-amber-800 dark:text-amber-200">
          {[
            mevcutManuel.taks != null && `TAKS ${mevcutManuel.taks}`,
            mevcutManuel.emsal != null && `Emsal ${mevcutManuel.emsal}`,
            mevcutManuel.maksKat != null && `${mevcutManuel.maksKat} kat`,
            mevcutManuel.yapiNizami,
          ].filter(Boolean).join(" · ") || "kayıt boş"}
        </div>
      )}

      {acik && (
        <div className="mt-2.5 space-y-2">
          {ePlanEksik && (
            <div className="rounded bg-white px-2 py-1.5 text-[10px] text-slate-600 leading-relaxed dark:bg-slate-800 dark:text-slate-200">
              💡 Resmi e-Plan kaydı eksik. Belediye e-imar veya 1/1000 plan PDF'inden alıp girebilirsiniz.
              Bu veri sadece bu parsele özeldir, paylaşılmaz.
            </div>
          )}

          <div className="grid grid-cols-3 gap-1.5">
            <Input label="TAKS" value={taks} onChange={setTaks} placeholder="0.40" type="decimal" />
            <Input label="Emsal" value={emsal} onChange={setEmsal} placeholder="1.50" type="decimal" />
            <Input label="Maks Kat" value={maksKat} onChange={setMaksKat} placeholder="5" type="integer" />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <SelectField
              label="Nizam"
              value={yapiNizami}
              onChange={setYapiNizami}
              options={NIZAM_SECENEKLER}
            />
            <SelectField
              label="Kullanım"
              value={kullanimKarari}
              onChange={setKullanimKarari}
              options={KULLANIM_SECENEKLER}
            />
          </div>

          <Input label="Kaynak" value={kaynak} onChange={setKaynak} placeholder="Belediye e-imar / 1/1000 plan" />

          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-amber-900">Not</label>
            <textarea
              value={notlar}
              onChange={(e) => setNotlar(e.target.value)}
              rows={2}
              placeholder="örn. çekme mesafeleri, otopark zorunluluğu"
              className="w-full rounded border border-amber-300 bg-white px-2 py-1 text-[11px] focus:border-amber-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="text-[9px] text-amber-700 dark:text-amber-300">
              {mevcutManuel && `Son güncelleme: ${new Date(mevcutManuel.girilmeTarihi).toLocaleDateString("tr-TR")}`}
            </div>
            <div className="flex items-center gap-1.5">
              {mevcutManuel && (
                <button
                  type="button"
                  onClick={sil}
                  className="rounded border border-red-300 bg-white px-2 py-1 text-[10px] font-medium text-red-700 hover:bg-red-50"
                >
                  Sil
                </button>
              )}
              <button
                type="button"
                onClick={kaydet}
                disabled={kaydetDurumu === "kaydediliyor"}
                className="rounded bg-amber-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {kaydetDurumu === "kaydediliyor" ? "Kaydediliyor…" : kaydetDurumu === "kaydedildi" ? "✓ Kaydedildi" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  type?: "text" | "decimal" | "integer";
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] font-medium text-amber-900 dark:text-amber-200">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          let v = e.target.value;
          if (type === "decimal") v = v.replace(/[^0-9.,]/g, "").replace(",", ".");
          if (type === "integer") v = v.replace(/[^0-9]/g, "");
          onChange(v);
        }}
        placeholder={placeholder}
        className="w-full rounded border border-amber-300 bg-white px-2 py-1 text-[11px] focus:border-amber-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="mb-0.5 block text-[10px] font-medium text-amber-900 dark:text-amber-200">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-amber-300 bg-white px-2 py-1 text-[11px] focus:border-amber-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      >
        <option value="">— seç —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
