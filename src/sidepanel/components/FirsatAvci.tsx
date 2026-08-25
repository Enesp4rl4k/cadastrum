/**
 * Fırsat Avcısı — Agentic AI UI
 *
 * Kullanıcı doğal dil sorgusu girer, backend AI ajan:
 *   1. Sorguyu parse eder (Gemini)
 *   2. Cadastrum DB'den emsal arar
 *   3. Milli Emlak ihalelerini kontrol eder
 *   4. Sonuçları değerlendirir + özet üretir
 *
 * Tamamen yasal — scraping yok, resmi API + kendi verimiz.
 *
 * Kullanım: LabView içinde "Fırsat Avcısı" tab'ı
 */

import { useState, useRef } from "react";
import {
  Search as SearchIcon,
  Loader2 as LoaderIcon,
  Sparkles as SparklesIcon,
  MapPin as MapPinIcon,
  TrendingUp as TrendingUpIcon,
  Building2 as BuildingIcon,
  AlertCircle as AlertIcon,
  ChevronRight as ChevronIcon,
} from "lucide-react";

// ── Tipler ────────────────────────────────────────────────────────────────────

interface AjanSonuc {
  tip: "emsal" | "milli_emlak" | "bolge";
  fiyat_per_m2?: number;
  m2?: number | null;
  toplam_tl?: number;
  konum: string;
  mesafe_m?: number;
  kaynak: string;
  puan?: number;
  not?: string;
}

interface AjanYanit {
  sorgu: string;
  parse: {
    il?: string | null;
    ilce?: string | null;
    kategori: string;
    maxFiyatTL?: number | null;
    minM2?: number | null;
    radiusKm: number;
  };
  sonuclar: AjanSonuc[];
  ozet: string;
  sorgulanan_kaynaklar: string[];
  toplam_sonuc: number;
  kalan_kota?: number;
}

import { BACKEND_API as API_BASE } from "../../lib/api-constants";

const ORNEK_SORGULAR = [
  "İzmir'de 2 milyon altı imarlı arsa",
  "Ankara çevresi 500m² üstü tarla yatırımlık",
  "İstanbul Avrupa yakasında 1M altı gelişim bölgesi",
  "Milli emlak ihalesi Konya arsa",
  "Antalya sahil yakını ucuz tarla",
];

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function fmtTL(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ₺`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K ₺`;
  return `${n.toLocaleString("tr-TR")} ₺`;
}

function fmtMesafe(m?: number): string {
  if (!m) return "";
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function sonucIkon(tip: AjanSonuc["tip"]) {
  switch (tip) {
    case "emsal": return <MapPinIcon className="h-3.5 w-3.5 text-blue-500" />;
    case "milli_emlak": return <BuildingIcon className="h-3.5 w-3.5 text-amber-500" />;
    case "bolge": return <TrendingUpIcon className="h-3.5 w-3.5 text-emerald-500" />;
  }
}

// ── Sonuç kartı ───────────────────────────────────────────────────────────────

function SonucKarti({ sonuc }: { sonuc: AjanSonuc }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {sonucIkon(sonuc.tip)}
          <span className="truncate text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            {sonuc.konum}
          </span>
          {sonuc.mesafe_m != null && (
            <span className="text-[9px] text-slate-400 flex-shrink-0">
              {fmtMesafe(sonuc.mesafe_m)}
            </span>
          )}
        </div>
        <span className="flex-shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
          {sonuc.kaynak}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-3">
        {sonuc.fiyat_per_m2 && (
          <div>
            <div className="text-[10px] text-slate-400">TL/m²</div>
            <div className="text-xs font-bold tabular-nums text-blue-700 dark:text-blue-400">
              {sonuc.fiyat_per_m2.toLocaleString("tr-TR")}
            </div>
          </div>
        )}
        {sonuc.m2 && (
          <div>
            <div className="text-[10px] text-slate-400">Alan</div>
            <div className="text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
              {sonuc.m2.toLocaleString("tr-TR")} m²
            </div>
          </div>
        )}
        {sonuc.toplam_tl && (
          <div>
            <div className="text-[10px] text-slate-400">Toplam</div>
            <div className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              ~{fmtTL(sonuc.toplam_tl)}
            </div>
          </div>
        )}
      </div>

      {sonuc.not && (
        <p className="mt-1 text-[9px] text-slate-400 dark:text-slate-500 leading-relaxed">
          {sonuc.not}
        </p>
      )}
    </div>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export function FirsatAvci() {
  const [sorgu, setSorgu] = useState("");
  const [arama, setArama] = useState(false);
  const [yanit, setYanit] = useState<AjanYanit | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function ara(q?: string) {
    const metin = (q ?? sorgu).trim();
    if (!metin || arama) return;

    setArama(true);
    setHata(null);
    setYanit(null);

    try {
      // JWT token — chrome.storage'dan
      const tokenData = await chrome.storage.local.get("cadastrum_token");
      const token = typeof tokenData["cadastrum_token"] === "string"
        ? tokenData["cadastrum_token"]
        : null;

      if (!token) {
        setHata("Bu özellik için giriş yapmanız gerekiyor. Ayarlar → Hesap bölümünden giriş yapın.");
        return;
      }

      const res = await fetch(`${API_BASE}/ai-ajan/firsat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ sorgu: metin }),
        signal: AbortSignal.timeout(30_000),
      });

      const veri = await res.json() as AjanYanit & { hata?: string };
      if (!res.ok || veri.hata) {
        setHata(veri.hata ?? `Hata: ${res.status}`);
        return;
      }

      setYanit(veri);
      if (q) setSorgu(q);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Bağlantı hatası");
    } finally {
      setArama(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto p-3">
      {/* Başlık */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
          <SparklesIcon className="h-4 w-4 text-white" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Fırsat Avcısı</h2>
          <p className="text-[10px] text-slate-400">AI destekli yasal kaynak taraması</p>
        </div>
      </div>

      {/* Arama kutusu */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={sorgu}
          onChange={(e) => setSorgu(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void ara(); }}
          placeholder="İzmir'de 2 milyon altı imarlı arsa..."
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-indigo-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800"
          disabled={arama}
        />
        <button
          type="button"
          onClick={() => void ara()}
          disabled={!sorgu.trim() || arama}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-300 transition"
          aria-label="Ara"
        >
          {arama
            ? <LoaderIcon className="h-4 w-4 animate-spin" />
            : <SearchIcon className="h-4 w-4" />
          }
        </button>
      </div>

      {/* Örnek sorgular */}
      {!yanit && !arama && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Örnek sorgular</p>
          {ORNEK_SORGULAR.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void ara(q)}
              className="flex w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-left text-[11px] text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 transition"
            >
              <ChevronIcon className="h-3 w-3 flex-shrink-0 text-slate-300" />
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Hata */}
      {hata && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
          <AlertIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p>{hata}</p>
        </div>
      )}

      {/* Yükleniyor */}
      {arama && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
          <LoaderIcon className="h-6 w-6 animate-spin text-indigo-500" />
          <p className="text-xs">AI ajan çalışıyor…</p>
          <p className="text-[10px] text-slate-300">Emsal DB + Milli Emlak taranıyor</p>
        </div>
      )}

      {/* Sonuçlar */}
      {yanit && (
        <div className="space-y-3">
          {/* AI özet */}
          <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 p-3 dark:from-indigo-950/30 dark:to-purple-950/20">
            <div className="flex items-center gap-1.5 mb-1.5">
              <SparklesIcon className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">AI Değerlendirmesi</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
              {yanit.ozet}
            </p>
          </div>

          {/* Arama detayları */}
          <div className="flex flex-wrap gap-1.5 text-[9px]">
            {yanit.parse.il && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                📍 {yanit.parse.il}
              </span>
            )}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
              🏷️ {yanit.parse.kategori}
            </span>
            {yanit.parse.maxFiyatTL && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                💰 max {fmtTL(yanit.parse.maxFiyatTL)}
              </span>
            )}
            {yanit.parse.minM2 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                📐 min {yanit.parse.minM2}m²
              </span>
            )}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
              🔍 {yanit.sorgulanan_kaynaklar.join(" · ")}
            </span>
          </div>

          {/* Sonuç listesi */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {yanit.toplam_sonuc} sonuç — en iyi {yanit.sonuclar.length} gösteriliyor
            </p>
            {yanit.sonuclar.map((s, i) => (
              <SonucKarti key={i} sonuc={s} />
            ))}
          </div>

          {/* Yasal not */}
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950/20">
            <p className="text-[9px] text-amber-700 dark:text-amber-400 leading-relaxed">
              ⚖️ Bu sonuçlar Cadastrum emsal veritabanı ve Milli Emlak resmi ihale verilerinden derlenmektedir.
              Gerçek satış kararı için parsel bazında TKGM tescil ve e-Plan imar sorgusu yapılmalıdır.
            </p>
          </div>

          {yanit.kalan_kota != null && (
            <p className="text-[9px] text-slate-400 text-right">
              Kalan günlük AI ajan kotası: {yanit.kalan_kota}
            </p>
          )}

          {/* Yeni sorgu butonu */}
          <button
            type="button"
            onClick={() => { setYanit(null); setSorgu(""); inputRef.current?.focus(); }}
            className="w-full rounded-lg border border-slate-200 py-2 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 transition"
          >
            ← Yeni Sorgu
          </button>
        </div>
      )}
    </div>
  );
}
