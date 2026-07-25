/**
 * Sahibinden Liste İngest — Content Script
 *
 * Kullanıcı Sahibinden arsa/tarla liste sayfasında gezinirken otomatik çalışır:
 *   1. DOM'dan ilan verilerini parse eder (fiyat, m², il, ilçe, mahalle)
 *   2. Backend /v1/sahibinden/ilan-batch'e POST eder
 *   3. VeriKatkiSkoru chrome.storage sayacını günceller (D3 gamification)
 *   4. Sayfada "X ilan eklendi" mini toast gösterir
 *
 * Tetiklenme koşulları:
 *   - URL: sahibinden.com ve (arsa veya tarla) keyword içeriyor
 *   - Kullanıcı sayfayı kaydırdığında veya sayfa yüklendiğinde
 *   - Aynı sayfa URL'si 1 saat içinde tekrar gönderilmez (dedup)
 *
 * KVKK: Sadece ilan metaverisi (fiyat, m², konum) gönderilir.
 * Kişisel veri (ilan sahibi adı, telefon) kesinlikle dahil edilmez.
 */

import { katkiSayaciniGuncelle } from "../lib/veri-katki";

const API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";
const DEDUP_PREFIX = "sb_ingest_";
const DEDUP_TTL_MS = 60 * 60 * 1000; // 1 saat

// ── URL filtreleme ──────────────────────────────────────────────────────

function sayfaGecirlimi(): boolean {
  const url = window.location.href.toLowerCase();
  if (!url.includes("sahibinden.com")) return false;
  return url.includes("arsa") || url.includes("tarla") || url.includes("satilik-arazi");
}

// ── İlan parse ──────────────────────────────────────────────────────────

interface ParsedIlan {
  url: string;
  ilan_no: string | null;
  baslik: string | null;
  fiyat_tlm2: number;
  m2: number;
  il_norm: string | null;
  ilce_norm: string | null;
  mahalle_norm: string | null;
  lat: number | null;
  lng: number | null;
}

function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (c) =>
      ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" } as Record<string, string>)[c] ?? c
    )
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fiyatParse(s: string): number {
  const temiz = s.replace(/[^0-9,.]/g, "").replace(",", ".");
  return parseFloat(temiz) || 0;
}

function m2Parse(s: string): number {
  const m = s.match(/[\d.,]+/);
  if (!m) return 0;
  return parseFloat(m[0]!.replace(",", ".")) || 0;
}

function ilanlarParse(): ParsedIlan[] {
  const sonuclar: ParsedIlan[] = [];

  // Sahibinden liste sayfası — ilan kartları
  const kartlar = document.querySelectorAll(
    "li[class*='searchResultsItem'], tr[class*='searchResult'], [data-id]"
  );

  kartlar.forEach((kart) => {
    try {
      // İlan no
      const ilanNo =
        kart.getAttribute("data-id") ??
        kart.querySelector("[data-id]")?.getAttribute("data-id") ??
        null;

      // Link
      const linkEl = kart.querySelector("a[href*='/ilan/']") as HTMLAnchorElement | null;
      if (!linkEl) return;
      const url = linkEl.href;

      // Başlık
      const baslik =
        (kart.querySelector("[class*='classifiedTitle'], [class*='title']") as HTMLElement | null)
          ?.textContent?.trim() ?? null;

      // Fiyat
      const fiyatEl = kart.querySelector("[class*='price'], [class*='Price']") as HTMLElement | null;
      const fiyatMetin = fiyatEl?.textContent?.trim() ?? "";
      if (!fiyatMetin || fiyatMetin.includes("Fiyat")) return; // başlık satırı

      // Alan (m²)
      const ilanBilgiler = kart.querySelectorAll("[class*='searchResultsAttributeValue'], td");
      let m2 = 0;
      let il_norm: string | null = null;
      let ilce_norm: string | null = null;
      let mahalle_norm: string | null = null;

      ilanBilgiler.forEach((el) => {
        const metin = (el as HTMLElement).textContent?.trim() ?? "";
        if (metin.includes("m²") && m2 === 0) {
          m2 = m2Parse(metin);
        }
      });

      // Konum — breadcrumb veya ilan başlığından çıkar
      const konumEl =
        kart.querySelector("[class*='location'], [class*='Location'], [class*='breadCrumb']") as HTMLElement | null;
      if (konumEl) {
        const konumMetin = konumEl.textContent ?? "";
        const parcalar = konumMetin.split("/").map((s) => s.trim()).filter(Boolean);
        if (parcalar[0]) il_norm = normalizeTr(parcalar[0]);
        if (parcalar[1]) ilce_norm = normalizeTr(parcalar[1]);
        if (parcalar[2]) mahalle_norm = normalizeTr(parcalar[2]);
      }

      // Fiyat ve m² geçerli mi?
      const fiyatTL = fiyatParse(fiyatMetin);
      if (!fiyatTL || fiyatTL <= 0 || !m2 || m2 <= 0) return;
      const fiyat_tlm2 = fiyatTL / m2;
      if (fiyat_tlm2 < 1 || fiyat_tlm2 > 1_000_000) return; // absürd değerler

      // İl/ilçe yoksa URL'den çıkarmayı dene
      if (!il_norm || !ilce_norm) {
        const urlParcalar = url.match(/sahibinden\.com\/([^/]+)\/([^/]+)/);
        if (urlParcalar) {
          if (!il_norm) il_norm = normalizeTr(urlParcalar[1]!);
          if (!ilce_norm) ilce_norm = normalizeTr(urlParcalar[2]!);
        }
      }

      if (!il_norm || !ilce_norm) return; // konum olmadan kaydetme

      // Kategori çıkar — başlık veya URL'den
      const kategori = url.toLowerCase().includes("tarla") || baslik?.toLowerCase().includes("tarla")
        ? "tarla" : "arsa";

      sonuclar.push({
        url,
        ilan_no: ilanNo,
        baslik: baslik?.slice(0, 200) ?? null,
        fiyat_tlm2: Math.round(fiyat_tlm2),
        m2,
        il_norm,
        ilce_norm,
        mahalle_norm,
        lat: null,
        lng: null,
      });
    } catch { /* sessiz — tek ilan hatası tümü durdurmaz */ }
  });

  return sonuclar;
}

// ── Dedup kontrolü ──────────────────────────────────────────────────────

async function sayfaDedupKontrol(sayfaUrl: string): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return false;
  const key = DEDUP_PREFIX + btoa(sayfaUrl).slice(0, 32);
  const raw = await chrome.storage.local.get(key);
  const ts = raw[key] as number | undefined;
  return !!ts && Date.now() - ts < DEDUP_TTL_MS;
}

async function sayfaDedupYaz(sayfaUrl: string): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  const key = DEDUP_PREFIX + btoa(sayfaUrl).slice(0, 32);
  await chrome.storage.local.set({ [key]: Date.now() });
}

// ── JWT token al ────────────────────────────────────────────────────────

async function tokenAl(): Promise<string | null> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
  const raw = await chrome.storage.local.get("cadastrum_token");
  const t = raw["cadastrum_token"];
  return typeof t === "string" ? t : null;
}

// ── Mini toast ──────────────────────────────────────────────────────────

function toastGoster(mesaj: string, tip: "basarili" | "bilgi" | "hata" = "basarili"): void {
  const mevcut = document.getElementById("__cadastrum_toast__");
  if (mevcut) mevcut.remove();

  const renkler = {
    basarili: "background:#065f46;border-color:#047857",
    bilgi:    "background:#1e40af;border-color:#1d4ed8",
    hata:     "background:#7f1d1d;border-color:#991b1b",
  };

  const el = document.createElement("div");
  el.id = "__cadastrum_toast__";
  el.style.cssText = `
    position:fixed;bottom:20px;right:20px;z-index:999999;
    color:#fff;font-family:system-ui,sans-serif;font-size:12px;font-weight:500;
    padding:8px 14px;border-radius:8px;border:1px solid;
    box-shadow:0 4px 12px rgba(0,0,0,.25);
    ${renkler[tip]};
    display:flex;align-items:center;gap:6px;
    animation:cadSlideIn .25s ease;
  `;
  el.innerHTML = `<span style="font-size:14px">${tip === "basarili" ? "◆" : tip === "hata" ? "⚠" : "ℹ"}</span> Cadastrum: ${mesaj}`;

  // CSS animasyonu
  const style = document.createElement("style");
  style.textContent = "@keyframes cadSlideIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}";
  document.head.appendChild(style);
  document.body.appendChild(el);

  setTimeout(() => el.remove(), 4000);
}

// ── Ana ingest fonksiyonu ───────────────────────────────────────────────

let ingestCalisiyor = false;

async function ilanlarIngestEt(): Promise<void> {
  if (ingestCalisiyor) return;
  if (!sayfaGecirlimi()) return;

  const sayfaUrl = window.location.href;
  if (await sayfaDedupKontrol(sayfaUrl)) return; // zaten gönderildi

  ingestCalisiyor = true;

  try {
    const ilanlar = ilanlarParse();
    if (ilanlar.length === 0) return;

    const token = await tokenAl();
    if (!token) return; // giriş yapmamış kullanıcı — sessiz çık

    const res = await fetch(`${API_BASE}/sahibinden/ilan-batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ ilanlar, sayfa_url: sayfaUrl }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return;

    const sonuc = await res.json() as {
      ok: boolean; insert: number; skip: number;
      mahalleli: number; koordinatli: number;
    };

    if (sonuc.ok && sonuc.insert > 0) {
      // D3 gamification sayacını güncelle
      await katkiSayaciniGuncelle({
        ilanSayisi: sonuc.insert,
        mahalleliSayisi: sonuc.mahalleli,
        koordinatliSayisi: sonuc.koordinatli,
      });

      toastGoster(`${sonuc.insert} ilan veri havuzuna eklendi ✓`, "basarili");
      await sayfaDedupYaz(sayfaUrl);
    } else if (sonuc.ok && sonuc.insert === 0 && ilanlar.length > 0) {
      // Hepsi zaten vardı — dedup yaz ama toast gösterme
      await sayfaDedupYaz(sayfaUrl);
    }
  } catch { /* ağ hatası — sessiz */ } finally {
    ingestCalisiyor = false;
  }
}

// ── Başlatma ────────────────────────────────────────────────────────────

// Sayfa yüklendikten 2 saniye sonra çalıştır (DOM tam oluşsun)
if (sayfaGecirlimi()) {
  setTimeout(() => void ilanlarIngestEt(), 2000);

  // Kullanıcı sayfa alt kısmına gelince de tetikle (sayfalama yoksa)
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        void ilanlarIngestEt();
      }
    },
    { threshold: 0.5 },
  );

  // Sayfa footer'ını gözlemle
  window.addEventListener("load", () => {
    const footer = document.querySelector("footer, [class*='footer'], [class*='pager']");
    if (footer) observer.observe(footer);
  });
}
