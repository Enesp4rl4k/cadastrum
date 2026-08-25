/**
 * Fırsat Avcısı — AI Ajan UI
 *
 * Backend /v1/ai-ajan/firsat endpoint'ini kullanır (Gemini Function Calling).
 * JWT gerektiren Pro endpoint — giriş yapılmamışsa CTA gösterir.
 *
 * Kaynaklar: Cadastrum D1 spatial emsal + Milli Emlak ihale + bölge skoru
 * Scraping YOK — sadece yasal API'ler.
 */
import { useState } from "react";
import {
  Search as SearchIcon,
  Loader2 as LoaderIcon,
  Sparkles as SparklesIcon,
} from "lucide-react";
import { useLisans } from "../../lib/lisans";

import { BACKEND_API } from "../../lib/api-constants";
const API_BASE = BACKEND_API;

interface FirsatSonucu {
  il?: string;
  ilce?: string;
  mahalle?: string;
  fiyat_per_m2?: number;
  m2?: number;
  mesafe_m?: number;
  imar?: string;
  bolge_skoru?: number;
}

interface AjanYanit {
  sonuclar: FirsatSonucu[];
  ozet: string;
  sorgulanan_kaynaklar: string[];
}

const ORNEK_SORGULAR = [
  "İzmir'de 2M altı imarlı arsa",
  "Ankara'da 1000m² üstü tarla",
  "İstanbul Anadolu yakası fırsat",
];

export function FirsatAvciPanel() {
  const lisans = useLisans();
  const [sorgu, setSorgu] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [yanit, setYanit] = useState<AjanYanit | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  async function ara() {
    if (!sorgu.trim()) return;
    setYukleniyor(true);
    setHata(null);
    setYanit(null);

    try {
      const tokenRaw = await chrome.storage.local.get("cadastrum_token");
      const token = typeof tokenRaw["cadastrum_token"] === "string"
        ? tokenRaw["cadastrum_token"]
        : null;

      if (!token) {
        setHata("Bu özellik için giriş yapmanız gerekiyor.");
        return;
      }

      const res = await fetch(`${API_BASE}/ai-ajan/firsat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ sorgu }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        if (res.status === 401) {
          setHata("Oturum süresi dolmuş. Lütfen tekrar giriş yapın.");
        } else if (res.status === 429) {
          setHata("Saatlik limit aşıldı (10 sorgu/saat). Biraz bekleyin.");
        } else if (res.status === 403) {
          setHata("Bu özellik Pro+ planı gerektirir.");
        } else {
          setHata(`Sunucu hatası: ${res.status}`);
        }
        return;
      }

      const veri = await res.json() as AjanYanit;
      setYanit(veri);
    } catch (e) {
      const mesaj = e instanceof Error ? e.message : String(e);
      if (/timeout/i.test(mesaj)) {
        setHata("Zaman aşımı — AI analizi 30 saniyede tamamlanamadı. Daha basit bir sorgu deneyin.");
      } else {
        setHata(mesaj || "Bağlantı hatası");
      }
    } finally {
      setYukleniyor(false);
    }
  }

  const fmtTLm2 = (n: number) => `${n.toLocaleString("tr-TR")} ₺/m²`;

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Başlık */}
      <div className="flex items-center gap-2">
        <SparklesIcon className="h-4 w-4 text-violet-600 dark:text-violet-400 flex-shrink-0" aria-hidden="true" />
        <div>
          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100">
            Fırsat Avcısı
          </div>
          <div className="text-[9px] text-slate-500 dark:text-slate-400">
            Doğal dil ile Türkiye genelinde fırsat ara
          </div>
        </div>
        {lisans.can("ai-fiyat") && (
          <span className="ml-auto rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
            Pro
          </span>
        )}
      </div>

      {/* Örnek sorgular */}
      <div className="space-y-1">
        <div className="text-[9px] font-medium uppercase tracking-wide text-slate-400">
          Örnek sorgular
        </div>
        <div className="flex flex-wrap gap-1">
          {ORNEK_SORGULAR.map((ornek) => (
            <button
              key={ornek}
              type="button"
              onClick={() => setSorgu(ornek)}
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
            >
              {ornek}
            </button>
          ))}
        </div>
      </div>

      {/* Arama input */}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={sorgu}
          onChange={(e: { target: { value: string } }) => setSorgu(e.target.value)}
          onKeyDown={(e: { key: string }) => { if (e.key === "Enter") void ara(); }}
          placeholder="örn. Bursa'da 500m²+ imarlı arsa 3M altı"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          aria-label="Fırsat arama sorgusu"
        />
        <button
          type="button"
          onClick={() => void ara()}
          disabled={!sorgu.trim() || yukleniyor}
          className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-[11px] font-medium text-white hover:bg-violet-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 transition"
          aria-label={yukleniyor ? "Aranıyor" : "Ara"}
        >
          {yukleniyor
            ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            : <SearchIcon className="h-3.5 w-3.5" aria-hidden="true" />
          }
          {yukleniyor ? "Arıyor…" : "Ara"}
        </button>
      </div>

      {/* Hata */}
      {hata && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-800/50 dark:bg-red-950/20 dark:text-red-400"
        >
          {hata}
          {/giriş/i.test(hata) && (
            <button
              type="button"
              onClick={() => chrome.tabs.create({ url: "https://cadastrum.com.tr/giris?source=extension" })}
              className="ml-2 underline hover:text-red-900 dark:hover:text-red-300"
            >
              Giriş Yap →
            </button>
          )}
        </div>
      )}

      {/* Sonuçlar */}
      {yanit && (
        <div className="space-y-2">
          {/* AI Özeti */}
          {yanit.ozet && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 dark:border-violet-800/50 dark:bg-violet-950/20">
              <div className="flex items-center gap-1.5 mb-1">
                <SparklesIcon className="h-3 w-3 text-violet-600 dark:text-violet-400 flex-shrink-0" aria-hidden="true" />
                <span className="text-[10px] font-semibold text-violet-800 dark:text-violet-300">
                  AI Değerlendirmesi
                </span>
              </div>
              <p className="text-[10px] leading-relaxed text-slate-700 dark:text-slate-300">
                {yanit.ozet}
              </p>
            </div>
          )}

          {/* Sorgulanan kaynaklar */}
          {yanit.sorgulanan_kaynaklar?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {yanit.sorgulanan_kaynaklar.map((k) => (
                <span
                  key={k}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                >
                  ✓ {k}
                </span>
              ))}
            </div>
          )}

          {/* Sonuç listesi */}
          {yanit.sonuclar.length > 0 ? (
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                {yanit.sonuclar.length} sonuç bulundu
              </div>
              {yanit.sonuclar.map((s, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-medium text-slate-800 dark:text-slate-100 truncate">
                        {[s.mahalle, s.ilce, s.il].filter(Boolean).join(", ") || "Konum bilgisi yok"}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">
                        {s.m2 && <span>{s.m2.toLocaleString("tr-TR")} m²</span>}
                        {s.imar && <span>İmar: {s.imar}</span>}
                        {s.mesafe_m != null && (
                          <span>
                            {s.mesafe_m < 1000
                              ? `${Math.round(s.mesafe_m)}m`
                              : `${(s.mesafe_m / 1000).toFixed(1)}km`}
                          </span>
                        )}
                        {s.bolge_skoru != null && (
                          <span className="text-violet-600 dark:text-violet-400 font-medium">
                            Skor: {s.bolge_skoru}/100
                          </span>
                        )}
                      </div>
                    </div>
                    {s.fiyat_per_m2 && (
                      <div className="flex-shrink-0 text-right">
                        <div className="text-[11px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {fmtTLm2(s.fiyat_per_m2)}
                        </div>
                        {s.m2 && (
                          <div className="text-[9px] text-slate-400 tabular-nums">
                            ≈ {(s.fiyat_per_m2 * s.m2 / 1_000_000).toFixed(1)}M ₺
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-400">
              Kriterlere uyan sonuç bulunamadı. Farklı filtreler veya daha geniş bir bölge deneyin.
            </div>
          )}
        </div>
      )}

      {/* Boş durum — kullanım rehberi */}
      {!yukleniyor && !yanit && !hata && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
          <strong className="block text-slate-600 dark:text-slate-300 mb-0.5">Nasıl çalışır?</strong>
          Sorgunuz Gemini AI ile analiz edilir. Cadastrum D1 emsal veritabanı,
          Milli Emlak ihaleleri ve bölge skoru birleştirilir.
          <br />
          <span className="text-[9px] text-slate-400">
            Kaynak: Cadastrum D1 + Milli Emlak resmi API — scraping yok.
          </span>
        </div>
      )}
    </div>
  );
}
