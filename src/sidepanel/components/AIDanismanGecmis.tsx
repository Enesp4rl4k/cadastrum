/**
 * AI Danışman Geçmiş Kartı — YENI-3
 * Son 20 sohbeti listeler, başlıkla gösterir, tekrar açabilir.
 */
import { useEffect, useState } from "react";
import { History as HistoryIcon, Loader2 as LoaderIcon, MessageSquare as MsgIcon } from "lucide-react";
import { Section } from "../ui/Card";

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";

interface GecmisMesaj {
  kullanici_mesaj: string;
  asistan_yanit: string;
  model: string;
  sure_ms: number;
  tarih: number;
}

interface Props {
  /** Seçili geçmiş mesajı dışarıya ilet — AIDanismanKarti ile entegre */
  onSohbetSec?: (mesaj: GecmisMesaj) => void;
  girisYapildi?: boolean;
}

async function tokenAl(): Promise<string | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
  const data = await chrome.storage.local.get("cadastrum_token");
  const t = data["cadastrum_token"];
  return typeof t === "string" ? t : null;
}

function tarihFmt(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) +
    " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

/** Mesajı kısa başlığa dönüştür */
function baslikCikar(mesaj: string): string {
  return mesaj.length > 50 ? mesaj.slice(0, 47) + "…" : mesaj;
}

export function AIDanismanGecmis({ onSohbetSec, girisYapildi = false }: Props) {
  const [gecmis, setGecmis] = useState<GecmisMesaj[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [acik, setAcik] = useState(false);

  useEffect(() => {
    if (!acik || !girisYapildi) return;
    let iptal = false;
    setYukleniyor(true);

    tokenAl().then((token) => {
      if (!token || iptal) { setYukleniyor(false); return; }
      return fetch(`${API_BASE}/ai-danisman/gecmis`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8_000),
      })
        .then((r) => r.ok ? r.json() as Promise<{ gecmis: GecmisMesaj[] }> : null)
        .then((d) => { if (!iptal && d) setGecmis(d.gecmis); })
        .catch(() => {})
        .finally(() => { if (!iptal) setYukleniyor(false); });
    }).catch(() => { if (!iptal) setYukleniyor(false); });

    return () => { iptal = true; };
  }, [acik, girisYapildi]);

  if (!girisYapildi) return null;

  return (
    <Section
      title="Sohbet geçmişi"
      icon={<HistoryIcon className="h-3.5 w-3.5" aria-hidden="true" />}
      accent="neutral"
      actions={
        <button
          onClick={() => setAcik((v) => !v)}
          className="text-[9px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          aria-expanded={acik}
          aria-label={acik ? "Geçmişi kapat" : "Geçmişi göster"}
        >
          {acik ? "Kapat" : "Göster"}
        </button>
      }
    >
      {acik && (
        <div className="space-y-1 p-2">
          {yukleniyor && (
            <div className="flex items-center gap-1.5 py-2 text-xs text-slate-400" role="status" aria-live="polite">
              <LoaderIcon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <span>Yükleniyor…</span>
            </div>
          )}

          {!yukleniyor && gecmis.length === 0 && (
            <p className="py-2 text-center text-[10px] text-slate-400">Henüz sohbet yok.</p>
          )}

          {!yukleniyor && gecmis.length > 0 && (
            <ul className="space-y-0.5" role="list" aria-label="Sohbet geçmişi">
              {gecmis.slice().reverse().map((m, i) => (
                <li key={`${m.tarih}-${i}`}>
                  <button
                    onClick={() => onSohbetSec?.(m)}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    aria-label={`Sohbet: ${baslikCikar(m.kullanici_mesaj)}`}
                  >
                    <MsgIcon className="mt-0.5 h-3 w-3 flex-shrink-0 text-slate-400" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[10px] font-medium text-slate-700 dark:text-slate-300">
                        {baslikCikar(m.kullanici_mesaj)}
                      </div>
                      <div className="flex items-center gap-1 text-[9px] text-slate-400">
                        <span>{tarihFmt(m.tarih)}</span>
                        <span>·</span>
                        <span>{m.model.split("-").slice(0, 2).join("-")}</span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!acik && (
        <p className="px-3 pb-2 text-[10px] text-slate-400">
          {gecmis.length > 0 ? `${gecmis.length} sohbet kayıtlı` : "Sohbet geçmişinize ulaşın"}
        </p>
      )}
    </Section>
  );
}
