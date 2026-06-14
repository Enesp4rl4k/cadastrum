import { useEffect, useState } from "react";
import { raporVerisiniOku, type RaporVerisi } from "../lib/rapor-data";
import { fmtTL, fmtTLM2 } from "../lib/fiyat-tahmin";
import { ePlanOzet } from "../lib/eplan";
import { ParselHarita, KarsilastirmaChart, GuvenGauge, Histogram, OzellikBar } from "./chart-helpers";
import { MAHALLE_OZELLIK } from "../lib/data/mahalle-ozellik";
import { MAHALLE_BASELINE } from "../lib/data/mahalle-baseline";
import { depremRiskiGetir } from "../lib/data/deprem-zonlari";
import { taskinRiskiGetir } from "../lib/data/taskin-risk";
import { mahalleKeyOlustur } from "../lib/baseline-engine";
import { normalizeYerAdi } from "../lib/tkgm-api";

export function RaporView() {
  const [veri, setVeri] = useState<RaporVerisi | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    raporVerisiniOku()
      .then((v) => {
        if (!v) {
          setHata("Rapor verisi bulunamadı. Lütfen Cadastrum panelinden 'PDF Rapor' butonunu yeniden tıklayın.");
        } else {
          setVeri(v);
          document.title = `Cadastrum — ${v.parsel.adaNo}/${v.parsel.parselNo} ${v.parsel.mahalleAd ?? ""}`;
        }
      })
      .catch((e) => setHata(e instanceof Error ? e.message : String(e)));
  }, []);

  if (hata) return <div className="loading-state"><p>⚠ {hata}</p></div>;
  if (!veri) return <div className="loading-state"><div className="spinner" /><p>Rapor hazırlanıyor…</p></div>;

  const { parsel, ePlan, fiyat, riskler, uretildiAt, cevre, egim, aiSonuc } = veri;
  const tier = veri.tier ?? "free";
  const isPro = tier === "pro" || tier === "pro_plus" || tier === "kurumsal";
  const isProPlus = tier === "pro_plus" || tier === "kurumsal";

  // Tier'a göre toplam sayfa sayısı:
  //   Free: 3 sayfa (kapak + parsel/imar özeti + fiyat özet + disclaimer)
  //   Pro: 5 sayfa (kapak + parsel/imar + fiyat + risk + disclaimer)
  //   Pro+: 6 sayfa (tam — kapak + parsel + fiyat + mahalle + risk + sonuç)
  const toplamSayfa = isProPlus ? 6 : isPro ? 5 : 3;

  // AI kombine beklenen — heuristik + AI sapması <%30 ise ortalama
  const aiSapma = aiSonuc && fiyat
    ? Math.abs((aiSonuc.beklenenPerM2 - fiyat.beklenenPerM2) / fiyat.beklenenPerM2)
    : null;
  const aiKombineGecerli = aiSapma != null && aiSapma <= 0.30;
  const aiKombinePerM2 = aiKombineGecerli && aiSonuc && fiyat
    ? Math.round(0.7 * fiyat.beklenenPerM2 + 0.3 * aiSonuc.beklenenPerM2)
    : null;
  const aiKombineToplam = aiKombinePerM2 ? Math.round(aiKombinePerM2 * parsel.alan) : null;
  const tarihStr = new Date(uretildiAt).toLocaleString("tr-TR", { dateStyle: "full", timeStyle: "short" });
  const kisaTarih = new Date(uretildiAt).toLocaleDateString("tr-TR");
  const raporNo = `CDS-${parsel.mahalleKodu ?? "x"}-${parsel.adaNo}-${parsel.parselNo}-${new Date(uretildiAt).toISOString().slice(0, 10).replace(/-/g, "")}`;

  // Yapı hakları hesabı
  const tabanAlan = ePlan?.taks != null ? Math.round(parsel.alan * ePlan.taks) : null;
  const insaatAlan = ePlan?.emsal != null ? Math.round(parsel.alan * ePlan.emsal) : null;
  const tahminiKonut = insaatAlan != null ? Math.floor(insaatAlan / 100) : null; // 100 m² ortalama daire

  // Risk seviyesine göre sayım
  const riskKritik = riskler.filter(r => r.seviye === "kritik").length;
  const riskOrta = riskler.filter(r => r.seviye === "orta").length;
  const riskBilgi = riskler.filter(r => r.seviye === "bilgi").length;

  // Mahalle özellik vector lookup — baseline-engine ile aynı key formatı
  const ozellikKey = mahalleKeyOlustur(parsel.ilAd, parsel.ilceAd, parsel.mahalleAd);
  const ozellikTuple = ozellikKey ? MAHALLE_OZELLIK[ozellikKey] : undefined;
  // Mahalle AI baseline (statik tablo)
  // Tuple: [arsa_tlm2, arsa_guven, konut_tlm2, konut_guven, tarla_tlm2, tarla_guven]
  const mahalleBaselineTuple = ozellikKey ? MAHALLE_BASELINE[ozellikKey] : undefined;
  const mahalleArsaBaseline = mahalleBaselineTuple ? mahalleBaselineTuple[0] : null;
  const mahalleArsaGuven = mahalleBaselineTuple ? mahalleBaselineTuple[1] : null;
  const mahalleKonutBaseline = mahalleBaselineTuple ? mahalleBaselineTuple[2] : null;
  const mahalleTarlaBaseline = mahalleBaselineTuple ? mahalleBaselineTuple[4] : null;
  const mahalleOzellikleri = ozellikTuple ? [
    { etiket: "🌊 Sahile mesafe", deger: ozellikTuple[0], max: 5, ters: true, not: ozellikTuple[0] === 0 ? "uzak" : "" },
    { etiket: "🚇 Metro/raylı", deger: ozellikTuple[1], max: 1.5, ters: true, not: ozellikTuple[1] === 0 ? "yok" : "" },
    { etiket: "🎓 Üniversite", deger: ozellikTuple[2], max: 2, ters: true, not: ozellikTuple[2] === 0 ? "yok" : "" },
    { etiket: "🛣 Anayol", deger: ozellikTuple[3], max: 5, ters: true, not: ozellikTuple[3] === 0 ? "uzak" : "" },
    { etiket: "🏙 İl merkezi", deger: ozellikTuple[4], max: 100, ters: true, not: "km" },
  ].filter(o => o.deger > 0 || o.etiket.includes("İl merkezi")) : [];

  // Deprem + taşkın risk
  const depremRisk = parsel.ilAd ? depremRiskiGetir(normalizeYerAdi(parsel.ilAd)) : null;
  const taskinRisk = parsel.ilAd ? taskinRiskiGetir(normalizeYerAdi(parsel.ilAd)) : null;

  // Emsal histogramı için verileri hazırla
  const emsalDegerleri: number[] = (fiyat?.emsalListesi ?? [])
    .map(e => e.fiyatPerM2)
    .filter((v): v is number => typeof v === "number" && v > 0);

  // ── Yatırım skoru (0-100) — likidite + risk + güven + emsal kalitesi ──
  const yatirimSkoru = (() => {
    let toplam = 50; // baseline
    let detay: { etiket: string; etki: number; not: string }[] = [];

    // Fiyat tahmin güveni (+0..20)
    if (fiyat) {
      const guvenEtki = Math.round((fiyat.guvenSkoru - 50) * 0.4);
      toplam += guvenEtki;
      detay.push({ etiket: "Fiyat tahmin güveni", etki: guvenEtki, not: `${fiyat.guvenSkoru}/100 güven skoru` });
    }

    // Risk durumu (-0..-20)
    const riskEtki = -(riskKritik * 8 + riskOrta * 3);
    if (riskEtki !== 0) {
      toplam += riskEtki;
      detay.push({ etiket: "Risk uyarıları", etki: riskEtki, not: `${riskKritik} kritik · ${riskOrta} orta` });
    }

    // Deprem zonu (-0..-15)
    if (depremRisk) {
      const depremEtki = depremRisk.zon === "Z1" ? -12 : depremRisk.zon === "Z2" ? -6 : depremRisk.zon === "Z3" ? -2 : depremRisk.zon === "Z4" ? 1 : 3;
      toplam += depremEtki;
      detay.push({ etiket: "Deprem zonu", etki: depremEtki, not: `${depremRisk.zon} (PGA ${depremRisk.pga.toFixed(2)}g)` });
    }

    // Taşkın riski (-0..-8)
    if (taskinRisk) {
      const taskinEtki = taskinRisk.risk === "yuksek" ? -6 : taskinRisk.risk === "orta" ? -2 : 1;
      toplam += taskinEtki;
      detay.push({ etiket: "Taşkın riski", etki: taskinEtki, not: taskinRisk.risk });
    }

    // Mahalle özellikleri (+0..+10)
    if (ozellikTuple) {
      let ozellikEtki = 0;
      if (ozellikTuple[0] > 0 && ozellikTuple[0] <= 2) ozellikEtki += 4;  // sahil
      if (ozellikTuple[1] > 0 && ozellikTuple[1] <= 1) ozellikEtki += 3;  // metro
      if (ozellikTuple[2] > 0 && ozellikTuple[2] <= 1.5) ozellikEtki += 2; // üniv
      if (ozellikTuple[3] > 0 && ozellikTuple[3] <= 2) ozellikEtki += 1;  // anayol
      if (ozellikTuple[4] > 0 && ozellikTuple[4] <= 25) ozellikEtki += 2; // il merkezi yakın
      if (ozellikEtki > 0) {
        toplam += ozellikEtki;
        detay.push({ etiket: "Mahalle özellikleri", etki: ozellikEtki, not: "konum primi" });
      }
    }

    // İmar netliği (+0..+8)
    if (ePlan?.taks != null && ePlan?.emsal != null) {
      toplam += 5;
      detay.push({ etiket: "İmar netliği", etki: 5, not: "Resmi e-Plan + TAKS/Emsal var" });
    }

    return { skor: Math.max(0, Math.min(100, Math.round(toplam))), detay };
  })();

  // ── SWOT analizi ───────────────────────────────────────────────
  const swot = {
    guclu: [] as string[],
    zayif: [] as string[],
    firsat: [] as string[],
    tehdit: [] as string[],
  };

  if (fiyat?.guvenSkoru && fiyat.guvenSkoru >= 70) swot.guclu.push(`Yüksek tahmin güveni (${fiyat.guvenSkoru}/100)`);
  if (ePlan?.emsal != null) swot.guclu.push(`Belirlenmiş yapı hakları (Emsal ${ePlan.emsal.toFixed(2)})`);
  if (ozellikTuple && ozellikTuple[0] > 0 && ozellikTuple[0] <= 2) swot.guclu.push(`Sahile yakın (${ozellikTuple[0].toFixed(1)} km)`);
  if (ozellikTuple && ozellikTuple[1] > 0 && ozellikTuple[1] <= 1) swot.guclu.push(`Metro/raylı taşıma yakın`);
  if (ozellikTuple && ozellikTuple[3] > 0 && ozellikTuple[3] <= 1) swot.guclu.push(`Anayol kenarında`);
  if (parsel.alan > 1000) swot.guclu.push(`Geniş parsel (${parsel.alan.toLocaleString("tr-TR")} m²)`);

  if (fiyat?.guvenSkoru && fiyat.guvenSkoru < 50) swot.zayif.push(`Düşük tahmin güveni — yetersiz emsal`);
  if (!ePlan) swot.zayif.push(`Resmi imar verisi eksik (manuel sorgu gerekli)`);
  if (riskler.some(r => r.seviye === "kritik")) swot.zayif.push(`Kritik risk uyarıları mevcut`);
  if (egim?.maxEgimYuzde && egim.maxEgimYuzde > 25) swot.zayif.push(`Yüksek eğim (%${egim.maxEgimYuzde.toFixed(0)})`);
  if (ozellikTuple && ozellikTuple[4] > 60) swot.zayif.push(`İl merkezine uzak (${ozellikTuple[4].toFixed(0)} km)`);

  if (ePlan?.kullanimKarari?.toLowerCase().includes("ticaret")) swot.firsat.push(`Ticari kullanım izni`);
  if (ePlan?.emsal != null && ePlan.emsal >= 1.5) swot.firsat.push(`Yüksek inşaat hakkı (Emsal ${ePlan.emsal.toFixed(2)})`);
  if (parsel.alan > 5000) swot.firsat.push(`Bölünebilir/parselleme potansiyeli`);
  if (ozellikTuple && ozellikTuple[2] > 0 && ozellikTuple[2] <= 2) swot.firsat.push(`Üniversite yakını — kira getirisi`);
  if (taskinRisk?.risk === "dusuk" && depremRisk && depremRisk.zon !== "Z1" && depremRisk.zon !== "Z2") {
    swot.firsat.push(`Düşük doğal afet riski`);
  }

  if (depremRisk?.zon === "Z1") swot.tehdit.push(`Z1 deprem zonu — yüksek PGA (${depremRisk.pga.toFixed(2)}g)`);
  if (taskinRisk?.risk === "yuksek") swot.tehdit.push(`Yüksek taşkın riski — ${taskinRisk.not}`);
  if (riskler.some(r => r.kod?.includes("ipotek") || r.kod?.includes("haciz"))) swot.tehdit.push(`Tapuda kısıtlama olabilir`);
  if (parsel.nitelik?.toLowerCase().includes("tarla") && !ePlan?.kullanimKarari?.toLowerCase().includes("konut")) {
    swot.tehdit.push(`Tarla niteliği — yapı izni sınırlı (3194 SK)`);
  }
  if (ozellikTuple && ozellikTuple[3] === 0 && ozellikTuple[4] > 30) swot.tehdit.push(`Sapa konum — likidite düşük`);

  // En az 1 madde olsun her başlıkta
  if (swot.guclu.length === 0) swot.guclu.push("Belirgin güçlü yön tespit edilemedi");
  if (swot.zayif.length === 0) swot.zayif.push("Belirgin zayıf yön tespit edilemedi");
  if (swot.firsat.length === 0) swot.firsat.push("Belirgin fırsat tespit edilemedi");
  if (swot.tehdit.length === 0) swot.tehdit.push("Belirgin tehdit tespit edilemedi");

  // Karşılaştırma için emsal verileri (varsa)
  const karsilastirmalar: { etiket: string; deger: number; vurgulu?: boolean; ikinci?: string }[] = [];
  if (fiyat) {
    karsilastirmalar.push({ etiket: "Bu parsel", deger: fiyat.beklenenPerM2, vurgulu: true, ikinci: "tahmini" });
  }
  if (fiyat?.emsalOzeti?.weightedAsking) {
    karsilastirmalar.push({ etiket: "Emsal medyanı", deger: Math.round(fiyat.emsalOzeti.weightedAsking), ikinci: `${fiyat.emsalOzeti.secilenAdet} ilan` });
  }
  fiyat?.bilesenler?.slice(0, 1).forEach(b => {
    if (b.ad.toLowerCase().includes("baseline") || b.ad.toLowerCase().includes("mahalle")) {
      karsilastirmalar.push({ etiket: "Mahalle baseline", deger: Math.round(b.carpan), ikinci: b.not });
    }
  });

  return (
    <>
      {/* Toolbar */}
      <div className="toolbar no-print">
        <h1>Parsel Analiz Raporu</h1>
        <div className="actions">
          <button type="button" onClick={() => window.print()}>🖨 PDF olarak indir</button>
          <button type="button" className="secondary" onClick={() => window.close()}>Kapat</button>
        </div>
      </div>

      {/* ═══════════════ SAYFA 1 — KAPAK ═══════════════ */}
      <div className="rapor-page kapak-page">
        <div className="kapak-bg" aria-hidden="true">
          <svg width="100%" height="100%" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, opacity: 0.04 }}>
            <defs>
              <pattern id="topoPattern" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M 0 40 Q 20 20 40 40 T 80 40" stroke="#1B2A4A" strokeWidth="1" fill="none"/>
                <path d="M 0 60 Q 20 40 40 60 T 80 60" stroke="#1B2A4A" strokeWidth="1" fill="none"/>
              </pattern>
            </defs>
            <rect width="600" height="800" fill="url(#topoPattern)"/>
          </svg>
        </div>

        <div className="kapak-content">
          <div className="kapak-top">
            <div className="brand">
              <BrandMark size={40} />
              <div className="brand-text">Cadastrum</div>
            </div>
            <div className="kapak-meta">
              <div style={{ fontSize: "8pt", letterSpacing: "0.1em", color: "var(--muted)" }}>RAPOR NO</div>
              <div style={{ fontSize: "11pt", fontWeight: 600, fontFamily: "monospace", color: "var(--imperial)" }}>{raporNo}</div>
            </div>
          </div>

          <div className="kapak-titulo">
            <div className="kapak-eyebrow">Parsel Analiz Raporu</div>
            <h1 className="kapak-h1">
              {parsel.ilAd} <span className="kapak-sep">/</span> {parsel.ilceAd}
            </h1>
            <div className="kapak-mahalle">{parsel.mahalleAd}</div>
            <div className="kapak-parsel-id">
              Ada {parsel.adaNo} · Parsel {parsel.parselNo} · {parsel.alan.toLocaleString("tr-TR")} m²
            </div>
          </div>

          {/* Tahmini değer büyük */}
          {fiyat && (
            <div className="kapak-fiyat">
              <div className="kapak-fiyat-label">
                {aiKombinePerM2 ? "Tahmini Piyasa Değeri · AI + İstatistik" : "Tahmini Piyasa Değeri"}
              </div>
              <div className="kapak-fiyat-buyuk">{fmtTL(aiKombineToplam ?? fiyat.toplamBeklenen)}</div>
              <div className="kapak-fiyat-aralik">
                <span>{fmtTL(fiyat.toplamAlt)}</span>
                <span className="kapak-fiyat-cizgi"></span>
                <span>{fmtTL(fiyat.toplamUst)}</span>
              </div>
              <div className="kapak-fiyat-perm2">
                {fmtTLM2(aiKombinePerM2 ?? fiyat.beklenenPerM2)} ortalama
                {aiSonuc && <span style={{ marginLeft: 8, color: "var(--champagne-700)" }}>· {aiSonuc.modelAd}</span>}
              </div>
            </div>
          )}

          {/* AI özet paragrafı — kapakta öne çıkar */}
          {aiSonuc?.gerekce && (
            <div style={{
              background: "linear-gradient(135deg, #FAF5E8 0%, #F0E4BD 100%)",
              borderLeft: "3px solid var(--champagne)",
              padding: "12px 14px",
              borderRadius: "0 4px 4px 0",
              marginBottom: "20px",
              fontSize: "9.5pt",
              lineHeight: 1.55,
              color: "var(--ink)",
              fontStyle: "italic",
            }}>
              <div style={{ fontSize: "8pt", fontWeight: 600, color: "var(--champagne-700)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px", fontStyle: "normal" }}>
                ✨ AI Yorumu — {aiSonuc.modelAd}
              </div>
              "{aiSonuc.gerekce}"
            </div>
          )}

          {/* 3 stat kutu */}
          <div className="kapak-stats">
            {fiyat && (
              <div className="kapak-stat">
                <GuvenGauge skor={fiyat.guvenSkoru} etiket="tahmin güveni" size={120} />
              </div>
            )}
            <div className="kapak-stat">
              <div className="kapak-stat-deger">{ePlan?.kullanimKarari ?? "—"}</div>
              <div className="kapak-stat-etiket">İmar Durumu</div>
              {ePlan?.emsal != null && <div className="kapak-stat-alt">Emsal {ePlan.emsal.toFixed(2)}</div>}
            </div>
            <div className="kapak-stat">
              <div className="kapak-stat-deger" style={{ color: riskKritik > 0 ? "#DC2626" : riskOrta > 0 ? "#D97706" : "#059669" }}>
                {riskler.length === 0 ? "✓" : riskler.length}
              </div>
              <div className="kapak-stat-etiket">Risk Uyarısı</div>
              {riskler.length > 0 && <div className="kapak-stat-alt">{riskKritik} kritik · {riskOrta} orta</div>}
            </div>
          </div>

          {/* Kapak alt — özet */}
          <div className="kapak-ozet">
            <div className="kapak-ozet-title">Bu rapor neyi içerir?</div>
            <ul className="kapak-ozet-list">
              <li>TKGM resmi parsel kaydı ve geometri görseli</li>
              <li>Çevre, Şehircilik Bakanlığı e-Plan resmi imar durumu</li>
              <li>Çoklu kaynak fiyat tahmini ve emsal karşılaştırması</li>
              <li>Mahalle özellik profili ve tehlike (risk) taraması</li>
            </ul>
          </div>

          <div className="kapak-footer">
            <div>
              <div style={{ fontSize: "8pt", color: "var(--muted)" }}>Düzenleme tarihi</div>
              <div style={{ fontSize: "10pt", color: "var(--imperial)" }}>{tarihStr}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "8pt", color: "var(--muted)" }}>Doğrulama</div>
              <a href={`https://cadastrum.com.tr/r/${raporNo}`} style={{ fontSize: "9pt", color: "var(--imperial)", textDecoration: "none" }}>
                cadastrum.com.tr/r/{raporNo}
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════ SAYFA 2 — PARSEL + İMAR ═══════════════ */}
      <div className="rapor-page">
        <header className="rapor-header">
          <div className="brand"><BrandMark /><div className="brand-text">Cadastrum</div></div>
          <div className="meta"><strong>{raporNo}</strong><br />Sayfa 2 / {toplamSayfa}</div>
        </header>

        <div className="rapor-title">
          <h1>Parsel ve İmar</h1>
          <p className="subtitle">{parsel.ilAd} / {parsel.ilceAd} / {parsel.mahalleAd}</p>
        </div>

        {/* Parsel + harita yan yana */}
        <section className="section">
          <h2>Parsel Kaydı<span className="section-no">01 · TKGM</span></h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "start" }}>
            <div className="data-grid">
              <div className="data-row"><span className="label">İl / İlçe</span><span className="value">{parsel.ilAd} / {parsel.ilceAd}</span></div>
              <div className="data-row"><span className="label">Mahalle</span><span className="value">{parsel.mahalleAd}</span></div>
              <div className="data-row"><span className="label">Mahalle Kodu</span><span className="value">{parsel.mahalleKodu ?? "—"}</span></div>
              <div className="data-row"><span className="label">Ada / Parsel</span><span className="value">{parsel.adaNo} / {parsel.parselNo}</span></div>
              <div className="data-row"><span className="label">Alan</span><span className="value">{parsel.alan.toLocaleString("tr-TR")} m²</span></div>
              <div className="data-row"><span className="label">Nitelik</span><span className="value">{parsel.nitelik}</span></div>
              <div className="data-row"><span className="label">Pafta</span><span className="value">{parsel.pafta || "—"}</span></div>
              <div className="data-row"><span className="label">Durum</span><span className="value">{parsel.durum || "Aktif"}</span></div>
              <div className="data-row"><span className="label">Koordinat</span><span className="value" style={{ fontSize: "8pt", fontFamily: "monospace" }}>{parsel.merkezNokta.lat.toFixed(5)}, {parsel.merkezNokta.lng.toFixed(5)}</span></div>
            </div>
            <ParselHarita
              koordinatlar={parsel.koordinatlar}
              merkez={parsel.merkezNokta}
              width={280}
              height={200}
              baslik="Parsel sınırları (TKGM)"
            />
          </div>
        </section>

        {/* e-Plan + yapı hakları */}
        <section className="section">
          <h2>İmar Durumu<span className="section-no">02 · e-Plan</span></h2>
          {ePlan ? (
            <>
              <p style={{ fontSize: "10pt", marginBottom: "10px", color: "var(--ink)" }}>{ePlanOzet(ePlan)}</p>

              {(ePlan.taks != null || ePlan.emsal != null || ePlan.maksKat != null || ePlan.yapiNizami) && (
                <div className="kpi-grid">
                  <div className="kpi-box"><div className="kpi-label">TAKS</div><div className="kpi-value">{ePlan.taks?.toFixed(2) ?? "—"}</div><div className="kpi-hint">Taban Alan KS</div></div>
                  <div className="kpi-box"><div className="kpi-label">Emsal</div><div className="kpi-value">{ePlan.emsal?.toFixed(2) ?? "—"}</div><div className="kpi-hint">Kat Alan KS</div></div>
                  <div className="kpi-box"><div className="kpi-label">Maks Kat</div><div className="kpi-value">{ePlan.maksKat ?? "—"}</div><div className="kpi-hint">İzin verilen</div></div>
                  <div className="kpi-box"><div className="kpi-label">Nizam</div><div className="kpi-value" style={{ fontSize: "11pt" }}>{ePlan.yapiNizami ?? "—"}</div><div className="kpi-hint">Yapı düzeni</div></div>
                </div>
              )}

              {/* Yapı hakları hesabı */}
              {(tabanAlan != null || insaatAlan != null) && (
                <div className="hesap-kutusu">
                  <div className="hesap-baslik">📐 Yapı Hakları Hesabı</div>
                  <div className="hesap-grid">
                    {tabanAlan != null && (
                      <div>
                        <div className="hesap-etiket">Maksimum taban alanı</div>
                        <div className="hesap-deger">{tabanAlan.toLocaleString("tr-TR")} m²</div>
                        <div className="hesap-formul">{parsel.alan.toLocaleString("tr-TR")} × {ePlan?.taks?.toFixed(2)} (TAKS)</div>
                      </div>
                    )}
                    {insaatAlan != null && (
                      <div>
                        <div className="hesap-etiket">Toplam inşaat alanı</div>
                        <div className="hesap-deger">{insaatAlan.toLocaleString("tr-TR")} m²</div>
                        <div className="hesap-formul">{parsel.alan.toLocaleString("tr-TR")} × {ePlan?.emsal?.toFixed(2)} (Emsal)</div>
                      </div>
                    )}
                    {tahminiKonut != null && tahminiKonut > 0 && (
                      <div>
                        <div className="hesap-etiket">Yaklaşık konut sayısı</div>
                        <div className="hesap-deger">~{tahminiKonut} adet</div>
                        <div className="hesap-formul">100 m² ortalama daire kabulüyle</div>
                      </div>
                    )}
                  </div>
                  <div className="hesap-not">
                    Bu hesap sadece TAKS ve Emsal değerlerinin uygulanmasıyla bulunan teorik üst sınırdır.
                    Çekme mesafeleri, otopark zorunluluğu, uygulama imar planı ve mevcut yapıların durumu hesaba dahil değildir.
                  </div>
                </div>
              )}

              {ePlan.kullanimKarari && (
                <div className="data-row" style={{ marginTop: "10px" }}><span className="label">Kullanım Kararı</span><span className="value">{ePlan.kullanimKarari}</span></div>
              )}
              {ePlan.planKarari && ePlan.planKarari !== ePlan.kullanimKarari && (
                <div className="data-row"><span className="label">Plan Kararı</span><span className="value">{ePlan.planKarari}</span></div>
              )}
            </>
          ) : (
            <div className="bos-veri">Resmi e-Plan kaydı yakalanmadı. e-plan.gov.tr üzerinden manuel sorgu yapılabilir.</div>
          )}
        </section>
      </div>

      {/* ═══════════════ SAYFA 3 — FİYAT ANALİZİ ═══════════════ */}
      <div className="rapor-page">
        <header className="rapor-header">
          <div className="brand"><BrandMark /><div className="brand-text">Cadastrum</div></div>
          <div className="meta"><strong>{raporNo}</strong><br />Sayfa 3 / {toplamSayfa}</div>
        </header>

        <div className="rapor-title">
          <h1>Fiyat Analizi</h1>
          <p className="subtitle">Çoklu kaynak triangulasyon · {kisaTarih}</p>
        </div>

        {fiyat ? (
          <>
            <section className="section">
              <h2>Tahmini Değer<span className="section-no">03 · Triangulasyon</span></h2>

              <div className="fiyat-box">
                <div className="fiyat-label">Beklenen Toplam Değer</div>
                <div className="fiyat-beklenen">{fmtTL(fiyat.toplamBeklenen)}</div>
                <div style={{ fontSize: "10pt", color: "var(--muted)" }}>
                  {fmtTLM2(fiyat.beklenenPerM2)} × {parsel.alan.toLocaleString("tr-TR")} m²
                </div>
                <div className="fiyat-aralik">
                  <div>
                    <div style={{ fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.05em" }}>Alt Sınır</div>
                    <strong>{fmtTL(fiyat.toplamAlt)}</strong>
                    <div style={{ fontSize: "8pt", opacity: 0.7 }}>{fmtTLM2(fiyat.altPerM2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.05em" }}>Üst Sınır</div>
                    <strong>{fmtTL(fiyat.toplamUst)}</strong>
                    <div style={{ fontSize: "8pt", opacity: 0.7 }}>{fmtTLM2(fiyat.ustPerM2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.05em" }}>Güven</div>
                    <strong>{fiyat.guven === "yuksek" ? "Yüksek ★★★" : fiyat.guven === "orta" ? "Orta ★★" : "Düşük ★"}</strong>
                    <div style={{ fontSize: "8pt", opacity: 0.7 }}>{fiyat.guvenSkoru}/100</div>
                  </div>
                </div>
              </div>

              <p style={{ fontSize: "9.5pt", color: "var(--muted)", margin: "12px 0", fontStyle: "italic" }}>
                {fiyat.guvenAciklama}
              </p>

              {/* AI doğrulama — Pro/Pro+ varsa */}
              {aiSonuc && (
                <div style={{
                  background: "#F5F0FA",
                  border: "1px solid #DDD0EA",
                  borderRadius: 4,
                  padding: "12px 14px",
                  marginTop: "12px",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ fontSize: "10pt", fontWeight: 600, color: "#7E22CE" }}>
                      ✨ AI Doğrulama
                    </div>
                    <div style={{ fontSize: "8pt", color: "var(--muted)" }}>
                      {aiSonuc.modelAd} · {aiSonuc.sureMs}ms
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: "7.5pt", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>AI Alt</div>
                      <div style={{ fontSize: "10pt", fontWeight: 600 }}>{fmtTLM2(aiSonuc.altPerM2)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "7.5pt", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>AI Beklenen</div>
                      <div style={{ fontSize: "11pt", fontWeight: 700, color: "#7E22CE" }}>{fmtTLM2(aiSonuc.beklenenPerM2)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "7.5pt", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>AI Üst</div>
                      <div style={{ fontSize: "10pt", fontWeight: 600 }}>{fmtTLM2(aiSonuc.ustPerM2)}</div>
                    </div>
                  </div>

                  {aiSapma != null && (
                    <div style={{ fontSize: "8.5pt", marginBottom: 8, padding: "4px 8px", background: aiKombineGecerli ? "#ECFCCB" : "#FEE2E2", borderRadius: 3, color: aiKombineGecerli ? "#3F6212" : "#7F1D1D" }}>
                      {aiKombineGecerli
                        ? `İstatistikten %${(aiSapma * 100).toFixed(0)} sapma — kombine değer kullanıldı`
                        : `İstatistikten %${(aiSapma * 100).toFixed(0)} sapma — yüksek, manuel inceleme önerilir`}
                    </div>
                  )}

                  {aiSonuc.gerekce && (
                    <div style={{ fontSize: "9pt", color: "var(--ink)", lineHeight: 1.5, fontStyle: "italic" }}>
                      "{aiSonuc.gerekce}"
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Karşılaştırma */}
            {karsilastirmalar.length > 1 && (
              <section className="section">
                <h2>Karşılaştırma<span className="section-no">04 · Bölgesel Bağlam</span></h2>
                <KarsilastirmaChart satirlar={karsilastirmalar} birim="TL/m²" width={520} />
              </section>
            )}

            {/* Hesap detayı */}
            <section className="section">
              <h2>Hesap Bileşenleri<span className="section-no">05 · Adım Adım</span></h2>
              <div style={{ display: "grid", gap: "4px", fontSize: "9pt" }}>
                {fiyat.bilesenler.map((b, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", background: i % 2 === 0 ? "#fafafa" : "white", borderRadius: 3, borderLeft: i === 0 ? "3px solid var(--imperial)" : "3px solid transparent" }}>
                    <span>
                      <strong>{b.ad}</strong>
                      <span style={{ color: "var(--muted)", marginLeft: "8px" }}>{b.not}</span>
                    </span>
                    <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
                      {i === 0 ? fmtTLM2(Math.round(b.carpan)) : `× ${b.carpan.toFixed(2)}`}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Emsal dağılım histogramı */}
            {emsalDegerleri.length >= 4 && (
              <section className="section">
                <h2>Emsal Dağılımı<span className="section-no">06 · {emsalDegerleri.length} ilan</span></h2>
                <p style={{ fontSize: "9pt", color: "var(--muted)", marginBottom: "8px" }}>
                  Bölgedeki seçilen emsallerin TL/m² dağılımı. Altın çubuk parselin tahmini değerini gösterir.
                </p>
                <Histogram
                  degerler={emsalDegerleri}
                  vurguDeger={fiyat.beklenenPerM2}
                  width={520}
                  height={140}
                  birim="TL/m²"
                />
              </section>
            )}
          </>
        ) : (
          <div className="bos-veri">Fiyat tahmini henüz hesaplanmadı.</div>
        )}

        {/* Free user için son sayfa — disclaimer + footer */}
        {!isPro && <DisclaimerFooter uretildiAt={uretildiAt} freeUyari={true} />}
      </div>

      {/* ═══════════════ SAYFA 4 — MAHALLE PROFİLİ (sadece Pro+) ═══════════════ */}
      {isProPlus && (
      <div className="rapor-page">
        <header className="rapor-header">
          <div className="brand"><BrandMark /><div className="brand-text">Cadastrum</div></div>
          <div className="meta"><strong>{raporNo}</strong><br />Sayfa 4 / {toplamSayfa}</div>
        </header>

        <div className="rapor-title">
          <h1>Mahalle Profili</h1>
          <p className="subtitle">Coğrafi öznitelikler · Doğal risk göstergeleri</p>
        </div>

        {/* Mahalle Künye — il/ilçe/mahalle + baseline tarihi + güven */}
        <section className="section">
          <h2>Mahalle Künyesi<span className="section-no">07 · Cadastrum Veritabanı</span></h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ padding: "10px 12px", background: "#EEF1F8", borderRadius: 4 }}>
              <div style={{ fontSize: "8pt", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>İl</div>
              <div style={{ fontSize: "11pt", fontWeight: 600, color: "var(--imperial)" }}>{parsel.ilAd ?? "—"}</div>
            </div>
            <div style={{ padding: "10px 12px", background: "#EEF1F8", borderRadius: 4 }}>
              <div style={{ fontSize: "8pt", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>İlçe</div>
              <div style={{ fontSize: "11pt", fontWeight: 600, color: "var(--imperial)" }}>{parsel.ilceAd ?? "—"}</div>
            </div>
            <div style={{ padding: "10px 12px", background: "#FAF5E8", borderRadius: 4 }}>
              <div style={{ fontSize: "8pt", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Mahalle</div>
              <div style={{ fontSize: "11pt", fontWeight: 600, color: "var(--imperial)" }}>{parsel.mahalleAd ?? "—"}</div>
            </div>
          </div>
          {ozellikKey && (
            <div style={{ fontSize: "8pt", color: "var(--muted)", fontFamily: "monospace" }}>
              key: {ozellikKey}
            </div>
          )}
        </section>

        {/* Mahalle Bazlı Fiyat Baseline (3 kategori) */}
        {(mahalleArsaBaseline || mahalleKonutBaseline || mahalleTarlaBaseline) && (
          <section className="section">
            <h2>Mahalle Bazlı Fiyat Baseline<span className="section-no">08 · 65k Mahalle Veritabanı</span></h2>
            <p style={{ fontSize: "9pt", color: "var(--muted)", marginBottom: "10px" }}>
              Bu mahallenin önceden hesaplanmış kategori bazlı medyanı (AI araştırma + KNN coğrafi yumuşatma).
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {/* Arsa */}
              <div style={{
                padding: "12px",
                background: parsel.nitelik?.toLowerCase().includes("arsa") ? "#FAF5E8" : "#F8FAFC",
                border: parsel.nitelik?.toLowerCase().includes("arsa") ? "2px solid #C9A86A" : "1px solid var(--border)",
                borderRadius: 4,
              }}>
                <div style={{ fontSize: "8pt", color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>🏗 Arsa</div>
                <div style={{ fontSize: "16pt", fontWeight: 700, color: "var(--imperial)" }}>
                  {mahalleArsaBaseline ? mahalleArsaBaseline.toLocaleString("tr-TR") : "—"}
                  <span style={{ fontSize: "8pt", fontWeight: 400, color: "var(--muted)", marginLeft: 4 }}>TL/m²</span>
                </div>
                {mahalleArsaGuven != null && (
                  <div style={{ fontSize: "8pt", color: "var(--muted)", marginTop: 2 }}>güven: {mahalleArsaGuven}/100</div>
                )}
              </div>
              {/* Konut */}
              <div style={{
                padding: "12px",
                background: parsel.nitelik?.toLowerCase().includes("mesken") || parsel.nitelik?.toLowerCase().includes("bina") ? "#FAF5E8" : "#F8FAFC",
                border: parsel.nitelik?.toLowerCase().includes("mesken") || parsel.nitelik?.toLowerCase().includes("bina") ? "2px solid #C9A86A" : "1px solid var(--border)",
                borderRadius: 4,
              }}>
                <div style={{ fontSize: "8pt", color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>🏠 Konut</div>
                <div style={{ fontSize: "16pt", fontWeight: 700, color: "var(--imperial)" }}>
                  {mahalleKonutBaseline ? mahalleKonutBaseline.toLocaleString("tr-TR") : "—"}
                  <span style={{ fontSize: "8pt", fontWeight: 400, color: "var(--muted)", marginLeft: 4 }}>TL/m²</span>
                </div>
              </div>
              {/* Tarla */}
              <div style={{
                padding: "12px",
                background: parsel.nitelik?.toLowerCase().includes("tarla") ? "#FAF5E8" : "#F8FAFC",
                border: parsel.nitelik?.toLowerCase().includes("tarla") ? "2px solid #C9A86A" : "1px solid var(--border)",
                borderRadius: 4,
              }}>
                <div style={{ fontSize: "8pt", color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 }}>🌾 Tarla</div>
                <div style={{ fontSize: "16pt", fontWeight: 700, color: "var(--imperial)" }}>
                  {mahalleTarlaBaseline ? mahalleTarlaBaseline.toLocaleString("tr-TR") : "—"}
                  <span style={{ fontSize: "8pt", fontWeight: 400, color: "var(--muted)", marginLeft: 4 }}>TL/m²</span>
                </div>
              </div>
            </div>
            <p style={{ fontSize: "8pt", color: "var(--muted)", fontStyle: "italic", marginTop: 8 }}>
              Çerçeveli kart bu parselin niteliğine ait kategoridir. Diğerleri referans amaçlı.
            </p>
          </section>
        )}

        {/* Mahalle özellik vector */}
        {mahalleOzellikleri.length > 0 ? (
          <section className="section">
            <h2>Coğrafi Öznitelikler<span className="section-no">09 · OSM ölçüm</span></h2>
            <p style={{ fontSize: "9pt", color: "var(--muted)", marginBottom: "10px" }}>
              Sahil, ulaşım, eğitim ve il merkezi yakınlığı. Yeşil = yakın/iyi, kırmızı = uzak.
            </p>
            <OzellikBar ozellikler={mahalleOzellikleri} width={520} />
          </section>
        ) : (
          <section className="section">
            <h2>Coğrafi Öznitelikler<span className="section-no">09 · OSM ölçüm</span></h2>
            <div className="bos-veri">Bu mahalle için coğrafi özellik verisi çıkarılmadı (62k mahalle vektör veritabanı).</div>
          </section>
        )}

        {/* Doğal risk görseli — Deprem + Taşkın */}
        <section className="section">
          <h2>Doğal Risk Profili<span className="section-no">10 · AFAD + Çevre Bak.</span></h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {/* Deprem kartı */}
            {depremRisk ? (
              <div style={{
                padding: "12px",
                borderLeft: `4px solid ${depremRisk.zon === "Z1" ? "#DC2626" : depremRisk.zon === "Z2" ? "#EA580C" : depremRisk.zon === "Z3" ? "#D97706" : depremRisk.zon === "Z4" ? "#65A30D" : "#059669"}`,
                background: depremRisk.zon === "Z1" ? "#FEE2E2" : depremRisk.zon === "Z2" ? "#FED7AA" : depremRisk.zon === "Z3" ? "#FEF3C7" : depremRisk.zon === "Z4" ? "#ECFCCB" : "#D1FAE5",
                borderRadius: 3,
              }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "4px" }}>
                  <div style={{ fontSize: "9pt", fontWeight: 600, color: "#1B2A4A", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    🌍 Deprem
                  </div>
                  <div style={{ fontSize: "16pt", fontWeight: 700, color: "#1B2A4A" }}>{depremRisk.zon}</div>
                </div>
                <div style={{ fontSize: "10pt", marginBottom: "6px" }}>
                  PGA: <strong>{depremRisk.pga.toFixed(2)}g</strong>
                  <span style={{ color: "var(--muted)", marginLeft: "6px" }}>(475 yıllık dönüş)</span>
                </div>
                {depremRisk.fay && (
                  <div style={{ fontSize: "9pt", color: "#1B2A4A", marginBottom: "4px" }}>
                    Fay: <em>{depremRisk.fay}</em>
                  </div>
                )}
                <div style={{ fontSize: "8pt", color: "var(--muted)", lineHeight: 1.4 }}>{depremRisk.not}</div>
              </div>
            ) : (
              <div className="bos-veri" style={{ margin: 0 }}>Deprem verisi yok</div>
            )}

            {/* Taşkın kartı */}
            {taskinRisk ? (
              <div style={{
                padding: "12px",
                borderLeft: `4px solid ${taskinRisk.risk === "yuksek" ? "#2563EB" : taskinRisk.risk === "orta" ? "#0EA5E9" : "#059669"}`,
                background: taskinRisk.risk === "yuksek" ? "#DBEAFE" : taskinRisk.risk === "orta" ? "#E0F2FE" : "#D1FAE5",
                borderRadius: 3,
              }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "4px" }}>
                  <div style={{ fontSize: "9pt", fontWeight: 600, color: "#1B2A4A", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    💧 Taşkın
                  </div>
                  <div style={{ fontSize: "13pt", fontWeight: 700, color: "#1B2A4A", textTransform: "uppercase" }}>
                    {taskinRisk.risk === "yuksek" ? "Yüksek" : taskinRisk.risk === "orta" ? "Orta" : "Düşük"}
                  </div>
                </div>
                <div style={{ fontSize: "8pt", color: "var(--muted)", lineHeight: 1.4 }}>{taskinRisk.not}</div>
              </div>
            ) : (
              <div className="bos-veri" style={{ margin: 0 }}>Taşkın verisi yok</div>
            )}
          </div>

          <p style={{ fontSize: "8pt", color: "var(--muted)", fontStyle: "italic", marginTop: "10px" }}>
            Veri il bazlıdır. Mahalle bazında AFAD Türkiye Deprem Tehlike Haritası ve Çevre Bakanlığı Sel Master Planı'na yönlendirilmiştir.
          </p>
        </section>
      </div>
      )}

      {/* ═══════════════ SAYFA 5 — RİSK LİSTESİ + ÇEVRE (Pro ve üstü) ═══════════════ */}
      {isPro && (
      <div className="rapor-page">
        <header className="rapor-header">
          <div className="brand"><BrandMark /><div className="brand-text">Cadastrum</div></div>
          <div className="meta"><strong>{raporNo}</strong><br />Sayfa 5 / {toplamSayfa}</div>
        </header>

        <div className="rapor-title">
          <h1>Risk Taraması ve Çevre</h1>
          <p className="subtitle">{riskler.length} otomatik uyarı · OSM çevre analizi</p>
        </div>

        {/* Risk listesi */}
        <section className="section">
          <h2>Risk Uyarıları<span className="section-no">11 · Otomatik Tespit</span></h2>

          {/* Risk özet bar */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <div style={{ flex: 1, padding: "8px 12px", background: "#FEE2E2", borderLeft: "3px solid #DC2626", borderRadius: 3 }}>
              <div style={{ fontSize: "8pt", color: "#7F1D1D", textTransform: "uppercase", letterSpacing: "0.05em" }}>Kritik</div>
              <div style={{ fontSize: "16pt", fontWeight: 700, color: "#DC2626" }}>{riskKritik}</div>
            </div>
            <div style={{ flex: 1, padding: "8px 12px", background: "#FEF3C7", borderLeft: "3px solid #D97706", borderRadius: 3 }}>
              <div style={{ fontSize: "8pt", color: "#78350F", textTransform: "uppercase", letterSpacing: "0.05em" }}>Orta</div>
              <div style={{ fontSize: "16pt", fontWeight: 700, color: "#D97706" }}>{riskOrta}</div>
            </div>
            <div style={{ flex: 1, padding: "8px 12px", background: "#DBEAFE", borderLeft: "3px solid #2563EB", borderRadius: 3 }}>
              <div style={{ fontSize: "8pt", color: "#1E3A8A", textTransform: "uppercase", letterSpacing: "0.05em" }}>Bilgi</div>
              <div style={{ fontSize: "16pt", fontWeight: 700, color: "#2563EB" }}>{riskBilgi}</div>
            </div>
          </div>

          {riskler.length === 0 ? (
            <div className="bos-veri">
              ✓ Otomatik tespit edilen kritik risk bulunamadı. Bu, hukuki garanti vermez —
              tapu ve imar belgelerini hukukçu ile inceleyin.
            </div>
          ) : (
            <div className="risk-list">
              {riskler.map((u, i) => (
                <div key={`${u.kod}-${i}`} className={`risk-item ${u.seviye}`}>
                  <div className="risk-header">
                    <div className="risk-title">{u.baslik}</div>
                    <div className="risk-level">{u.seviye}</div>
                  </div>
                  <div className="risk-desc">{u.aciklama}</div>
                  {u.oneri && <div className="risk-oneri">→ {u.oneri}</div>}
                  {u.yasaRef && <div className="risk-yasaref">{u.yasaRef}</div>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Çevre + eğim */}
        {(cevre || egim) && (
          <section className="section">
            <h2>Çevre Analizi<span className="section-no">12 · OSM + Topo</span></h2>
            <div className="data-grid">
              {egim?.ortEgimYuzde != null && (
                <div className="data-row"><span className="label">Ortalama eğim</span><span className="value">%{egim.ortEgimYuzde.toFixed(1)} ({egim.egimKategori})</span></div>
              )}
              {egim?.maxEgimYuzde != null && (
                <div className="data-row"><span className="label">Maksimum eğim</span><span className="value">%{egim.maxEgimYuzde.toFixed(1)}</span></div>
              )}
              {egim?.bakiYonu && (
                <div className="data-row"><span className="label">Bakı yönü</span><span className="value">{egim.bakiYonu}</span></div>
              )}
              {egim?.merkezYukseklikM != null && (
                <div className="data-row"><span className="label">Yükseklik</span><span className="value">{Math.round(egim.merkezYukseklikM)} m</span></div>
              )}
              {cevre?.adres && (
                <div className="data-row"><span className="label">Açık adres</span><span className="value" style={{ fontSize: "9pt" }}>{cevre.adres}</span></div>
              )}
              {cevre?.enYakinlar && cevre.enYakinlar.length > 0 && (
                <div className="data-row" style={{ gridColumn: "1 / -1" }}>
                  <span className="label">En yakın</span>
                  <span className="value" style={{ fontSize: "9pt" }}>
                    {cevre.enYakinlar.slice(0, 4).map(y => `${y.tip} ${Math.round(y.mesafeM)}m`).join(" · ")}
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* TKGM Yıllık Yoğunluk Analizi (Pro+ özel) */}
        {veri.tkgmAnaliz && veri.tkgmAnaliz.tipler.length > 0 && (() => {
          const t = veri.tkgmAnaliz!;
          const maxIslem = Math.max(...t.tipler.map(x => x.toplamIslem), 1);
          const maxTrend = Math.max(...t.trend.map(x => x.sayi), 1);
          const ipotekRengi = t.ipotekOrani >= 50 ? "#D97706" : t.ipotekOrani >= 20 ? "#65A30D" : "#059669";
          return (
            <section className="section">
              <h2>TKGM Yıllık Yoğunluk<span className="section-no">13 · {t.ilceAd} {t.yil}</span></h2>
              <p style={{ fontSize: "9pt", color: "var(--muted)", marginBottom: "10px" }}>
                Tapu ve Kadastro Genel Müdürlüğü resmi alım-satım istatistikleri. Bölgenin likidite ve aktivite göstergesi.
              </p>

              {/* 5 analiz tipi karşılaştırma */}
              <div style={{ display: "grid", gap: 4, marginBottom: 12 }}>
                {t.tipler.map((tip) => {
                  const pct = (tip.toplamIslem / maxIslem) * 100;
                  return (
                    <div key={tip.tip} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "9pt" }}>
                      <div style={{ width: 130, color: "#475569" }}>{tip.etiket}</div>
                      <div style={{ flex: 1, height: 14, background: "#F1F5F9", borderRadius: 2, position: "relative", overflow: "hidden" }}>
                        <div style={{
                          position: "absolute", inset: 0, left: 0,
                          width: `${pct}%`,
                          background: "linear-gradient(90deg, #7C3AED, #5B21B6)",
                          borderRadius: 2,
                        }} />
                      </div>
                      <div style={{ width: 70, textAlign: "right", fontWeight: 600, color: "#5B21B6", fontVariantNumeric: "tabular-nums" }}>
                        {tip.toplamIslem.toLocaleString("tr-TR")}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* İpotek oranı insight */}
              <div style={{
                padding: "10px 12px",
                background: t.ipotekOrani >= 50 ? "#FEF3C7" : t.ipotekOrani >= 20 ? "#ECFCCB" : "#D1FAE5",
                borderLeft: `3px solid ${ipotekRengi}`,
                borderRadius: 3,
                marginBottom: 12,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span style={{ fontSize: "9pt", fontWeight: 600, color: "#1B2A4A" }}>💳 İpotekli Satış Oranı</span>
                  <span style={{ fontSize: "16pt", fontWeight: 700, color: ipotekRengi }}>%{t.ipotekOrani.toFixed(0)}</span>
                </div>
                <div style={{ fontSize: "9pt", color: "var(--ink)", lineHeight: 1.5 }}>
                  {t.ipotekOrani >= 50
                    ? "Bölgede kredili alımlar baskın — alım gücü genelde 1. el konut alıcısı, fiyatlar finansman uygunluğuna duyarlı."
                    : t.ipotekOrani >= 20
                    ? "Karışık alıcı profili — kredi ve peşin alıcılar dengeli."
                    : "Peşin alıcılar baskın — yatırımcı/yabancı sermaye ağırlıklı, fiyat değişikliklerine dirençli."}
                </div>
              </div>

              {/* 5 yıllık trend bar chart */}
              {t.trend.length >= 3 && (
                <div>
                  <div style={{ fontSize: "9pt", fontWeight: 600, color: "#1B2A4A", marginBottom: 6 }}>
                    📈 5 Yıllık Alım-Satım Trendi
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 70 }}>
                    {t.trend.map((tr) => {
                      const pct = (tr.sayi / maxTrend) * 100;
                      const oncekiYil = t.trend[t.trend.indexOf(tr) - 1];
                      const degisim = oncekiYil && oncekiYil.sayi > 0 ? ((tr.sayi - oncekiYil.sayi) / oncekiYil.sayi) * 100 : null;
                      return (
                        <div key={tr.yil} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <div style={{ fontSize: "8pt", fontWeight: 600, color: "#5B21B6" }}>
                            {tr.sayi >= 1000 ? `${(tr.sayi / 1000).toFixed(1)}K` : tr.sayi}
                          </div>
                          <div style={{
                            width: "100%",
                            height: `${Math.max(pct, 4)}%`,
                            background: "linear-gradient(180deg, #A78BFA, #7C3AED)",
                            borderRadius: "2px 2px 0 0",
                          }} />
                          <div style={{ fontSize: "8pt", color: "#94A3B8" }}>{tr.yil}</div>
                          {degisim != null && (
                            <div style={{ fontSize: "7pt", color: degisim > 0 ? "#059669" : degisim < 0 ? "#DC2626" : "#94A3B8" }}>
                              {degisim > 0 ? "+" : ""}{degisim.toFixed(0)}%
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <p style={{ fontSize: "8pt", color: "var(--muted)", fontStyle: "italic", marginTop: 8 }}>
                Kaynak: TKGM cbsapi.tkgm.gov.tr resmi parsel analiz API'si.
              </p>
            </section>
          );
        })()}

        {/* Pro (Pro+ değil) için son sayfa — disclaimer + footer */}
        {isPro && !isProPlus && <DisclaimerFooter uretildiAt={uretildiAt} />}
      </div>
      )}

      {/* Sayfa 6 ve sonrasından önce: tüm tier'larda son sayfaya disclaimer footer'ı koymalıyız */}

      {/* ═══════════════ SAYFA 6 — YATIRIM SKORU + SWOT (sadece Pro+) ═══════════════ */}
      {isProPlus && (
      <div className="rapor-page">
        <header className="rapor-header">
          <div className="brand"><BrandMark /><div className="brand-text">Cadastrum</div></div>
          <div className="meta"><strong>{raporNo}</strong><br />Sayfa 6 / {toplamSayfa}</div>
        </header>

        <div className="rapor-title">
          <h1>Sonuç</h1>
          <p className="subtitle">Yatırım skoru · SWOT analizi</p>
        </div>

        {/* Yatırım skoru — büyük gauge + bileşenler */}
        <section className="section">
          <h2>Yatırım Skoru<span className="section-no">14 · Bileşik Değerlendirme</span></h2>

          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "20px", alignItems: "center" }}>
            <GuvenGauge skor={yatirimSkoru.skor} etiket="100 üzerinden" size={180} />

            <div>
              <div style={{ fontSize: "11pt", marginBottom: "10px", color: "var(--ink)" }}>
                <strong>
                  {yatirimSkoru.skor >= 70 ? "Güçlü yatırım fırsatı" :
                   yatirimSkoru.skor >= 50 ? "Orta seviye fırsat" :
                   yatirimSkoru.skor >= 30 ? "Dikkatli değerlendirilmeli" :
                   "Yüksek riskli"}
                </strong>
              </div>
              <p style={{ fontSize: "9pt", color: "var(--muted)", marginBottom: "12px", lineHeight: 1.5 }}>
                Skor; fiyat tahmin güveni, risk uyarıları, doğal afet zonları, mahalle özellikleri ve imar netliği gibi
                faktörlerin ağırlıklı bileşkesidir. 50 nötr noktadır; üzeri olumlu, altı olumsuz sinyal.
              </p>

              <div style={{ display: "grid", gap: "3px", fontSize: "8.5pt" }}>
                {yatirimSkoru.detay.map((d, i) => (
                  <div key={i} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "3px 8px",
                    background: i % 2 === 0 ? "#fafafa" : "white",
                    borderRadius: 2,
                    borderLeft: `2px solid ${d.etki > 0 ? "#059669" : d.etki < 0 ? "#DC2626" : "#94A3B8"}`,
                  }}>
                    <span>
                      <strong style={{ color: "var(--ink)" }}>{d.etiket}</strong>
                      <span style={{ color: "var(--muted)", marginLeft: "6px", fontSize: "8pt" }}>{d.not}</span>
                    </span>
                    <span style={{ fontFamily: "monospace", fontWeight: 600, color: d.etki > 0 ? "#059669" : d.etki < 0 ? "#DC2626" : "var(--muted)" }}>
                      {d.etki > 0 ? "+" : ""}{d.etki}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* SWOT */}
        <section className="section">
          <h2>SWOT Analizi<span className="section-no">15 · Stratejik Bakış</span></h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {/* Güçlü Yönler */}
            <div style={{ padding: "10px 12px", background: "#ECFCCB", borderLeft: "3px solid #65A30D", borderRadius: 3 }}>
              <div style={{ fontSize: "9pt", fontWeight: 700, color: "#3F6212", marginBottom: "6px", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                ✓ Güçlü Yönler (S)
              </div>
              <ul style={{ paddingLeft: "16px", margin: 0, fontSize: "9pt", color: "var(--ink)", lineHeight: 1.5 }}>
                {swot.guclu.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>

            {/* Zayıf Yönler */}
            <div style={{ padding: "10px 12px", background: "#FEF3C7", borderLeft: "3px solid #D97706", borderRadius: 3 }}>
              <div style={{ fontSize: "9pt", fontWeight: 700, color: "#78350F", marginBottom: "6px", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                ✗ Zayıf Yönler (W)
              </div>
              <ul style={{ paddingLeft: "16px", margin: 0, fontSize: "9pt", color: "var(--ink)", lineHeight: 1.5 }}>
                {swot.zayif.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>

            {/* Fırsatlar */}
            <div style={{ padding: "10px 12px", background: "#DBEAFE", borderLeft: "3px solid #2563EB", borderRadius: 3 }}>
              <div style={{ fontSize: "9pt", fontWeight: 700, color: "#1E3A8A", marginBottom: "6px", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                ↗ Fırsatlar (O)
              </div>
              <ul style={{ paddingLeft: "16px", margin: 0, fontSize: "9pt", color: "var(--ink)", lineHeight: 1.5 }}>
                {swot.firsat.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>

            {/* Tehditler */}
            <div style={{ padding: "10px 12px", background: "#FEE2E2", borderLeft: "3px solid #DC2626", borderRadius: 3 }}>
              <div style={{ fontSize: "9pt", fontWeight: 700, color: "#7F1D1D", marginBottom: "6px", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                ⚠ Tehditler (T)
              </div>
              <ul style={{ paddingLeft: "16px", margin: 0, fontSize: "9pt", color: "var(--ink)", lineHeight: 1.5 }}>
                {swot.tehdit.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          </div>
        </section>

        {/* Veri kaynakları özet */}
        <section className="section">
          <h2>Veri Kaynakları<span className="section-no">16 · Kapsam</span></h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "9pt" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <span style={{ color: "#059669", fontWeight: 700 }}>✓</span>
              <span><strong>TKGM</strong> — Tapu ve Kadastro Genel Müdürlüğü resmi parsel</span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <span style={{ color: ePlan ? "#059669" : "#94a3b8", fontWeight: 700 }}>{ePlan ? "✓" : "○"}</span>
              <span><strong>e-Plan</strong> — ÇŞİDB resmi imar kaydı</span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <span style={{ color: fiyat ? "#059669" : "#94a3b8", fontWeight: 700 }}>{fiyat ? "✓" : "○"}</span>
              <span><strong>Sahibinden + Hepsiemlak</strong> — İlan medyanı</span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <span style={{ color: "#059669", fontWeight: 700 }}>✓</span>
              <span><strong>AFAD</strong> — Türkiye deprem tehlike haritası</span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <span style={{ color: "#059669", fontWeight: 700 }}>✓</span>
              <span><strong>Çevre Bakanlığı</strong> — Sel/taşkın haritası</span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <span style={{ color: cevre ? "#059669" : "#94a3b8", fontWeight: 700 }}>{cevre ? "✓" : "○"}</span>
              <span><strong>OpenStreetMap</strong> — Çevre POI ve mahalle özellik</span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <span style={{ color: "#059669", fontWeight: 700 }}>✓</span>
              <span><strong>TCMB</strong> — Konut Fiyat Endeksi (KFE)</span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <span style={{ color: egim ? "#059669" : "#94a3b8", fontWeight: 700 }}>{egim ? "✓" : "○"}</span>
              <span><strong>Open-Meteo</strong> — Yükseklik ve eğim</span>
            </div>
          </div>
        </section>

        <DisclaimerFooter uretildiAt={uretildiAt} />
      </div>
      )}
    </>
  );
}

/** Cadastrum V3 logo — header ve kapak için inline SVG */
function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <circle cx="32" cy="32" r="30" fill="#1B2A4A"/>
      <path d="M 32 12 A 20 20 0 1 0 50 38" stroke="#FFFFFF" strokeWidth="6" fill="none" strokeLinecap="round"/>
      <circle cx="50" cy="38" r="3.5" fill="#C9A86A" stroke="#1B2A4A" strokeWidth="0.8"/>
      <circle cx="32" cy="32" r="27" fill="none" stroke="#C9A86A" strokeWidth="0.5" opacity="0.5"/>
    </svg>
  );
}

/** Disclaimer + Footer — son sayfada gösterilir, tier'a göre Free uyarısı eklenir. */
function DisclaimerFooter({ uretildiAt, freeUyari }: { uretildiAt: number; freeUyari?: boolean }) {
  return (
    <>
      {freeUyari && (
        <div style={{
          background: "linear-gradient(135deg, #FAF5E8 0%, #F0E4BD 100%)",
          border: "1px solid #C9A86A",
          borderRadius: 4,
          padding: "12px 14px",
          marginTop: "16px",
          marginBottom: "12px",
          fontSize: "9.5pt",
        }}>
          <div style={{ fontWeight: 600, color: "var(--imperial)", marginBottom: 6 }}>
            ✨ Bu rapor Free planında — Pro'da daha çok detay var
          </div>
          <ul style={{ paddingLeft: 18, margin: 0, color: "var(--ink)", lineHeight: 1.7 }}>
            <li><strong>Pro</strong>: Risk uyarıları, OSM çevre analizi, eğim/yükseklik, AI fiyat doğrulaması</li>
            <li><strong>Pro+</strong>: Mahalle bazlı fiyat baseline, coğrafi öznitelikler, doğal afet zonları, yatırım skoru, SWOT analizi</li>
          </ul>
          <div style={{ marginTop: 8, textAlign: "right" }}>
            <a href="https://cadastrum.com.tr/fiyat" style={{
              display: "inline-block",
              padding: "6px 14px",
              background: "var(--imperial)",
              color: "#fff",
              textDecoration: "none",
              borderRadius: 4,
              fontWeight: 600,
              fontSize: "9pt",
            }}>Pro'ya geç →</a>
          </div>
        </div>
      )}
      <div className="disclaimer">
        <strong>⚠ Sorumluluk Reddi</strong>
        Bu rapor Cadastrum tarafından TKGM resmi parsel verisi, e-Plan resmi imar
        kaydı, Sahibinden/Hepsiemlak ilan birikimi ve çoklu kaynak fiyat motoru
        kullanılarak otomatik üretilmiştir. <strong>Ekspertiz raporu, hukuki
        danışmanlık veya yatırım tavsiyesi niteliği taşımaz.</strong> Yatırım
        kararı vermeden önce yetkili gayrimenkul danışmanı, hukukçu ve mali
        müşavirden görüş alınız. Cadastrum, bu rapora dayanarak alınan
        kararlardan doğan zararlardan sorumlu tutulamaz.
      </div>
      <div className="rapor-footer">
        <span>cadastrum.com.tr · Cadastrum Parsel Zekâ Platformu</span>
        <span>{new Date(uretildiAt).getFullYear()} © Tüm hakları saklıdır</span>
      </div>
    </>
  );
}
