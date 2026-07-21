/**
 * Arazi Avcısı Kartı — Faz A3/A4
 * Kriter formu → ranked arazi adayları listesi + kriter kaydetme.
 */
import { useState } from "react";
import { Search as SearchIcon, Loader2 as LoaderIcon, Star as StarIcon, Bell as BellIcon } from "lucide-react";
import { Section } from "../ui/Card";

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

interface AraziAday {
  il_norm: string;
  ilce_norm: string;
  mahalle_norm: string | null;
  kategori: string;
  medyan_tlm2: number;
  ilan_adet: number;
  skor: number;
  skor_etiket: string;
}

interface AraciSonuc {
  adaylar: AraziAday[];
  toplam: number;
  disclaimer: string;
}

async function tokenAl(): Promise<string | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
  const data = await chrome.storage.local.get("cadastrum_token");
  const t = data["cadastrum_token"];
  return typeof t === "string" ? t : null;
}

const KATEGORI_SECENEKLER = [
  { value: "arsa", label: "Arsa" },
  { value: "tarla", label: "Tarla" },
  { value: "konut", label: "Konut" },
];

const IMAR_SECENEKLER = [
  { value: "", label: "Tümü" },
  { value: "konut", label: "Konut" },
  { value: "ticari", label: "Ticari" },
  { value: "sanayi", label: "Sanayi" },
  { value: "tarim", label: "Tarım" },
  { value: "karma", label: "Karma" },
];

function skorRenk(skor: number): string {
  if (skor >= 65) return "text-emerald-600 dark:text-emerald-400";
  if (skor >= 45) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

export function AraziAvciKarti() {
  const [il, setIl] = useState("");
  const [ilce, setIlce] = useState("");
  const [kategori, setKategori] = useState("arsa");
  const [imarTipi, setImarTipi] = useState("");
  const [maxTlm2, setMaxTlm2] = useState("");
  const [sonuc, setSonuc] = useState<AraciSonuc | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [kaydedildi, setKaydedildi] = useState(false);

  const ara = async () => {
    setYukleniyor(true);
    setHata(null);
    setSonuc(null);
    try {
      const res = await fetch(`${API_BASE}/arazi-avci/ara`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          il: il || undefined,
          ilce: ilce || undefined,
          kategori,
          imar_tipi: imarTipi || undefined,
          max_tlm2: maxTlm2 ? Number(maxTlm2) : undefined,
          limit: 15,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const d = await res.json() as AraciSonuc & { ok: boolean };
      setSonuc(d);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Arama başarısız");
    } finally {
      setYukleniyor(false);
    }
  };

  const kriterKaydet = async () => {
    const token = await tokenAl();
    if (!token) { setHata("Kriter kaydetmek için giriş gerekli"); return; }
    try {
      const res = await fetch(`${API_BASE}/arazi-avci/kriter`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ad: `${kategori} — ${il || "Tüm Türkiye"}${ilce ? ` / ${ilce}` : ""}`,
          il: il || undefined,
          ilce: ilce || undefined,
          kategori,
          imar_tipi: imarTipi || undefined,
          max_tlm2: maxTlm2 ? Number(maxTlm2) : undefined,
          uyari_aktif: true,
        }),
      });
      if (res.ok) setKaydedildi(true);
      else { const d = await res.json() as { error?: string }; throw new Error(d.error); }
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Kayıt başarısız");
    }
  };

  return (
    <Section
      title="Arazi Avcısı"
      icon={<SearchIcon className="h-3.5 w-3.5" aria-hidden="true" />}
      accent="info"
    >
      <div className="space-y-2 p-2">
        {/* Filtre formu */}
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label htmlFor="avci-il" className="block text-[9px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">İl</label>
            <input
              id="avci-il"
              type="text"
              placeholder="İstanbul"
              value={il}
              onChange={(e) => setIl(e.target.value)}
              className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-800 placeholder-slate-300 focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="avci-ilce" className="block text-[9px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">İlçe</label>
            <input
              id="avci-ilce"
              type="text"
              placeholder="Beykoz"
              value={ilce}
              onChange={(e) => setIlce(e.target.value)}
              className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-800 placeholder-slate-300 focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="avci-kategori" className="block text-[9px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">Kategori</label>
            <select
              id="avci-kategori"
              value={kategori}
              onChange={(e) => setKategori(e.target.value)}
              className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-800 focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {KATEGORI_SECENEKLER.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="avci-imar" className="block text-[9px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">İmar tipi</label>
            <select
              id="avci-imar"
              value={imarTipi}
              onChange={(e) => setImarTipi(e.target.value)}
              className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-800 focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {IMAR_SECENEKLER.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="avci-max-tlm2" className="block text-[9px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
            Maks TL/m² (opsiyonel)
          </label>
          <input
            id="avci-max-tlm2"
            type="number"
            min={0}
            placeholder="ör. 50000"
            value={maxTlm2}
            onChange={(e) => setMaxTlm2(e.target.value)}
            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-800 placeholder-slate-300 focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        {/* Butonlar */}
        <div className="flex gap-1.5">
          <button
            onClick={() => void ara()}
            disabled={yukleniyor}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-[10px] font-medium text-white hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            aria-label="Arazi ara"
          >
            {yukleniyor
              ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              : <SearchIcon className="h-3.5 w-3.5" aria-hidden="true" />
            }
            {yukleniyor ? "Aranıyor…" : "Ara"}
          </button>
          {sonuc && !kaydedildi && (
            <button
              onClick={() => void kriterKaydet()}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] text-slate-600 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              title="Kriteri kaydet ve uyarı al"
              aria-label="Kriteri kaydet ve uyarı al"
            >
              <BellIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          {kaydedildi && (
            <span className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
              <StarIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Kaydedildi
            </span>
          )}
        </div>

        {/* Hata */}
        {hata && (
          <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400" role="alert">
            {hata}
          </p>
        )}

        {/* Sonuçlar */}
        {sonuc && (
          <div className="space-y-1">
            <div className="text-[9px] text-slate-400">{sonuc.toplam} aday bulundu</div>
            {sonuc.adaylar.map((a, i) => (
              <div
                key={`${a.il_norm}-${a.ilce_norm}-${a.mahalle_norm ?? i}`}
                className="flex items-center gap-2 rounded border border-slate-100 bg-slate-50/80 px-2 py-1.5 text-[10px] dark:border-slate-800 dark:bg-slate-900/50"
              >
                <div className={`w-6 text-center font-bold tabular-nums ${skorRenk(a.skor)}`}>
                  {a.skor}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-800 dark:text-slate-200">
                    {a.mahalle_norm
                      ? `${a.mahalle_norm} / ${a.ilce_norm}`
                      : a.ilce_norm}
                    {" · "}
                    <span className="text-slate-500">{a.il_norm}</span>
                  </div>
                  <div className="text-slate-400">
                    {a.medyan_tlm2.toLocaleString("tr-TR")} TL/m² · {a.ilan_adet} ilan · {a.skor_etiket}
                  </div>
                </div>
              </div>
            ))}
            <p className="text-[9px] italic text-slate-400">{sonuc.disclaimer}</p>
          </div>
        )}
      </div>
    </Section>
  );
}
