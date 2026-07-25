/**
 * AjanFirsatTarayici — Agentic Fırsat Tarayıcı MVP
 *
 * Kullanıcı doğal dil ile kriter girer ("İzmir'de 2M altı fırsat ara").
 * Backend /v1/arazi-avci/agent endpoint'i 6 adımlı loop çalıştırır:
 *   1. Bölge taraması
 *   2. Fiyat filtresi
 *   3. Risk kontrolü
 *   4. İmar kontrolü
 *   5. Sıralama
 *   6. Gemini doğal dil rapor
 *
 * Gösterilen bilgiler:
 *   - Adım adım progress (tamamlandı / atlandı / hata)
 *   - AI doğal dil raporu
 *   - Top 10 fırsat listesi (skor + fiyat + konum)
 */

import { useState } from "react";
import {
  Zap as ZapIcon,
  Loader2 as LoaderIcon,
  AlertCircle as AlertIcon,
  CheckCircle2 as CheckIcon,
  XCircle as XCircleIcon,
  MinusCircle as SkipIcon,
  TrendingUp as TrendIcon,
  MapPin as MapPinIcon,
  Sparkles as SparklesIcon,
  Search as SearchIcon,
} from "lucide-react";
import { Section } from "../ui/Card";

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

// ── Tipler ────────────────────────────────────────────────────────────────────

interface AjanAdim {
  ad: string;
  durum: "tamamlandi" | "atlandi" | "hata";
  aday_sayisi: number;
  not?: string;
}

interface AjanAday {
  il_norm: string;
  ilce_norm: string;
  mahalle_norm: string | null;
  kategori: string;
  medyan_tlm2: number;
  ilan_adet: number;
  skor: number;
  skor_etiket: string;
  aciklama: string;
  risk_notu: string | null;
}

interface AjanSonuc {
  ok: boolean;
  sorgu: string;
  adimlar: AjanAdim[];
  adaylar: AjanAday[];
  rapor: string;
  model: string;
  sure_ms: number;
  disclaimer: string;
}

// ── Yardımcı ──────────────────────────────────────────────────────────────────

async function tokenAl(): Promise<string | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
  const data = await chrome.storage.local.get("cadastrum_token");
  const t = data["cadastrum_token"];
  return typeof t === "string" ? t : null;
}

function skorRenk(skor: number): string {
  if (skor >= 65) return "text-emerald-600 dark:text-emerald-400";
  if (skor >= 45) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function skorBg(skor: number): string {
  if (skor >= 65) return "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/50";
  if (skor >= 45) return "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/50";
  return "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800/50";
}

function adimIkon(durum: AjanAdim["durum"]) {
  switch (durum) {
    case "tamamlandi": return <CheckIcon className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />;
    case "atlandi":    return <SkipIcon  className="h-3.5 w-3.5 text-slate-400"   aria-hidden="true" />;
    case "hata":       return <XCircleIcon className="h-3.5 w-3.5 text-red-500"  aria-hidden="true" />;
  }
}

const ORNEK_SORGULAR = [
  "İzmir'de 2M altı arsa fırsatı ara",
  "Bursa'da sanayi yakını tarla bul",
  "Antalya kıyısında düşük fiyatlı arsa",
  "Ankara'da yatırımlık arsa — 500K altı",
];

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export function AjanFirsatTarayici() {
  const [sorgu, setSorgu] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [sonuc, setSonuc] = useState<AjanSonuc | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [adimlarAcik, setAdimlarAcik] = useState(false);

  const calistir = async () => {
    const temiz = sorgu.trim();
    if (!temiz) return;
    setYukleniyor(true);
    setHata(null);
    setSonuc(null);

    try {
      const token = await tokenAl();
      if (!token) {
        setHata("Bu özellik için giriş yapmanız gerekiyor.");
        return;
      }

      const res = await fetch(`${API_BASE}/arazi-avci/agent`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sorgu: temiz }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Sunucu hatası" })) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }

      const d = await res.json() as AjanSonuc;
      setSonuc(d);
      setAdimlarAcik(false);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Ajan çalışırken hata oluştu");
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <Section
      title="Ajan Fırsat Tarayıcı"
      icon={<ZapIcon className="h-3.5 w-3.5" aria-hidden="true" />}
      accent="ai"
      tintedHeader
    >
      <div className="space-y-3 p-2">

        {/* Sorgu girişi */}
        <div className="space-y-1.5">
          <label htmlFor="ajan-sorgu" className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Doğal dil kriteri
          </label>
          <div className="flex gap-1.5">
            <input
              id="ajan-sorgu"
              type="text"
              placeholder="İzmir'de 2M altı arsa fırsatı ara…"
              value={sorgu}
              onChange={(e) => setSorgu(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !yukleniyor) void calistir(); }}
              maxLength={300}
              disabled={yukleniyor}
              className="flex-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-800 placeholder-slate-300 focus:border-violet-400 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-600"
            />
            <button
              type="button"
              onClick={calistir}
              disabled={yukleniyor || !sorgu.trim()}
              className="flex flex-shrink-0 items-center gap-1 rounded border border-violet-300 bg-violet-600 px-2.5 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
              aria-label="Ajanı çalıştır"
            >
              {yukleniyor
                ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                : <SearchIcon className="h-3.5 w-3.5" aria-hidden="true" />
              }
              {yukleniyor ? "Tarıyor…" : "Tara"}
            </button>
          </div>

          {/* Örnek sorgular */}
          {!sonuc && !yukleniyor && (
            <div className="flex flex-wrap gap-1">
              {ORNEK_SORGULAR.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSorgu(s)}
                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Yükleniyor */}
        {yukleniyor && (
          <div className="space-y-2 rounded-md border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-800/50 dark:bg-violet-950/20">
            <div className="flex items-center gap-2 text-2xs text-violet-700 dark:text-violet-300">
              <LoaderIcon className="h-3.5 w-3.5 animate-spin flex-shrink-0" aria-hidden="true" />
              <span>Ajan çalışıyor — bölgeler taranıyor, fırsatlar değerlendiriliyor…</span>
            </div>
            {/* Simüle adım göstergesi */}
            <div className="space-y-1 text-3xs text-violet-600/70 dark:text-violet-400/70">
              {["Bölge taraması", "Fiyat filtresi", "Risk kontrolü", "Sıralama + AI rapor"].map((a, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <LoaderIcon className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
                  <span>{a}…</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hata */}
        {hata && !yukleniyor && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-3xs text-red-800 dark:border-red-800/50 dark:bg-red-950/20 dark:text-red-300">
            <div className="flex items-start gap-1.5">
              <AlertIcon className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
              <span>{hata}</span>
            </div>
            {/giriş|oturum|Pro|hesap/i.test(hata) && (
              <button
                type="button"
                onClick={() => chrome.tabs.create({ url: "https://cadastrum.com.tr/giris?source=extension" })}
                className="mt-1.5 rounded bg-imperial px-2 py-1 text-white text-3xs font-medium hover:bg-imperial-700 transition"
              >
                Giriş Yap →
              </button>
            )}
          </div>
        )}

        {/* Sonuç */}
        {sonuc && !yukleniyor && (
          <div className="space-y-2">

            {/* AI Rapor */}
            {sonuc.rapor && (
              <div className="rounded-md border border-violet-200 bg-violet-50/60 p-2.5 dark:border-violet-800/50 dark:bg-violet-950/20">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                  <SparklesIcon className="h-3 w-3" aria-hidden="true" />
                  AI Analizi
                  {sonuc.model !== "istatistik-only" && (
                    <span className="ml-auto text-[9px] font-normal text-violet-500">{sonuc.model} · {sonuc.sure_ms}ms</span>
                  )}
                </div>
                <p className="text-3xs leading-relaxed text-slate-700 dark:text-slate-300">
                  {sonuc.rapor}
                </p>
              </div>
            )}

            {/* Adımlar toggle */}
            <button
              type="button"
              onClick={() => setAdimlarAcik((v) => !v)}
              className="flex w-full items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400 transition-colors"
            >
              <span className="flex items-center gap-1">
                <ZapIcon className="h-3 w-3" aria-hidden="true" />
                Ajan adımları ({sonuc.adimlar.length})
              </span>
              <span>{adimlarAcik ? "▲" : "▼"}</span>
            </button>

            {adimlarAcik && (
              <div className="space-y-1 rounded border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-700 dark:bg-slate-800/40">
                {sonuc.adimlar.map((adim, i) => (
                  <div key={i} className="flex items-start gap-2 text-3xs">
                    <span className="mt-0.5 flex-shrink-0">{adimIkon(adim.durum)}</span>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{adim.ad}</span>
                      {adim.aday_sayisi > 0 && (
                        <span className="ml-1 text-slate-400">({adim.aday_sayisi} aday)</span>
                      )}
                      {adim.not && (
                        <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">{adim.not}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Aday listesi */}
            {sonuc.adaylar.length > 0 ? (
              <div className="space-y-1">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Top {sonuc.adaylar.length} Fırsat Bölgesi
                </div>
                {sonuc.adaylar.map((aday, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-md border p-2 ${skorBg(aday.skor)}`}
                  >
                    {/* Sıra + skor */}
                    <div className="flex-shrink-0 text-center">
                      <div className="text-[9px] text-slate-400">#{i + 1}</div>
                      <div className={`text-sm font-bold tabular-nums ${skorRenk(aday.skor)}`}>
                        {aday.skor}
                      </div>
                      <div className="text-[8px] text-slate-400">{aday.skor_etiket}</div>
                    </div>

                    {/* Konum + fiyat */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-2xs font-semibold text-slate-800 dark:text-slate-200">
                        <MapPinIcon className="h-3 w-3 flex-shrink-0 text-slate-400" aria-hidden="true" />
                        <span className="truncate capitalize">
                          {aday.il_norm}
                          {aday.ilce_norm ? ` / ${aday.ilce_norm}` : ""}
                          {aday.mahalle_norm ? ` / ${aday.mahalle_norm}` : ""}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-3xs text-slate-600 dark:text-slate-400">
                        <span className="font-mono font-semibold tabular-nums">
                          {aday.medyan_tlm2.toLocaleString("tr-TR")} ₺/m²
                        </span>
                        <span>·</span>
                        <span>{aday.ilan_adet} ilan</span>
                        <span>·</span>
                        <span>{aday.kategori}</span>
                      </div>
                      {aday.risk_notu && (
                        <div className="mt-0.5 flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400">
                          <AlertIcon className="h-2.5 w-2.5 flex-shrink-0" aria-hidden="true" />
                          {aday.risk_notu}
                        </div>
                      )}
                    </div>

                    {/* Trend ikonu */}
                    <TrendIcon className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${skorRenk(aday.skor)}`} aria-hidden="true" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded border border-slate-200 bg-slate-50 p-3 text-center text-3xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
                Kriterlere uygun bölge bulunamadı. Filtrelerinizi genişletin.
              </div>
            )}

            {/* Disclaimer */}
            {sonuc.disclaimer && (
              <p className="text-[9px] text-slate-400 dark:text-slate-500 leading-snug">
                {sonuc.disclaimer}
              </p>
            )}

            {/* Yeni arama butonu */}
            <button
              type="button"
              onClick={() => { setSonuc(null); setSorgu(""); }}
              className="w-full rounded border border-slate-200 bg-white py-1 text-[9px] text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 transition-colors"
            >
              Yeni arama
            </button>
          </div>
        )}

        {/* Bilgi notu — ilk açılışta */}
        {!sonuc && !yukleniyor && !hata && (
          <p className="text-[9px] text-slate-400 dark:text-slate-500 leading-relaxed">
            Ajan Türkiye genelinde bölge verilerini tarar, fiyat ve risk filtrelerini uygular,
            Gemini ile fırsat raporu üretir. Pro plan gerektirir.
          </p>
        )}

      </div>
    </Section>
  );
}
