/**
 * GraphRAG & İmar Hukuku Bilgi Grafı (Knowledge Graph Engine).
 *
 * Prensip:
 *   İmar mevzuatı, plan hiyerarşisi, koruma kurulları ve mahkeme içtihatları arasındaki
 *   ilişkisel zincirleri (Node & Edge Traversal) modelleyerek çok adımlı hukuki çıkarım yapar.
 */

export type DugumTipi =
  | "parsel"
  | "plan_100k"
  | "plan_5k"
  | "plan_1k"
  | "kanun"
  | "kurul"
  | "kisitlama"
  | "ictihat";

export type IliskiTipi =
  | "TABIDIR"
  | "KISITLAR"
  | "ICERIR"
  | "ISTISNA_TANIMLAR"
  | "EMSAL_TESKIL_EDER"
  | "YETKILIDIR";

export interface GrafDugumu {
  id: string;
  tip: DugumTipi;
  baslik: string;
  detay: string;
  metadata?: Record<string, unknown>;
}

export interface GrafKenari {
  kaynakId: string;
  hedefId: string;
  iliski: IliskiTipi;
  aciklama: string;
  onemDerecesi: "kritik" | "onemli" | "bilgi";
}

export interface GrafZincirCikarimi {
  zincir: string[];
  sonucKisitlamasi: string;
  onemDerecesi: "kritik" | "onemli" | "bilgi";
  yasalDayanak: string;
}

export class ImarKnowledgeGraph {
  private dugumler: Map<string, GrafDugumu> = new Map();
  private kenarlar: GrafKenari[] = [];

  constructor() {
    this.varsayilanGrafiYukle();
  }

  public dugumEkle(dugum: GrafDugumu): void {
    this.dugumler.set(dugum.id, dugum);
  }

  public kenarEkle(kenar: GrafKenari): void {
    this.kenarlar.push(kenar);
  }

  /**
   * Bir düğümden başlayarak ilişkili tüm hukuki zincirleri gezinir (Graph Traversal).
   */
  public zincirleriBul(baslangicId: string, maxDerinlik = 3): GrafZincirCikarimi[] {
    const cikarimlar: GrafZincirCikarimi[] = [];
    const ziyaretEdilen = new Set<string>();

    const dfs = (suankiId: string, yol: string[], derinlik: number) => {
      if (derinlik > maxDerinlik || ziyaretEdilen.has(suankiId)) return;
      ziyaretEdilen.add(suankiId);

      const bagliKenarlar = this.kenarlar.filter((k) => k.kaynakId === suankiId);

      for (const k of bagliKenarlar) {
        const hedefDugum = this.dugumler.get(k.hedefId);
        if (!hedefDugum) continue;

        const yeniYol = [...yol, `-[${k.iliski}]-> ${hedefDugum.baslik}`];

        if (hedefDugum.tip === "kisitlama" || hedefDugum.tip === "ictihat") {
          cikarimlar.push({
            zincir: yeniYol,
            sonucKisitlamasi: hedefDugum.detay,
            onemDerecesi: k.onemDerecesi,
            yasalDayanak: hedefDugum.metadata?.kanunNo ? `${hedefDugum.metadata.kanunNo} SK` : "Mevzuat",
          });
        }

        dfs(k.hedefId, yeniYol, derinlik + 1);
      }

      ziyaretEdilen.delete(suankiId);
    };

    const kokDugum = this.dugumler.get(baslangicId);
    if (kokDugum) {
      dfs(baslangicId, [kokDugum.baslik], 1);
    }

    return cikarimlar;
  }

  private varsayilanGrafiYukle(): void {
    // 1. Düğümler
    this.dugumEkle({ id: "tarim_alani", tip: "plan_100k", baslik: "1/100.000 ÇDP: Tarımsal Alan", detay: "Çevre Düzeni Planında Tarımsal Niteliği Korunacak Alan" });
    this.dugumEkle({ id: "kanun_5403", tip: "kanun", baslik: "5403 Sayılı Toprak Koruma Kanunu", detay: "Tarım Arazilerinin Korunması ve Kullanımı", metadata: { kanunNo: "5403" } });
    this.dugumEkle({ id: "kisit_ifraz", tip: "kisitlama", baslik: "Bölünemez Parsel Kısıtlaması", detay: "20.000 m² altındaki tarlalar hisselendirilemez ve bölünemez.", metadata: { kanunNo: "5403" } });

    this.dugumEkle({ id: "zeytin_alani", tip: "plan_100k", baslik: "Zeytinlik Koruma Bölgesi", detay: "3573 Sayılı Kanun Kapsamındaki Alanlar" });
    this.dugumEkle({ id: "kanun_3573", tip: "kanun", baslik: "3573 Sayılı Zeytincilik Kanunu", detay: "Zeytinliklerin Islahı ve Korunması", metadata: { kanunNo: "3573" } });
    this.dugumEkle({ id: "kisit_sanayi_yasagi", tip: "kisitlama", baslik: "3 Km Sanayi & Tesis Yasağı", detay: "Zeytinlik sahalarına 3 km mesafede konut/sanayi tesisi yapılamaz.", metadata: { kanunNo: "3573" } });

    this.dugumEkle({ id: "sit_derece_1", tip: "kisitlama", baslik: "1. Derece Doğal SİT", detay: "Kesin Yapılaşma Yasağı — Çivi dahi çakılamaz.", metadata: { kanunNo: "2863" } });
    this.dugumEkle({ id: "koruma_kurulu", tip: "kurul", baslik: "Kültür ve Tabiat Varlıklarını Koruma Kurulu", detay: "Bölge Koruma Kurulu Onay Makamı" });

    // 2. Kenarlar (İlişkiler)
    this.kenarEkle({ kaynakId: "tarim_alani", hedefId: "kanun_5403", iliski: "TABIDIR", aciklama: "Tarımsal plan alanları 5403 SK hükümlerine bağlıdır.", onemDerecesi: "kritik" });
    this.kenarEkle({ kaynakId: "kanun_5403", hedefId: "kisit_ifraz", iliski: "KISITLAR", aciklama: "Asgari büyüklük altındaki parsel satışını kısıtlar.", onemDerecesi: "kritik" });

    this.kenarEkle({ kaynakId: "zeytin_alani", hedefId: "kanun_3573", iliski: "TABIDIR", aciklama: "Zeytin alanları 3573 SK'ya tabidir.", onemDerecesi: "kritik" });
    this.kenarEkle({ kaynakId: "kanun_3573", hedefId: "kisit_sanayi_yasagi", iliski: "KISITLAR", aciklama: "3 km çevresinde sanayi ve plansız yapılaşmayı yasaklar.", onemDerecesi: "kritik" });

    this.kenarEkle({ kaynakId: "sit_derece_1", hedefId: "koruma_kurulu", iliski: "YETKILIDIR", aciklama: "Tüm işlemler kurul iznine tabidir.", onemDerecesi: "kritik" });
  }
}