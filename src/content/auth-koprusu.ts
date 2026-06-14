/**
 * Site → Extension Auth Köprüsü
 *
 * cadastrum.com.tr'de çalışan content script. Site (auth.ts) login/kayıt
 * başarılı olduğunda window.postMessage(CADASTRUM_AUTH) atar — burası dinler
 * ve token + kullanıcı bilgisini chrome.storage.local'a kaydeder.
 *
 * Aynı şekilde site logout ettiğinde token silinir.
 *
 * Mesaj formatları (site → extension):
 *   { type: "CADASTRUM_AUTH",   token, kullanici }
 *   { type: "CADASTRUM_LOGOUT" }
 *   { type: "CADASTRUM_PING" }   → response: extension yüklü mü
 */

interface AuthMessage {
  type: "CADASTRUM_AUTH" | "CADASTRUM_LOGOUT" | "CADASTRUM_PING";
  token?: string;
  kullanici?: {
    id: number;
    email: string;
    ad?: string | null;
    tier: string;
    tierBitis?: number | null;
  };
}

window.addEventListener("message", async (event) => {
  // Sadece kendi origin'imizden mesaj kabul et — XSS koruması
  const origin = event.origin;
  if (!/^https:\/\/(www\.)?cadastrum\.com\.tr$/.test(origin)) return;

  const data = event.data as AuthMessage;
  if (!data?.type?.startsWith("CADASTRUM_")) return;

  try {
    if (data.type === "CADASTRUM_AUTH") {
      if (!data.token || !data.kullanici) return;
      await chrome.storage.local.set({
        cadastrum_token: data.token,
        cadastrum_kullanici: data.kullanici,
        cadastrum_token_kayit_zamani: Date.now(),
      });
      // Site'a onay yolla — kullanıcı UI'da "✓ eklenti güncellendi" görsün
      window.postMessage({ type: "CADASTRUM_AUTH_OK", source: "extension" }, origin);
      console.log("[Cadastrum] Token extension'a aktarıldı:", data.kullanici.email, "tier:", data.kullanici.tier);
    } else if (data.type === "CADASTRUM_LOGOUT") {
      await chrome.storage.local.remove([
        "cadastrum_token",
        "cadastrum_kullanici",
        "cadastrum_token_kayit_zamani",
      ]);
      window.postMessage({ type: "CADASTRUM_LOGOUT_OK", source: "extension" }, origin);
      console.log("[Cadastrum] Token extension'dan silindi");
    } else if (data.type === "CADASTRUM_PING") {
      // Site, extension yüklü mü diye sorgular
      const stored = await chrome.storage.local.get(["cadastrum_kullanici"]);
      window.postMessage({
        type: "CADASTRUM_PONG",
        source: "extension",
        installed: true,
        kullanici: stored.cadastrum_kullanici ?? null,
      }, origin);
    }
  } catch (e) {
    console.warn("[Cadastrum auth-koprusu] hata:", e);
  }
});

// Sayfa yüklenince hemen ping at — site UI'sı extension yüklü olduğunu bilebilsin
window.postMessage({ type: "CADASTRUM_EXT_READY", source: "extension" }, "*");

/**
 * PROAKTIF SENKRON — site push etmese bile, content script cadastrum.com.tr'nin
 * localStorage'ını doğrudan okur (aynı origin, isolated world localStorage'ı paylaşır).
 * Token varsa backend'den TAZE kullanıcı (güncel tier) çekip chrome.storage'a yazar.
 * Bu sayede mevcut oturumda (login push'u olmadan) extension senkronize olur.
 */
const BACKEND_API = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

async function proaktifSenkron(): Promise<void> {
  try {
    const token = localStorage.getItem("cadastrum_token");
    if (!token) {
      // Site'ta oturum yok — extension'da da temizle (tutarlılık)
      const mevcut = await chrome.storage.local.get("cadastrum_token");
      if (mevcut.cadastrum_token) {
        await chrome.storage.local.remove([
          "cadastrum_token", "cadastrum_kullanici", "cadastrum_token_kayit_zamani",
        ]);
      }
      return;
    }

    // Backend'den taze kullanıcı (güncel tier) çek
    let kullanici: unknown = null;
    try {
      const res = await fetch(`${BACKEND_API}/auth/ben`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const j = await res.json();
        kullanici = j.kullanici ?? null;
      }
    } catch { /* network — localStorage fallback'e düş */ }

    // Backend erişilemezse localStorage'daki user'ı kullan
    if (!kullanici) {
      const raw = localStorage.getItem("cadastrum_user");
      if (raw) { try { kullanici = JSON.parse(raw); } catch { /* ignore */ } }
    }
    if (!kullanici) return;

    await chrome.storage.local.set({
      cadastrum_token: token,
      cadastrum_kullanici: kullanici,
      cadastrum_token_kayit_zamani: Date.now(),
    });
    console.log("[Cadastrum] Proaktif senkron OK:", (kullanici as { email?: string }).email, "tier:", (kullanici as { tier?: string }).tier);
  } catch (e) {
    console.warn("[Cadastrum auth-koprusu] proaktif senkron hatası:", e);
  }
}

void proaktifSenkron();

export {};
