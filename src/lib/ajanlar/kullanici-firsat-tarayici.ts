/**
 * Kullanıcı Tanımlı Otonom Fırsat Tarayıcı Motoru (Autonomous Deal Scanner).
 *
 * Kullanıcının belirlediği kriterlere göre (bütçe, konum, kategori, iskonto)
 * ilanları tarar; her ilanı Değerleme + Hukuk + Fırsat Ajanları Konseyi'nden
 * geçirir ve sadece doğrulanmış kelepir fırsatları kullanıcıya sunar.
 */

import type { ParselSorguGirdisi, CokluAjanSentezRaporu } from "./ajan-tipleri";
import { MultiAgentOrkestrator } from "./multi-agent-orkestrator";
import { MultiAgentDebateProtokolu, type DebateSonucu } from "./debate-protokolu";
import { CitationGroundingGuardrail } from "../rag/citation-grounding";

export interface KullaniciAramaKriteri {
  il: string;
  ilce?: string;
  mahalle?: string;
  kategori: "arsa" | "tarla" | "konut";
  minFiyatTL?: number;
  maxFiyatTL?: number;
  minM2?: number;
  maxM2?: number;
  minIskontoYuzde?: number; // Örn: En az %20 indirimli olanlar
  sadeceImarli?: boolean;
  sadeceTemizTapu?: boolean; // Hisseli veya SİT alanlarını ele
}

export interface TarananIlanGirdisi {
  ilanNo: string;
  baslik: string;
  fiyatTL: number;
  m2: number;
  il: string;
  ilce: string;
  mahalle?: string;
  kategori: "arsa" | "tarla" | "konut";
  lat?: number;
  lng?: number;
  imarDurumu?: string;
  ilanUrl?: string;
  aciklama?: string;
}

export interface BulunanFirsatKart {
  ilan: TarananIlanGirdisi;
  sentez: CokluAjanSentezRaporu;
  debate: DebateSonucu;
  iskontoYuzde: number;
  potansiyelKarTL: number;
  efektifSkor: number;
  firsatRozeti: "GÜÇLÜ FIRSAT" | "ŞARTLI ALIM" | "RİSKLİ / PAHALI";
}

export class KullaniciFirsatTarayici {
  private orkestrator = new MultiAgentOrkestrator();
  private debateEngine = new MultiAgentDebateProtokolu();
  private guardrail = new CitationGroundingGuardrail();

  /**
   * Bir grup ilanı kullanıcının kriterlerine göre analiz eder ve filtreler.
   */
  public async ilanlariTara(
    kriter: KullaniciAramaKriteri,
    hamIlanlar: TarananIlanGirdisi[],
    onIlerleme?: (taranan: number, toplam: number) => void
  ): Promise<BulunanFirsatKart[]> {
    const firsatlar: BulunanFirsatKart[] = [];
    const minIskonto = kriter.minIskontoYuzde ?? 15;

    for (let i = 0; i < hamIlanlar.length; i++) {
      const ilan = hamIlanlar[i]!;
      if (onIlerleme) onIlerleme(i + 1, hamIlanlar.length);

      // 1. Temel Filtreler
      if (kriter.minFiyatTL && ilan.fiyatTL < kriter.minFiyatTL) continue;
      if (kriter.maxFiyatTL && ilan.fiyatTL > kriter.maxFiyatTL) continue;
      if (kriter.minM2 && ilan.m2 < kriter.minM2) continue;
      if (kriter.maxM2 && ilan.m2 > kriter.maxM2) continue;

      // İlan metnindeki anahtar kelimeleri tespit et
      const aciklama = (ilan.aciklama ?? "").toLowerCase();
      const hisseliMi = aciklama.includes("hisseli") || aciklama.includes("paylı");
      const sitAlaniMi = aciklama.includes("sit") || aciklama.includes("koruma");
      const zeytinlikMi = aciklama.includes("zeytin") || ilan.kategori === "tarla" && aciklama.includes("zeytin");

      if (kriter.sadeceTemizTapu && (hisseliMi || sitAlaniMi)) {
        continue; // Kullanıcı riskli tapuları istemedi
      }

      const parselGirdisi: ParselSorguGirdisi = {
        il: ilan.il,
        ilce: ilan.ilce,
        mahalle: ilan.mahalle,
        kategori: ilan.kategori,
        alanM2: ilan.m2,
        lat: ilan.lat,
        lng: ilan.lng,
        ilanFiyatiTL: ilan.fiyatTL,
        imarDurumu: ilan.imarDurumu,
        hisseliMi,
        sitAlaniMi,
        zeytinlikMi,
      };

      // 2. Ajan Konseyi Sentezi
      try {
        const sentez = await this.orkestrator.analizEt(parselGirdisi);
        const debate = this.debateEngine.munazaraYurut(parselGirdisi, sentez.hukuk, sentez.firsat);

        // Dipnotları doğrula
        const grounded = this.guardrail.dogrulaVeDipnotEkle(sentez.nihaiTavsiye);
        sentez.nihaiTavsiye = grounded.dipnotluMetin;

        const iskontoYuzde = sentez.firsat.iskontoOraniYuzde;
        const potansiyelKarTL = sentez.firsat.potansiyelKarTL;

        // Fırsat kriteri: İskonto eşiğini geçmeli ve kesin red olmamalı
        if (iskontoYuzde >= minIskonto && debate.konsensusKarari !== "kesin-red") {
          let firsatRozeti: BulunanFirsatKart["firsatRozeti"] = "ŞARTLI ALIM";
          if (debate.konsensusKarari === "guclu-al") firsatRozeti = "GÜÇLÜ FIRSAT";

          firsatlar.push({
            ilan,
            sentez,
            debate,
            iskontoYuzde,
            potansiyelKarTL,
            efektifSkor: debate.efektifFirsatPuani,
            firsatRozeti,
          });
        }
      } catch (err) {
        console.warn("[kullanici-firsat-tarayici] İlan analiz hatası:", ilan.ilanNo, err);
      }
    }

    // En yüksek potansiyel kâr ve efektif skora göre sırala
    return firsatlar.sort((a, b) => b.efektifSkor - a.efektifSkor || b.potansiyelKarTL - a.potansiyelKarTL);
  }
}