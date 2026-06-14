import { useEffect, useState } from "react";
import {
  getIlListesi,
  getIlceListesi,
  getMahalleListesi,
  getParselByCodes,
} from "../../lib/tkgm-api";
import { db } from "../../lib/db";
import type { Il, Ilce, Mahalle, Parsel } from "../../types/tkgm";

interface Props {
  onResult: (parsel: Parsel) => void;
}

export function AraView({ onResult }: Props) {
  const [iller, setIller] = useState<Il[]>([]);
  const [ilceler, setIlceler] = useState<Ilce[]>([]);
  const [mahalleler, setMahalleler] = useState<Mahalle[]>([]);

  const [ilKodu, setIlKodu] = useState<number | null>(null);
  const [ilceKodu, setIlceKodu] = useState<number | null>(null);
  const [mahalleKodu, setMahalleKodu] = useState<number | null>(null);
  const [adaNo, setAdaNo] = useState("");
  const [parselNo, setParselNo] = useState("");

  const [loadingIller, setLoadingIller] = useState(false);
  const [loadingIlceler, setLoadingIlceler] = useState(false);
  const [loadingMahalleler, setLoadingMahalleler] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingIller(true);
    getIlListesi()
      .then((list) => {
        // Türkçe alfabetik sırala
        list.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
        setIller(list);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingIller(false));
  }, []);

  useEffect(() => {
    setIlceler([]);
    setMahalleler([]);
    setIlceKodu(null);
    setMahalleKodu(null);
    if (ilKodu == null) return;
    setLoadingIlceler(true);
    getIlceListesi(ilKodu)
      .then((list) => {
        list.sort((a, b) => a.ilceAdi.localeCompare(b.ilceAdi, "tr"));
        setIlceler(list);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingIlceler(false));
  }, [ilKodu]);

  useEffect(() => {
    setMahalleler([]);
    setMahalleKodu(null);
    if (ilceKodu == null) return;
    setLoadingMahalleler(true);
    getMahalleListesi(ilceKodu)
      .then((list) => {
        list.sort((a, b) => a.mahalleAdi.localeCompare(b.mahalleAdi, "tr"));
        setMahalleler(list);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingMahalleler(false));
  }, [ilceKodu]);

  async function ara() {
    if (mahalleKodu == null || !adaNo.trim() || !parselNo.trim()) return;
    setError(null);
    setSearching(true);
    try {
      const parsel = await getParselByCodes(
        mahalleKodu,
        Number.parseInt(adaNo, 10),
        Number.parseInt(parselNo, 10),
      );
      await db.gecmis.add({
        lat: parsel.merkezNokta.lat,
        lng: parsel.merkezNokta.lng,
        zaman: Date.now(),
        basarili: true,
        parsel,
      });
      onResult(parsel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSearching(false);
    }
  }

  const aktif =
    mahalleKodu != null &&
    adaNo.trim() !== "" &&
    parselNo.trim() !== "" &&
    !searching;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 text-xs">
      <Field label="İl">
        <select
          value={ilKodu ?? ""}
          onChange={(e) =>
            setIlKodu(e.target.value ? Number(e.target.value) : null)
          }
          disabled={loadingIller}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5"
        >
          <option value="">
            {loadingIller ? "Yükleniyor…" : "İl seç"}
          </option>
          {iller.map((il) => (
            <option key={il.kod} value={il.kod}>
              {il.ad}
            </option>
          ))}
        </select>
      </Field>

      <Field label="İlçe">
        <select
          value={ilceKodu ?? ""}
          onChange={(e) =>
            setIlceKodu(e.target.value ? Number(e.target.value) : null)
          }
          disabled={ilKodu == null || loadingIlceler}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 disabled:bg-slate-100"
        >
          <option value="">
            {loadingIlceler
              ? "Yükleniyor…"
              : ilKodu == null
                ? "Önce il seç"
                : "İlçe seç"}
          </option>
          {ilceler.map((ilce) => (
            <option key={ilce.ilceKodu} value={ilce.ilceKodu}>
              {ilce.ilceAdi}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Mahalle">
        <select
          value={mahalleKodu ?? ""}
          onChange={(e) =>
            setMahalleKodu(e.target.value ? Number(e.target.value) : null)
          }
          disabled={ilceKodu == null || loadingMahalleler}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 disabled:bg-slate-100"
        >
          <option value="">
            {loadingMahalleler
              ? "Yükleniyor…"
              : ilceKodu == null
                ? "Önce ilçe seç"
                : "Mahalle seç"}
          </option>
          {mahalleler.map((m) => (
            <option key={m.mahalleKodu} value={m.mahalleKodu}>
              {m.mahalleAdi}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Ada No">
          <input
            type="text"
            inputMode="numeric"
            value={adaNo}
            onChange={(e) => setAdaNo(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="örn. 1234"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5"
          />
        </Field>
        <Field label="Parsel No">
          <input
            type="text"
            inputMode="numeric"
            value={parselNo}
            onChange={(e) => setParselNo(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="örn. 5"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5"
          />
        </Field>
      </div>

      <button
        type="button"
        onClick={ara}
        disabled={!aktif}
        className="rounded bg-tkgm-primary py-2 font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
      >
        {searching ? "Sorgulanıyor…" : "Sorgula"}
      </button>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-red-700">
          {error}
        </div>
      )}

      <p className="mt-2 text-[11px] text-tkgm-muted">
        Bulunan parsel otomatik olarak harita sekmesine geçecek ve gösterilecek.
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-medium text-tkgm-muted">{label}</span>
      {children}
    </label>
  );
}
