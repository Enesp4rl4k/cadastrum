/**
 * Sidepanel header'ında kullanıcının Cadastrum hesap durumunu gösterir.
 * - Giriş yapmadıysa: "Giriş Yap" CTA → cadastrum.com.tr/giris açar
 * - Free: "Free" rozeti + Pro CTA
 * - Pro/Pro+/Kurumsal: yeşil rozet + email + çıkış
 *
 * Token chrome.storage.local.cadastrum_token'da saklanır.
 * Site → Extension köprüsü auth-koprusu.ts ile çalışır.
 */
import { useEffect, useRef, useState } from "react";
import { LogIn, Crown, User, LogOut, ExternalLink } from "lucide-react";
import { isAdminGetir } from "../../lib/lisans";

interface Kullanici {
  id: number;
  email: string;
  ad?: string | null;
  tier: "free" | "pro" | "pro_plus" | "kurumsal";
  tierBitis?: number | null;
}

const TIER_ETIKET: Record<string, { ad: string; renk: string; icon: any }> = {
  free: { ad: "Free", renk: "bg-slate-100 text-slate-700", icon: User },
  pro: { ad: "Pro", renk: "bg-imperial-50 text-imperial-700", icon: Crown },
  pro_plus: { ad: "Pro+", renk: "bg-amber-50 text-amber-700", icon: Crown },
  kurumsal: { ad: "Kurumsal", renk: "bg-emerald-50 text-emerald-700", icon: Crown },
};

const SITE_URL = "https://cadastrum.com.tr";

export default function HesapDurumu() {
  const [kullanici, setKullanici] = useState<Kullanici | null>(null);
  const [loading, setLoading] = useState(true);
  const [acik, setAcik] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const sarmalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    isAdminGetir().then(setIsAdmin);
  }, [kullanici]);

  // Dışarı tıklayınca / Escape'e basınca menüyü kapat
  useEffect(() => {
    if (!acik) return;
    const disTik = (e: MouseEvent) => {
      if (sarmalRef.current && !sarmalRef.current.contains(e.target as Node)) setAcik(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAcik(false); };
    document.addEventListener("mousedown", disTik);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", disTik);
      document.removeEventListener("keydown", esc);
    };
  }, [acik]);

  useEffect(() => {
    let mounted = true;
    async function yukle() {
      try {
        const data = await chrome.storage.local.get(["cadastrum_kullanici", "cadastrum_token"]);
        if (mounted) {
          setKullanici((data.cadastrum_kullanici as Kullanici) ?? null);
          setLoading(false);
        }
      } catch {
        if (mounted) setLoading(false);
      }
    }
    yukle();

    // Storage değişince güncelle (site'tan token gelirse anında yansır)
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && (changes.cadastrum_kullanici || changes.cadastrum_token)) {
        if (mounted) {
          setKullanici((changes.cadastrum_kullanici?.newValue as Kullanici) ?? null);
        }
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      mounted = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  async function cikisYap() {
    await chrome.storage.local.remove([
      "cadastrum_token",
      "cadastrum_kullanici",
      "cadastrum_token_kayit_zamani",
    ]);
    setKullanici(null);
    setAcik(false);
  }

  function girisAc() {
    chrome.tabs.create({ url: `${SITE_URL}/giris?source=extension` });
  }

  function siteAc(yol = "/hesap") {
    chrome.tabs.create({ url: `${SITE_URL}${yol}` });
  }

  if (loading) {
    return (
      <div className="px-3 py-2 text-xs text-slate-500">Yükleniyor…</div>
    );
  }

  if (!kullanici) {
    return (
      <button
        onClick={girisAc}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-imperial text-white text-xs font-medium hover:bg-imperial-700 transition shadow-sm"
        title="cadastrum.com.tr/giris adresinden giriş yapın"
      >
        <LogIn className="w-3.5 h-3.5" />
        <span>Giriş Yap</span>
      </button>
    );
  }

  const tierAktif = !kullanici.tierBitis || kullanici.tierBitis > Date.now();
  // Admin → her zaman kurumsal göster (tier senkron sorunlarından bağımsız)
  const gercekTier = isAdmin ? "kurumsal" : (tierAktif ? kullanici.tier : "free");
  const gercekTierBilgi = isAdmin
    ? { ad: "Admin", renk: "bg-emerald-50 text-emerald-700", icon: Crown }
    : (TIER_ETIKET[gercekTier] || TIER_ETIKET.free!);
  const Icon = gercekTierBilgi.icon;

  return (
    <div className="relative" ref={sarmalRef}>
      <button
        onClick={() => setAcik((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition ${gercekTierBilgi.renk}`}
        title={`${kullanici.email} (${gercekTierBilgi.ad})`}
      >
        <Icon className="w-3 h-3" />
        <span>{gercekTierBilgi.ad}</span>
      </button>

      {/* Dropdown menü — tıkla aç/kapat, dışarı tıkla kapat */}
      <div className={`${acik ? "block" : "hidden"} absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-xl border border-slate-200 z-50 p-2`}>
        <div className="px-2 py-1.5 border-b border-slate-100 mb-1">
          <div className="text-xs font-semibold text-slate-900 truncate">
            {kullanici.ad || kullanici.email.split("@")[0]}
          </div>
          <div className="text-[10px] text-slate-500 truncate">{kullanici.email}</div>
          {kullanici.tierBitis && tierAktif && (
            <div className="text-[10px] text-slate-400 mt-0.5">
              {gercekTierBilgi.ad} bitiş: {new Date(kullanici.tierBitis).toLocaleDateString("tr-TR")}
            </div>
          )}
        </div>

        {gercekTier === "free" && (
          <button
            onClick={() => siteAc("/fiyat")}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-imperial-700 hover:bg-imperial-50 rounded transition"
          >
            <Crown className="w-3 h-3" />
            <span className="flex-1 text-left">Pro'ya geç</span>
            <span className="text-amber-600 text-[10px] font-semibold">ERKEN100 -%40</span>
          </button>
        )}

        <button
          onClick={() => siteAc("/hesap")}
          className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50 rounded transition"
        >
          <ExternalLink className="w-3 h-3" />
          Hesabımı yönet
        </button>

        <button
          onClick={cikisYap}
          className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded transition"
        >
          <LogOut className="w-3 h-3" />
          Çıkış yap
        </button>
      </div>
    </div>
  );
}
