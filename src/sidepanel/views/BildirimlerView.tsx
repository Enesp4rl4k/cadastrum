/**
 * BildirimlerView — Aktif fiyat alarm aboneliklerini listeler.
 *
 * Backend GET /v1/bildirim/list çağırır, her aboneliği gösterir.
 * Kullanıcı silmek istediğinde DELETE /v1/bildirim/:id çağırır.
 *
 * Sadece giriş yapmış kullanıcılara gösterilir.
 * Free tier max 1 abonelik (server-side enforce).
 */

import { useEffect, useState } from "react";
import {
  Bell as BellIcon,
  BellOff as BellOffIcon,
  Trash2 as TrashIcon,
  RefreshCw as RefreshIcon,
  MapPin as MapPinIcon,
} from "lucide-react";
import { BACKEND_API } from "../../lib/api-constants";

interface Abonelik {
  id: number;
  tip: string;
  parametre: {
    lat?: number;
    lng?: number;
    radius_km?: number;
    kategori?: string;
    esik_yuzde?: number;
  };
  olusturuldu: number; // unix timestamp
  son_kontrol?: number | null;
  aktif: boolean;
}

async function tokenAl(): Promise<string | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
  const data = await chrome.storage.local.get("cadastrum_token");
  const t = data["cadastrum_token"];
  return typeof t === "string" ? t : null;
}

export function BildirimlerView() {
  const [abonelikler, setAbonelikler] = useState<Abonelik[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [siliniyor, setSiliniyor] = useState<number | null>(null);

  async function listeCek() {
    setYukleniyor(true);
    setHata(null);
    const token = await tokenAl();
    if (!token) {
      setHata("Bildirim listesini görmek için giriş yapın.");
      setYukleniyor(false);
      return;
    }
    try {
      const res = await fetch(`${BACKEND_API}/bildirim/list`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        if (res.status === 401) {
          setHata("Oturum süresi dolmuş. Tekrar giriş yapın.");
        } else {
          setHata(`Sunucu hatası: ${res.status}`);
        }
        return;
      }
      const data = await res.json() as { abonelikler: Abonelik[] };
      setAbonelikler(data.abonelikler ?? []);
    } catch {
      setHata("Bağlantı hatası. İnternet bağlantınızı kontrol edin.");
    } finally {
      setYukleniyor(false);
    }
  }

  async function sil(id: number) {
    setSiliniyor(id);
    const token = await tokenAl();
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_API}/bildirim/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        setAbonelikler((prev) => prev.filter((a) => a.id !== id));
      }
    } catch {
      // Sessiz başarısız — liste güncel kalır
    } finally {
      setSiliniyor(null);
    }
  }

  useEffect(() => { void listeCek(); }, []);

  return (
    <div className="flex h-full flex-col">
      {/* ── Başlık ── */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 dark:text-slate-200">
          <BellIcon className="h-3.5 w-3.5 text-violet-500" aria-hidden="true" />
          Fiyat Alarmları
        </div>
        <button
          type="button"
          onClick={() => void listeCek()}
          disabled={yukleniyor}
          className="flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          aria-label="Listeyi yenile"
        >
          <RefreshIcon className={`h-3 w-3 ${yukleniyor ? "animate-spin" : ""}`} aria-hidden="true" />
          Yenile
        </button>
      </div>

      {/* ── İçerik ── */}
      <div className="flex-1 overflow-y-auto">
        {yukleniyor ? (
          <div className="space-y-2 p-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : hata ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <BellOffIcon className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" aria-hidden="true" />
            <p className="text-sm text-slate-500 dark:text-slate-400">{hata}</p>
          </div>
        ) : abonelikler.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <div className="mb-3 rounded-full bg-violet-50 dark:bg-violet-950/30 p-3">
              <BellOffIcon className="h-6 w-6 text-violet-300 dark:text-violet-600" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Aktif alarm yok</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-[200px]">
              Bir parseli aç, "Fiyat değişirse mail at" butonunu kullan.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {abonelikler.map((ab) => (
              <li key={ab.id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {/* Konum */}
                    {ab.parametre.lat && ab.parametre.lng && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                        <MapPinIcon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                        <span className="font-mono">
                          {ab.parametre.lat.toFixed(4)}, {ab.parametre.lng.toFixed(4)}
                        </span>
                        {ab.parametre.radius_km && (
                          <span className="text-slate-400">· {ab.parametre.radius_km} km</span>
                        )}
                      </div>
                    )}
                    {/* Kategori + eşik */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {ab.parametre.kategori && (
                        <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                          {ab.parametre.kategori}
                        </span>
                      )}
                      {ab.parametre.esik_yuzde != null && (
                        <span className="inline-flex items-center rounded-full bg-violet-50 dark:bg-violet-950/30 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                          ±%{ab.parametre.esik_yuzde} değişimde bildir
                        </span>
                      )}
                      {!ab.aktif && (
                        <span className="inline-flex items-center rounded-full bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                          Pasif
                        </span>
                      )}
                    </div>
                    {/* Tarihler */}
                    <div className="mt-1 text-[10px] text-slate-400">
                      Oluşturuldu: {new Date(ab.olusturuldu * 1000).toLocaleDateString("tr-TR")}
                      {ab.son_kontrol && (
                        <span className="ml-2">
                          Son kontrol: {new Date(ab.son_kontrol * 1000).toLocaleString("tr-TR", {
                            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Sil butonu */}
                  <button
                    type="button"
                    onClick={() => void sil(ab.id)}
                    disabled={siliniyor === ab.id}
                    className="flex-shrink-0 rounded-md p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-40 transition-colors"
                    aria-label={`Alarm #${ab.id} sil`}
                  >
                    <TrashIcon className={`h-3.5 w-3.5 ${siliniyor === ab.id ? "animate-pulse" : ""}`} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
