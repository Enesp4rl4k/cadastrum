/**
 * Yatırımcı Sunum Raporu — HTML üreteci (Pro branding, 15-20 sayfa kalite).
 *
 * Saf fonksiyon: `RaporVerisi` → kendine yeten, yazdırılabilir, tek dosya HTML string.
 * React/DOM bağımlılığı yok → extension rapor sayfası, site, backend paylaşım linki.
 *
 * Pro rapor bölümleri:
 *   1. Kapak sayfası (Pro branding, parsel özeti, QR, tarih)
 *   2. Yönetici özeti (tek bakış, verdict)
 *   3. Uydu harita + koordinat analizi
 *   4. Fiyat değerleme (bant, emsaller tam liste)
 *   5. AI Fiyat Analizi (Pro+ — aiSonuc varsa)
 *   6. Konum Zekâsı (skor barları + POI)
 *   7. İmar & Risk taraması
 *   8. Emsal tam tablo (Pro — 20 satıra kadar)
 *   9. TKGM işlem trendi (Pro+)
 *  10. Fizibilite özeti (ePlan varsa)
 *  11. Doğal varlıklar & çevre analizi
 *  12. Yasal uyarı & sorumluluk reddi (tam sayfa)
 */

import type { RaporVerisi } from "./rapor-data";
import { analizet } from "./analiz";
import { tumSkorlariHesapla, type Skor, type SkorBilinmiyor } from "./skor";
import { riskOzetSkoru, type RiskUyarisi, type RiskSeviye } from "./risk-uyarilari";
import type { AiFiyatSonucu } from "./ai-fiyat";

/** Backend shareable-link API tabanı (paylaş butonu buraya POST eder). */
const RAPOR_API_BASE = "https://cadastrum-api.cadastrum-tr.workers.dev/v1";
/** Büyüme döngüsü: paylaşılan rapor → markalı CTA → site → kurulum. */
const SITE_URL = "https://cadastrum.com.tr";
const ESRI_IMAGERY =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export";

// ── Biçimleme yardımcıları ──────────────────────────────────────────────
const tlKisa = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return "₺" + (n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace(".", ",") + "M";
  if (n >= 1_000) return "₺" + Math.round(n / 1000) + "K";
  return "₺" + Math.round(n);
};
const num = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n) ? "—" : Math.round(n).toLocaleString("tr-TR");
const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
const skorVal = (s: Skor | SkorBilinmiyor): number | null => s.toplam;

// ── Uydu görseli (Esri World Imagery + gerçek parsel poligonu overlay) ──
// Head'deki og:image ve harita paneli aynı görseli paylaşır → tek hesap.
function uyduGorseli(veri: RaporVerisi): { imgUrl: string; W: number; H: number; pts: string } | null {
  const ring = (veri.parsel.koordinatlar ?? []).filter(
    (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng),
  );
  if (ring.length < 3) return null;
  const lats = ring.map((p) => p.lat), lngs = ring.map((p) => p.lng);
  let minLat = Math.min(...lats), maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const padLat = (maxLat - minLat || 0.0006) * 0.4;
  const padLng = (maxLng - minLng || 0.0006) * 0.4;
  minLat -= padLat; maxLat += padLat; minLng -= padLng; maxLng += padLng;
  const latSpan = maxLat - minLat || 1e-6, lngSpan = maxLng - minLng || 1e-6;
  const W = 920;
  const H = Math.round(Math.max(360, Math.min(640, (W * latSpan) / lngSpan)));
  const bbox = `${minLng.toFixed(6)},${minLat.toFixed(6)},${maxLng.toFixed(6)},${maxLat.toFixed(6)}`;
  const imgUrl = `${ESRI_IMAGERY}?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${W},${H}&format=jpg&f=image`;
  const pts = ring
    .map((p) => `${(((p.lng - minLng) / lngSpan) * W).toFixed(1)},${(((maxLat - p.lat) / latSpan) * H).toFixed(1)}`)
    .join(" ");
  return { imgUrl, W, H, pts };
}

function haritaPanel(gorsel: ReturnType<typeof uyduGorseli>): string {
  if (!gorsel) return `<div class="cad-nomap">Parsel geometrisi yok</div>`;
  const { imgUrl, W, H, pts } = gorsel;
  return `<div class="cad-map-wrap" style="padding-bottom:${((H / W) * 100).toFixed(1)}%">
    <img class="cad-map-img" src="${imgUrl}" alt="Uydu görüntüsü" loading="lazy" referrerpolicy="no-referrer"
      >
    <svg class="cad-map-ov" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Parsel sınırı">
      <polygon points="${pts}" fill="#ffd400" fill-opacity="0.18" stroke="#ffd400" stroke-width="3" stroke-linejoin="round"/>
    </svg>
    <span class="cad-map-north">↑ K</span>
  </div>`;
}

// ── Değerleme bloğu ─────────────────────────────────────────────────────
function degerlemeHtml(veri: RaporVerisi): string {
  const f = veri.fiyat;
  if (!f) {
    return `<section class="cad-card cad-reveal"><div class="cad-card-h">Değerleme</div>
      <p class="cad-empty">Değerleme için imar bilgisi gerekli. Parselin imar durumu girildiğinde TL/m² aralığı, emsaller ve güven skoru burada görünür.</p></section>`;
  }
  const altMid = f.beklenenPerM2 - f.altPerM2;
  const span = f.ustPerM2 - f.altPerM2 || 1;
  const markPct = Math.max(2, Math.min(98, (altMid / span) * 100));
  const emsaller = (f.emsalListesi ?? []).slice(0, 5);
  const emsalSatir = emsaller.length
    ? emsaller
        .map(
          (e) =>
            `<li><span>${num(e.alan)} m²</span><b>${num(e.fiyatPerM2)} ₺</b><i>${e.tazelikGun} gün</i></li>`,
        )
        .join("")
    : `<li class="cad-cmp-none"><span>Doğrudan emsal yok — bölge baseline kullanıldı</span></li>`;
  return `<section class="cad-card cad-reveal" style="--d:.16s">
    <div class="cad-card-h">Değerleme</div>
    <div class="cad-range">
      <div class="cad-range-bar"><span class="cad-range-fill"></span><span class="cad-range-mark" style="left:${markPct.toFixed(0)}%"></span></div>
      <div class="cad-range-lbl"><span>${num(f.altPerM2)} ₺</span><span class="cad-range-mid">${num(f.beklenenPerM2)} ₺/m²</span><span>${num(f.ustPerM2)} ₺</span></div>
    </div>
    <div class="cad-cmp-h">Kullanılan emsaller${f.baselineAdet ? ` · ${f.baselineAdet} kayıt` : ""}</div>
    <ul class="cad-cmp">${emsalSatir}</ul>
  </section>`;
}

// ── Skorlar bloğu ───────────────────────────────────────────────────────
function skorlarHtml(veri: RaporVerisi): string {
  const analiz = analizet(veri.parsel);
  const s = tumSkorlariHesapla(analiz, veri.cevre, veri.egim);
  const bar = (ad: string, sk: Skor | SkorBilinmiyor) => {
    const v = skorVal(sk);
    const w = v ?? 0;
    return `<div class="cad-score"><span>${ad}</span><div class="cad-sbar"><i style="width:${w}%"></i></div><b>${v ?? "—"}</b></div>`;
  };
  const poi = veri.cevre?.poi;
  const poiHtml = poi
    ? `<div class="cad-poi"><span>${poi.okul} eğitim</span><span>${poi.hastane} sağlık</span><span>${poi.duraklar} durak</span></div>`
    : "";
  return `<section class="cad-card cad-reveal" style="--d:.24s">
    <div class="cad-card-h">Konum Zekâsı</div>
    ${bar("Lojistik", s.lojistik)}
    ${bar("Fiziksel", s.fiziksel)}
    ${bar("Erişim", s.erisim)}
    ${bar("Altyapı", s.altyapi)}
    ${poiHtml}
  </section>`;
}

// ── İmar & Risk bloğu ───────────────────────────────────────────────────
const RISK_RENK: Record<RiskSeviye, string> = {
  kritik: "cad-r-krit",
  yuksek: "cad-r-warn",
  orta: "cad-r-info",
  bilgi: "cad-r-info",
};
function imarRiskHtml(veri: RaporVerisi): string {
  const ep = veri.ePlan;
  const imarOzet = veri.fiyat?.imarOzeti;
  const satir = (k: string, v: string) =>
    `<div class="cad-imar-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  let imarRows = "";
  if (ep) {
    imarRows =
      satir("Kullanım", ep.kullanimKarari ?? ep.planKarari ?? "—") +
      satir("Yapı nizamı", ep.yapiNizami ?? "—") +
      satir("TAKS / KAKS", `${ep.taks ?? "—"} / ${ep.emsal ?? "—"}`) +
      satir("Maks. kat", ep.maksKat != null ? `${ep.maksKat} kat` : "—");
  } else {
    imarRows =
      satir("Nitelik", veri.parsel.nitelik) +
      satir("İmar kaynağı", imarOzet?.kaynak ?? "parsel niteliği") +
      satir("Sınıf", imarOzet?.sinif ?? "belirsiz");
  }
  const imarKaynak = ep ? "e-Plan resmi" : imarOzet?.kaynak ?? "TKGM nitelik";

  const riskler = veri.riskler ?? [];
  const riskHtml = riskler.length
    ? riskler
        .slice(0, 4)
        .map(
          (r: RiskUyarisi) =>
            `<div class="cad-risk-i ${RISK_RENK[r.seviye]}"><b>${esc(r.baslik)}</b><span>${esc(r.aciklama)}${r.oneri ? " " + esc(r.oneri) : ""}</span></div>`,
        )
        .join("")
    : `<div class="cad-risk-i cad-r-ok"><b>Kritik kısıt sinyali yok</b><span>Tarama temiz — yine de tapu/imar belgesini resmî kanaldan teyit edin.</span></div>`;

  return `<section class="cad-card cad-span2 cad-reveal" style="--d:.32s">
    <div class="cad-card-h">İmar &amp; Risk Taraması</div>
    <p class="cad-note" style="font-size:11px;opacity:.75;margin:0 0 8px">Plan öznitelikleri e-Plan’dan; renkli uygulama imar görseli haritadaki ÇDP/belediye katmanından bakılır (PDF’e gömülü plan görüntüsü yok).</p>
    <div class="cad-ir">
      <div class="cad-imar">${imarRows}<div class="cad-src">Kaynak: ${esc(imarKaynak)}</div></div>
      <div class="cad-risk">${riskHtml}</div>
    </div>
  </section>`;
}

// ── Opsiyonel: TKGM resmî işlem trendi (Pro+) ───────────────────────────
function tkgmHtml(veri: RaporVerisi): string {
  const t = veri.tkgmAnaliz;
  if (!t || !t.trend?.length) return "";
  const maks = Math.max(...t.trend.map((y) => y.sayi), 1);
  const barlar = t.trend
    .map(
      (y) =>
        `<div class="cad-tk-col"><i style="--h:${Math.max(4, (y.sayi / maks) * 100)}%"></i><span>${String(y.yil).slice(2)}</span></div>`,
    )
    .join("");
  return `<section class="cad-card cad-span2 cad-reveal" style="--d:.36s">
    <div class="cad-card-h">Bölge İşlem Yoğunluğu · ${esc(t.ilceAd)}</div>
    <div class="cad-tk">
      <div class="cad-tk-bars">${barlar}</div>
      <div class="cad-tk-meta">
        <div><b>${t.trend.at(-1)?.sayi?.toLocaleString("tr-TR") ?? "—"}</b><span>${t.yil} işlem</span></div>
        <div><b>%${Math.round(t.ipotekOrani)}</b><span>ipotekli satış</span></div>
      </div>
    </div>
  </section>`;
}

// ── Kapak sayfası (Pro branding) ─────────────────────────────────────────
function kapakSayfasiHtml(veri: RaporVerisi, raporNo: string, tarih: string): string {
  const p = veri.parsel;
  const f = veri.fiyat;
  const loc = [p.ilAd, p.ilceAd, p.mahalleAd].filter(Boolean).join(" · ").toLocaleUpperCase("tr");
  const tier = veri.tier ?? "free";
  const tierEtiket = tier === "kurumsal" ? "Kurumsal" : tier === "pro_plus" ? "Pro+" : tier === "pro" ? "Pro" : "Free";
  return `<div class="cad-kapak">
    <div class="cad-kapak-ust">
      <div class="cad-kapak-logo">◆ <span>Cadastrum</span></div>
      <div class="cad-kapak-tier">${esc(tierEtiket)} Rapor</div>
    </div>
    <div class="cad-kapak-ic">
      <div class="cad-kapak-pre">YATIRIMCI SUNUM RAPORU</div>
      <h1 class="cad-kapak-h1">Ada ${esc(p.adaNo)} / Parsel ${esc(p.parselNo)}</h1>
      <div class="cad-kapak-lok">${esc(loc)}</div>
      <div class="cad-kapak-meta-grid">
        <div><span>Nitelik</span><b>${esc(p.nitelik)}</b></div>
        <div><span>Alan</span><b>${num(p.alan)} m²</b></div>
        <div><span>Rapor No</span><b>${esc(raporNo)}</b></div>
        <div><span>Tarih</span><b>${esc(tarih)}</b></div>
        ${f ? `<div><span>Tahmini Değer</span><b>${tlKisa(f.toplamBeklenen)} (${num(f.beklenenPerM2)} ₺/m²)</b></div>` : ""}
        ${f ? `<div><span>Güven Skoru</span><b>${f.guvenSkoru}/100</b></div>` : ""}
      </div>
    </div>
    <div class="cad-kapak-alt">
      <div class="cad-kapak-disc">Bu rapor Cadastrum tarafından otomatik olarak oluşturulmuştur. Resmî ekspertiz yerine geçmez. Yalnızca bilgilendirme amaçlıdır.</div>
      <div class="cad-kapak-site">cadastrum.com.tr</div>
    </div>
  </div>`;
}

// ── AI Fiyat Analizi bölümü (Pro+) ───────────────────────────────────────
function aiAnalizHtml(aiSonuc: AiFiyatSonucu | null | undefined): string {
  if (!aiSonuc) return "";
  // AiFiyatSonucu: altPerM2, beklenenPerM2, ustPerM2, gerekce, kaynak, modelAd, sureMs
  const satirlar: string[] = [];

  satirlar.push(`<div class="cad-ai-blok">
    <div class="cad-ai-h">AI Değerleme</div>
    <div class="cad-ai-band">
      <span class="cad-ai-band-item"><small>Alt</small><b>${num(aiSonuc.altPerM2)} ₺/m²</b></span>
      <span class="cad-ai-band-item cad-ai-band-mid"><small>Beklenen</small><b>${num(aiSonuc.beklenenPerM2)} ₺/m²</b></span>
      <span class="cad-ai-band-item"><small>Üst</small><b>${num(aiSonuc.ustPerM2)} ₺/m²</b></span>
    </div>
  </div>`);

  if (aiSonuc.gerekce) {
    satirlar.push(`<div class="cad-ai-blok">
      <div class="cad-ai-h">AI Gerekçesi</div>
      <p class="cad-ai-p">${esc(aiSonuc.gerekce)}</p>
    </div>`);
  }

  satirlar.push(`<div class="cad-ai-blok">
    <div class="cad-ai-h">Model Bilgisi</div>
    <p class="cad-ai-p">Model: <b>${esc(aiSonuc.modelAd)}</b> · Kaynak: ${esc(aiSonuc.kaynak)} · Süre: ${aiSonuc.sureMs}ms</p>
  </div>`);

  return `<section class="cad-card cad-span2 cad-reveal cad-pagebreak" style="--d:.28s">
    <div class="cad-card-h cad-pro-badge">🤖 AI Fiyat Analizi <span class="cad-pro-tag">Pro</span></div>
    <div class="cad-ai-grid">${satirlar.join("")}</div>
    <div class="cad-ai-disc">AI analizi, büyük dil modeli çıktısına dayanır; hata içerebilir. Kesin yatırım kararı için bağımsız ekspertiz alın.</div>
  </section>`;
}

// ── Emsal tam tablo (Pro — 20 satıra kadar) ──────────────────────────────
function emsalTamTabloHtml(veri: RaporVerisi): string {
  const f = veri.fiyat;
  const tier = veri.tier ?? "free";
  const isPro = tier === "pro" || tier === "pro_plus" || tier === "kurumsal";
  const liste = (f?.emsalListesi ?? []).slice(0, isPro ? 20 : 5);
  if (liste.length <= 5) return ""; // kısa liste zaten degerleme bölümünde gösterilir
  const satirlar = liste
    .map((e, i) => `<tr class="${i % 2 === 0 ? "cad-trow-alt" : ""}">
      <td>${i + 1}</td>
      <td class="cad-num">${num(e.alan)}</td>
      <td class="cad-num cad-bold">${num(e.fiyatPerM2)} ₺</td>
      <td class="cad-num">${num(e.fiyatPerM2 * (e.alan ?? 0))}</td>
      <td class="cad-num">${e.tazelikGun} gün</td>
      <td class="cad-num">${(e.benzerlik * 100).toFixed(0)}%</td>
    </tr>`)
    .join("");
  return `<section class="cad-card cad-span2 cad-reveal cad-pagebreak" style="--d:.30s">
    <div class="cad-card-h cad-pro-badge">Emsal Detay Tablosu <span class="cad-pro-tag">Pro</span></div>
    <div class="cad-tablo-wrap">
      <table class="cad-tablo">
        <thead><tr><th>#</th><th>Alan (m²)</th><th>₺/m²</th><th>Toplam ₺</th><th>Tazelik</th><th>Benzerlik</th></tr></thead>
        <tbody>${satirlar}</tbody>
      </table>
    </div>
    <div class="cad-src" style="margin-top:8px">Kaynak: Sahibinden / Hepsiemlak / Emlakjet · Baseline medyan tabanlı filtre uygulandı</div>
  </section>`;
}

// ── Fizibilite özeti (ePlan varsa) ────────────────────────────────────────
function fizibiliteHtml(veri: RaporVerisi): string {
  const ep = veri.ePlan;
  const f = veri.fiyat;
  if (!ep || !f) return "";
  const alan = veri.parsel.alan ?? 0;
  const taks = ep.taks ?? 0;
  const emsal = ep.emsal ?? 0;
  const insaatAlani = emsal > 0 && alan > 0 ? alan * emsal : null;
  const zemin = taks > 0 && alan > 0 ? alan * taks : null;
  const tahminiInsaatMaliyeti = insaatAlani ? insaatAlani * 18_000 : null; // ~18K TL/m² 2024 endeksi
  const tahminiSatisDegeri = insaatAlani ? insaatAlani * (f.beklenenPerM2 * 2.2) : null; // arsa + inşaat marj faktörü
  const kacMisliArsa = f.toplamBeklenen > 0 && tahminiSatisDegeri
    ? (tahminiSatisDegeri / f.toplamBeklenen).toFixed(1)
    : null;

  const satirla = (k: string, v: string, bold = false) =>
    `<div class="cad-fiz-row"><span>${esc(k)}</span><${bold ? "b" : "span"} class="cad-num">${esc(v)}</${bold ? "b" : "span"}></div>`;

  return `<section class="cad-card cad-span2 cad-reveal cad-pagebreak" style="--d:.34s">
    <div class="cad-card-h">Hızlı Fizibilite Özeti</div>
    <div class="cad-fiz-note">Tahmini hesaplama — kesin proje maliyeti için mimar/müteahhit teklifine başvurun.</div>
    <div class="cad-fiz-grid">
      <div>
        <div class="cad-fiz-sub">Arsa Metrikleri</div>
        ${satirla("Toplam alan", `${num(alan)} m²`)}
        ${satirla("TAKS", ep.taks != null ? String(ep.taks) : "—")}
        ${satirla("Emsal (KAKS)", ep.emsal != null ? String(ep.emsal) : "—")}
        ${satirla("Zemin alanı (TAKS×alan)", zemin != null ? `${num(zemin)} m²` : "—")}
        ${satirla("İnşaat alanı (emsal×alan)", insaatAlani != null ? `${num(insaatAlani)} m²` : "—")}
      </div>
      <div>
        <div class="cad-fiz-sub">Tahmini Maliyet & Değer</div>
        ${satirla("Arsa tahmini (model)", `${tlKisa(f.toplamBeklenen)}`, true)}
        ${satirla("Tahmini inşaat maliyeti", tahminiInsaatMaliyeti != null ? tlKisa(tahminiInsaatMaliyeti) : "—")}
        ${satirla("Tahmini satış değeri", tahminiSatisDegeri != null ? tlKisa(tahminiSatisDegeri) : "—")}
        ${kacMisliArsa ? satirla("Arsa değeri çarpanı", `${kacMisliArsa}×`) : ""}
        ${satirla("Maks. kat", ep.maksKat != null ? `${ep.maksKat} kat` : "—")}
      </div>
    </div>
  </section>`;
}

// ── Çevre & doğal varlıklar bölümü ───────────────────────────────────────
function cevreHtml(veri: RaporVerisi): string {
  const c = veri.cevre;
  const eg = veri.egim;
  if (!c && !eg) return "";
  const satirla = (k: string, v: string) =>
    `<div class="cad-cevrow"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  let sol = "";
  let sag = "";
  if (eg) {
    sol += `<div class="cad-cev-sub">Topografya</div>`;
    sol += satirla("Rakım", `${eg.merkezYukseklikM} m`);
    sol += satirla("Ortalama eğim", `%${eg.ortEgimYuzde}`);
    sol += satirla("Bakı yönü", eg.bakiYonu);
    sol += satirla("Eğim kategorisi", eg.egimKategori);
  }
  if (c) {
    const poi = c.poi;
    sag += `<div class="cad-cev-sub">Yakın Çevre (POI)</div>`;
    if (poi) {
      sag += satirla("Eğitim", `${poi.okul} kurum`);
      sag += satirla("Sağlık", `${poi.hastane} tesis`);
      sag += satirla("Ulaşım", `${poi.duraklar} durak`);
    }
    // enYakinlar dizisinden yol ve şehir noktalarını çek
    const yol = c.enYakinlar.find((n) => n.tip === "motorway" || n.tip === "trunk" || n.tip === "primary");
    if (yol) sag += satirla("En yakın ana yol", `${(yol.mesafeM / 1000).toFixed(1)} km — ${esc(yol.ad)}`);
    const altyapi = c.altyapi;
    if (altyapi.elektrikHattiM != null) sag += satirla("Elektrik hattı", `${Math.round(altyapi.elektrikHattiM)} m`);
    if (altyapi.suBoruM != null) sag += satirla("Su borusu", `${Math.round(altyapi.suBoruM)} m`);
    if (c.kirsal?.yolaCepheM != null) sag += satirla("Yola cephe", `${Math.round(c.kirsal.yolaCepheM)} m`);
  }
  return `<section class="cad-card cad-span2 cad-reveal cad-pagebreak" style="--d:.38s">
    <div class="cad-card-h">Çevre &amp; Doğal Varlıklar</div>
    <div class="cad-cev-grid">
      <div>${sol}</div>
      <div>${sag}</div>
    </div>
  </section>`;
}

// ── Yasal sorumluluk reddi sayfası ───────────────────────────────────────
function yasalRedHtml(tarih: string, raporNo: string): string {
  return `<section class="cad-yasal cad-pagebreak">
    <div class="cad-yasal-h">Yasal Uyarı &amp; Sorumluluk Reddi</div>
    <div class="cad-yasal-ic">
      <p>Bu rapor, Cadastrum analiz motoru tarafından kamuya açık veri kaynakları (TKGM, e-Plan, Esri uydu görüntüsü, Sahibinden/Hepsiemlak/Emlakjet ilan verileri, OSM, Open-Meteo) kullanılarak otomatik olarak oluşturulmuştur. Rapor No: <b>${esc(raporNo)}</b> · Üretim tarihi: <b>${esc(tarih)}</b>.</p>
      <p><b>Bu rapor, 6362 sayılı Sermaye Piyasası Kanunu kapsamında yetkilendirilmiş bir ekspertiz veya değerleme raporu değildir.</b> İçeriği yatırım tavsiyesi olarak yorumlanamaz ve Türkiye Değerleme Uzmanları Derneği (TDUB) veya Sermaye Piyasası Kurulu (SPK) standartlarına uygun olduğu iddia edilmez.</p>
      <p>Tahmini değerlemeler, istatistiksel model ve ilana dayalı emsal analizine dayanır. Gerçek piyasa değeri bu tahminlerden önemli ölçüde farklılık gösterebilir. Arsa/tarla alım-satım kararlarında, ipotek veya kredi başvurularında ve hukuki süreçlerde bu raporun kullanılmasından doğan hiçbir zarardan Cadastrum sorumlu tutulamaz.</p>
      <p>Parsel sınırları, imar bilgileri ve kullanım kararlarının doğruluğu için yetkili idare (ilgili belediye, İl Tarım Müdürlüğü, Çevre ve Şehircilik İl Müdürlüğü) kayıtlarına başvurulmalıdır. Tarım arazileri, orman sınırındaki parseller ve mera vasıflı taşınmazlar için ek kısıtlamalar söz konusu olabilir.</p>
      <p>Uydu görüntüsü © Esri World Imagery. Emsal verisi © Sahibinden, Hepsiemlak, Emlakjet (yazılı izin olmaksızın 3. şahıslarla paylaşılamaz). TKGM tapu kaydı ve e-Plan imar verisi kamu verisi olup kaynak olarak belirtilmiştir.</p>
      <p>Cadastrum, içerik doğruluğu konusunda makul özen göstermekle birlikte, veri kaynağı hatalarından, gecikmelerden veya güncelleme eksikliklerinden kaynaklanan hatalar için sorumluluk kabul etmez. Kullanıcılar, karar öncesinde bağımsız uzman görüşü almalıdır.</p>
    </div>
    <div class="cad-yasal-ft">cadastrum.com.tr · Mülkiyet Analiz Platformu · Tüm hakları saklıdır.</div>
  </section>`;
}

// ── Genişletilmiş CSS ─────────────────────────────────────────────────────
const PRO_CSS = `
/* Kapak sayfası */
.cad-kapak{display:flex;flex-direction:column;min-height:100vh;padding:40px;background:linear-gradient(135deg,#0f2a1e 0%,#1b4332 60%,#0f2a1e 100%);color:#fff;border-radius:0;page-break-after:always}
.cad-kapak-ust{display:flex;justify-content:space-between;align-items:center;margin-bottom:auto}
.cad-kapak-logo{font-size:20px;font-weight:800;letter-spacing:.5px;color:#4ade80}
.cad-kapak-logo span{color:#fff}
.cad-kapak-tier{font-size:11px;font-weight:700;letter-spacing:1.5px;background:rgba(255,255,255,.15);padding:4px 12px;border-radius:999px;color:#a7f3d0}
.cad-kapak-ic{flex:1;display:flex;flex-direction:column;justify-content:center;padding:60px 0}
.cad-kapak-pre{font-size:11px;font-weight:700;letter-spacing:3px;color:#6ee7b7;margin-bottom:16px}
.cad-kapak-h1{font-size:48px;font-weight:900;line-height:1.05;letter-spacing:-1px;margin:0 0 12px;color:#fff}
.cad-kapak-lok{font-size:16px;color:#a7f3d0;letter-spacing:.5px;margin-bottom:32px}
.cad-kapak-meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;border-top:1px solid rgba(255,255,255,.2);padding-top:24px}
.cad-kapak-meta-grid > div{display:flex;flex-direction:column;gap:2px}
.cad-kapak-meta-grid span{font-size:10px;letter-spacing:1px;color:#6ee7b7;font-weight:600}
.cad-kapak-meta-grid b{font-size:14px;color:#fff}
.cad-kapak-alt{margin-top:auto;border-top:1px solid rgba(255,255,255,.2);padding-top:20px;display:flex;justify-content:space-between;align-items:flex-end}
.cad-kapak-disc{font-size:10px;color:rgba(255,255,255,.5);max-width:480px;line-height:1.5}
.cad-kapak-site{font-size:12px;font-weight:700;color:#4ade80}
/* Pro badge */
.cad-pro-badge{display:flex;align-items:center;gap:8px}
.cad-pro-tag{font-size:9px;font-weight:700;letter-spacing:.5px;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:999px;border:1px solid #fde68a}
/* AI analiz */
.cad-ai-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px}
.cad-ai-blok{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px}
.cad-ai-h{font-size:10px;font-weight:700;letter-spacing:.5px;color:#475569;margin-bottom:6px;text-transform:uppercase}
.cad-ai-p{font-size:12px;color:#334155;line-height:1.55;margin:0}
.cad-ai-liste{margin:0;padding-left:16px}
.cad-ai-liste li{font-size:12px;color:#334155;line-height:1.5;margin-bottom:4px}
.cad-ai-firsat li::marker{color:#059669}
.cad-ai-oneri-blok{background:#ecfdf5;border-color:#a7f3d0}
.cad-ai-disc{font-size:10px;color:#94a3b8;margin-top:6px;font-style:italic}
/* Emsal tablo */
.cad-tablo-wrap{overflow-x:auto;margin-top:8px}
.cad-tablo{width:100%;border-collapse:collapse;font-size:11px}
.cad-tablo th{background:#f1f5f9;color:#475569;font-size:10px;font-weight:700;letter-spacing:.3px;padding:6px 8px;text-align:left;border-bottom:2px solid #e2e8f0}
.cad-tablo td{padding:5px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
.cad-trow-alt td{background:#f8fafc}
.cad-num{text-align:right;font-variant-numeric:tabular-nums}
.cad-bold{font-weight:700}
/* Fizibilite */
.cad-fiz-note{font-size:11px;color:#f59e0b;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin-bottom:10px}
.cad-fiz-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.cad-fiz-sub{font-size:10px;font-weight:700;letter-spacing:.5px;color:#64748b;margin-bottom:8px;text-transform:uppercase}
.cad-fiz-row{display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:12px}
.cad-fiz-row span{color:#6b7785}
/* Çevre */
.cad-cev-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.cad-cev-sub{font-size:10px;font-weight:700;letter-spacing:.5px;color:#64748b;margin-bottom:8px;text-transform:uppercase}
.cad-cevrow{display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:12px}
.cad-cevrow span{color:#6b7785}
/* Yasal */
.cad-yasal{background:#fff;border:1px solid #d6dce2;border-radius:12px;padding:24px 28px;margin-top:12px}
.cad-yasal-h{font-size:13px;font-weight:700;color:#3f4a55;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #d6dce2}
.cad-yasal-ic p{font-size:11px;color:#475569;line-height:1.65;margin-bottom:10px}
.cad-yasal-ic b{color:#1a1d21}
.cad-yasal-ft{font-size:10px;color:#94a3b8;text-align:center;margin-top:16px;padding-top:12px;border-top:1px solid #f1f5f9}
/* Sayfa kırılması */
.cad-pagebreak{page-break-before:auto}
@media print{
  .cad-kapak{min-height:100vh;page-break-after:always;border-radius:0}
  .cad-pagebreak{page-break-before:always}
  .cad-ai-grid,.cad-fiz-grid,.cad-cev-grid{break-inside:avoid}
  .cad-tablo{font-size:9px}
  .cad-yasal{page-break-before:always}
}`;

// ── Ana üreteç ──────────────────────────────────────────────────────────
export function raporHtmlUret(
  veri: RaporVerisi,
  opts: { etkilesim?: boolean } = {},
): string {
  // etkilesim=false → inline <script> ve toolbar atlanır (extension CSP 'script-src self'
  // inline script'i bloklar). Değerler zaten JS'siz doğru render edilir (progressive
  // enhancement), animasyon/paylaş sadece web/backend link'te (etkilesim=true) çalışır.
  const etkilesim = opts.etkilesim !== false;
  const p = veri.parsel;
  const f = veri.fiyat;
  const ozet = riskOzetSkoru(veri.riskler ?? []);
  const riskBadgeRenk =
    ozet.renk === "red" ? "cad-chip-krit" : ozet.renk === "orange" || ozet.renk === "amber" ? "cad-chip-warn" : "cad-chip-ok";
  const tarih = new Date(veri.uretildiAt || Date.now()).toLocaleDateString("tr-TR");
  const raporNo = `CAD-${new Date(veri.uretildiAt || Date.now()).getFullYear()}-${String(p.adaNo)}${String(p.parselNo)}`;
  const loc = [p.ilAd, p.ilceAd, p.mahalleAd].filter(Boolean).join(" · ").toLocaleUpperCase("tr");
  const imarSinif = f?.imarOzeti?.sinif ?? (veri.ePlan ? "imarlı" : "—");
  const baslik = `${p.ilceAd} ${p.mahalleAd} Ada ${p.adaNo}/${p.parselNo}`;
  const gorsel = uyduGorseli(veri);

  // Sosyal paylaşım meta — paylaşılan link WhatsApp/X/LinkedIn'de zengin kart olarak açılır
  const ogBaslik = `${p.ilceAd} ${p.adaNo}/${p.parselNo} · ${esc(p.nitelik)} ${num(p.alan)} m²`;
  const ogAciklama = f
    ? `Tahmini değer ${tlKisa(f.toplamBeklenen)} (${num(f.beklenenPerM2)} ₺/m², güven ${f.guvenSkoru}/100) · ${loc}`
    : `${loc} · Cadastrum parsel analizi`;
  const ogMeta =
    `<meta property="og:type" content="website">` +
    `<meta property="og:title" content="${esc(ogBaslik)}">` +
    `<meta property="og:description" content="${esc(ogAciklama)}">` +
    (gorsel ? `<meta property="og:image" content="${esc(gorsel.imgUrl)}">` : "") +
    `<meta name="twitter:card" content="${gorsel ? "summary_large_image" : "summary"}">` +
    `<meta name="twitter:title" content="${esc(ogBaslik)}">` +
    `<meta name="twitter:description" content="${esc(ogAciklama)}">` +
    (gorsel ? `<meta name="twitter:image" content="${esc(gorsel.imgUrl)}">` : "");

  const heroDeger = f
    ? `<div class="cad-val" data-target="${Math.round(f.toplamBeklenen)}">₺${num(f.toplamBeklenen)}</div>
       <div class="cad-val-band">Aralık ${tlKisa(f.toplamAlt)} – ${tlKisa(f.toplamUst)} · <b>${num(f.beklenenPerM2)} ₺/m²</b></div>
       <div class="cad-conf"><span class="cad-conf-dot"></span> Güven ${f.guvenSkoru}/100 · ${f.baselineAdet || 0} emsal · ${esc(f.baselineKaynak)}</div>`
    : `<div class="cad-val cad-val-na">Değerleme bekliyor</div>
       <div class="cad-val-band">İmar bilgisi girilince hesaplanır</div>`;

  const verdictMetin = f
    ? `${esc(p.nitelik)}, ${num(p.alan)} m². Değerleme ${num(f.beklenenPerM2)} ₺/m² (güven ${f.guvenSkoru}/100). ${
        ozet.kritikSayi > 0
          ? "<b>Kritik kısıt var — yatırım öncesi hukuki teyit şart.</b>"
          : ozet.yuksekSayi > 0
            ? "<b>Dikkat gerektiren risk mevcut.</b>"
            : "<b>Belirgin kısıt sinyali yok.</b>"
      }`
    : `Parsel kimliği ve konum analizi hazır; değerleme için imar bilgisi bekleniyor.`;

  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cadastrum Sunum Raporu · ${esc(p.ilceAd)} ${esc(p.adaNo)}/${esc(p.parselNo)}</title>
<meta name="description" content="${esc(ogAciklama)}">
${ogMeta}
<style>
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1a1d21;background:#f6f8fa;margin:0;padding:24px;font-size:13px;line-height:1.45}
.cad{max-width:820px;margin:0 auto}
.cad-bar{position:sticky;top:0;z-index:9;display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px}
.cad-btn{cursor:pointer;font-size:12px;font-weight:600;padding:6px 12px;border-radius:8px;border:1px solid #d6dce2;background:#fff;color:#1a1d21}
.cad-btn-primary{background:#199e70;border-color:#199e70;color:#fff}
.cad-btn:disabled{opacity:.6;cursor:default}
.cad-top{display:flex;justify-content:space-between;align-items:center;padding-bottom:10px;border-bottom:1px solid #d6dce2;margin-bottom:14px}
.cad-brand{font-weight:700;font-size:14px;display:flex;align-items:center;gap:7px}
.cad-logo{color:#1baf7a}
.cad-tag{font-weight:500;color:#6b7785;border-left:1px solid #d6dce2;padding-left:7px;font-size:12px}
.cad-meta{font-family:ui-monospace,monospace;font-size:11px;color:#6b7785}
.cad-hero{display:flex;justify-content:space-between;gap:18px;background:#fff;border:1px solid #d6dce2;border-radius:12px;padding:18px 20px;margin-bottom:12px}
.cad-loc{font-size:11px;letter-spacing:1px;color:#6b7785;font-weight:600}
.cad-h1{font-size:22px;font-weight:700;margin:4px 0 10px}
.cad-chips{display:flex;flex-wrap:wrap;gap:6px}
.cad-chip{font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;background:#eef1f4;color:#3f4a55;border:1px solid #d6dce2}
.cad-chip-ok{background:#e7f6ef;color:#0a6b45;border-color:#bfe6d3}
.cad-chip-warn{background:#fdf2e0;color:#9a6400;border-color:#f0d9a8}
.cad-chip-krit{background:#fdeaea;color:#a3221f;border-color:#f3c2c0}
.cad-hero-r{text-align:right;min-width:235px;border-left:1px solid #d6dce2;padding-left:18px}
.cad-val-label{font-size:10px;letter-spacing:1px;color:#6b7785;font-weight:600}
.cad-val{font-size:30px;font-weight:800;letter-spacing:-.5px;font-variant-numeric:tabular-nums;margin:2px 0}
.cad-val-na{font-size:20px;color:#6b7785}
.cad-val-band{font-size:12px;color:#3f4a55}
.cad-conf{font-size:11px;color:#6b7785;margin-top:6px;display:flex;align-items:center;gap:5px;justify-content:flex-end}
.cad-conf-dot{width:7px;height:7px;border-radius:50%;background:#eda100}
.cad-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cad-card{background:#fff;border:1px solid #d6dce2;border-radius:12px;padding:14px}
.cad-span2{grid-column:1 / -1}
.cad-card-h{font-size:12px;font-weight:700;letter-spacing:.3px;color:#3f4a55;margin-bottom:10px;text-transform:uppercase}
.cad-map-wrap{position:relative;width:100%;height:0;border-radius:8px;overflow:hidden;background:#dfe4e9}
.cad-map-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.cad-map-ov{position:absolute;inset:0;width:100%;height:100%}
.cad-map-north{position:absolute;top:8px;right:10px;font-size:11px;font-weight:700;color:#fff;background:rgba(0,0,0,.45);padding:2px 7px;border-radius:6px}
.cad-nomap{height:120px;display:flex;align-items:center;justify-content:center;background:#f1f4f7;border-radius:8px;font-size:12px;color:#6b7785}
.cad-mapfoot{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:8px;font-size:11px;color:#3f4a55}
.cad-range{margin-bottom:14px}
.cad-range-bar{position:relative;height:8px;border-radius:6px;background:#eef1f4}
.cad-range-fill{position:absolute;left:14%;right:14%;top:0;bottom:0;border-radius:6px;background:#2a78d6;opacity:.30}
.cad-range-mark{position:absolute;top:-3px;width:3px;height:14px;border-radius:2px;background:#2a78d6}
.cad-range-lbl{display:flex;justify-content:space-between;margin-top:7px;font-size:11px;color:#6b7785;font-variant-numeric:tabular-nums}
.cad-range-mid{font-weight:700;color:#1a1d21}
.cad-cmp-h{font-size:11px;font-weight:600;color:#6b7785;margin-bottom:6px}
.cad-cmp{list-style:none;margin:0;padding:0}
.cad-cmp li{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:5px 0;border-top:1px solid #eef1f4;font-size:12px}
.cad-cmp li span{color:#3f4a55}
.cad-cmp li b{font-variant-numeric:tabular-nums}
.cad-cmp li i{font-style:normal;font-size:10px;color:#6b7785;min-width:42px;text-align:right}
.cad-cmp-none span{color:#6b7785;font-style:italic}
.cad-score{display:grid;grid-template-columns:64px 1fr 26px;gap:9px;align-items:center;margin-bottom:8px;font-size:12px}
.cad-score span{color:#3f4a55}
.cad-score b{text-align:right;font-variant-numeric:tabular-nums}
.cad-sbar{height:6px;border-radius:4px;background:#eef1f4;overflow:hidden}
.cad-sbar i{display:block;height:100%;width:0;border-radius:4px;background:#1baf7a;transition:width .9s cubic-bezier(.2,.7,.2,1)}
.cad-poi{display:flex;gap:12px;margin-top:10px;padding-top:9px;border-top:1px solid #eef1f4;font-size:11px;color:#3f4a55}
.cad-ir{display:grid;grid-template-columns:1fr 1.3fr;gap:16px}
.cad-imar-row{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid #eef1f4;font-size:12px}
.cad-imar-row span{color:#6b7785}
.cad-imar-row b{font-variant-numeric:tabular-nums;text-align:right}
.cad-src{font-size:10px;color:#6b7785;margin-top:7px}
.cad-risk-i{padding:8px 10px;border-radius:8px;margin-bottom:7px}
.cad-risk-i b{display:block;font-size:12px;margin-bottom:2px}
.cad-risk-i span{font-size:11px;line-height:1.35}
.cad-r-krit{background:#fdeaea;border:1px solid #f3c2c0;color:#8f1f1d}
.cad-r-warn{background:#fdf2e0;border:1px solid #f0d9a8;color:#7a5200}
.cad-r-info{background:#eef1f4;border:1px solid #d6dce2;color:#3f4a55}
.cad-r-ok{background:#e7f6ef;border:1px solid #bfe6d3;color:#0a6b45}
.cad-tk{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:end}
.cad-tk-bars{display:flex;gap:6px;align-items:flex-end;height:64px}
.cad-tk-col{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;flex:1;height:100%}
.cad-tk-col i{display:block;width:100%;max-width:26px;height:var(--h);background:#2a78d6;border-radius:3px 3px 0 0;opacity:.85}
.cad-tk-col span{font-size:9px;color:#6b7785;margin-top:3px}
.cad-tk-meta{display:flex;gap:16px;text-align:right}
.cad-tk-meta b{display:block;font-size:16px;font-variant-numeric:tabular-nums}
.cad-tk-meta span{font-size:10px;color:#6b7785}
.cad-empty{color:#6b7785;font-size:12px;line-height:1.5;margin:0}
.cad-verdict{margin-top:12px;background:#fff;border:1px solid #d6dce2;border-left:3px solid #1baf7a;border-radius:12px;padding:13px 16px;font-size:13px}
.cad-v-badge{font-size:10px;font-weight:700;letter-spacing:.5px;color:#0a6b45;background:#e7f6ef;padding:2px 7px;border-radius:5px;margin-right:6px}
.cad-disc{font-size:10px;color:#6b7785;margin-top:8px;line-height:1.4}
.cad-cta{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:12px;padding:14px 18px;background:#0f2f24;color:#fff;border-radius:12px;text-decoration:none;font-size:13px}
.cad-cta b{color:#fff}
.cad-cta-btn{flex:none;font-weight:700;background:#1baf7a;padding:8px 14px;border-radius:8px;white-space:nowrap}
@media print{.cad-cta{background:#fff;color:#0f2f24;border:1px solid #d6dce2}.cad-cta-btn{background:#e7f6ef;color:#0a6b45}}
.cad-reveal{opacity:0;transform:translateY(10px);animation:cadIn .55s ease forwards;animation-delay:var(--d,0s)}
@keyframes cadIn{to{opacity:1;transform:none}}
@media print{.cad-bar{display:none}.cad-reveal{opacity:1;transform:none;animation:none}.cad-sbar i{transition:none}body{padding:0;background:#fff}.cad-card,.cad-hero,.cad-verdict{break-inside:avoid}}
@media(max-width:560px){.cad-grid{grid-template-columns:1fr}.cad-hero{flex-direction:column}.cad-hero-r{text-align:left;border-left:0;border-top:1px solid #d6dce2;padding-left:0;padding-top:12px}.cad-conf{justify-content:flex-start}.cad-ir{grid-template-columns:1fr}}
/* AI bant göstergesi */
.cad-ai-band{display:flex;gap:12px;margin:8px 0}
.cad-ai-band-item{flex:1;text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px}
.cad-ai-band-item small{display:block;font-size:9px;letter-spacing:.5px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase}
.cad-ai-band-item b{display:block;font-size:14px;font-variant-numeric:tabular-nums;color:#1a1d21}
.cad-ai-band-mid{background:#ecfdf5;border-color:#a7f3d0}
.cad-ai-band-mid b{color:#065f46}
${PRO_CSS}
</style></head>
<body><div class="cad">
  ${kapakSayfasiHtml(veri, raporNo, tarih)}

  ${etkilesim ? `<div class="cad-bar">
    <button class="cad-btn cad-btn-primary" id="cadShare" type="button">Paylaşılabilir link</button>
    <button class="cad-btn" type="button" onclick="print()">PDF indir</button>
  </div>` : ""}

  <div class="cad-top">
    <div class="cad-brand"><span class="cad-logo">◆</span> Cadastrum <span class="cad-tag">Yatırımcı Sunum Raporu</span></div>
    <div class="cad-meta">Rapor: ${tarih} · No: ${esc(raporNo)}</div>
  </div>

  <section class="cad-hero cad-reveal" style="--d:0s">
    <div class="cad-hero-l">
      <div class="cad-loc">${esc(loc)}</div>
      <h1 class="cad-h1">Ada ${esc(p.adaNo)} / Parsel ${esc(p.parselNo)}</h1>
      <div class="cad-chips">
        <span class="cad-chip cad-chip-ok">${esc(p.nitelik)}</span>
        <span class="cad-chip">${num(p.alan)} m²</span>
        <span class="cad-chip">${esc(imarSinif)}</span>
        <span class="cad-chip ${riskBadgeRenk}">${esc(ozet.etiket)}${ozet.toplam ? ` · ${ozet.toplam} uyarı` : ""}</span>
      </div>
    </div>
    <div class="cad-hero-r">
      <div class="cad-val-label">TAHMİNİ PİYASA DEĞERİ</div>
      ${heroDeger}
    </div>
  </section>

  <div class="cad-grid">
    <section class="cad-card cad-span2 cad-reveal" style="--d:.08s">
      <div class="cad-card-h">Konum &amp; Uydu Görünümü</div>
      ${haritaPanel(gorsel)}
      <div class="cad-mapfoot">
        <span>${esc(p.pafta || "Pafta —")}</span>
        ${veri.egim ? `<span><b>${veri.egim.ortEgimYuzde}%</b> eğim · ${esc(veri.egim.bakiYonu.split(" ")[0])}</span>` : ""}
        ${veri.egim ? `<span><b>${veri.egim.merkezYukseklikM}</b> m rakım</span>` : ""}
      </div>
    </section>
    ${degerlemeHtml(veri)}
    ${skorlarHtml(veri)}
    ${imarRiskHtml(veri)}
    ${aiAnalizHtml(veri.aiSonuc)}
    ${emsalTamTabloHtml(veri)}
    ${fizibiliteHtml(veri)}
    ${cevreHtml(veri)}
    ${tkgmHtml(veri)}
  </div>

  <section class="cad-verdict cad-reveal" style="--d:.40s">
    <div><span class="cad-v-badge">YATIRIM ÖZETİ</span> ${verdictMetin}</div>
    <div class="cad-disc">Tahmini değerlemedir; resmî ekspertiz yerine geçmez. Cadastrum motoru · emsaller (emlakjet/sahibinden) + TKGM/e-Plan/TÜCBS analizi. Uydu görüntüsü © Esri World Imagery.</div>
  </section>

  <a class="cad-cta cad-reveal" style="--d:.46s" href="${SITE_URL}/?utm_source=rapor&amp;utm_medium=paylasim" target="_blank" rel="noopener">
    <span><b>Bu raporu Cadastrum oluşturdu.</b> Kendi arsanı/tarlanı 10 saniyede ücretsiz analiz et.</span>
    <span class="cad-cta-btn">Ücretsiz dene →</span>
  </a>

  ${yasalRedHtml(tarih, raporNo)}
</div>
${etkilesim ? `<script>
(function(){
  var el=document.querySelector('.cad-val[data-target]');
  if(el){var target=+el.getAttribute('data-target')||0,t0=null,dur=1200;
    function f(n){return '₺'+Math.round(n).toLocaleString('tr-TR');}
    function step(ts){if(!t0)t0=ts;var p=Math.min((ts-t0)/dur,1),e=1-Math.pow(1-p,3);el.textContent=f(target*e);if(p<1)requestAnimationFrame(step);}
    setTimeout(function(){requestAnimationFrame(step);},250);}

  /* W7 — Arsa Pasaportu: Paylaş → URL + QR kodu */
  function qrGoster(url){
    var mevcut=document.getElementById('cadQrPanel');
    if(mevcut)mevcut.remove();
    var qrUrl='https://api.qrserver.com/v1/create-qr-code/?size=180x180&data='+encodeURIComponent(url);
    var panel=document.createElement('div');
    panel.id='cadQrPanel';
    panel.style.cssText='position:fixed;bottom:24px;right:24px;background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.18);padding:20px;text-align:center;z-index:9999;max-width:240px;font-family:system-ui,sans-serif;';
    panel.innerHTML='<div style="font-size:13px;font-weight:700;color:#1B2A4A;margin-bottom:8px;">Arsa Pasaportu</div>'
      +'<img src="'+qrUrl+'" width="180" height="180" alt="QR Kod" style="border-radius:8px;border:1px solid #e5e7eb;">'
      +'<div style="margin-top:8px;font-size:11px;color:#6b7280;">QR kodu tara veya linki kopyala</div>'
      +'<input value="'+url+'" readonly style="width:100%;margin-top:6px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:11px;color:#374151;" onclick="this.select()">'
      +'<div style="margin-top:10px;display:flex;gap:6px;justify-content:center;">'
      +'<button onclick="navigator.clipboard&&navigator.clipboard.writeText(\''+url+'\').then(function(){this.textContent=\'Kopyalandı ✓\'}.bind(this))" style="flex:1;padding:6px;background:#1B2A4A;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;">Kopyala</button>'
      +'<button onclick="document.getElementById(\'cadQrPanel\').remove()" style="flex:1;padding:6px;background:#f3f4f6;color:#374151;border:none;border-radius:6px;font-size:11px;cursor:pointer;">Kapat</button>'
      +'</div>';
    document.body.appendChild(panel);
  }

  var sb=document.getElementById('cadShare');
  if(sb){sb.addEventListener('click',async function(){
    sb.disabled=true;var eski=sb.textContent;sb.textContent='Yükleniyor…';
    try{
      var html='<!DOCTYPE html>\\n'+document.documentElement.outerHTML;
      var r=await fetch('${RAPOR_API_BASE}/rapor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({html:html,baslik:${JSON.stringify(baslik)}})});
      var j=await r.json();
      if(j&&j.url){qrGoster(j.url);}
      else{alert('Paylaşım başarısız: '+(j&&j.error||'bilinmeyen hata'));}
    }catch(e){alert('Paylaşım başarısız: '+e.message);}
    sb.disabled=false;sb.textContent=eski;
  });}
})();
</script>` : ""}
</body></html>`;
}
