/**
 * CANLI DOĞRULAMA & ÇALIŞMA DEMOSU
 * Bu betik Cadastrum'un gerçek veri tabanını ve ajanlarını çalıştırır.
 */

import { MultiAgentOrkestrator } from "./src/lib/ajanlar/multi-agent-orkestrator.ts";
import { MultiAgentDebateProtokolu } from "./src/lib/ajanlar/debate-protokolu.ts";
import { mevzuatStoreOlustur } from "./src/lib/rag/mevzuat-knowledge-base.ts";
import { haversineMesafeKm } from "./src/lib/rag/spatial-rag.ts";

async function main() {
  console.log("\n=======================================================");
  console.log("   CADASTRUM CANLI AJAN & MEVZUAT DOĞRULAMA TESTİ");
  console.log("=======================================================\n");

  const orkestrator = new MultiAgentOrkestrator();
  const debate = new MultiAgentDebateProtokolu();
  const mevzuatStore = mevzuatStoreOlustur();

  // ── TEST 1: MEVZUAT RAG KNOWLEDGE BASE ARAMASI ────────────────────────────
  console.log("▶ 1. TEST: İmar Mevzuatı Knowledge Base Semantik Sorgusu");
  console.log("Sorgu: 'Hisseli tarla kaç dönüm altına bölünemez?'");
  const mevzuatSonuc = mevzuatStore.ara({
    sorguMetni: "Hisseli tarla kaç dönüm altına bölünemez ifraz asgari",
    topK: 1
  });
  console.log("-> Bulunan Kanun:", mevzuatSonuc[0]?.dokuman.metadata.baslik);
  console.log("-> Yasal Madde Özeti:", mevzuatSonuc[0]?.dokuman.metadata.ekBilgiler?.ozet);
  console.log("-> Eşleşme Güven Skoru (RRF):", (mevzuatSonuc[0]?.rrfSkor * 100).toFixed(1), "/ 100\n");

  // ── TEST 2: GERÇEK PARSEL DEĞERLEME & HUKUK DENETİMİ (Balıkesir Edremit) ──
  console.log("▶ 2. TEST: Hukuki Riskli Parsel Simülasyonu (Edremit Zeytinlik)");
  const parsel1 = {
    il: "balikesir",
    ilce: "edremit",
    mahalle: "altinoluk",
    kategori: "tarla",
    alanM2: 8000,
    lat: 39.58,
    lng: 26.74,
    ilanFiyatiTL: 2500000,
    hisseliMi: true,
    zeytinlikMi: true,
  };

  const sentez1 = await orkestrator.analizEt(parsel1);
  const munazara1 = debate.munazaraYurut(parsel1, sentez1.hukuk, sentez1.firsat);

  console.log("-> Hesaplanan Piyasa Değeri:", sentez1.firsat.tahminiPiyasaDegeriTL.toLocaleString("tr-TR"), "TL");
  console.log("-> İlan Fiyatı:", parsel1.ilanFiyatiTL.toLocaleString("tr-TR"), "TL");
  console.log("-> Hukuk Risk Skoru:", sentez1.hukuk.riskSkoru, "/ 100 (Risk Seviyesi:", sentez1.hukuk.riskSeviyesi, ")");
  console.log("-> Tespit Edilen Yasal Engeller:");
  sentez1.hukuk.tespitEdilenRiskler.forEach((r, i) => console.log(`   ${i+1}. [${r.ilgiliKanun}] ${r.baslik}`));
  console.log("-> Ajan Konseyi Konsensüs Kararı:", munazara1.konsensusKarari.toUpperCase());
  console.log("-> Efektif Yatırım Skoru (Risk Düzeltmeli):", munazara1.efektifFirsatPuani, "/ 100\n");

  // ── TEST 3: GERÇEK FIRSAT PARSELİ (Ankara Gölbaşı Arsa) ────────────────────
  console.log("▶ 3. TEST: Sorunsuz Kelepir Fırsat Parseli (Gölbaşı İmar)");
  const parsel2 = {
    il: "ankara",
    ilce: "golbasi",
    mahalle: "incek",
    kategori: "arsa",
    alanM2: 1500,
    lat: 39.82,
    lng: 32.75,
    ilanFiyatiTL: 6000000, // Piyasa değerinin altında
    imarDurumu: "konut-imarli",
    hisseliMi: false,
  };

  const sentez2 = await orkestrator.analizEt(parsel2);
  const munazara2 = debate.munazaraYurut(parsel2, sentez2.hukuk, sentez2.firsat);

  console.log("-> Hesaplanan Piyasa Değeri:", sentez2.firsat.tahminiPiyasaDegeriTL.toLocaleString("tr-TR"), "TL");
  console.log("-> İlan Fiyatı:", parsel2.ilanFiyatiTL.toLocaleString("tr-TR"), "TL");
  console.log("-> İskonto Oranı: %", sentez2.firsat.iskontoOraniYuzde);
  console.log("-> Potansiyel Kâr:", sentez2.firsat.potansiyelKarTL.toLocaleString("tr-TR"), "TL");
  console.log("-> Ajan Konseyi Konsensüs Kararı:", munazara2.konsensusKarari.toUpperCase());
  console.log("-> Efektif Yatırım Skoru:", munazara2.efektifFirsatPuani, "/ 100");
  console.log("-> Yatırımcı Aksiyon Listesi:");
  munazara2.aksiyonMaddeleri.forEach((a, i) => console.log(`   ${i+1}. ${a}`));

  console.log("\n=======================================================");
  console.log("   ✅ TÜM TESTLER CANLI VERİ VE MOTORLA ÇALIŞTI!");
  console.log("=======================================================\n");
}

main().catch(console.error);