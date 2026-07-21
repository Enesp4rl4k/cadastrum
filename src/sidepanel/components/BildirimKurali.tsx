/**
 * BildirimKurali — Faz 4 Sprint G4.
 *
 * Açık parsel için tek tıkla "bu bölgede fiyat %5 değişirse mail at" abonelik.
 * Backend `/v1/bildirim/abone` çağırır; JWT token chrome.storage'tan alınır.
 *
 * Free tier max 1 abonelik (server-side enforce); UI burada hint verir.
 */

import { useState } from "react";
import { Bell as BellIcon, BellRing as BellRingIcon } from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import { useLisans } from "../../lib/lisans";

interface Props {
  parsel: Parsel;
}

type Durum = "idle" | "yukleniyor" | "basarili" | "hata" | "yetki-yok";

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

async function tokenAl(): Promise<string | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
  const data = await chrome.storage.local.get("cadastrum_token");
  const t = data["cadastrum_token"];
  return typeof t === "string" ? t : null;
}

const SITE_URL = "https://cadastrum.com.tr";

export function BildirimKurali({ parsel }: Props) {
  const lisans = useLisans();
  const [durum, setDurum] = useState<Durum>("idle");
  const [esikYuzde, setEsikYuzde] = useState(5);

  const lat = parsel.merkezNokta?.lat;
  const lng = parsel.merkezNokta?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  // Lisans kapısı — watchlist-uyari Pro+ gerektirir
  if (!lisans.can("watchlist-uyari")) {
    return (
      <div className="rounded border border-violet-200 bg-violet-50 dark:bg-slate-900 dark:border-slate-700 p-2 text-2xs">
        <div className="flex items-center gap-1.5 font-semibold text-violet-900 dark:text-violet-300 mb-1.5">
          <BellIcon className="h-3.5 w-3.5" />
          <span>Fiyat değişimi bildirimi</span>
        </div>
        <p className="text-3xs text-slate-500 mb-1.5">
          Bu bölgede fiyat değiştiğinde e-posta al. Pro plan gerektirir.
        </p>
        <button
          type="button"
          onClick={() => {
            if (typeof chrome !== "undefined" && chrome?.tabs) {
              chrome.tabs.create({ url: `${SITE_URL}/fiyat?plan=pro&source=extension-bildirim` });
            }
          }}
          className="w-full rounded border border-violet-300 bg-white px-2 py-1 text-2xs font-medium text-violet-700 hover:bg-violet-50 transition"
        >
          🔔 Pro'ya geç — e-posta uyarı aktif
        </button>
      </div>
    );
  }


  const kategori = parsel.nitelik.toLocaleLowerCase("tr").includes("tarla")
    ? "tarla"
    : parsel.nitelik.toLocaleLowerCase("tr").match(/mesken|konut|daire/)
      ? "konut"
      : "arsa";

  async function abone() {
    setDurum("yukleniyor");
    const token = await tokenAl();
    if (!token) {
      setDurum("yetki-yok");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/bildirim/abone`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tip: "fiyat-degisimi",
          parametre: {
            lat,
            lng,
            radius_km: 3,
            kategori,
            esik_yuzde: esikYuzde,
          },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (res.status === 403) {
          setDurum("yetki-yok");
        } else {
          console.warn("[bildirim] hata:", j);
          setDurum("hata");
        }
        return;
      }
      setDurum("basarili");
    } catch (e) {
      console.warn("[bildirim] network:", e);
      setDurum("hata");
    }
  }

  return (
    <div className="rounded border border-violet-200 bg-violet-50 dark:bg-slate-900 dark:border-slate-700 p-2 text-2xs">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 font-semibold text-violet-900 dark:text-violet-300">
          {durum === "basarili" ? <BellRingIcon className="h-3.5 w-3.5" /> : <BellIcon className="h-3.5 w-3.5" />}
          <span>Bu bölgede fiyat değişirse mail at</span>
        </div>
        <select
          value={esikYuzde}
          onChange={(e) => setEsikYuzde(+e.target.value)}
          disabled={durum === "yukleniyor" || durum === "basarili"}
          className="text-2xs px-1 py-0.5 rounded border bg-white dark:bg-slate-800"
        >
          <option value={3}>±%3</option>
          <option value={5}>±%5</option>
          <option value={10}>±%10</option>
          <option value={20}>±%20</option>
        </select>
      </div>
      {durum === "idle" && (
        <button
          onClick={abone}
          className="w-full px-2 py-1 bg-violet-600 hover:bg-violet-700 text-white rounded text-2xs font-medium"
        >
          Aboneliği oluştur
        </button>
      )}
      {durum === "yukleniyor" && (
        <div className="text-3xs italic text-slate-600">Gönderiliyor…</div>
      )}
      {durum === "basarili" && (
        <div className="text-3xs text-emerald-700 dark:text-emerald-400 font-medium">
          ✓ Abonelik oluşturuldu. Saatlik kontrol; günde max 1 mail.
        </div>
      )}
      {durum === "hata" && (
        <div className="text-3xs text-red-700">
          Hata. Tekrar dene.
        </div>
      )}
      {durum === "yetki-yok" && (
        <div className="text-3xs text-amber-800">
          Önce giriş yapın veya tier limitiniz dolu. ({lisans.tier})
        </div>
      )}
    </div>
  );
}
