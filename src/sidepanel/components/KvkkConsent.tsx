/**
 * KVKK Consent Modal — extension ilk açılış.
 *
 * 3 toggle: telemetri (anonim kullanım), spatial pool (anonim emsal paylaşımı),
 * bildirim (mail aboneliği için izin). Hepsi default OFF (opt-in).
 *
 * chrome.storage.local.cadastrum_kvkk_v1 → "accepted" veya "declined" sonra
 * tekrar gösterilmez. Yeni feature consent'i için anahtar v2'ye geçecek.
 */

import { useEffect, useState } from "react";
import { Shield as ShieldIcon, X as XIcon } from "lucide-react";

const STORAGE_KEY = "cadastrum_kvkk_v1";

interface ConsentDurum {
  telemetri: boolean;
  spatialPool: boolean;
  bildirim: boolean;
}

const VARSAYILAN: ConsentDurum = {
  telemetri: false,
  spatialPool: false,
  bildirim: false,
};

export function KvkkConsent({ onComplete }: { onComplete: () => void }) {
  const [acik, setAcik] = useState(true);
  const [durum, setDurum] = useState<ConsentDurum>(VARSAYILAN);

  if (!acik) return null;

  async function kaydet(d: ConsentDurum) {
    if (typeof chrome === "undefined" || !chrome?.storage?.local) {
      onComplete();
      return;
    }
    await chrome.storage.local.set({
      [STORAGE_KEY]: { ts: Date.now(), ...d },
      // Ayarlar.ts ile sync
      ayarlar_telemetri: d.telemetri,
    });
    setAcik(false);
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center gap-2 mb-3">
          <ShieldIcon className="h-6 w-6 text-imperial dark:text-champagne" />
          <h2 className="text-lg font-semibold">Gizlilik ve KVKK</h2>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
          Cadastrum'u kullanmaya başlamadan önce neye onay verdiğini netleştir.
          Hepsi <strong>opsiyonel</strong> ve istediğin zaman Ayarlar'dan değiştirebilirsin.
        </p>

        <div className="space-y-3 mb-5">
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={durum.telemetri}
              onChange={(e) => setDurum({ ...durum, telemetri: e.target.checked })}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="font-medium">Anonim kullanım istatistikleri</div>
              <div className="text-xs text-slate-500">
                Hata raporu, sayfa kullanımı, özellik tetiklenme. Kişisel veri yok.
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={durum.spatialPool}
              onChange={(e) => setDurum({ ...durum, spatialPool: e.target.checked })}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="font-medium">Anonim ilan paylaşımı (Spatial Pool)</div>
              <div className="text-xs text-slate-500">
                Yakaladığın Sahibinden/Hepsiemlak ilanlarının fiyat + koordinatı
                topluluk fiyat havuzuna eklensin. Kişisel/iletişim bilgisi yok.
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={durum.bildirim}
              onChange={(e) => setDurum({ ...durum, bildirim: e.target.checked })}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="font-medium">Email bildirimleri</div>
              <div className="text-xs text-slate-500">
                Fiyat değişimi, yeni emsal bildirimi için email gönderme izni.
              </div>
            </div>
          </label>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => kaydet(VARSAYILAN)}
            className="flex-1 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
          >
            Hepsini reddet
          </button>
          <button
            onClick={() => kaydet(durum)}
            className="flex-1 px-3 py-2 text-sm font-semibold bg-imperial text-white hover:bg-imperial-700 rounded"
          >
            Onayla ve devam et
          </button>
        </div>

        <p className="text-3xs text-slate-400 dark:text-slate-500 text-center mt-3">
          Tüm tercihlerini Ayarlar &rarr; Gizlilik bölümünden değiştirebilirsin.
        </p>
      </div>
    </div>
  );
}

/** chrome.storage'tan KVKK consent durumunu okur. */
export async function kvkkConsentDurumuOku(): Promise<ConsentDurum | null> {
  if (typeof chrome === "undefined" || !chrome?.storage?.local) return null;
  const d = await chrome.storage.local.get(STORAGE_KEY);
  const kayit = d[STORAGE_KEY] as (ConsentDurum & { ts: number }) | undefined;
  if (!kayit) return null;
  return { telemetri: kayit.telemetri, spatialPool: kayit.spatialPool, bildirim: kayit.bildirim };
}

/** Hook — KVKK consent verilmiş mi? */
export function useKvkkConsentVerilmis(): boolean | null {
  const [verilmis, setVerilmis] = useState<boolean | null>(null);
  useEffect(() => {
    kvkkConsentDurumuOku().then((d) => setVerilmis(d !== null));
  }, []);
  return verilmis;
}
