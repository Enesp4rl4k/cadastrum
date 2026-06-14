/**
 * Bootstrap View — admin only (üretimde).
 *
 * Sahibinden ilçe sayfalarını arka plan tab'larında otomatik açar, content
 * script `sahibinden-liste.ts` her sayfada ilanları yakalar, backend'e POST.
 *
 * Erişim: admin JWT claim'i (`kullanicilar.admin=1`) veya DEV build.
 * App.tsx tab listesinde `adminGerekli: true` ile filtrelenir; ek olarak burada
 * defansif bir kontrol var (deep-link / tab restore senaryoları için).
 */
import { useEffect, useState } from "react";
import { Play, Square, AlertTriangle, RefreshCw, Lock } from "lucide-react";
import {
  BOOTSTRAP_ILCE_LISTESI,
  bootstrapIlleriGetir,
  bootstrapIlcelerGetir,
} from "../../lib/data/ilce-listesi-bootstrap";
import type { BootstrapKategori } from "../../lib/sahibinden-bootstrap";
import { useLisans } from "../../lib/lisans";

interface Durum {
  calisiyor: boolean;
  toplamSayfa: number;
  islenenSayfa: number;
  hataAdet: number;
  botEngelAdet: number;
  sonIlce: string | null;
  baslangic: number;
}

interface DetayDurum {
  calisiyor: boolean;
  bekleyenSayi: number;
  isleniyorSayi: number;
  tamamSayi: number;
  hataSayi: number;
  kaliciHataSayi: number;
  sonIlanNo: string | null;
  baslangic: number;
  sonHata: string | null;
}

export function BootstrapView() {
  const lisans = useLisans();
  const iller = bootstrapIlleriGetir();
  const [seciliIl, setSeciliIl] = useState<string>("İstanbul");
  const [kategoriArsa, setKategoriArsa] = useState(true);
  const [kategoriTarla, setKategoriTarla] = useState(false);
  const [rateMs, setRateMs] = useState(6000);
  const [bekleMs, setBekleMs] = useState(4000);
  const [tumTurkiye, setTumTurkiye] = useState(false);

  const [durum, setDurum] = useState<Durum | null>(null);
  const [scraperSecret, setScraperSecret] = useState<string>("");
  const [secretKayitli, setSecretKayitli] = useState(false);

  // Mevcut secret'i yükle
  useEffect(() => {
    chrome.storage.local.get("scraper_api_secret").then((d) => {
      if (typeof d.scraper_api_secret === "string" && d.scraper_api_secret.length > 0) {
        setScraperSecret(d.scraper_api_secret);
        setSecretKayitli(true);
      }
    });
  }, []);

  async function secretKaydet() {
    const s = scraperSecret.trim();
    if (!s) {
      await chrome.storage.local.remove("scraper_api_secret");
      setSecretKayitli(false);
      return;
    }
    await chrome.storage.local.set({ scraper_api_secret: s });
    setSecretKayitli(true);
  }

  // Background'tan durum poll et
  const [detayDurum, setDetayDurum] = useState<DetayDurum | null>(null);
  const [refreshDurum, setRefreshDurum] = useState<"idle" | "yukleniyor" | "tamam" | "hata">("idle");

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await chrome.runtime.sendMessage({ tip: "bootstrap-durum" });
        if (r?.ok) setDurum(r.durum);
      } catch {}
      try {
        const r2 = await chrome.runtime.sendMessage({ tip: "detay-zenginlestir-durum" });
        if (r2?.ok) setDetayDurum(r2.durum);
      } catch {}
    }, 1500);
    return () => clearInterval(id);
  }, []);

  async function detayBaslat() {
    await chrome.runtime.sendMessage({ tip: "detay-zenginlestir-baslat" });
  }
  async function detayDurdur() {
    await chrome.runtime.sendMessage({ tip: "detay-zenginlestir-durdur" });
  }
  async function detayKuyruguTemizle() {
    if (!confirm("Tüm detay kuyruğu silinecek. Devam?")) return;
    await chrome.runtime.sendMessage({ tip: "detay-kuyrugu-temizle" });
  }
  async function istatistikRefresh() {
    if (!scraperSecret) {
      alert("Önce scraper_api_secret kaydet — istatistik refresh için gerekli.");
      return;
    }
    setRefreshDurum("yukleniyor");
    try {
      const res = await fetch(
        `https://cadastrum-api.cadastrum-tr.workers.dev/v1/istatistik/refresh?secret=${encodeURIComponent(scraperSecret)}`,
      );
      setRefreshDurum(res.ok ? "tamam" : "hata");
    } catch {
      setRefreshDurum("hata");
    }
  }

  const ilceSayisi = tumTurkiye ? BOOTSTRAP_ILCE_LISTESI.length : bootstrapIlcelerGetir(seciliIl).length;
  const kategoriler: BootstrapKategori[] = [];
  if (kategoriArsa) kategoriler.push("arsa");
  if (kategoriTarla) kategoriler.push("tarla");
  const toplamSayfa = ilceSayisi * kategoriler.length;
  const tahminiDakika = Math.round((toplamSayfa * (rateMs + bekleMs)) / 60_000);

  async function basla() {
    if (kategoriler.length === 0) {
      alert("En az bir kategori seç");
      return;
    }
    if (toplamSayfa > 50 && !confirm(`${toplamSayfa} sayfa açılacak (~${tahminiDakika}dk). Devam?`)) {
      return;
    }
    await chrome.runtime.sendMessage({
      tip: "bootstrap-tara",
      ayar: {
        il: tumTurkiye ? null : seciliIl,
        kategoriler,
        rateMs,
        bekleMs,
      },
    });
  }

  async function durdur() {
    await chrome.runtime.sendMessage({ tip: "bootstrap-durdur" });
  }

  // Defansif admin guard — TÜM hook'lardan SONRA, return JSX'ten ÖNCE.
  // (React #310: hook'lar koşullu çağrılamaz, bu yüzden early return hook
  //  çağrılarından önce konursa "more hooks than previous render" patlar.)
  if (!lisans.isAdmin && !import.meta.env.DEV) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-slate-600 dark:text-slate-300">
        <Lock className="h-10 w-10 mb-3 text-slate-400" />
        <h2 className="text-lg font-semibold mb-1">Bootstrap aracı yalnız admin onaylı kullanıcılara açıktır</h2>
        <p className="text-sm max-w-md">
          Bu araç Sahibinden ilçe sayfalarını otomatik tarar; abuse riskini
          kontrol etmek için sadece <code>kullanicilar.admin=1</code> claim'i olan
          hesaplara açıktır.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3 space-y-3">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-2xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
        <div className="flex items-start gap-1.5">
          <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
          <div>
            <strong>DEV / ADMIN ONLY.</strong> Sahibinden ilçe sayfalarını arka plan tab'da
            açar, content script ilanları yakalar. Üretim dağıtımına dahil değildir.
            Sahibinden ToS gri alan — sadece kendi browsing'inde çalıştır.
          </div>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <label className="block text-2xs font-semibold mb-1">
          Scraper API Secret {secretKayitli && <span className="text-emerald-600">✓ kayıtlı</span>}
        </label>
        <div className="flex gap-1.5">
          <input
            type="password"
            value={scraperSecret}
            onChange={(e) => setScraperSecret(e.target.value)}
            placeholder="wrangler secret SCRAPER_API_SECRET ile aynı"
            className="flex-1 rounded border px-2 py-1 text-xs"
          />
          <button
            onClick={secretKaydet}
            className="rounded bg-slate-800 px-2 py-1 text-2xs font-semibold text-white hover:bg-slate-700"
          >
            Kaydet
          </button>
        </div>
        <div className="mt-1 text-3xs text-slate-500">
          Bu olmadan backend /v1/ilan/batch 401 döner. Ayar chrome.storage.local'da saklanır.
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={tumTurkiye}
            onChange={(e) => setTumTurkiye(e.target.checked)}
            disabled={durum?.calisiyor}
          />
          Tüm Türkiye (973 ilçe)
        </label>
        {!tumTurkiye && (
          <div>
            <label className="block text-2xs font-semibold mb-1">İl</label>
            <select
              value={seciliIl}
              onChange={(e) => setSeciliIl(e.target.value)}
              disabled={durum?.calisiyor}
              className="w-full rounded border px-2 py-1 text-xs"
            >
              {iller.map((il) => (
                <option key={il} value={il}>
                  {il} ({bootstrapIlcelerGetir(il).length} ilçe)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="block text-2xs font-semibold mb-1">Kategori</label>
        <div className="flex gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={kategoriArsa}
              onChange={(e) => setKategoriArsa(e.target.checked)}
              disabled={durum?.calisiyor}
            />
            Arsa
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={kategoriTarla}
              onChange={(e) => setKategoriTarla(e.target.checked)}
              disabled={durum?.calisiyor}
            />
            Tarla
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-2xs font-semibold mb-1">Sayfa arası (ms)</label>
          <input
            type="number"
            value={rateMs}
            onChange={(e) => setRateMs(+e.target.value)}
            disabled={durum?.calisiyor}
            className="w-full rounded border px-2 py-1 text-xs"
            min={3000}
            max={30000}
          />
        </div>
        <div>
          <label className="block text-2xs font-semibold mb-1">Sayfa tarama bekle (ms)</label>
          <input
            type="number"
            value={bekleMs}
            onChange={(e) => setBekleMs(+e.target.value)}
            disabled={durum?.calisiyor}
            className="w-full rounded border px-2 py-1 text-xs"
            min={2000}
            max={15000}
          />
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-2xs space-y-0.5 dark:border-slate-700 dark:bg-slate-800">
        <div>
          Hedef: <strong>{ilceSayisi}</strong> ilçe × <strong>{kategoriler.length}</strong> kategori
          = <strong>{toplamSayfa}</strong> sayfa
        </div>
        <div>
          Tahmini süre: ~<strong>{tahminiDakika}</strong> dakika
        </div>
      </div>

      {durum?.calisiyor ? (
        <button
          onClick={durdur}
          className="flex items-center justify-center gap-1.5 rounded-md bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
        >
          <Square className="h-3.5 w-3.5" />
          Durdur
        </button>
      ) : (
        <button
          onClick={basla}
          disabled={toplamSayfa === 0}
          className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" />
          Başlat
        </button>
      )}

      {durum && (durum.calisiyor || durum.islenenSayfa > 0) && (
        <div className="rounded-md border border-slate-200 bg-white p-2 text-2xs space-y-1 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-1.5 font-semibold">
            {durum.calisiyor ? (
              <RefreshCw className="h-3 w-3 animate-spin text-emerald-600" />
            ) : (
              <span className="text-slate-400">✓</span>
            )}
            {durum.calisiyor ? "Çalışıyor" : "Bitti"}
          </div>
          <div>
            İlerleme: <strong>{durum.islenenSayfa}</strong>/{durum.toplamSayfa}
          </div>
          {durum.sonIlce && (
            <div className="text-slate-500 truncate">Son: {durum.sonIlce}</div>
          )}
          {durum.hataAdet > 0 && (
            <div className="text-rose-600">Hata: {durum.hataAdet}</div>
          )}
          {durum.botEngelAdet > 0 && (
            <div className="text-amber-600">Bot engel: {durum.botEngelAdet}</div>
          )}
          {durum.baslangic > 0 && (
            <div className="text-slate-500">
              Süre: {Math.round((Date.now() - durum.baslangic) / 60_000)}dk
            </div>
          )}
        </div>
      )}

      {/* ── Detay zenginleştirme paneli — Faz 5 ────────────────────────── */}
      <div className="rounded-md border border-indigo-200 bg-indigo-50/60 p-2 text-2xs space-y-1.5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-indigo-900 dark:text-indigo-300">
            🎯 Detay Zenginleştirme (lat/lng)
          </div>
          {detayDurum?.calisiyor ? (
            <button
              onClick={detayDurdur}
              className="rounded bg-rose-600 px-2 py-0.5 text-white text-3xs hover:bg-rose-700"
            >
              Durdur
            </button>
          ) : (
            <button
              onClick={detayBaslat}
              className="rounded bg-indigo-600 px-2 py-0.5 text-white text-3xs hover:bg-indigo-700"
            >
              Başlat
            </button>
          )}
        </div>
        {detayDurum && (
          <>
            <div className="grid grid-cols-4 gap-1 text-center">
              <KuyrukKpi label="Bekleyen" v={detayDurum.bekleyenSayi} renk="amber" />
              <KuyrukKpi label="Tamam" v={detayDurum.tamamSayi} renk="emerald" />
              <KuyrukKpi label="Hata" v={detayDurum.hataSayi} renk="rose" />
              <KuyrukKpi label="Kalıcı" v={detayDurum.kaliciHataSayi} renk="slate" />
            </div>
            {detayDurum.sonIlanNo && (
              <div className="text-3xs text-slate-500 truncate">
                Son ilan: {detayDurum.sonIlanNo}
              </div>
            )}
            {detayDurum.sonHata && (
              <div className="text-3xs text-rose-600 truncate">
                Son hata: {detayDurum.sonHata}
              </div>
            )}
            <div className="text-3xs text-slate-500">
              Yavaş çalışır (4-8 sn/ilan); Sahibinden bot koruması nedeniyle insan-tempo'su.
            </div>
            {detayDurum.tamamSayi + detayDurum.bekleyenSayi + detayDurum.kaliciHataSayi > 0 && (
              <button
                onClick={detayKuyruguTemizle}
                className="text-3xs text-slate-500 underline hover:text-slate-800"
              >
                Kuyruğu temizle
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Backend istatistik refresh ─────────────────────────────────── */}
      <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2 text-2xs space-y-1 dark:border-slate-700 dark:bg-slate-900">
        <div className="font-semibold text-amber-900 dark:text-amber-300">
          📊 Backend mahalle_istatistik refresh
        </div>
        <div className="text-3xs text-slate-600 dark:text-slate-400">
          Bootstrap + detay zenginleştirme bittikten sonra mahalle istatistik
          tablosunu güncelle. Yoksa toplanan ilanlar baseline'a yansımaz.
        </div>
        <button
          onClick={istatistikRefresh}
          disabled={refreshDurum === "yukleniyor"}
          className="rounded bg-amber-600 px-2 py-1 text-white text-3xs hover:bg-amber-700 disabled:opacity-50"
        >
          {refreshDurum === "yukleniyor" ? "Yükleniyor…" :
            refreshDurum === "tamam" ? "✓ Tamamlandı" :
            refreshDurum === "hata" ? "✗ Hata — tekrar dene" :
            "Refresh tetikle"}
        </button>
      </div>
    </div>
  );
}

function KuyrukKpi({ label, v, renk }: { label: string; v: number; renk: "amber" | "emerald" | "rose" | "slate" }) {
  const renkler: Record<string, string> = {
    amber: "bg-amber-100 text-amber-900",
    emerald: "bg-emerald-100 text-emerald-900",
    rose: "bg-rose-100 text-rose-900",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className={`rounded px-1 py-1 ${renkler[renk]} dark:bg-slate-800 dark:text-slate-200`}>
      <div className="text-[8px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xs font-bold tabular-nums">{v}</div>
    </div>
  );
}
