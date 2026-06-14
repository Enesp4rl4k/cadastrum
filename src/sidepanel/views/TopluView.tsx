import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload as UploadIcon,
  Play as PlayIcon,
  Square as StopIcon,
  Download as DownloadIcon,
  Star as StarIcon,
  CheckCircle2 as CheckIcon,
  XCircle as XCircleIcon,
  Clock as ClockIcon,
  Database as DatabaseIcon,
  ChevronUp as ChevronUpIcon,
  ChevronDown as ChevronDownIcon,
  Trash2 as TrashIcon,
  FileSpreadsheet as FileSpreadsheetIcon,
} from "lucide-react";
import {
  getParselByLatLng,
  parselCacheGet,
  parselCacheSet,
} from "../../lib/tkgm-api";
import { db } from "../../lib/db";
import {
  type BulkResult,
  type CoordInput,
  downloadFile,
  parseCoordsText,
  toCsv,
  toGeoJson,
  toKml,
} from "../../lib/import-export";
import type { Parsel } from "../../types/tkgm";

const REQUEST_DELAY_MS = 250;

type Status = "bekliyor" | "sorgulanıyor" | "tamam" | "hata" | "cache";

interface SatirDurumu {
  input: CoordInput;
  status: Status;
  parsel: Parsel | null;
  hata: string | null;
  index: number;
  secili: boolean;
}

type SiraAlan = "siraNo" | "ada" | "parsel" | "alan" | "nitelik" | "ilce";

const ORNEK_CSV = `lat,lng,label
41.0086,28.9802,Sultanahmet
39.9334,32.8597,Ankara Çankaya
38.4192,27.1287,İzmir Konak`;

export function TopluView() {
  const [text, setText] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [satirlar, setSatirlar] = useState<SatirDurumu[]>([]);
  const [running, setRunning] = useState(false);
  const [duraklatildi, setDuraklatildi] = useState(false);
  const [siraAlani, setSiraAlani] = useState<SiraAlan>("siraNo");
  const [siraYonu, setSiraYonu] = useState<"asc" | "desc">("asc");
  const [filtreNitelik, setFiltreNitelik] = useState<string>("");
  const [seciliHepsi, setSeciliHepsi] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [favoriEklendi, setFavoriEklendi] = useState<number | null>(null);
  const cancelRef = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // İstatistikler
  const istatistik = useMemo(() => {
    const toplam = satirlar.length;
    const tamam = satirlar.filter((s) => s.status === "tamam" || s.status === "cache").length;
    const cache = satirlar.filter((s) => s.status === "cache").length;
    const hata = satirlar.filter((s) => s.status === "hata").length;
    const bekliyor = satirlar.filter((s) => s.status === "bekliyor").length;
    const seciliSayi = satirlar.filter((s) => s.secili).length;
    return { toplam, tamam, cache, hata, bekliyor, seciliSayi };
  }, [satirlar]);

  // Filtre + sıralama
  const gosterilenSatirlar = useMemo(() => {
    let s = [...satirlar];
    if (filtreNitelik) {
      const f = filtreNitelik.toLocaleLowerCase("tr");
      s = s.filter((r) =>
        (r.parsel?.nitelik || "").toLocaleLowerCase("tr").includes(f),
      );
    }
    s.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (siraAlani) {
        case "siraNo":
          av = a.index; bv = b.index; break;
        case "ada":
          av = a.parsel?.adaNo ?? -1; bv = b.parsel?.adaNo ?? -1; break;
        case "parsel":
          av = a.parsel?.parselNo ?? -1; bv = b.parsel?.parselNo ?? -1; break;
        case "alan":
          av = a.parsel?.alan ?? -1; bv = b.parsel?.alan ?? -1; break;
        case "nitelik":
          av = a.parsel?.nitelik ?? ""; bv = b.parsel?.nitelik ?? ""; break;
        case "ilce":
          av = a.parsel?.ilceAd ?? ""; bv = b.parsel?.ilceAd ?? ""; break;
      }
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), "tr");
      return siraYonu === "asc" ? cmp : -cmp;
    });
    return s;
  }, [satirlar, siraAlani, siraYonu, filtreNitelik]);

  function siralamaDegistir(alan: SiraAlan) {
    if (siraAlani === alan) {
      setSiraYonu((y) => (y === "asc" ? "desc" : "asc"));
    } else {
      setSiraAlani(alan);
      setSiraYonu("asc");
    }
  }

  function handleParse() {
    const { coords, errors } = parseCoordsText(text);
    setSatirlar(
      coords.map((c, i) => ({
        input: c,
        status: "bekliyor",
        parsel: null,
        hata: null,
        index: i,
        secili: false,
      })),
    );
    setParseErrors(errors);
  }

  async function handleFile(file: File) {
    const t = await file.text();
    setText(t);
    const { coords, errors } = parseCoordsText(t);
    setSatirlar(
      coords.map((c, i) => ({
        input: c,
        status: "bekliyor",
        parsel: null,
        hata: null,
        index: i,
        secili: false,
      })),
    );
    setParseErrors(errors);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function runBulk() {
    if (satirlar.length === 0) return;
    cancelRef.current = false;
    setDuraklatildi(false);
    setRunning(true);

    for (let i = 0; i < satirlar.length; i++) {
      if (cancelRef.current) break;
      const cur = satirlar[i];
      if (!cur || cur.status === "tamam" || cur.status === "cache") continue;

      // İşaretle: sorgulanıyor
      setSatirlar((prev) =>
        prev.map((s, j) => (j === i ? { ...s, status: "sorgulanıyor" } : s)),
      );

      try {
        // Cache-first
        const cacheKey = `coord:${cur.input.lat.toFixed(5)},${cur.input.lng.toFixed(5)}`;
        let parsel = await parselCacheGet(cacheKey);
        let isCache = !!parsel;
        if (!parsel) {
          parsel = await getParselByLatLng(cur.input.lat, cur.input.lng);
          await parselCacheSet(cacheKey, parsel);
        }

        setSatirlar((prev) =>
          prev.map((s, j) =>
            j === i ? { ...s, status: isCache ? "cache" : "tamam", parsel: parsel! } : s,
          ),
        );

        await db.gecmis.add({
          lat: cur.input.lat,
          lng: cur.input.lng,
          zaman: Date.now(),
          basarili: true,
          parsel,
        });

        if (!isCache) {
          await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setSatirlar((prev) =>
          prev.map((s, j) => (j === i ? { ...s, status: "hata", hata: msg } : s)),
        );
        await db.gecmis.add({
          lat: cur.input.lat,
          lng: cur.input.lng,
          zaman: Date.now(),
          basarili: false,
          hata: msg,
        });
      }
    }
    setRunning(false);
  }

  function durdur() {
    cancelRef.current = true;
    setDuraklatildi(true);
  }

  function temizle() {
    if (running) return;
    if (!confirm("Tüm sonuçları temizle?")) return;
    setSatirlar([]);
    setText("");
    setParseErrors([]);
  }

  function tumunuSec(secim: boolean) {
    setSeciliHepsi(secim);
    setSatirlar((prev) => prev.map((s) => ({ ...s, secili: secim })));
  }

  function tekSec(index: number, secili: boolean) {
    setSatirlar((prev) =>
      prev.map((s) => (s.index === index ? { ...s, secili } : s)),
    );
  }

  async function seciliFavorileEkle() {
    const seciliParseller = satirlar.filter(
      (s) => s.secili && s.parsel != null,
    );
    let n = 0;
    for (const s of seciliParseller) {
      if (!s.parsel) continue;
      await db.favoriler.add({
        mahalleKodu: s.parsel.mahalleKodu ?? 0,
        adaNo: s.parsel.adaNo,
        parselNo: s.parsel.parselNo,
        ilAd: s.parsel.ilAd,
        ilceAd: s.parsel.ilceAd,
        mahalleAd: s.parsel.mahalleAd,
        not: s.input.label
          ? `Toplu içe aktar: ${s.input.label}`
          : "Toplu içe aktar",
        eklenmeTarihi: Date.now(),
        parsel: s.parsel,
      });
      n++;
    }
    setFavoriEklendi(n);
    setTimeout(() => setFavoriEklendi(null), 3000);
  }

  function exportFile(fmt: "csv" | "geojson" | "kml") {
    const sonuc: BulkResult[] = satirlar
      .filter((s) => s.parsel || s.hata)
      .map((s) => ({
        input: s.input,
        parsel: s.parsel,
        hata: s.hata,
      }));
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    if (fmt === "csv") {
      downloadFile(toCsv(sonuc), `tkgm-toplu-${stamp}.csv`, "text/csv");
    } else if (fmt === "geojson") {
      downloadFile(
        toGeoJson(sonuc),
        `tkgm-toplu-${stamp}.geojson`,
        "application/geo+json",
      );
    } else {
      downloadFile(
        toKml(sonuc),
        `tkgm-toplu-${stamp}.kml`,
        "application/vnd.google-earth.kml+xml",
      );
    }
  }

  // Toplam ilerleme yüzdesi
  const ilerleme =
    istatistik.toplam > 0
      ? Math.round(((istatistik.tamam + istatistik.hata) / istatistik.toplam) * 100)
      : 0;

  // Boş ekran
  if (satirlar.length === 0) {
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-xs">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <FileSpreadsheetIcon className="h-4 w-4 text-slate-500" />
            Toplu Parsel Sorgulama
          </h2>
          <p className="mt-1 text-2xs text-slate-500 dark:text-slate-400">
            Birden fazla koordinatı (lat,lng) tek seferde TKGM'den sorgula.
            Sonuçları sırala, filtrele, favorilere ekle veya CSV/KML/GeoJSON
            olarak indir.
          </p>
        </div>

        {/* Drag-drop alanı */}
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragActive
              ? "border-tkgm-primary bg-blue-50 dark:bg-blue-950/30"
              : "border-slate-300 bg-slate-50 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800/50"
          }`}
        >
          <UploadIcon className="h-7 w-7 text-slate-400" />
          <div>
            <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
              CSV/TXT dosyasını sürükle bırak
            </div>
            <div className="text-3xs text-slate-500 dark:text-slate-400">
              veya tıkla → dosya seç
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.tsv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            className="hidden"
          />
        </div>

        {/* Manuel paste */}
        <div className="space-y-1.5">
          <label className="block text-2xs font-semibold text-slate-700 dark:text-slate-200">
            Veya doğrudan yapıştır:
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={ORNEK_CSV}
            rows={6}
            className="w-full resize-y rounded-md border border-slate-300 bg-white p-2 font-mono text-3xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          />
          <button
            type="button"
            onClick={handleParse}
            disabled={!text.trim()}
            className="cursor-pointer rounded-md bg-tkgm-primary px-3 py-1.5 text-2xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Çözümle ve önizle
          </button>
        </div>

        {parseErrors.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-2xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <div className="font-semibold">
              {parseErrors.length} satır atlandı:
            </div>
            <ul className="mt-1 list-inside list-disc">
              {parseErrors.slice(0, 3).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {parseErrors.length > 3 && (
                <li>… {parseErrors.length - 3} satır daha</li>
              )}
            </ul>
          </div>
        )}

        {/* CSV format yardımı */}
        <details className="rounded-md border border-slate-200 bg-slate-50 p-2 text-2xs dark:border-slate-700 dark:bg-slate-800/50">
          <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-200">
            CSV format örneği
          </summary>
          <pre className="mt-2 overflow-x-auto rounded bg-white p-2 font-mono text-3xs dark:bg-slate-900">
            {ORNEK_CSV}
          </pre>
          <ul className="mt-2 list-inside list-disc text-3xs text-slate-600 dark:text-slate-400">
            <li>Başlık satırı opsiyonel (lat,lng veya enlem,boylam)</li>
            <li>Ayırıcı: virgül, noktalı virgül veya tab</li>
            <li>Decimal: nokta veya virgül</li>
            <li>3. kolon (label) opsiyonel — sonuçta gösterilir</li>
          </ul>
        </details>
      </div>
    );
  }

  // Aktif çalışma görünümü
  return (
    <div className="flex h-full flex-col">
      {/* Üst toolbar — istatistikler + aksiyonlar */}
      <div className="border-b border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-2xs font-semibold text-slate-800 dark:text-slate-100">
            <FileSpreadsheetIcon className="h-3.5 w-3.5 text-slate-500" />
            Toplu Sorgu · {istatistik.toplam} parsel
          </h2>
          <div className="flex items-center gap-1">
            {!running ? (
              <>
                {istatistik.bekliyor > 0 && (
                  <button
                    type="button"
                    onClick={runBulk}
                    className="flex cursor-pointer items-center gap-1 rounded-md bg-tkgm-primary px-2 py-1 text-3xs font-medium text-white hover:bg-blue-700"
                  >
                    <PlayIcon className="h-3 w-3" />
                    {duraklatildi ? "Devam et" : "Başlat"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={temizle}
                  className="cursor-pointer rounded-md border border-slate-300 px-2 py-1 text-3xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <TrashIcon className="h-3 w-3" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={durdur}
                className="flex cursor-pointer items-center gap-1 rounded-md bg-accent-danger px-2 py-1 text-3xs font-medium text-white hover:bg-red-700"
              >
                <StopIcon className="h-3 w-3" />
                Durdur
              </button>
            )}
          </div>
        </div>

        {/* İstatistik kartları */}
        <div className="mb-2 grid grid-cols-4 gap-1.5 text-3xs">
          <StatChip
            ikon={<CheckIcon className="h-3 w-3" />}
            label="Tamam"
            sayi={istatistik.tamam}
            renk="text-accent-success"
          />
          <StatChip
            ikon={<DatabaseIcon className="h-3 w-3" />}
            label="Cache"
            sayi={istatistik.cache}
            renk="text-blue-600"
          />
          <StatChip
            ikon={<XCircleIcon className="h-3 w-3" />}
            label="Hata"
            sayi={istatistik.hata}
            renk="text-accent-danger"
          />
          <StatChip
            ikon={<ClockIcon className="h-3 w-3" />}
            label="Sırada"
            sayi={istatistik.bekliyor}
            renk="text-slate-500"
          />
        </div>

        {/* İlerleme bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full bg-tkgm-primary transition-all"
            style={{ width: `${ilerleme}%` }}
          />
        </div>

        {/* Filtre */}
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={filtreNitelik}
            onChange={(e) => setFiltreNitelik(e.target.value)}
            placeholder="Nitelik filtresi (örn: arsa, tarla)"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-3xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          />
          {istatistik.seciliSayi > 0 && (
            <span className="rounded-full bg-tkgm-primary/10 px-2 py-0.5 text-3xs font-semibold text-tkgm-primary">
              {istatistik.seciliSayi} seçili
            </span>
          )}
        </div>
      </div>

      {/* Tablo */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-slate-950">
        <table className="w-full text-3xs">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="w-6 p-1.5 text-left">
                <input
                  type="checkbox"
                  checked={seciliHepsi}
                  onChange={(e) => tumunuSec(e.target.checked)}
                  className="h-3 w-3 cursor-pointer"
                />
              </th>
              <ThSiralanabilir alan="siraNo" siraAlani={siraAlani} siraYonu={siraYonu} onTikla={siralamaDegistir} kisa>
                #
              </ThSiralanabilir>
              <th className="p-1.5 text-left">Konum</th>
              <ThSiralanabilir alan="ada" siraAlani={siraAlani} siraYonu={siraYonu} onTikla={siralamaDegistir}>Ada</ThSiralanabilir>
              <ThSiralanabilir alan="parsel" siraAlani={siraAlani} siraYonu={siraYonu} onTikla={siralamaDegistir}>Parsel</ThSiralanabilir>
              <ThSiralanabilir alan="alan" siraAlani={siraAlani} siraYonu={siraYonu} onTikla={siralamaDegistir}>Alan</ThSiralanabilir>
              <ThSiralanabilir alan="nitelik" siraAlani={siraAlani} siraYonu={siraYonu} onTikla={siralamaDegistir}>Nitelik</ThSiralanabilir>
              <ThSiralanabilir alan="ilce" siraAlani={siraAlani} siraYonu={siraYonu} onTikla={siralamaDegistir}>İlçe</ThSiralanabilir>
              <th className="w-16 p-1.5 text-center">Durum</th>
            </tr>
          </thead>
          <tbody>
            {gosterilenSatirlar.map((s) => (
              <SatirRender
                key={s.index}
                satir={s}
                onSec={(secili) => tekSec(s.index, secili)}
              />
            ))}
            {gosterilenSatirlar.length === 0 && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-2xs text-slate-500">
                  Filtreyle eşleşen satır yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Alt bulk actions sticky bar */}
      <div className="border-t border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        {favoriEklendi != null && (
          <div className="mb-2 rounded-md bg-emerald-50 p-1.5 text-3xs text-accent-success dark:bg-emerald-950/40">
            ✓ {favoriEklendi} parsel favorilere eklendi
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={seciliFavorileEkle}
            disabled={istatistik.seciliSayi === 0}
            className="flex cursor-pointer items-center gap-1 rounded-md bg-amber-500 px-2 py-1 text-3xs font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <StarIcon className="h-3 w-3" />
            Seçili {istatistik.seciliSayi}'i favorile
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => exportFile("csv")}
            disabled={istatistik.tamam === 0}
            className="flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-3xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <DownloadIcon className="h-3 w-3" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => exportFile("geojson")}
            disabled={istatistik.tamam === 0}
            className="flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-3xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <DownloadIcon className="h-3 w-3" />
            GeoJSON
          </button>
          <button
            type="button"
            onClick={() => exportFile("kml")}
            disabled={istatistik.tamam === 0}
            className="flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-3xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <DownloadIcon className="h-3 w-3" />
            KML
          </button>
        </div>
      </div>
    </div>
  );
}

function ThSiralanabilir({
  alan,
  siraAlani,
  siraYonu,
  onTikla,
  children,
  kisa = false,
}: {
  alan: SiraAlan;
  siraAlani: SiraAlan;
  siraYonu: "asc" | "desc";
  onTikla: (a: SiraAlan) => void;
  children: React.ReactNode;
  kisa?: boolean;
}) {
  const aktif = siraAlani === alan;
  return (
    <th
      onClick={() => onTikla(alan)}
      className={`cursor-pointer p-1.5 text-left font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 ${
        kisa ? "w-8" : ""
      }`}
    >
      <span className="flex items-center gap-0.5">
        {children}
        {aktif && (
          siraYonu === "asc"
            ? <ChevronUpIcon className="h-2.5 w-2.5" />
            : <ChevronDownIcon className="h-2.5 w-2.5" />
        )}
      </span>
    </th>
  );
}

function StatChip({
  ikon,
  label,
  sayi,
  renk,
}: {
  ikon: React.ReactNode;
  label: string;
  sayi: number;
  renk: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-700 dark:bg-slate-800">
      <span className={renk}>{ikon}</span>
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
        <div className={`text-2xs font-bold tabular-nums leading-tight ${renk}`}>
          {sayi}
        </div>
      </div>
    </div>
  );
}

function SatirRender({
  satir,
  onSec,
}: {
  satir: SatirDurumu;
  onSec: (secili: boolean) => void;
}) {
  const renkSinif =
    satir.status === "tamam" || satir.status === "cache"
      ? "text-slate-800 dark:text-slate-200"
      : satir.status === "hata"
        ? "text-slate-400 italic"
        : satir.status === "sorgulanıyor"
          ? "text-tkgm-primary"
          : "text-slate-500";

  return (
    <tr
      className={`border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${renkSinif}`}
    >
      <td className="p-1.5">
        <input
          type="checkbox"
          checked={satir.secili}
          onChange={(e) => onSec(e.target.checked)}
          disabled={!satir.parsel}
          className="h-3 w-3 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
        />
      </td>
      <td className="p-1.5 tabular-nums text-slate-400">{satir.index + 1}</td>
      <td className="p-1.5">
        <div className="font-mono text-[10px] tabular-nums">
          {satir.input.lat.toFixed(4)}, {satir.input.lng.toFixed(4)}
        </div>
        {satir.input.label && (
          <div className="text-[9px] italic text-slate-400">{satir.input.label}</div>
        )}
      </td>
      <td className="p-1.5 tabular-nums">{satir.parsel?.adaNo ?? "—"}</td>
      <td className="p-1.5 tabular-nums">{satir.parsel?.parselNo ?? "—"}</td>
      <td className="p-1.5 tabular-nums">
        {satir.parsel?.alan != null
          ? `${satir.parsel.alan.toLocaleString("tr-TR")} m²`
          : "—"}
      </td>
      <td className="p-1.5 truncate max-w-[100px]">{satir.parsel?.nitelik ?? "—"}</td>
      <td className="p-1.5 truncate max-w-[80px]">{satir.parsel?.ilceAd ?? "—"}</td>
      <td className="p-1.5 text-center">
        <DurumIkonu status={satir.status} hata={satir.hata} />
      </td>
    </tr>
  );
}

function DurumIkonu({ status, hata }: { status: Status; hata: string | null }) {
  if (status === "tamam")
    return <CheckIcon className="mx-auto h-3.5 w-3.5 text-accent-success" />;
  if (status === "cache")
    return (
      <span title="Cache'ten geldi (TKGM çağrısı yok)">
        <DatabaseIcon className="mx-auto h-3.5 w-3.5 text-blue-500" />
      </span>
    );
  if (status === "hata")
    return (
      <span title={hata ?? "hata"}>
        <XCircleIcon className="mx-auto h-3.5 w-3.5 text-accent-danger" />
      </span>
    );
  if (status === "sorgulanıyor")
    return (
      <div className="mx-auto h-3 w-3 animate-spin rounded-full border-2 border-tkgm-primary border-t-transparent" />
    );
  return <ClockIcon className="mx-auto h-3.5 w-3.5 text-slate-400" />;
}
