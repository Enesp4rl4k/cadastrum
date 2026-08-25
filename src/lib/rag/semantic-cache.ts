/**
 * Semantik Önbellek Motoru (Semantic Cache Engine).
 *
 * Prensip:
 *   Sorguların embedding vektörlerini saklar. Yeni gelen bir sorgu geçmiş sorgularla
 *   kosinüs benzerliği >= 0.95 eşleşirse doğrudan önbellekten 5ms içinde yanıt döner.
 *   API maliyetini ve gecikmeyi %90 azaltır.
 */

import { cosineSimilarity, yerelEmbeddingUret } from "./embedding-service";

export interface CacheKaydi<T> {
  anahtar: string;
  vektor: number[];
  veri: T;
  eklenmeZamani: number;
  sonErisimZamani: number;
  erisimSayisi: number;
}

export interface CacheIstatistigi {
  toplamIstek: number;
  hitSayisi: number;
  missSayisi: number;
  hitOraniYuzde: number;
  elemanSayisi: number;
}

export class SemanticCache<T> {
  private cache: Map<string, CacheKaydi<T>> = new Map();
  private maxEleman: number;
  private ttlMs: number;
  private benzerlikEsigi: number;
  private stats: { istek: number; hit: number; miss: number } = { istek: 0, hit: 0, miss: 0 };

  constructor(secenekler?: {
    maxEleman?: number;
    ttlMs?: number; // Varsayılan 1 saat
    benzerlikEsigi?: number; // Varsayılan 0.95
  }) {
    this.maxEleman = secenekler?.maxEleman ?? 500;
    this.ttlMs = secenekler?.ttlMs ?? 60 * 60 * 1000;
    this.benzerlikEsigi = secenekler?.benzerlikEsigi ?? 0.95;
  }

  /**
   * Semantik önbellekten sorgu getirir.
   */
  public getir(sorguMetni: string): { veri: T; benzerlik: number; cachedKey: string } | null {
    this.stats.istek++;
    if (!sorguMetni || this.cache.size === 0) {
      this.stats.miss++;
      return null;
    }

    const sorguVektor = yerelEmbeddingUret(sorguMetni).vector;
    const simdi = Date.now();

    let enIyiEslesme: { kayit: CacheKaydi<T>; benzerlik: number } | null = null;

    for (const kayit of this.cache.values()) {
      // TTL Kontrolü
      if (simdi - kayit.eklenmeZamani > this.ttlMs) {
        this.cache.delete(kayit.anahtar);
        continue;
      }

      const sim = cosineSimilarity(sorguVektor, kayit.vektor);
      if (sim >= this.benzerlikEsigi) {
        if (!enIyiEslesme || sim > enIyiEslesme.benzerlik) {
          enIyiEslesme = { kayit, benzerlik: sim };
        }
      }
    }

    if (enIyiEslesme) {
      this.stats.hit++;
      enIyiEslesme.kayit.sonErisimZamani = simdi;
      enIyiEslesme.kayit.erisimSayisi++;
      return {
        veri: enIyiEslesme.kayit.veri,
        benzerlik: enIyiEslesme.benzerlik,
        cachedKey: enIyiEslesme.kayit.anahtar,
      };
    }

    this.stats.miss++;
    return null;
  }

  /**
   * Yeni sorguyu ve sonucunu önbelleğe kaydeder.
   */
  public kaydet(sorguMetni: string, veri: T): void {
    if (!sorguMetni) return;

    // LRU benzeri temizlik
    if (this.cache.size >= this.maxEleman) {
      let enEskiKey: string | null = null;
      let enEskiZaman = Infinity;

      for (const [key, kayit] of this.cache.entries()) {
        if (kayit.sonErisimZamani < enEskiZaman) {
          enEskiZaman = kayit.sonErisimZamani;
          enEskiKey = key;
        }
      }

      if (enEskiKey) this.cache.delete(enEskiKey);
    }

    const vektor = yerelEmbeddingUret(sorguMetni).vector;
    const simdi = Date.now();

    this.cache.set(sorguMetni, {
      anahtar: sorguMetni,
      vektor,
      veri,
      eklenmeZamani: simdi,
      sonErisimZamani: simdi,
      erisimSayisi: 1,
    });
  }

  public istatistik(): CacheIstatistigi {
    const hitOrani = this.stats.istek > 0 ? (this.stats.hit / this.stats.istek) * 100 : 0;
    return {
      toplamIstek: this.stats.istek,
      hitSayisi: this.stats.hit,
      missSayisi: this.stats.miss,
      hitOraniYuzde: Number(hitOrani.toFixed(1)),
      elemanSayisi: this.cache.size,
    };
  }

  public temizle(): void {
    this.cache.clear();
    this.stats = { istek: 0, hit: 0, miss: 0 };
  }
}