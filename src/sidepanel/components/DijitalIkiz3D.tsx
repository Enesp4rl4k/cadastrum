/**
 * DijitalIkiz3D — Gerçek 3D Dijital İkiz
 *
 * Deck.gl WebGL tabanlı 3D görünüm:
 *   - PolygonLayer  → parsel zemini (gerçek koordinatlar)
 *   - ColumnLayer   → bina kütle (TAKS × alan → footprint, KAKS/TAKS → kat yüksekliği)
 *   - PathLayer     → imar zarfı çerçevesi
 *
 * Koordinatlar: TKGM'den gelen WGS84 (lat/lng) → Deck.gl [lng, lat] formatına çevrilir.
 * Lazy import: DeckGL sadece bu bileşen açıldığında yüklenir (~500KB, başlangıç maliyeti yok).
 *
 * Kullanım:
 *   <DijitalIkiz3D parsel={parsel} ePlan={ePlan} />
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2 as LoaderIcon, AlertCircle as AlertIcon, RotateCcw as ResetIcon } from "lucide-react";
import type { Parsel } from "../../types/tkgm";
import type { EPlanImarVerisi } from "../../lib/eplan";
import type { CevreAnalizi } from "../../lib/osm";

// ── Tipler ────────────────────────────────────────────────────────────────────

interface Props {
  parsel: Parsel;
  ePlan?: EPlanImarVerisi | null;
  cevre?: CevreAnalizi | null;
  egimYuzde?: number | null;
  /** Canvas yüksekliği (px) — varsayılan 260 */
  yukseklik?: number;
}

// Deck.gl lazy import tipler — any kullanmak zorundayız (dynamic import)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DeckInstance = any;

// ── Koordinat yardımcıları ────────────────────────────────────────────────────

/** WGS84 derece → metre yaklaşık dönüşüm (lokal alan için yeterli) */
const DEG_TO_M_LAT = 111_320;
function degToMLng(lat: number) { return 111_320 * Math.cos((lat * Math.PI) / 180); }

/**
 * Parsel geometrisinden [lng, lat] dizisi çıkar.
 * MultiPolygon için ilk halkayı alır.
 */
function parselPoligon(parsel: Parsel): [number, number][] {
  const g = parsel.geometri;
  if (!g) {
    // Fallback: koordinatlar dizisi
    return parsel.koordinatlar.map((k) => [k.lng, k.lat]);
  }
  if (g.type === "Polygon") {
    const ring = (g.coordinates as number[][][])[0] ?? [];
    return ring.map(([x, y]) => [x, y] as [number, number]);
  }
  if (g.type === "MultiPolygon") {
    const ring = ((g.coordinates as number[][][][])[0]?.[0]) ?? [];
    return ring.map(([x, y]) => [x, y] as [number, number]);
  }
  return parsel.koordinatlar.map((k) => [k.lng, k.lat]);
}

/**
 * Parsel merkezi çevresinde imar taban footprint poligonu oluştur.
 * TAKS oranına göre parsel alanını küçültür.
 */
function imarFootprint(
  merkezLng: number,
  merkezLat: number,
  alan: number,
  taks: number,
): [number, number][] {
  const imarAlan = alan * Math.max(0.05, Math.min(1, taks));
  const yari = Math.sqrt(imarAlan) / 2;

  const dLat = yari / DEG_TO_M_LAT;
  const dLng = yari / degToMLng(merkezLat);

  return [
    [merkezLng - dLng, merkezLat - dLat],
    [merkezLng + dLng, merkezLat - dLat],
    [merkezLng + dLng, merkezLat + dLat],
    [merkezLng - dLng, merkezLat + dLat],
    [merkezLng - dLng, merkezLat - dLat], // kapalı halka
  ];
}

/**
 * Kat yüksekliğini metre cinsinden hesapla.
 * Türkiye'de standart: 3m/kat, bodrum dahil +1m zemin
 */
function katYuksekligiM(katSayisi: number): number {
  return Math.max(3, katSayisi) * 3;
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export function DijitalIkiz3D({ parsel, ePlan, cevre: _cevre, egimYuzde: _egim, yukseklik = 260 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<DeckInstance>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  const taks    = ePlan?.taks   ?? 0.3;
  const kaks    = ePlan?.emsal  ?? 1.0;
  const maksKat = ePlan?.maksKat ?? Math.max(1, Math.round(kaks / Math.max(0.05, taks)));
  const katH    = katYuksekligiM(maksKat);

  const merkezLng = parsel.merkezNokta.lng;
  const merkezLat = parsel.merkezNokta.lat;

  const baslatDeck = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      // Lazy import — sadece bu bileşen render edildiğinde yüklenir
      const [
        { Deck, OrthographicView },
        { PolygonLayer },
        { PathLayer },
        { ColumnLayer },
      ] = await Promise.all([
        import("@deck.gl/core"),
        import("@deck.gl/layers"),
        import("@deck.gl/layers"),
        import("@deck.gl/layers"),
      ]);

      const parselPoly = parselPoligon(parsel);
      const imarPoly   = imarFootprint(merkezLng, merkezLat, parsel.alan, taks);

      // Viewport: parsel merkezine odaklan, hafif eğimli perspektif
      const initialViewState = {
        longitude: merkezLng,
        latitude:  merkezLat,
        zoom:      17,
        pitch:     45,
        bearing:   -20,
      };

      // Layer renkleri
      const ZEMIN_RENK:     [number, number, number, number] = [148, 163, 184, 180]; // slate-400
      const IMAR_ZEMIN:     [number, number, number, number] = [59,  130, 246, 100]; // blue-500 şeffaf
      const BINA_YAN:       [number, number, number, number] = [147, 197, 253, 220]; // blue-300
      const BINA_UST:       [number, number, number, number] = [191, 219, 254, 255]; // blue-200
      const KENAR_RENK:     [number, number, number, number] = [59,  130, 246, 255]; // blue-500
      const IMAR_KENAR:     [number, number, number, number] = [234, 179,   8, 220]; // amber-500

      const layers = [
        // 1. Parsel zemin poligonu
        new PolygonLayer({
          id: "parsel-zemin",
          data: [{ contour: parselPoly }],
          getPolygon: (d: { contour: [number, number][] }) => d.contour,
          getFillColor: ZEMIN_RENK,
          getLineColor: KENAR_RENK,
          getLineWidth: 2,
          lineWidthMinPixels: 1,
          extruded: false,
          pickable: false,
        }),

        // 2. İmar taban footprint (zemin)
        new PolygonLayer({
          id: "imar-taban",
          data: [{ contour: imarPoly }],
          getPolygon: (d: { contour: [number, number][] }) => d.contour,
          getFillColor: IMAR_ZEMIN,
          getLineColor: IMAR_KENAR,
          getLineWidth: 1.5,
          lineWidthMinPixels: 1,
          extruded: false,
          pickable: false,
        }),

        // 3. Bina kütlesi — ekstrüde poligon (imar taban × kat yüksekliği)
        new PolygonLayer({
          id: "bina-kutle",
          data: [{ contour: imarPoly, yukseklik: katH }],
          getPolygon: (d: { contour: [number, number][]; yukseklik: number }) => d.contour,
          getElevation: (d: { yukseklik: number }) => d.yukseklik,
          getFillColor: BINA_YAN,
          getLineColor: KENAR_RENK,
          lineWidthMinPixels: 1,
          extruded: true,
          wireframe: false,
          material: { ambient: 0.35, diffuse: 0.6, shininess: 20, specularColor: [255, 255, 255] },
          pickable: true,
        }),

        // 4. Çatı vurgusu — üst yüzey için ince PathLayer
        new PathLayer({
          id: "cati-cerceve",
          data: [{ path: imarPoly.map(([x, y]) => [x, y, katH] as [number, number, number]) }],
          getPath: (d: { path: [number, number, number][] }) => d.path,
          getColor: BINA_UST,
          getWidth: 1.5,
          widthMinPixels: 1,
          pickable: false,
        }),

        // 5. Parsel sınır çerçevesi (öne çıkar)
        new PathLayer({
          id: "parsel-cerceve",
          data: [{ path: [...parselPoly, parselPoly[0]!].map(([x, y]) => [x, y, 0.5] as [number, number, number]) }],
          getPath: (d: { path: [number, number, number][] }) => d.path,
          getColor: [100, 116, 139, 200] as [number, number, number, number], // slate-500
          getWidth: 1.5,
          widthMinPixels: 1,
          pickable: false,
        }),
      ];

      // MapLibre yerine OrthographicView kullan — harita tile'ı gerektirmez,
      // extension'da dış kaynak bağımlılığı azalır.
      // Koordinat bazlı görünüm için MapView kullanılır (default).
      if (deckRef.current) {
        deckRef.current.setProps({ layers, initialViewState });
      } else {
        deckRef.current = new Deck({
          parent: containerRef.current,
          width: "100%",
          height: yukseklik,
          initialViewState,
          controller: true,
          layers,
          onWebGLInitialized: () => setYukleniyor(false),
          onError: (e: Error) => setHata(e.message),
        });
      }
      setYukleniyor(false);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "3D yüklenemedi");
      setYukleniyor(false);
    }
  }, [parsel, merkezLng, merkezLat, taks, katH, yukseklik]);

  useEffect(() => {
    void baslatDeck();
    return () => {
      if (deckRef.current) {
        deckRef.current.finalize?.();
        deckRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Parsel/ePlan değişince layer'ları güncelle
  useEffect(() => {
    if (!deckRef.current || yukleniyor) return;
    void baslatDeck();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsel.adaNo, parsel.parselNo, taks, kaks, maksKat]);

  const kameraYenile = () => {
    deckRef.current?.setProps({
      initialViewState: {
        longitude: merkezLng,
        latitude:  merkezLat,
        zoom:      17,
        pitch:     45,
        bearing:   -20,
        transitionDuration: 500,
      },
    });
  };

  return (
    <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-900 dark:border-slate-700"
         style={{ height: yukseklik }}>
      {/* Deck.gl canvas mount noktası */}
      <div ref={containerRef} className="absolute inset-0" style={{ height: yukseklik }} />

      {/* Yükleniyor overlay */}
      {yukleniyor && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10">
          <div className="flex items-center gap-2 text-2xs text-slate-300">
            <LoaderIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>3D sahne yükleniyor…</span>
          </div>
        </div>
      )}

      {/* Hata overlay */}
      {hata && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 z-10 p-4">
          <div className="text-center">
            <AlertIcon className="h-6 w-6 text-red-400 mx-auto mb-2" aria-hidden="true" />
            <p className="text-2xs text-red-300">{hata}</p>
          </div>
        </div>
      )}

      {/* Kontrol butonları */}
      {!yukleniyor && !hata && (
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
          <button
            type="button"
            onClick={kameraYenile}
            title="Kamerayı sıfırla"
            aria-label="Kamerayı sıfırla"
            className="rounded bg-slate-800/80 p-1 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors backdrop-blur-sm"
          >
            <ResetIcon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Kat / imar bilgisi overlay — sol alt */}
      {!yukleniyor && !hata && (
        <div className="absolute bottom-2 left-2 z-10 rounded bg-slate-800/75 px-2 py-1 text-[9px] text-slate-300 backdrop-blur-sm">
          <span className="font-semibold text-blue-300">{maksKat} kat</span>
          {" · "}TAKS {taks.toFixed(2)} · KAKS {kaks.toFixed(2)}
          {" · "}{parsel.alan.toLocaleString("tr-TR")} m²
        </div>
      )}

      {/* Sürükle ipucu */}
      {!yukleniyor && !hata && (
        <div className="absolute bottom-2 right-2 z-10 text-[8px] text-slate-500 italic">
          Sürükle · Kaydır · Döndür
        </div>
      )}
    </div>
  );
}
