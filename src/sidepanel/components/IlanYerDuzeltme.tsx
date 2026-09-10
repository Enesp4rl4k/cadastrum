import { useState, useEffect } from "react";
import type { Mahalle } from "../../types/tkgm";
import type { IlanBilgisi } from "../../types/ilan";
import { ilceKodunuBul, getMahalleListesi } from "../../lib/tkgm-api";

interface Props {
  ilan: IlanBilgisi;
  onKaydet: (yeniIlan: IlanBilgisi) => void;
  onIptal: () => void;
}

export function IlanYerDuzeltme({ ilan, onKaydet, onIptal }: Props) {
  const [duzeltIl, setDuzeltIl] = useState(ilan.il ?? "");
  const [duzeltIlce, setDuzeltIlce] = useState(ilan.ilce ?? "");
  const [duzeltMahalle, setDuzeltMahalle] = useState(ilan.mahalle ?? "");
  const [duzeltAda, setDuzeltAda] = useState(ilan.adaNo != null ? String(ilan.adaNo) : "");
  const [duzeltParsel, setDuzeltParsel] = useState(ilan.parselNo != null ? String(ilan.parselNo) : "");
  const [mahallelerDropdown, setMahallelerDropdown] = useState<Mahalle[]>([]);

  useEffect(() => {
    if (!duzeltIl.trim() || !duzeltIlce.trim()) {
      setMahallelerDropdown([]);
      return;
    }
    let iptal = false;
    (async () => {
      const ilceKodu = await ilceKodunuBul(duzeltIl.trim(), duzeltIlce.trim());
      if (iptal || !ilceKodu) return;
      const liste = await getMahalleListesi(ilceKodu);
      if (iptal) return;
      liste.sort((a, b) => a.mahalleAdi.localeCompare(b.mahalleAdi, "tr"));
      setMahallelerDropdown(liste);
    })().catch(() => {});
    return () => {
      iptal = true;
    };
  }, [duzeltIl, duzeltIlce]);

  const handleKaydet = () => {
    const adaDuzelt = duzeltAda.trim() ? Number(duzeltAda.trim()) : undefined;
    const parselDuzelt = duzeltParsel.trim() ? Number(duzeltParsel.trim()) : undefined;

    const yeniIlan: IlanBilgisi = {
      ...ilan,
      il: duzeltIl.trim() || ilan.il,
      ilce: duzeltIlce.trim() || ilan.ilce,
      mahalle: duzeltMahalle.trim() || ilan.mahalle,
      ...(adaDuzelt != null && !isNaN(adaDuzelt) ? { adaNo: adaDuzelt } : {}),
      ...(parselDuzelt != null && !isNaN(parselDuzelt) ? { parselNo: parselDuzelt } : {}),
      manuelDuzeltildi: true,
    };

    onKaydet(yeniIlan);
  };

  return (
    <div className="col-span-2 mt-1 space-y-1.5 rounded-md border border-orange-200 bg-orange-50/60 p-2">
      <div className="text-3xs font-semibold text-slate-700">Yer bilgisini düzelt</div>
      <input
        type="text"
        placeholder="İl (örn: Balıkesir)"
        value={duzeltIl}
        onChange={(e) => setDuzeltIl(e.target.value)}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-2xs"
      />
      <input
        type="text"
        placeholder="İlçe (örn: Bandırma)"
        value={duzeltIlce}
        onChange={(e) => setDuzeltIlce(e.target.value)}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-2xs"
      />
      {/* Mahalle: il+ilçe biliniyorsa dropdown (TKGM listesi), değilse text input */}
      {duzeltIl && duzeltIlce && mahallelerDropdown.length > 0 ? (
        <select
          value={duzeltMahalle}
          onChange={(e) => setDuzeltMahalle(e.target.value)}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-2xs"
        >
          <option value="">— Mahalle seç —</option>
          {mahallelerDropdown.map((m) => (
            <option key={m.mahalleKodu} value={m.mahalleAdi}>
              {m.mahalleAdi}
            </option>
          ))}
        </select>
      ) : duzeltIl && duzeltIlce ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            placeholder="Mahalle (yükleniyor…)"
            value={duzeltMahalle}
            onChange={(e) => setDuzeltMahalle(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-2xs"
            readOnly
          />
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-orange-300 border-t-orange-600 flex-shrink-0" />
        </div>
      ) : (
        <input
          type="text"
          placeholder="Mahalle (örn: Yalı)"
          value={duzeltMahalle}
          onChange={(e) => setDuzeltMahalle(e.target.value)}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-2xs"
        />
      )}
      {/* Ada / Parsel No — açıklamada farklı bilgi varsa veya ada eksikse */}
      <div className="grid grid-cols-2 gap-1">
        <label className="flex flex-col gap-0.5">
          <span className="text-3xs text-slate-500">
            Ada No <span className="text-slate-400">(opsiyonel)</span>
          </span>
          <input
            type="number"
            min="0"
            placeholder="örn: 116"
            value={duzeltAda}
            onChange={(e) => setDuzeltAda(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-2xs"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-3xs text-slate-500">Parsel No</span>
          <input
            type="number"
            min="1"
            placeholder="örn: 977"
            value={duzeltParsel}
            onChange={(e) => setDuzeltParsel(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-2xs"
          />
        </label>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={handleKaydet}
          className="flex-1 cursor-pointer rounded bg-accent-ilan px-2 py-1 text-2xs font-medium text-white hover:bg-orange-700"
        >
          Kaydet & yeniden sorgula
        </button>
        <button
          type="button"
          onClick={onIptal}
          className="cursor-pointer rounded bg-slate-200 px-2 py-1 text-2xs text-slate-700 hover:bg-slate-300"
        >
          İptal
        </button>
      </div>
      <div className="text-3xs italic text-slate-500">
        Mahalle TKGM'den seçilir. Ada boş bırakılırsa sadece parsel no ile sorgulanır.
      </div>
    </div>
  );
}
