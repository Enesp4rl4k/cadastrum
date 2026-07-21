/**
 * AI Yatırım Danışmanı Chat Kartı — Faz B3/B4
 * Parsel bağlamlı RAG sohbet. Guardrails backend'de uygulanır.
 * JWT gerektirir — giriş yapmamış kullanıcıya paywall gösterir.
 */
import { useEffect, useRef, useState } from "react";
import {
  Bot as BotIcon,
  Send as SendIcon,
  Loader2 as LoaderIcon,
  Lock as LockIcon,
  X as CloseIcon,
} from "lucide-react";
import { Section } from "../ui/Card";

/** chrome.storage.local'dan JWT token al (BildirimKurali pattern'i ile aynı) */
async function tokenAl(): Promise<string | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
  const data = await chrome.storage.local.get("cadastrum_token");
  const t = data["cadastrum_token"];
  return typeof t === "string" ? t : null;
}

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

// ── Tip tanımları ─────────────────────────────────────────────────────────────

interface ParselBaglam {
  il: string;
  ilce: string;
  mahalle?: string;
  kategori?: string;
  m2?: number;
  medyan_tlm2?: number;
  alt_tlm2?: number;
  ust_tlm2?: number;
  guven_skoru?: number;
  imar_tipi?: string;
  emsal?: number;
  taks?: number;
  gelecek_skor?: number;
  gelecek_etiket?: string;
  yatirim_skoru?: number;
  yatirim_etiket?: string;
}

interface SohbetMesaj {
  rol: "kullanici" | "asistan";
  icerik: string;
  sureMs?: number;
}

interface Props {
  baglam?: ParselBaglam;
  /** Giriş yapılmamışsa paywall göster */
  girisYapildi?: boolean;
}

// ── Yardımcı ─────────────────────────────────────────────────────────────────

function BalonKullanici({ icerik }: { icerik: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-xl rounded-br-sm bg-blue-600 px-3 py-1.5 text-[10px] leading-relaxed text-white shadow-sm">
        {icerik}
      </div>
    </div>
  );
}

function BalonAsistan({ icerik, yukleniyor }: { icerik: string; yukleniyor?: boolean }) {
  return (
    <div className="flex items-start gap-1.5">
      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/50">
        <BotIcon className="h-3 w-3 text-violet-600 dark:text-violet-400" aria-hidden="true" />
      </div>
      <div className="max-w-[85%] rounded-xl rounded-tl-sm border border-slate-200 bg-white px-3 py-1.5 text-[10px] leading-relaxed text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        {yukleniyor ? (
          <span className="flex items-center gap-1 text-slate-400">
            <LoaderIcon className="h-3 w-3 animate-spin" aria-hidden="true" />
            Yanıt hazırlanıyor…
          </span>
        ) : (
          icerik
        )}
      </div>
    </div>
  );
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export function AIDanismanKarti({ baglam, girisYapildi = false }: Props) {
  const [mesajlar, setMesajlar] = useState<SohbetMesaj[]>([]);
  const [girdi, setGirdi] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [kalanKota, setKalanKota] = useState<number | null>(null);
  const [acik, setAcik] = useState(false);
  const listeSonuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mesaj listesi en alta scroll
  useEffect(() => {
    listeSonuRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mesajlar, yukleniyor]);

  // Panel açıldığında inputa odaklan
  useEffect(() => {
    if (acik) setTimeout(() => inputRef.current?.focus(), 100);
  }, [acik]);

  const gondер = async () => {
    if (!girdi.trim() || yukleniyor) return;
    const metин = girdi.trim();
    setGirdi("");
    setHata(null);

    const yeniMesaj: SohbetMesaj = { rol: "kullanici", icerik: metин };
    setMesajlar((m) => [...m, yeniMesaj]);
    setYukleniyor(true);

    try {
      const token = await tokenAl();
      if (!token) throw new Error("Giriş gerekli");

      const gecmis = mesajlar.slice(-6).map((m) => ({
        rol: m.rol,
        icerik: m.icerik,
      }));

      const res = await fetch(`${API_BASE}/ai-danisman/sohbet`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mesaj: metин,
          parsel_baglam: baglam ?? null,
          sohbet_gecmisi: gecmis,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (res.status === 429) {
        const d = await res.json() as { hata?: string; kalan?: number };
        throw new Error(d.hata ?? "Günlük kota doldu.");
      }
      if (!res.ok) {
        const d = await res.json() as { hata?: string };
        throw new Error(d.hata ?? `HTTP ${res.status}`);
      }

      const d = await res.json() as { yanit: string; kalanKota?: number; sureMs?: number };
      setMesajlar((m) => [...m, {
        rol: "asistan",
        icerik: d.yanit,
        sureMs: d.sureMs,
      }]);
      if (d.kalanKota != null) setKalanKota(d.kalanKota);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
      setHata(msg);
      // Kullanıcı mesajını geri al
      setMesajlar((m) => m.filter((x) => x !== yeniMesaj));
      setGirdi(metин);
    } finally {
      setYukleniyor(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void gondер();
    }
  };

  // ── Paywall ─────────────────────────────────────────────────────────────────
  if (!girisYapildi) {
    return (
      <Section
        title="AI Yatırım Danışmanı"
        icon={<BotIcon className="h-3.5 w-3.5" aria-hidden="true" />}
        accent="ai"
      >
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <LockIcon className="h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Parsel bağlamlı AI danışman
          </p>
          <p className="text-[10px] text-slate-400">
            Giriş yaparak günlük 3 sorgu hakkı edinin.
          </p>
        </div>
      </Section>
    );
  }

  // ── Kapalı durum (özet buton) ────────────────────────────────────────────────
  if (!acik) {
    return (
      <Section
        title="AI Yatırım Danışmanı"
        icon={<BotIcon className="h-3.5 w-3.5" aria-hidden="true" />}
        accent="ai"
        actions={
          <button
            onClick={() => setAcik(true)}
            className="rounded-md bg-violet-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            aria-label="AI danışman sohbeti aç"
          >
            Sor
          </button>
        }
      >
        <p className="px-3 pb-2 text-[10px] text-slate-500 dark:text-slate-400">
          Parsel imar, fiyat ve yatırım senaryoları hakkında soru sor.
          {kalanKota != null && ` (${kalanKota} kota kaldı)`}
        </p>
      </Section>
    );
  }

  // ── Açık sohbet paneli ───────────────────────────────────────────────────────
  return (
    <Section
      title="AI Yatırım Danışmanı"
      icon={<BotIcon className="h-3.5 w-3.5" aria-hidden="true" />}
      accent="ai"
      glow="ai"
      actions={
        <button
          onClick={() => setAcik(false)}
          className="rounded p-0.5 text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:hover:text-slate-300"
          aria-label="Sohbeti kapat"
        >
          <CloseIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      }
    >
      <div className="flex flex-col gap-2 p-2">
        {/* Mesaj listesi */}
        <div
          className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-0.5"
          role="log"
          aria-live="polite"
          aria-label="Sohbet geçmişi"
        >
          {mesajlar.length === 0 && (
            <p className="text-center text-[10px] text-slate-400 py-4">
              Parsel hakkında ne sormak istiyorsunuz?
            </p>
          )}
          {mesajlar.map((m, i) =>
            m.rol === "kullanici" ? (
              <BalonKullanici key={i} icerik={m.icerik} />
            ) : (
              <BalonAsistan key={i} icerik={m.icerik} />
            )
          )}
          {yukleniyor && <BalonAsistan icerik="" yukleniyor />}
          <div ref={listeSonuRef} aria-hidden="true" />
        </div>

        {/* Hata */}
        {hata && (
          <p className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400" role="alert">
            {hata}
          </p>
        )}

        {/* Giriş alanı */}
        <div className="flex items-center gap-1.5">
          <label htmlFor="ai-danisman-input" className="sr-only">Sorunuzu yazın</label>
          <input
            id="ai-danisman-input"
            ref={inputRef}
            type="text"
            value={girdi}
            onChange={(e) => setGirdi(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Sorunuzu yazın…"
            maxLength={1000}
            disabled={yukleniyor}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-800 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-violet-500 dark:focus:ring-violet-900/50"
            aria-describedby={hata ? "ai-hata" : undefined}
          />
          <button
            onClick={() => void gondер()}
            disabled={!girdi.trim() || yukleniyor}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            aria-label="Mesaj gönder"
          >
            {yukleniyor
              ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              : <SendIcon className="h-3.5 w-3.5" aria-hidden="true" />
            }
          </button>
        </div>

        {/* Kota + disclaimer */}
        <div className="flex items-center justify-between text-[9px] text-slate-400">
          <span>Model çıktısı · yatırım tavsiyesi değildir</span>
          {kalanKota != null && <span>{kalanKota} kota</span>}
        </div>
      </div>
    </Section>
  );
}
