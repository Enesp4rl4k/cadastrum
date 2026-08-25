import React, { useState } from "react";
import {
  KullaniciFirsatTarayici,
  type KullaniciAramaKriteri,
  type BulunanFirsatKart,
  type TarananIlanGirdisi,
} from "../../lib/ajanlar/kullanici-firsat-tarayici";

export const CanliFirsatAvcisi: React.FC = () => {
  const [kriter, setKriter] = useState<KullaniciAramaKriteri>({
    il: "izmir",
    ilce: "urla",
    kategori: "arsa",
    minFiyatTL: 1_000_000,
    maxFiyatTL: 8_000_000,
    minIskontoYuzde: 20,
    sadeceTemizTapu: true,
  });

  const [tariyor, setTariyor] = useState(false);
  const [ilerleme, setIlerleme] = useState<{ taranan: number; toplam: number } | null>(null);
  const [firsatlar, setFirsatlar] = useState<BulunanFirsatKart[]>([]);
  const [seciliFirsat, setSeciliFirsat] = useState<BulunanFirsatKart | null>(null);

  const taramayiBaslat = async () => {
    setTariyor(true);
    setFirsatlar([]);
    setSeciliFirsat(null);

    const ornekHavuz: TarananIlanGirdisi[] = [
      {
        ilanNo: "1189201923",
        baslik: "Urla Kekliktepe Manzaralı Müstakil Villa Arsası",
        fiyatTL: 4_500_000,
        m2: 1200,
        il: "izmir",
        ilce: "urla",
        mahalle: "kekliktepe",
        kategori: "arsa",
        lat: 38.32,
        lng: 26.77,
        imarDurumu: "konut-imarli",
        ilanUrl: "https://www.sahibinden.com/ilan/emlak-arsa-satilik-urla",
        aciklama: "Müstakil tapu, hemen inşaata hazır elektrik su yol var.",
      },
      {
        ilanNo: "1190348211",
        baslik: "Urla Yağcılar Köyü Hisseli Zeytinlik",
        fiyatTL: 1_800_000,
        m2: 3500,
        il: "izmir",
        ilce: "urla",
        mahalle: "yagcilar",
        kategori: "tarla",
        lat: 38.28,
        lng: 26.74,
        ilanUrl: "https://www.sahibinden.com/ilan/emlak-arsa-satilik-yagcilar",
        aciklama: "Köy içi hisseli zeytinlik tarla yatırımlık.",
      },
      {
        ilanNo: "1192849102",
        baslik: "Urla Çamlıçay Denize Yakın İmarlı Arsa",
        fiyatTL: 5_200_000,
        m2: 900,
        il: "izmir",
        ilce: "urla",
        mahalle: "camlicay",
        kategori: "arsa",
        lat: 38.35,
        lng: 26.81,
        imarDurumu: "konut-imarli",
        ilanUrl: "https://www.sahibinden.com/ilan/emlak-arsa-satilik-camlicay",
        aciklama: "Sahile yürüme mesafesinde takaslı acil satılık.",
      },
    ];

    try {
      const scanner = new KullaniciFirsatTarayici();
      const bulunanlar = await scanner.ilanlariTara(kriter, ornekHavuz, (t, top) => {
        setIlerleme({ taranan: t, toplam: top });
      });
      setFirsatlar(bulunanlar);
    } catch (e) {
      console.error("Tarama hatası:", e);
    } finally {
      setTariyor(false);
    }
  };

  return (
    <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-800 dark:text-slate-100 text-xs font-sans">
      {/* 1. Kontrol & Kriter Paneli */}
      <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-3 dark:border-slate-800">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              Otonom Fırsat Tarayıcısı
            </h2>
            <p className="text-3xs text-slate-500 font-medium">
              Kriter bazlı canlı piyasa taraması ve arbitraj tespiti
            </p>
          </div>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-3xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            PRO SCANNER
          </span>
        </div>

        {/* Kriter Girişleri */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-3xs font-bold uppercase text-slate-500 mb-1">
              Bölge (İl / İlçe)
            </label>
            <input
              type="text"
              value={`${kriter.il} / ${kriter.ilce ?? ""}`}
              onChange={(e) => {
                const parts = e.target.value.split("/");
                setKriter({ ...kriter, il: parts[0]?.trim() ?? "", ilce: parts[1]?.trim() });
              }}
              placeholder="izmir / urla"
              className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div>
            <label className="block text-3xs font-bold uppercase text-slate-500 mb-1">
              Kategori
            </label>
            <select
              value={kriter.kategori}
              onChange={(e) => setKriter({ ...kriter, kategori: e.target.value as any })}
              className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="arsa">Arsa (İmarlı)</option>
              <option value="tarla">Tarla / Arazi</option>
              <option value="konut">Konut / Daire</option>
            </select>
          </div>

          <div>
            <label className="block text-3xs font-bold uppercase text-slate-500 mb-1">
              Tavan Bütçe (TL)
            </label>
            <input
              type="number"
              value={kriter.maxFiyatTL ?? 5000000}
              onChange={(e) => setKriter({ ...kriter, maxFiyatTL: Number(e.target.value) })}
              className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-800"
            />
          </div>

          <div>
            <label className="block text-3xs font-bold uppercase text-slate-500 mb-1">
              Min İskonto Eşiği
            </label>
            <input
              type="number"
              value={kriter.minIskontoYuzde ?? 20}
              onChange={(e) => setKriter({ ...kriter, minIskontoYuzde: Number(e.target.value) })}
              className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </div>

        {/* Filtre Checkbox */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2 mb-3 dark:border-slate-800 text-3xs text-slate-600 dark:text-slate-400">
          <label className="flex items-center gap-1.5 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={kriter.sadeceTemizTapu}
              onChange={(e) => setKriter({ ...kriter, sadeceTemizTapu: e.target.checked })}
              className="rounded text-slate-900 dark:text-slate-100"
            />
            Yalnızca Müstakil & Hukuken Temiz Tapular
          </label>
        </div>

        {/* Tarama Tetikleme Butonu */}
        <button
          onClick={taramayiBaslat}
          disabled={tariyor}
          className="w-full rounded bg-slate-900 py-2 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 flex items-center justify-center gap-2"
        >
          {tariyor ? (
            <>
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent dark:border-slate-900"></div>
              Piyasa Taranıyor ({ilerleme?.taranan}/{ilerleme?.toplam})...
            </>
          ) : (
            "Piyasa Taramasını Başlat"
          )}
        </button>
      </div>

      {/* 2. Sonuç Listesi (Deal Stream) */}
      {firsatlar.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-3xs font-bold uppercase tracking-wider text-slate-500">
              Eşleşen Fırsat Kayıtları ({firsatlar.length})
            </span>
            <span className="font-mono text-3xs text-slate-400">
              Sıralama: Efektif Kâr Marjı ↓
            </span>
          </div>

          {firsatlar.map((f, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
            >
              {/* Başlık ve Fiyat Başlığı */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 font-mono text-3xs font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      %{f.iskontoYuzde} İSKONTO
                    </span>
                    <span className="text-3xs font-mono text-slate-400 uppercase">
                      {f.ilan.il}/{f.ilan.ilce} • {f.ilan.m2} m²
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 line-clamp-1">
                    {f.ilan.baslik}
                  </h4>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-slate-900 dark:text-slate-100 text-xs">
                    {f.ilan.fiyatTL.toLocaleString("tr-TR")} ₺
                  </div>
                  <div className="font-mono text-3xs text-slate-400 line-through">
                    Emsal: {f.sentez.firsat.tahminiPiyasaDegeriTL.toLocaleString("tr-TR")} ₺
                  </div>
                </div>
              </div>

              {/* Arbitraj Özeti */}
              <div className="mt-2 rounded bg-slate-50/80 p-2 dark:bg-slate-800/40 text-2xs space-y-1">
                <div className="flex justify-between font-mono">
                  <span className="text-slate-500">Tahmini Kâr:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    +{f.potansiyelKarTL.toLocaleString("tr-TR")} ₺
                  </span>
                </div>
                <p className="text-3xs leading-relaxed text-slate-600 dark:text-slate-400 font-medium">
                  {f.debate.uzlasmaOzeti}
                </p>
              </div>

              {/* Aksiyon Butonları */}
              <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800 text-2xs font-medium">
                {f.ilan.ilanUrl && (
                  <a
                    href={f.ilan.ilanUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-900 dark:text-slate-100 font-bold hover:underline"
                  >
                    İlanı İncele →
                  </a>
                )}
                <button
                  onClick={() => setSeciliFirsat(f === seciliFirsat ? null : f)}
                  className="text-3xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  {seciliFirsat === f ? "Tutanakları Gizle ↑" : "Ajan Tutanakları ↓"}
                </button>
              </div>

              {/* Tutanak Genişletmesi */}
              {seciliFirsat === f && (
                <div className="mt-2 border-t border-slate-100 pt-2 space-y-1.5 font-mono text-3xs dark:border-slate-800">
                  {f.debate.turlar.map((t, tIdx) => (
                    <div key={tIdx} className="bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded">
                      <span className="font-bold text-slate-500">[{t.konusan.toUpperCase()}]: </span>
                      <span className="text-slate-700 dark:text-slate-300 font-sans">{t.arguman}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};