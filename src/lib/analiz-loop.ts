/**
 * Dependency-Aware Analiz Loop
 *
 * Parsel seçildiğinde tüm analiz katmanlarını doğru sırayla fetch eder
 * ve ParselStore'a yazar.
 *
 * Bağımlılık grafiği:
 *   Seviye 0 (paralel, bağımsız):
 *     - ePlan  (e-Plan imar verisi)
 *     - cevre  (OSM/Overpass POI)
 *     - egim   (Open-Meteo elevation)
 *     - tucbs  (CDP imar planı)
 *
 *   Seviye 1 (cevre + egim + ePlan + tucbs tamamlanınca):
 *     - fiyat  (heuristic fiyat tahmini — cevre+egim+ePlan+tucbs kullanır)
 *
 *   Seviye 2 (fiyat tamamlanınca, AI sağlayıcı ayarlıysa):
 *     - aiFiyat (AI fiyat tahmini — fiyat heuristic'i context olarak alır)
 *
 * Özellikler:
 *   - AbortController: parsel değişince önceki fetch'ler iptal edilir
 *   - Stale-data koruması: store'da parselKey ile sağlanıyor
 *   - Partial failure: bir katman hata alsa diğerleri devam eder
 *   - Timeout: her katman için ayrı timeout (Overpass yavaş olabilir)
 */

import { useEffect, useRef } from "react";
import type { Parsel } from "../types/tkgm";
import { useParselStore, parselKey } from "./parsel-store";
import { cevreAnaliziGetir } from "./osm";
import { egimAnaliziGetir } from "./elevation";
import { fiyatTahminEt } from "./fiyat-tahmin";
import { tucbsCdpGetir } from "./tucbs";
import { aktifEPlanVerisiGetir } from "./eplan";
import { otomatikEPlanSorgula } from "./eplan-api";
import { ayarlariGetir } from "./ayarlar";
import { aiTahmin } from "./ai-fiyat";
import { withRetry } from "./graceful-degradation";
import type { CevreAnalizi } from "./osm";
import type { EgimAnalizi } from "./elevation";
import type { EPlanImarVerisi } from "./eplan";
import type { TucbsCdpSonuc } from "./tucbs";

// ── Timeout sabitleri ─────────────────────────────────────────────────────────

const TIMEOUT = {
  eplan:  15_000,
  cevre:  25_000,  // Overpass bazen yavaş
  egim:   10_000,
  tucbs:  15_000,
  fiyat:  20_000,
  aiFiyat: 45_000,
} as const;

// ── Timeout promise yardımcısı ────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, katman: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${katman} timeout (${ms}ms)`)), ms),
    ),
  ]);
}

// ── Parsel köşelerini çıkar (elevation için) ──────────────────────────────────

function parselKoseleri(p: Parsel) {
  const ring = p.koordinatlar ?? [];
  const merkez = p.merkezNokta;
  const noktalar = ring.length >= 4 ? ring : [merkez, merkez, merkez, merkez];
  const n = noktalar.length;
  return {
    merkez,
    k1: noktalar[0]              ?? merkez,
    k2: noktalar[Math.floor(n / 4)]  ?? merkez,
    k3: noktalar[Math.floor(n / 2)]  ?? merkez,
    k4: noktalar[Math.floor((3 * n) / 4)] ?? merkez,
  };
}

// ── Ana hook ──────────────────────────────────────────────────────────────────

/**
 * Parsel seçildiğinde otomatik olarak tüm analiz katmanlarını yükler.
 * ParselDetay veya MapView'da tek seferlik mount edilmesi yeterli.
 */
export function useAnalizLoop(parsel: Parsel | null): void {
  const { katmanBaslat, katmanTamamla, katmanHata, katmanAtla } = useParselStore();
  const abortRef = useRef<AbortController | null>(null);
  const aktifKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!parsel) return;
    // parsel null olması mümkün değil artık ama TS için guard
    const p = parsel;
    const pKey = parselKey(p);

    // Aynı parsel için loop zaten çalışıyorsa tekrar başlatma
    if (aktifKeyRef.current === pKey) return;
    aktifKeyRef.current = pKey;

    // Önceki fetch'leri iptal et
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const { signal } = ac;

    // ── Seviye 0: Paralel bağımsız katmanlar ─────────────────────────────────

    async function fetchEPlan(): Promise<EPlanImarVerisi | null> {
      katmanBaslat("ePlan");
      try {
        const t0 = Date.now();
        // Önce cache'e bak
        let veri = await aktifEPlanVerisiGetir(p);
        if (!veri) {
          const oto = await withTimeout(
            otomatikEPlanSorgula(p),
            TIMEOUT.eplan,
            "ePlan",
          );
          veri = oto.veri;
        }
        if (signal.aborted) return null;
        if (veri) {
          katmanTamamla("ePlan", veri, Date.now() - t0);
        } else {
          katmanAtla("ePlan");
        }
        return veri;
      } catch (e) {
        if (signal.aborted) return null;
        katmanHata("ePlan", e instanceof Error ? e.message : String(e));
        return null;
      }
    }

    async function fetchCevre(): Promise<CevreAnalizi | null> {
      katmanBaslat("cevre");
      try {
        const t0 = Date.now();
        // withRetry: Overpass bazen 429/503 verir — 2 retry ile daha güvenilir
        const veri = await withTimeout(
          withRetry(
            () => cevreAnaliziGetir(p.merkezNokta.lat, p.merkezNokta.lng, signal),
            2,
            800,
          ),
          TIMEOUT.cevre,
          "cevre",
        );
        if (signal.aborted) return null;
        katmanTamamla("cevre", veri, Date.now() - t0);
        return veri;
      } catch (e) {
        if (signal.aborted) return null;
        katmanHata("cevre", e instanceof Error ? e.message : String(e));
        return null;
      }
    }

    async function fetchEgim(): Promise<EgimAnalizi | null> {
      katmanBaslat("egim");
      try {
        const t0 = Date.now();
        const koseler = parselKoseleri(p);
        const veri = await withTimeout(
          withRetry(
            () => egimAnaliziGetir(
              koseler.merkez,
              koseler.k1,
              koseler.k2,
              koseler.k3,
              koseler.k4,
              signal,
            ),
            2,
            500,
          ),
          TIMEOUT.egim,
          "egim",
        );
        if (signal.aborted) return null;
        katmanTamamla("egim", veri, Date.now() - t0);
        return veri;
      } catch (e) {
        if (signal.aborted) return null;
        katmanHata("egim", e instanceof Error ? e.message : String(e));
        return null;
      }
    }

    async function fetchTucbs(): Promise<TucbsCdpSonuc | null> {
      katmanBaslat("tucbs");
      try {
        const t0 = Date.now();
        const veri = await withTimeout(
          tucbsCdpGetir(p),
          TIMEOUT.tucbs,
          "tucbs",
        );
        if (signal.aborted) return null;
        if (veri) {
          katmanTamamla("tucbs", veri, Date.now() - t0);
        } else {
          katmanAtla("tucbs");
        }
        return veri;
      } catch (e) {
        if (signal.aborted) return null;
        // TUCBS genellikle coverage dışı — hata değil, atlama
        katmanAtla("tucbs");
        return null;
      }
    }

    // ── Seviye 1: Fiyat (bağımlı: cevre + egim + ePlan + tucbs) ─────────────

    async function fetchFiyat(
      cevre: CevreAnalizi | null,
      egim: EgimAnalizi | null,
      ePlan: EPlanImarVerisi | null,
      tucbs: TucbsCdpSonuc | null,
    ) {
      if (signal.aborted) return null;
      katmanBaslat("fiyat");
      try {
        const t0 = Date.now();
        const veri = await withTimeout(
            fiyatTahminEt(p, cevre, egim, ePlan, tucbs),
          TIMEOUT.fiyat,
          "fiyat",
        );
        if (signal.aborted) return null;
        katmanTamamla("fiyat", veri, Date.now() - t0);
        return veri;
      } catch (e) {
        if (signal.aborted) return null;
        katmanHata("fiyat", e instanceof Error ? e.message : String(e));
        return null;
      }
    }

    // ── Seviye 2: AI Fiyat (bağımlı: fiyat heuristic) ───────────────────────

    async function fetchAiFiyat(
      fiyat: Awaited<ReturnType<typeof fiyatTahminEt>>,
      cevre: CevreAnalizi | null,
      egim: EgimAnalizi | null,
    ) {
      if (signal.aborted) return;

      // AI sağlayıcı ayarlı mı kontrol et
      let ayar: Awaited<ReturnType<typeof ayarlariGetir>>;
      try {
        ayar = await ayarlariGetir();
      } catch {
        katmanAtla("aiFiyat");
        return;
      }

      if (!ayar.aiSaglayici || ayar.aiSaglayici === "yok") {
        katmanAtla("aiFiyat");
        return;
      }

      katmanBaslat("aiFiyat");
      try {
        const t0 = Date.now();
        const veri = await withTimeout(
          aiTahmin(p, cevre, egim, fiyat, {
            saglayici: ayar.aiSaglayici,
            ollamaModel: ayar.aiOllamaModel ?? "llama3.2",
            ollamaUrl: ayar.aiOllamaUrl ?? "http://localhost:11434",
            geminiApiKey: ayar.aiGeminiApiKey ?? "",
          }),
          TIMEOUT.aiFiyat,
          "aiFiyat",
        );
        if (signal.aborted) return;
        katmanTamamla("aiFiyat", veri, Date.now() - t0);
      } catch (e) {
        if (signal.aborted) return;
        // AI hata → atlama (fatal değil, heuristic zaten var)
        katmanHata("aiFiyat", e instanceof Error ? e.message : String(e));
      }
    }

    // ── Orchestration ─────────────────────────────────────────────────────────

    async function run() {
      // Seviye 0: hepsini paralel başlat
      const [ePlanVeri, cevreVeri, egimVeri, tucbsVeri] = await Promise.all([
        fetchEPlan(),
        fetchCevre(),
        fetchEgim(),
        fetchTucbs(),
      ]);

      if (signal.aborted) return;

      // Seviye 1: fiyat (tüm Lv0 sonuçlarıyla)
      const fiyatVeri = await fetchFiyat(cevreVeri, egimVeri, ePlanVeri, tucbsVeri);

      if (signal.aborted || !fiyatVeri) return;

      // Seviye 2: AI fiyat
      await fetchAiFiyat(fiyatVeri, cevreVeri, egimVeri);
    }

    run().catch((e) => {
      if (!signal.aborted) {
        console.error("[analiz-loop] Beklenmeyen hata:", e);
      }
    });

    return () => {
      ac.abort();
      aktifKeyRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsel ? parselKey(parsel) : null]);
}
