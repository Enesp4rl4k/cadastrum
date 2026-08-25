/**
 * Çoklu Model Destekli Embedding & Vektör Benzerlik Servisi.
 *
 * Özellikler:
 *   1. Cosine Similarity ve Vektör Normları
 *   2. Yerel Deterministic Hash Embedding (64-128 dim, sıfır gecikme, offline/edge uyumlu)
 *   3. Gemini text-embedding-004 API Entegrasyonu (768 dim)
 *   4. BM25 Sparse Tokenization (Türkçe ek ayıklamalı)
 */

import type { EmbeddingVector } from "./types";

/**
 * İki vektör arasındaki Kosinüs Benzerliğini hesaplar.
 * Formül: (A . B) / (||A|| * ||B||)
 * Aralık: [-1, +1], genellikle [0, 1]
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i]!;
    const valB = b[i]!;
    dot += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  if (normA <= 0 || normB <= 0) return 0;
  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return Number(Math.max(-1, Math.min(1, sim)).toFixed(6));
}

/**
 * Türkçe metinleri semantik token'lara böler ve frekans haritası üretir (BM25 sparse).
 */
export function sparseTokenize(metin: string): Record<string, number> {
  if (!metin) return {};
  const temiz = metin
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const stopWords = new Set([
    "ve", "veya", "ile", "bir", "icin", "için", "olan", "bu", "şu", "su",
    "da", "de", "ta", "te", "ki", "mi", "mu", "mü", "ise", "cok", "çok",
    "en", "daha", "kadar", "gibi", "icin", "olarak", "olan", "var", "yok"
  ]);

  const tokens = temiz.split(" ").filter((t) => t.length > 1 && !stopWords.has(t));
  const tf: Record<string, number> = {};

  for (const t of tokens) {
    tf[t] = (tf[t] ?? 0) + 1;
  }

  return tf;
}

/**
 * İki sparse token haritası arasındaki BM25/Dot similarity puanını hesaplar.
 */
export function sparseSimilarity(
  queryTokens: Record<string, number>,
  docTokens: Record<string, number>,
): number {
  let score = 0;
  let matchCount = 0;

  for (const [token, qCount] of Object.entries(queryTokens)) {
    if (docTokens[token]) {
      const dCount = docTokens[token]!;
      // TF-IDF benzeri logaritmik frekans doygunluğu
      score += Math.log1p(qCount) * Math.log1p(dCount);
      matchCount++;
    }
  }

  if (matchCount === 0) return 0;
  return Number((score / (1 + Math.log1p(Object.keys(queryTokens).length))).toFixed(4));
}

/**
 * Yerel deterministik n-gram tabanlı embedding üretir (Edge & Offline uyumlu).
 * Metindeki semantik ve kök benzerliklerini 128 boyutlu normalize vektöre eşler.
 */
export function yerelEmbeddingUret(metin: string, dim = 128): EmbeddingVector {
  const vec = new Array<number>(dim).fill(0);
  if (!metin) return { vector: vec, dimension: dim };

  const temiz = metin.toLowerCase().trim();
  const ngrams: string[] = [];

  // Karakter 3-gram ve 4-gram'lar ile Türkçe ek morfolojisini yakala
  for (let i = 0; i < temiz.length - 2; i++) {
    ngrams.push(temiz.slice(i, i + 3));
    if (i < temiz.length - 3) {
      ngrams.push(temiz.slice(i, i + 4));
    }
  }

  // Kelime token'ları
  const words = temiz.split(/\s+/);
  for (const w of words) {
    if (w.length > 2) ngrams.push(w);
  }

  // MurmurHash benzeri dağılım
  for (const ng of ngrams) {
    let h = 2166136261;
    for (let i = 0; i < ng.length; i++) {
      h ^= ng.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dim;
    const sign = (h & 1) === 0 ? 1 : -1;
    vec[idx] = (vec[idx] ?? 0) + sign * (1 / Math.sqrt(ng.length));
  }

  // L2 Normalizasyonu
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    norm += vec[i]! * vec[i]!;
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      vec[i] = Number((vec[i]! / norm).toFixed(6));
    }
  }

  return { vector: vec, dimension: dim };
}

/**
 * Google Gemini API üzerinden 768 boyutlu dense embedding çeker.
 */
export async function geminiEmbeddingGetir(
  metin: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<EmbeddingVector | null> {
  if (!apiKey || !metin) return null;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text: metin.slice(0, 2048) }] },
      }),
      signal: signal ?? AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;
    const data = await res.json() as { embedding?: { values?: number[] } };
    const values = data.embedding?.values;
    if (!values || !Array.isArray(values)) return null;

    return { vector: values, dimension: values.length };
  } catch {
    return null;
  }
}