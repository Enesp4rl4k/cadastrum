/**
 * İMAR DEĞERİNDEKİ JSON KAÇIŞI — sessiz sınıf bölünmesi.
 *
 * `imarDurumuCikar` değeri JSON.parse ile değil regex ile çekiyor, çünkü blob
 * Next.js `__NEXT_DATA__` içinde ve tamamını ayrıştırmak pahalı. Ama bu, JSON'un
 * kendi `\uXXXX` kaçışlarının çözülmediği anlamına geliyordu.
 *
 * ÜRETİMDE ÖLÇÜLDÜ (2026-09-05): "Bağ & Bahçe" iki ayrı imar sınıfına
 * bölünmüştü — 104 kayıt doğru yazımla, 70 kayıt ham kaçışla. Medyanları bile
 * farklıydı (1.478 / 985 TL/m²).
 *
 * Bu KOZMETİK DEĞİL. `emsal-havuzu.ts` emsalleri `imarUyumu` üzerinden
 * puanlıyor; iki yazım farklı sınıf sayıldığı için aynı imar durumundaki
 * ilanlar birbirine emsal olamıyordu. Ve imar_durumu, ilçe-içi arsa fiyat
 * varyansının %60,8'ini açıklayan tek alan — yani bölünmenin bedeli yüksek.
 *
 * DİKKAT — String.raw ŞART. İlk yazımda kaçış düz bir çift tırnaklı dizgeye
 * konmuştu; TypeScript onu DERLEME ANINDA "&" karakterine çeviriyor ve test
 * tautoloji hâline geliyordu (düzeltme kaldırılsa bile geçiyordu). Mutasyon
 * denemesi bunu yakaladı. Kaçış literal kalmalı ki test gerçek girdiyi ölçsün.
 *
 * MUTASYON: `imarDurumuCikar` içindeki `jsonKacisCoz` çağrısı kaldırılırsa
 * ilk test kırılır — doğrulandı.
 */
import { describe, it, expect } from "vitest";
import { imarDurumuCikar, jsonKacisCoz } from "../src/lib/emlakjet-zenginlestirme.js";

/** Üretimdeki blobun birebir biçimi. */
function sayfa(deger: string): string {
  return `<script>{"@type":"PropertyValue","name":"İmar Durumu","value":"${deger}"}</script>`;
}

/**
 * Kaçış dizisini KOD İÇİNDE kuruyoruz: kaynak dosyaya düz yazılan bir
 * `\u0026`, hangi tırnak kullanılırsa kullanılsın araçlar arasında
 * sessizce çözülebiliyor. Tek ters bölüyü ayrı bir parçadan birleştirmek
 * bu belirsizliği tamamen ortadan kaldırıyor.
 */
const TERS_BOLU = "\\";
const KACISLI_VE = TERS_BOLU + "u0026";

describe("imar durumu JSON kaçışı", () => {
  it("kaçışlı ve kaçışsız yazım AYNI sınıfa düşer", () => {
    expect(imarDurumuCikar(sayfa(`Bağ ${KACISLI_VE} Bahçe`))).toBe("Bağ & Bahçe");
    expect(imarDurumuCikar(sayfa("Bağ & Bahçe"))).toBe("Bağ & Bahçe");
  });

  it("kaçışsız değerler bozulmadan geçer", () => {
    expect(imarDurumuCikar(sayfa("Konut İmarlı"))).toBe("Konut İmarlı");
    expect(imarDurumuCikar(sayfa("Tarla"))).toBe("Tarla");
  });

  it("boş/bilinmiyor hâlâ null döner", () => {
    expect(imarDurumuCikar(sayfa("Bilinmiyor"))).toBeNull();
    expect(imarDurumuCikar(sayfa("-"))).toBeNull();
    expect(imarDurumuCikar("<html>alakasız</html>")).toBeNull();
  });

  it("diğer JSON kaçışları da çözülür", () => {
    expect(jsonKacisCoz(`a ${KACISLI_VE} b`)).toBe("a & b");
    expect(jsonKacisCoz(TERS_BOLU + '"tirnak' + TERS_BOLU + '"')).toBe('"tirnak"');
    expect(jsonKacisCoz("ters" + TERS_BOLU + TERS_BOLU + "bolu")).toBe("ters" + TERS_BOLU + "bolu");
  });
});
