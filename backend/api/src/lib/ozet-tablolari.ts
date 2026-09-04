/**
 * Önden hesaplanmış özet tabloları — sıcak yoldaki tam tablo taramalarını
 * günde bir kez yapılan toplu işe taşır.
 *
 * NEDEN: Cloudflare D1 ücretsiz katmanı günde 5M satır okuma veriyor ve
 * 2026-09-04'te bu limit doldu. Sistemin kullanıcısı yok; yük tamamen cron ve
 * birkaç uçtan geliyordu. İki sorgu tek başına bütçeyi eritiyordu:
 *
 *   /v1/fiyat/toplu-ozet   → 188.697 satırlık GROUP BY, her cache-miss'te
 *   zenginleştirme kuyruğu → iki CTE tam tarama + JOIN, SAATLİK
 *
 * Yazma bütçesi (100k/gün) bol, okuma darboğaz. O yüzden ağır agregasyon günde
 * bir kez yapılıp küçük tablolara yazılıyor; sıcak yol o tabloları okuyor.
 *
 * Tablolar: migration 0032_okuma_butcesi.sql
 */

const KATEGORILER = ["arsa", "tarla", "konut"] as const;

export interface OzetKurulumSonucu {
  yazilan: number;
  sure_ms: number;
}

/**
 * `il_fiyat_ozet` tablosunu yeniden kurar.
 *
 * Ölçülmüş (`il_istatistik`) ve türetilmiş (`mahalle_baseline_ai`) değerler
 * AYRI kolonlara yazılır. Tek bir "medyan" kolonu, uç noktasının hangisini
 * sunduğunu gizler ve "AI tahminini gerçek ilan sanma" hatasını kolaylaştırırdı
 * — nitekim eski kod, AI satırlarında `ilan_adet` alanına türetilmiş SATIR
 * sayısını yazıyor ve harita bunu "650 ilan" diye gösteriyordu.
 */
export async function ilFiyatOzetiKur(db: D1Database): Promise<OzetKurulumSonucu> {
  const t0 = Date.now();
  const simdi = Date.now();
  let yazilan = 0;

  // TEK TARAMA, kategori bazında gruplanmış.
  //
  // İlk hâli kategori başına ayrı sorgu atıyordu: `mahalle_baseline_ai` (188.697
  // satır) üç kez taranıyordu. Ölçüldü — üretimde bu işin tek seferlik maliyeti
  // 755.936 satır okuma, yani günlük 5M bütçenin %15'i. Her gece tekrarlanacak
  // bir iş için kabul edilemez; `GROUP BY kategori, il_norm` ile tek tarama
  // aynı sonucu ~üçte bir maliyetle veriyor.
  const olculen = await db.prepare(
    `SELECT kategori, il_norm, medyan, ilan_adet FROM il_istatistik`,
  ).all<{ kategori: string; il_norm: string; medyan: number | null; ilan_adet: number | null }>();

  const turetilen = await db.prepare(
    `SELECT kategori, il_norm, AVG(tlm2) AS medyan, COUNT(*) AS adet
     FROM mahalle_baseline_ai GROUP BY kategori, il_norm`,
  ).all<{ kategori: string; il_norm: string; medyan: number | null; adet: number }>();

  // Ayrac "|": kategori ve il_norm normalize edilmis ASCII, bu karakteri
  // tasiyamazlar. Bosluk ayraci kirilgan olurdu — bosluklu bir deger gelirse
  // sessizce yanlis parcalanir.
  const anahtar = (kat: string, il: string) => `${kat}|${il}`;
  const olcMap = new Map<string, { medyan: number | null; adet: number }>();
  for (const r of (olculen.results ?? [])) {
    olcMap.set(anahtar(r.kategori, r.il_norm), { medyan: r.medyan, adet: r.ilan_adet ?? 0 });
  }
  const turMap = new Map<string, { medyan: number | null; adet: number }>();
  for (const r of (turetilen.results ?? [])) {
    turMap.set(anahtar(r.kategori, r.il_norm), { medyan: r.medyan, adet: r.adet });
  }

  const ifadeler: D1PreparedStatement[] = [];
  for (const k of new Set([...olcMap.keys(), ...turMap.keys()])) {
    const [kategori, il] = k.split("|") as [string, string];
    if (!KATEGORILER.includes(kategori as (typeof KATEGORILER)[number])) continue;
    const o = olcMap.get(k);
    const t = turMap.get(k);
    ifadeler.push(
      db.prepare(
        `INSERT OR REPLACE INTO il_fiyat_ozet
           (kategori, il_norm, medyan_ilan, adet_ilan, medyan_ai, mahalle_ai_adet, guncellendi)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(kategori, il, o?.medyan ?? null, o?.adet ?? 0, t?.medyan ?? null, t?.adet ?? 0, simdi),
    );
  }
  // D1 batch üst sınırı için parçala.
  const PARTI = 100;
  for (let i = 0; i < ifadeler.length; i += PARTI) {
    await db.batch(ifadeler.slice(i, i + PARTI));
    yazilan += Math.min(PARTI, ifadeler.length - i);
  }

  return { yazilan, sure_ms: Date.now() - t0 };
}

/**
 * `zenginlestirme_kuyruk` tablosunu yeniden kurar.
 *
 * Saatlik cron eskiden her turda `ilanlar` üzerinde iki ayrı GROUP BY tam
 * tarama yapıp ikisini JOIN'liyordu. Aynı bilgi günde bir kez hesaplanıp
 * burada tutuluyor; saatlik tur indeksli küçük tabloyu okuyor ve işlediği
 * kadar `islenen` sayacını artırıyor.
 *
 * Gün içinde sayaç artırıldığı için kuyruk gerçekle senkron kalır; günlük
 * yeniden kurulum birikmiş kaymayı sıfırlar.
 */
export async function zenginlestirmeKuyruguKur(db: D1Database): Promise<OzetKurulumSonucu> {
  const t0 = Date.now();
  const simdi = Date.now();

  // İki tam tarama — günde bir kez. Saatlik yolda hiç tarama yok.
  const satirlar = await db.prepare(
    `SELECT il_norm, ilce_norm, mahalle_norm,
            COUNT(*) AS toplam,
            SUM(CASE WHEN zenginlestirildi IS NOT NULL THEN 1 ELSE 0 END) AS islenen
     FROM ilanlar
     WHERE kaynak = 'emlakjet' AND aktif = 1 AND mahalle_norm IS NOT NULL
     GROUP BY il_norm, ilce_norm, mahalle_norm`,
  ).all<{ il_norm: string; ilce_norm: string; mahalle_norm: string; toplam: number; islenen: number }>();

  const liste = satirlar.results ?? [];
  // Eski satırlar silinir: mahalle tamamen boşalmışsa kuyrukta kalmamalı.
  await db.prepare(`DELETE FROM zenginlestirme_kuyruk`).run();

  let yazilan = 0;
  const PARTI = 100;
  for (let i = 0; i < liste.length; i += PARTI) {
    const dilim = liste.slice(i, i + PARTI);
    await db.batch(
      dilim.map((r) =>
        db.prepare(
          `INSERT OR REPLACE INTO zenginlestirme_kuyruk
             (il_norm, ilce_norm, mahalle_norm, toplam, islenen, guncellendi)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(r.il_norm, r.ilce_norm, r.mahalle_norm, r.toplam, r.islenen ?? 0, simdi),
      ),
    );
    yazilan += dilim.length;
  }

  return { yazilan, sure_ms: Date.now() - t0 };
}
