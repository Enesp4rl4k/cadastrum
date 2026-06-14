/**
 * Sistem Sağlığı dashboard — backend cross-validation çıktısını gösterir.
 *
 * - Global MAPE (sistemin genel doğruluğu)
 * - Top 5 yüksek tahmin yapılan ilçeler (positif bias)
 * - Top 5 düşük tahmin yapılan ilçeler (negatif bias)
 * - Son güncelleme tarihi
 *
 * Modal olarak açılır (Ayarlar'dan tetiklenir).
 */
import { useEffect, useState } from "react";
import { validationOzetYukle, type ValidationOzet } from "../../lib/bias-kalibrasyon";

interface Props {
  onClose: () => void;
}

export function SistemSagligi({ onClose }: Props) {
  const [veri, setVeri] = useState<ValidationOzet | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;
    setYukleniyor(true);
    validationOzetYukle()
      .then(v => {
        if (!iptal) {
          if (!v) setHata("Backend henüz validation çalıştırmadı veya yeterli veri yok.");
          else setVeri(v);
          setYukleniyor(false);
        }
      })
      .catch(e => {
        if (!iptal) {
          setHata(`Yükleme hatası: ${e.message}`);
          setYukleniyor(false);
        }
      });
    return () => { iptal = true; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">📊 Sistem Sağlığı</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          {yukleniyor && (
            <div className="text-center py-8 text-slate-500 animate-pulse">
              Validation raporu yükleniyor...
            </div>
          )}

          {hata && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              <div className="font-semibold mb-1">Veri henüz yetersiz</div>
              {hata}
              <div className="mt-2 text-xs text-amber-700">
                Cross-validation çalışması için backend'de en az ~50 ilan + 5 farklı ilçe gerek.
                Kullanıcılar Sahibinden/Hepsiemlak'ta gezdikçe veri birikir.
              </div>
            </div>
          )}

          {veri && (
            <>
              {/* Global metrikler */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-slate-600 mb-1">Global MAPE</div>
                  <div className="text-2xl font-bold text-blue-700">
                    %{veri.global.mape.toFixed(1)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Ortalama yüzde sapma
                  </div>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-slate-600 mb-1">Test örnek</div>
                  <div className="text-2xl font-bold text-purple-700">
                    {veri.testAdet.toLocaleString("tr-TR")}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {veri.global.n} ilçe-kategori grubu
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-slate-600 mb-1">Train örnek</div>
                  <div className="text-2xl font-bold text-green-700">
                    {veri.trainAdet.toLocaleString("tr-TR")}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {veri.pencereGun} gün penceresi
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-500 mb-3">
                Son güncelleme: {new Date(veri.olusturuldu).toLocaleString("tr-TR")}
              </div>

              {/* Top sapma — pozitif bias (sistem yüksek tahmin) */}
              {veri.topPositiveBias.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold mb-2 text-red-700">
                    ↑ Sistem yüksek tahmin yapıyor (otomatik düzeltme uygulanıyor)
                  </h3>
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="text-left p-1.5">İlçe</th>
                        <th className="text-right p-1.5">Bias</th>
                        <th className="text-right p-1.5">MAPE</th>
                        <th className="text-right p-1.5">N</th>
                      </tr>
                    </thead>
                    <tbody>
                      {veri.topPositiveBias.map((x, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="p-1.5">{x.ilce} <span className="text-slate-400">/ {x.il} / {x.kategori}</span></td>
                          <td className="text-right p-1.5 text-red-600 font-medium">+%{x.bias.toFixed(1)}</td>
                          <td className="text-right p-1.5">%{x.mape.toFixed(1)}</td>
                          <td className="text-right p-1.5 text-slate-500">{x.n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Top sapma — negatif bias (sistem düşük tahmin) */}
              {veri.topNegativeBias.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold mb-2 text-blue-700">
                    ↓ Sistem düşük tahmin yapıyor
                  </h3>
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="text-left p-1.5">İlçe</th>
                        <th className="text-right p-1.5">Bias</th>
                        <th className="text-right p-1.5">MAPE</th>
                        <th className="text-right p-1.5">N</th>
                      </tr>
                    </thead>
                    <tbody>
                      {veri.topNegativeBias.map((x, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="p-1.5">{x.ilce} <span className="text-slate-400">/ {x.il} / {x.kategori}</span></td>
                          <td className="text-right p-1.5 text-blue-600 font-medium">{x.bias.toFixed(1)}%</td>
                          <td className="text-right p-1.5">%{x.mape.toFixed(1)}</td>
                          <td className="text-right p-1.5 text-slate-500">{x.n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Açıklama */}
              <div className="mt-4 p-3 bg-slate-50 rounded-lg text-[11px] text-slate-600">
                <div className="font-semibold mb-1 text-slate-700">Nasıl çalışır?</div>
                Backend'de son 90 günün ilan verisi train/test split (eski %80 → train, yeni %20 → test).
                Mahalle medyanı train ile hesaplanır, test ilanlarına karşı ölçülür.
                Bias %5'ten büyük olan ilçelerde otomatik düzeltme çarpanı uygulanır.
                Daha çok kullanıcı veri katkıda bulundukça doğruluk artar.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
