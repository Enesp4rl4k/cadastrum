import { useEffect, useState } from "react";
import { useAyarlar } from "../../lib/ayarlar";
import { db } from "../../lib/db";
import { chromeAiDestekleniyor, type AiSaglayici } from "../../lib/ai-fiyat";
import {
  MODULLER,
  MODUL_KATEGORI_ETIKET,
  type ModulId,
  type ModulKategori,
} from "../../lib/modul-tanimi";
import { AbonelikYonetimi } from "./AbonelikYonetimi";
import { SistemSagligi } from "./SistemSagligi";

export function AyarlarDugmesi() {
  const [acik, setAcik] = useState(false);
  const [ayarlar, guncelle] = useAyarlar();
  const [chromeAiVar, setChromeAiVar] = useState(false);
  const [sistemSagligiAcik, setSistemSagligiAcik] = useState(false);
  const [gelismisAcik, setGelismisAcik] = useState(false);

  useEffect(() => {
    chromeAiDestekleniyor().then(setChromeAiVar);
  }, []);

  async function ilanGecmisiniSil() {
    if (!confirm("Sahibinden ilan gözlemleri silinecek. Devam?")) return;
    await db.ilanGozlem.clear();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        className="rounded p-1 text-tkgm-muted hover:bg-slate-100"
        title="Ayarlar"
      >
        ⚙
      </button>
      {acik && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setAcik(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 max-h-[85vh] w-80 overflow-y-auto rounded-lg border border-slate-300 bg-white p-3 text-xs shadow-lg">
            {/* Abonelik — geçici devre dışı, fiyatlandırma kesinleşince aç */}
            {false && (
              <div className="mb-3 border-b border-slate-200 pb-3">
                <AbonelikYonetimi />
              </div>
            )}

            <div className="mb-2 font-semibold text-tkgm-ink">Ayarlar</div>
            <label className="flex items-start gap-2 py-1">
              <input
                type="checkbox"
                checked={ayarlar.ilanGozlemiKaydet}
                onChange={(e) =>
                  guncelle({ ilanGozlemiKaydet: e.target.checked })
                }
                className="mt-0.5"
              />
              <div>
                <div className="font-medium">İlan gözlemi kaydet</div>
                <div className="text-[10px] text-tkgm-muted">
                  Açtığın her sahibinden ilanı yerel olarak biriktir, mahalle
                  TL/m² ortalaması hesapla. Cihazından çıkmaz.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2 py-1">
              <input
                type="checkbox"
                checked={ayarlar.otomatikFavori}
                onChange={(e) =>
                  guncelle({ otomatikFavori: e.target.checked })
                }
                className="mt-0.5"
              />
              <div>
                <div className="font-medium">TKGM doğrulamasında otomatik favori</div>
                <div className="text-[10px] text-tkgm-muted">
                  İlan TKGM'de doğrulandığında parsel otomatik olarak Favoriler'e
                  eklenir, not olarak ilan no + TL/m² düşülür.
                </div>
              </div>
            </label>
            {/* TCMB KFE — il bazlı konut fiyat endeksi enflasyon düzeltmesi */}
            <div className="mt-3 border-t border-slate-200 pt-2">
              <div className="mb-1 font-semibold text-tkgm-ink">TCMB Konut Fiyat Endeksi</div>
              <div className="text-[10px] text-tkgm-muted mb-1.5">
                İl bazlı KFE ile enflasyon düzeltmesi. Boş bırakılırsa TÜFE fallback aktif olur.{" "}
                <a
                  href="https://evds2.tcmb.gov.tr/index.php?/evds/login"
                  target="_blank"
                  rel="noopener"
                  className="text-blue-600 hover:underline"
                >
                  Ücretsiz API key al →
                </a>
              </div>
              <input
                type="password"
                placeholder="TCMB EVDS API anahtarı..."
                value={ayarlar.tcmbApiKey}
                onChange={(e) => guncelle({ tcmbApiKey: e.target.value })}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-2xs text-slate-700"
              />
            </div>

            <label className="flex items-start gap-2 py-1 mt-2">
              <input
                type="checkbox"
                checked={ayarlar.backendTelemetri}
                onChange={async (e) => {
                  guncelle({ backendTelemetri: e.target.checked });
                  // Service worker da chrome.storage.local'dan okur — senkronize et
                  if (typeof chrome !== "undefined" && chrome?.storage?.local) {
                    await chrome.storage.local.set({ backendTelemetri: e.target.checked });
                  }
                }}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium">Veri katkısı (anonim)</div>
                <div className="text-[10px] text-tkgm-muted">
                  Sahibinden/Hepsiemlak'ta gezdiğin ilan verileri (fiyat, m², il/ilçe/mahalle, kategori)
                  anonim olarak Cadastrum sunucusuna gider. Mahalle medyan fiyatları topluluk
                  verisiyle iyileşir. <strong>Kişisel bilgi gönderilmez.</strong> Kapatırsan
                  uzaktan veri kaybolmaz, sadece bundan sonra paylaşılmaz.
                </div>
              </div>
            </label>
            {/* Analiz Modülleri — kullanıcı seçer */}
            <div className="mt-3 border-t border-slate-200 pt-2">
              <div className="mb-1 font-semibold text-tkgm-ink">
                Analiz Modülleri
              </div>
              <div className="text-[10px] text-tkgm-muted mb-1.5">
                Bir parsel açtığında alttaki panelde hangi analizlerin
                gösterileceğini seç.
              </div>
              {(Object.keys(MODUL_KATEGORI_ETIKET) as ModulKategori[]).map((kat) => {
                const grupModulleri = MODULLER.filter((m) => m.kategori === kat);
                if (grupModulleri.length === 0) return null;
                return (
                  <div key={kat} className="mb-1.5">
                    <div className="text-[9px] uppercase tracking-wide text-slate-400">
                      {MODUL_KATEGORI_ETIKET[kat]}
                    </div>
                    {grupModulleri.map((m) => {
                      const acik = ayarlar.acikModuller.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className="flex cursor-pointer items-start gap-1.5 py-0.5 hover:bg-slate-50 rounded px-1"
                        >
                          <input
                            type="checkbox"
                            checked={acik}
                            onChange={(e) => {
                              const yeni = e.target.checked
                                ? [...ayarlar.acikModuller, m.id]
                                : ayarlar.acikModuller.filter(
                                    (x) => x !== m.id,
                                  );
                              guncelle({ acikModuller: yeni });
                            }}
                            className="mt-0.5 h-3 w-3 cursor-pointer accent-tkgm-primary"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-medium text-tkgm-ink">
                              {m.ad}
                            </div>
                            <div className="text-[9px] text-tkgm-muted">
                              {m.aciklama}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* AI fiyat tahmini — Cadastrum sağlıyor (kullanıcı setup gerekmez) */}
            <div className="mt-3 border-t border-slate-200 pt-2">
              <div className="mb-1 flex items-center justify-between">
                <div className="font-semibold text-tkgm-ink">🤖 AI Fiyat Tahmini</div>
                <button
                  type="button"
                  onClick={() => setGelismisAcik(v => !v)}
                  className="text-[9px] text-tkgm-muted hover:text-tkgm-ink"
                >
                  {gelismisAcik ? "▴ gizle" : "▾ gelişmiş"}
                </button>
              </div>
              <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] text-emerald-800">
                ✓ <strong>Cadastrum AI</strong> aktif — Free planda günde 3, Pro'da 100, Pro+'ta 1000 sorgu/gün.
                Kurulum gerekmiyor, otomatik çalışır.
              </div>

              {/* Gelişmiş: power user kendi sağlayıcısını seçebilir */}
              {gelismisAcik && (
                <div className="mt-2 space-y-1.5">
                  <div className="text-[9px] text-tkgm-muted">
                    Gelişmiş kullanıcılar için alternatif AI sağlayıcıları:
                  </div>
                  <select
                    value={ayarlar.aiSaglayici}
                    onChange={(e) =>
                      guncelle({ aiSaglayici: e.target.value as AiSaglayici })
                    }
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[11px]"
                  >
                    <option value="cadastrum-proxy">Cadastrum AI (varsayılan, önerilen)</option>
                    <option value="chrome-builtin" disabled={!chromeAiVar}>
                      {chromeAiVar
                        ? "Chrome built-in (Gemini Nano, lokal)"
                        : "Chrome built-in (yok — Chrome 127+ flag)"}
                    </option>
                    <option value="ollama">Ollama (lokal, kendi sunucun)</option>
                    <option value="gemini-free">Google Gemini (kendi API key)</option>
                    <option value="yok">AI tamamen kapalı</option>
                  </select>

                  {ayarlar.aiSaglayici === "ollama" && (
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={ayarlar.aiOllamaModel}
                        onChange={(e) => guncelle({ aiOllamaModel: e.target.value })}
                        placeholder="model adı (llama3.2, mistral...)"
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[10px]"
                      />
                      <input
                        type="text"
                        value={ayarlar.aiOllamaUrl}
                        onChange={(e) => guncelle({ aiOllamaUrl: e.target.value })}
                        placeholder="http://localhost:11434"
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[10px]"
                      />
                    </div>
                  )}

                  {ayarlar.aiSaglayici === "gemini-free" && (
                    <input
                      type="password"
                      value={ayarlar.aiGeminiApiKey}
                      onChange={(e) => guncelle({ aiGeminiApiKey: e.target.value })}
                      placeholder="API key (AIza...)"
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[10px]"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="mt-2 border-t border-slate-200 pt-2 space-y-1.5">
              <button
                type="button"
                onClick={() => { setSistemSagligiAcik(true); setAcik(false); }}
                className="block text-[11px] text-blue-600 hover:underline"
              >
                📊 Sistem Sağlığı (cross-validation raporu)
              </button>
              <button
                type="button"
                onClick={ilanGecmisiniSil}
                className="block text-[11px] text-red-600 hover:underline"
              >
                İlan gözlem geçmişini sil
              </button>
            </div>
          </div>
        </>
      )}
      {sistemSagligiAcik && <SistemSagligi onClose={() => setSistemSagligiAcik(false)} />}
    </div>
  );
}
