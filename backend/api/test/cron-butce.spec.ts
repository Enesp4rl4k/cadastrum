/**
 * Saatlik cron, G2'nin `env`/`ctx` gölgelemesiyle UÇTAN UCA çalışıyor mu?
 *
 * NEDEN: 2026-09-11 deploy'undan sonra üretimdeki bütçe tablosu yalnızca TEK
 * satır gösterdi (cron-saatlik, 1 sorgu) ve zenginleştirme günlüğüne 10:00'dan
 * beri satır düşmedi. İki açıklama vardı: D1 okuma limiti (cron ilk sorguda
 * reddediliyor) ya da G2 sarmalayıcısının cron'u kırması. Üretim kuyruğu
 * ağ kopması yüzünden izlenemedi; bu test soruyu ağsız ve deterministik soruyor.
 */
import { describe, it, expect, vi } from "vitest";
import worker from "../src/index.js";
import { createMockEnv } from "./test-helper.js";

describe("saatlik cron — G2 sarmalayıcısıyla", () => {
  it("tamamlanır, reddedilen iş yok, bütçe tablosu cron sorgularını sayar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const env = createMockEnv();
    const bekleyen: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (p: Promise<unknown>) => { bekleyen.push(p); },
      passThroughOnException: () => {},
    } as unknown as ExecutionContext;

    await worker.scheduled(
      { cron: "0 * * * *", scheduledTime: Date.now() } as unknown as ScheduledEvent,
      env,
      ctx,
    );
    const sonuc = await Promise.allSettled(bekleyen);
    const reddedilen = sonuc.filter((s) => s.status === "rejected");

    const butce = await env.DB.prepare(
      "SELECT kaynak, satir_okuma, sorgu_adet, metasiz_adet FROM okuma_butcesi_gunluk",
    ).all();
    const zlog = await env.DB.prepare("SELECT COUNT(*) AS n FROM zenginlestirme_log").first<{ n: number }>();

    vi.unstubAllGlobals();

    // SONUÇ (2026-09-11): sarmalayıcı cron'u KIRMIYOR — iş tamamlanıyor,
    // zenginleştirme günlüğü yazılıyor, bütçe cron'un sorgularını sayıyor.
    // Üretimdeki boşluğun açıklaması D1 okuma limiti: 10:00 turu deploy'dan
    // (10:12) ÖNCE de eksikti. Bu test sarmalayıcının cron'u sessizce
    // kırmasına karşı kalıcı koruma.
    //
    // MUTASYON: index.ts'de `p.finally(() => butceyiBosalt(envHam.DB))`'yi `p`
    // yap → bütçe satırı oluşmaz → kırılır.
    expect(reddedilen.map((r) => String((r as PromiseRejectedResult).reason))).toEqual([]);
    expect(zlog?.n ?? 0).toBeGreaterThan(0);
    const satir = (butce.results ?? []) as Array<{ kaynak: string; sorgu_adet: number }>;
    const saatlik = satir.find((s) => s.kaynak === "cron-saatlik");
    expect(saatlik).toBeDefined();
    // Cron'un birden fazla sorgusu sayılmalı — üretimdeki "1 sorgu" deseni
    // burada tekrarlanırsa sayaç cron'un çoğunu görmüyor demektir.
    expect(saatlik!.sorgu_adet).toBeGreaterThan(1);
  });
});
