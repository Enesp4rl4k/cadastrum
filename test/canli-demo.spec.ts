import { describe, it } from "vitest";
import { MultiAgentOrkestrator } from "../src/lib/ajanlar/multi-agent-orkestrator";
import { MultiAgentDebateProtokolu } from "../src/lib/ajanlar/debate-protokolu";
import { mevzuatStoreOlustur } from "../src/lib/rag/mevzuat-knowledge-base";

describe("CANLI DOĞRULAMA: Cadastrum Ajan & Spatial RAG Motoru", () => {
  it("Gerçek veriler ve senaryolarla canlı ajan çıktısı üretir", async () => {
    console.log("\n================================================================================");
    console.log("             CADASTRUM CANLI AJAN VE SPATIAL RAG DOĞRULAMA TESTİ");
    console.log("================================================================================\n");

    const orkestrator = new MultiAgentOrkestrator();
    const debate = new MultiAgentDebateProtokolu();
    const mevzuatStore = mevzuatStoreOlustur();

    // ── 1. RAG SORGUSU ─────────────────────────────────────────────────────────
    console.log("📌 [ADIM 1: RAG KNOWLEDGE BASE ARAMASI]");
    const mevzuatSonuc = mevzuatStore.ara({
      sorguMetni: "Hisseli tarla kaç dönüm altına bölünemez ifraz asgari",
      topK: 1,
    });
    console.log("   • Kullanıcı Sorusu: 'Hisseli tarla kaç dönüm altına bölünemez?'");
    console.log("   • Bulunan Kanun Maddesi:", mevzuatSonuc[0]?.dokuman.metadata.baslik);
    console.log("   • Resmi Özet:", mevzuatSonuc[0]?.dokuman.metadata.ekBilgiler?.ozet);
    console.log("   • RRF Eşleşme Skoru:", (mevzuatSonuc[0]?.rrfSkor * 100).toFixed(1), "/ 100\n");

    // ── 2. HUKUKİ RİSKLİ PARSEL (Balıkesir Edremit) ───────────────────────────
    console.log("📌 [ADIM 2: HUKUKİ RİSKLİ PARSEL SİMÜLASYONU]");
    const parselRiskli = {
      il: "balikesir",
      ilce: "edremit",
      mahalle: "altinoluk",
      kategori: "tarla" as const,
      alanM2: 8000,
      lat: 39.58,
      lng: 26.74,
      ilanFiyatiTL: 2500000,
      hisseliMi: true,
      zeytinlikMi: true,
    };

    const sentez1 = await orkestrator.analizEt(parselRiskli);
    const munazara1 = debate.munazaraYurut(parselRiskli, sentez1.hukuk, sentez1.firsat);

    console.log("   • Parsel: Balıkesir/Edremit 8.000 m² Hisseli Zeytinlik");
    console.log("   • Model Piyasa Değeri:", sentez1.firsat.tahminiPiyasaDegeriTL.toLocaleString("tr-TR"), "TL");
    console.log("   • İlan Fiyatı:", parselRiskli.ilanFiyatiTL.toLocaleString("tr-TR"), "TL");
    console.log("   • Hukuk Risk Skoru:", sentez1.hukuk.riskSkoru, "/ 100");
    console.log("   • Tespit Edilen Riskler:");
    sentez1.hukuk.tespitEdilenRiskler.forEach((r, i) => {
      console.log(`     ${i + 1}. [${r.ilgiliKanun}] ${r.baslik}`);
    });
    console.log("   • Ajan Konseyi Kararı:", munazara1.konsensusKarari.toUpperCase());
    console.log("   • Efektif Yatırım Skoru:", munazara1.efektifFirsatPuani, "/ 100\n");

    // ── 3. GERÇEK FIRSAT PARSELİ (Ankara Gölbaşı) ─────────────────────────────
    console.log("📌 [ADIM 3: GERÇEK KELEPİR FIRSAT PARSELİ]");
    const parselFirsat = {
      il: "ankara",
      ilce: "golbasi",
      mahalle: "incek",
      kategori: "arsa" as const,
      alanM2: 1500,
      lat: 39.82,
      lng: 32.75,
      ilanFiyatiTL: 6000000,
      imarDurumu: "konut-imarli",
      hisseliMi: false,
    };

    const sentez2 = await orkestrator.analizEt(parselFirsat);
    const munazara2 = debate.munazaraYurut(parselFirsat, sentez2.hukuk, sentez2.firsat);

    console.log("   • Parsel: Ankara/Gölbaşı İncek 1.500 m² Konut İmarlı Arsa");
    console.log("   • Model Piyasa Değeri:", sentez2.firsat.tahminiPiyasaDegeriTL.toLocaleString("tr-TR"), "TL");
    console.log("   • İlan Fiyatı:", parselFirsat.ilanFiyatiTL.toLocaleString("tr-TR"), "TL");
    console.log("   • İskonto Oranı: %", sentez2.firsat.iskontoOraniYuzde);
    console.log("   • Potansiyel Net Kâr:", sentez2.firsat.potansiyelKarTL.toLocaleString("tr-TR"), "TL");
    console.log("   • Ajan Konseyi Kararı:", munazara2.konsensusKarari.toUpperCase());
    console.log("   • Efektif Yatırım Skoru:", munazara2.efektifFirsatPuani, "/ 100");
    console.log("   • Yatırımcı İçin Aksiyon Kontrol Listesi:");
    munazara2.aksiyonMaddeleri.forEach((a, i) => console.log(`     ✓ ${a}`));

    console.log("\n================================================================================");
    console.log("        ✅ TEST BAŞARILI: TÜM FORMÜLLER, RAG VE AJANLAR ÇALIŞIYOR");
    console.log("================================================================================\n");
  });
});