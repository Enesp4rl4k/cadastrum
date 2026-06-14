/**
 * Cadastrum site auth helper (client-side, browser-only).
 * Token + kullanıcı bilgisi localStorage'da tutulur.
 */
import { PUBLIC_API_BASE } from "./config";
const API = PUBLIC_API_BASE;
const TOKEN_KEY = "cadastrum_token";
const USER_KEY = "cadastrum_user";

export interface Kullanici {
  id: number;
  email: string;
  ad: string | null;
  tier: "free" | "pro" | "pro_plus" | "kurumsal";
  tierBitis: number | null;
  emailDogrulandi?: boolean;
}

export function tokenAl(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function kullaniciAl(): Kullanici | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function girisYapildi(): boolean {
  return !!tokenAl() && !!kullaniciAl();
}

export function isPro(): boolean {
  const u = kullaniciAl();
  if (!u) return false;
  if (u.tier === "free") return false;
  if (u.tierBitis && u.tierBitis < Date.now()) return false;
  return true;
}

function kaydet(token: string, kullanici: Kullanici) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(kullanici));
  // Extension'a token aktar (yüklüyse content script dinler)
  notifyExtension(token, kullanici);
}

export function cikisYap() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  // Extension'dan da sil
  if (typeof window !== "undefined") {
    window.postMessage({ type: "CADASTRUM_LOGOUT" }, window.location.origin);
  }
}

/**
 * Site → Extension token transfer.
 * Extension content script `auth-koprusu.ts` dinler, chrome.storage.local'a kaydeder.
 * Extension yoksa mesaj sessizce yutulur.
 */
function notifyExtension(token: string, kullanici: Kullanici): void {
  if (typeof window === "undefined") return;
  window.postMessage({
    type: "CADASTRUM_AUTH",
    token,
    kullanici: {
      id: kullanici.id,
      email: kullanici.email,
      ad: kullanici.ad,
      tier: kullanici.tier,
      tierBitis: kullanici.tierBitis,
    },
  }, window.location.origin);
}

/**
 * Site → Extension token senkronizasyonu.
 * Her sayfa yüklemesinde çağrılır: oturum açıksa, backend'den TAZE tier'ı çekip
 * (tazele) extension'a push eder. Böylece sadece login anında değil, mevcut
 * oturumda da (tier değişikliği vb.) extension güncel kalır.
 *
 * Extension content script (auth-koprusu.ts) sayfa yüklenince CADASTRUM_EXT_READY
 * yollar — onu dinleyip de push ederiz (content script geç yüklenirse).
 */
export function extensionSenkronBaslat(): void {
  if (typeof window === "undefined") return;

  const push = async () => {
    const token = tokenAl();
    if (!token) return;
    // tazele() → /v1/auth/ben'den güncel tier (kurumsal vb.) + localStorage güncelle
    const taze = await tazele().catch(() => null);
    const kullanici = taze ?? kullaniciAl();
    if (kullanici) notifyExtension(token, kullanici);
  };

  // Extension content script hazır sinyali → push
  window.addEventListener("message", (e: MessageEvent) => {
    if (e.origin !== window.location.origin && e.origin !== "null") {
      // CADASTRUM_EXT_READY "*" origin ile gelebilir
      if (e.data?.type !== "CADASTRUM_EXT_READY") return;
    }
    if (e.data?.type === "CADASTRUM_EXT_READY") void push();
  });

  // İlk yüklemede de dene (content script zaten yüklüyse)
  void push();
}

/**
 * Extension yüklü mü kontrol et.
 * Site UI'da "Eklenti yüklü ✓" / "Eklentiyi yükle" göstermek için.
 */
export function eklentiKontrolu(): Promise<{ yuklu: boolean; kullanici: Kullanici | null }> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve({ yuklu: false, kullanici: null });
    let cevaplandi = false;
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "CADASTRUM_PONG" && e.data?.source === "extension") {
        cevaplandi = true;
        window.removeEventListener("message", handler);
        resolve({ yuklu: true, kullanici: e.data.kullanici ?? null });
      }
    };
    window.addEventListener("message", handler);
    window.postMessage({ type: "CADASTRUM_PING" }, window.location.origin);
    setTimeout(() => {
      if (!cevaplandi) {
        window.removeEventListener("message", handler);
        resolve({ yuklu: false, kullanici: null });
      }
    }, 500);
  });
}

export async function kayit(email: string, sifre: string, ad?: string): Promise<Kullanici> {
  const res = await fetch(`${API}/auth/kayit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, sifre, ad }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.hata ?? "Kayıt hatası");
  kaydet(j.token, j.kullanici);
  return j.kullanici;
}

export async function giris(email: string, sifre: string): Promise<Kullanici> {
  const res = await fetch(`${API}/auth/giris`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, sifre }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.hata ?? "Giriş hatası");
  kaydet(j.token, j.kullanici);
  return j.kullanici;
}

// ── Email doğrulama ────────────────────────────────────────────
export async function dogrulamaKodGonder(): Promise<void> {
  const token = tokenAl();
  if (!token) throw new Error("Giriş yapın");
  const res = await fetch(`${API}/auth/dogrulama-gonder`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.hata ?? "Hata");
}

export async function dogrula(kod: string): Promise<void> {
  const token = tokenAl();
  if (!token) throw new Error("Giriş yapın");
  const res = await fetch(`${API}/auth/dogrula`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ kod }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.hata ?? "Hata");
  // Tazele
  await tazele();
}

// ── Şifre sıfırlama ────────────────────────────────────────────
export async function sifreSifirlamaIste(email: string): Promise<void> {
  const res = await fetch(`${API}/auth/sifre-sifirla`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.hata ?? "Hata");
}

export async function sifreYenile(token: string, yeniSifre: string): Promise<void> {
  const res = await fetch(`${API}/auth/sifre-yenile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, yeniSifre }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.hata ?? "Hata");
}

// ── Hesap yönetimi ─────────────────────────────────────────────
export async function veriDisaAktar(): Promise<any> {
  const token = tokenAl();
  if (!token) throw new Error("Giriş yapın");
  const res = await fetch(`${API}/hesap/dis-aktarim`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Veri export hatası");
  return await res.json();
}

export async function hesabimiSil(onayMetni: string): Promise<void> {
  const token = tokenAl();
  if (!token) throw new Error("Giriş yapın");
  const res = await fetch(`${API}/hesap/sil`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ onay: onayMetni }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.hata ?? "Hata");
  cikisYap();
}

export async function sifreDegistir(eski: string, yeni: string): Promise<void> {
  const token = tokenAl();
  if (!token) throw new Error("Giriş yapın");
  const res = await fetch(`${API}/hesap/sifre-degistir`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ eski, yeni }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.hata ?? "Hata");
}

export async function tazele(): Promise<Kullanici | null> {
  const token = tokenAl();
  if (!token) return null;
  try {
    const res = await fetch(`${API}/auth/ben`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      cikisYap();
      return null;
    }
    const j = await res.json();
    localStorage.setItem(USER_KEY, JSON.stringify(j.kullanici));
    return j.kullanici;
  } catch {
    return null;
  }
}
