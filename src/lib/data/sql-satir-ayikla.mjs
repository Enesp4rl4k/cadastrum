/**
 * SQL VALUES bloğundan satırları ayıklar — TIRNAK FARKINDALIĞIYLA.
 *
 * ── NEDEN AYRI VE NEDEN PAYLAŞILAN ──────────────────────────────────────────
 *
 * Üç ayrı okuyucu (`backtest/real-engine.spec.ts`, `kapsam-raporu.mjs`,
 * `ilce-baseline-gozlem-uret.mjs`) aynı naif regex'i kullanıyordu:
 *
 *     /\(([^()]*)\)/g
 *
 * "Parantez içermeyen parantezli grup" arıyor. Korpus yalnızca sayı ve yer adı
 * taşıdığı sürece çalıştı. Sonra `baslik` kolonu eklendi ve başlıklar parantez
 * içeriyor — "Satılık Arsa (Acil)" gibi. O satırlar bölündü, kolon sayısı
 * tutmadı ve okuyucular onları SESSİZCE ATLADI.
 *
 * ÖLÇÜLDÜ (2026-09-08): korpusta 66.621 ilan varken backtest 53.339 tanesini
 * okuyordu — **%20 kayıp**, hiçbir hata vermeden. Kapsam raporunda da havuzlu
 * mahalle 2.928'den 2.485'e düşmüş görünüyordu; veri artarken kapsamın
 * azalması bu hatayı ele verdi.
 *
 * Bu, projede tekrar tekrar ayıkladığımız sınıfın ta kendisi: yeni bir kolon
 * eklemek, onu okumayan bir yolu sessizce bozuyor.
 *
 * Kuralların ikinci bir kopyasını çıkarmak yerine tek kaynak: bağımlılıksız
 * saf JS, hem TS motorundan hem `scripts/*.mjs`'ten import ediliyor —
 * `mahalle-kanonik-kurallar.mjs` ile aynı desen.
 */

/**
 * Bir `VALUES` bloğunu satırlara böler.
 *
 * Parantez derinliğini sayar ama YALNIZCA tırnak dışındayken — tırnak içinde
 * geçen parantez sıradan bir karakterdir. SQL'de tırnak kaçışı `''` ile
 * yapılır ve bu da doğru işleniyor.
 *
 * @param {string} blok `VALUES` anahtar sözcüğünden sonraki ham metin
 * @returns {string[]} her satırın parantez İÇİ içeriği
 */
export function sqlSatirlariniAyikla(blok) {
  const satirlar = [];
  let derinlik = 0;
  let bas = -1;
  let tirnakta = false;

  for (let i = 0; i < blok.length; i++) {
    const c = blok[i];

    if (tirnakta) {
      // SQL kaçışı: '' → tek tırnak, dizge devam ediyor
      if (c === "'" && blok[i + 1] === "'") { i++; continue; }
      if (c === "'") tirnakta = false;
      continue;
    }

    if (c === "'") { tirnakta = true; continue; }

    if (c === "(") {
      if (derinlik === 0) bas = i + 1;
      derinlik++;
    } else if (c === ")") {
      derinlik--;
      if (derinlik === 0 && bas >= 0) {
        satirlar.push(blok.slice(bas, i));
        bas = -1;
      }
      // Derinlik negatife düşerse blok bozuk; sıfırla ve devam et —
      // tek bozuk satır tüm dosyayı düşürmemeli.
      if (derinlik < 0) derinlik = 0;
    }
  }
  return satirlar;
}

/**
 * Tek bir satırın değerlerini virgülle böler — yine tırnak farkındalığıyla.
 *
 * Ayrı bir fonksiyon çünkü okuyucuların bazıları kolon adına göre eşleme
 * yapıyor ve sıraya güvenmiyor.
 *
 * @param {string} satir parantez içi ham içerik
 * @returns {string[]} tırnakları soyulmuş değerler (`NULL` olduğu gibi kalır)
 */
export function sqlDegerleriniAyir(satir) {
  const out = [];
  let cur = "";
  let tirnakta = false;

  for (let i = 0; i < satir.length; i++) {
    const c = satir[i];
    if (tirnakta) {
      if (c === "'" && satir[i + 1] === "'") { cur += "'"; i++; continue; }
      if (c === "'") { tirnakta = false; continue; }
      cur += c;
    } else if (c === "'") {
      tirnakta = true;
    } else if (c === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

/**
 * Bir SQL dosyasındaki tüm `INSERT INTO ilanlar` bloklarını ayıklar.
 *
 * ── NEDEN BLOK SINIRI DA TIRNAK FARKINDA OLMALI ─────────────────────────────
 *
 * Okuyucular blokları şu regex'le buluyordu:
 *
 *     /INSERT OR IGNORE INTO ilanlar\s*\(([^)]*)\)\s*VALUES([^;]+);/gs
 *
 * `[^;]+` — "noktalı virgüle kadar her şey". Korpus yalnızca sayı ve yer adı
 * taşıdığı sürece doğruydu. Başlık kolonu eklendikten sonra 256 başlık `;`
 * içeriyordu ve o bloklar ORTASINDAN kesildi; kalan satırlar sessizce
 * kayboldu.
 *
 * ÖLÇÜLDÜ (2026-09-08): satır ayrıştırıcısı düzeltildikten SONRA bile 58.307
 * satır okunuyordu, korpusta 66.621 vardı. Kalan 8.314 kaybın sebebi buydu —
 * yani iki ayrı kırılganlık üst üste binmişti ve ilkini düzeltmek ikincisini
 * görünür kıldı.
 *
 * Buradaki tarama tırnak durumunu takip ediyor: `;` yalnızca tırnak DIŞINDA
 * blok sonu sayılıyor.
 *
 * @param {string} metin SQL dosyasının tamamı
 * @returns {Array<{kolonlar: string[], satirlar: string[]}>}
 */
export function sqlBloklariniAyikla(metin) {
  const bloklar = [];
  // Blok BAŞLANGICINI bulmak güvenli: kolon listesi ve VALUES sözcüğü
  // kullanıcı verisi taşımıyor. Riskli olan yalnızca bloğun NEREDE bittiği.
  const basRe = /INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+ilanlar\s*\(([^)]*)\)\s*VALUES/gi;
  let m;
  while ((m = basRe.exec(metin)) !== null) {
    const kolonlar = m[1].split(",").map((k) => k.trim());
    // VALUES'tan sonra, TIRNAK DIŞINDAKİ ilk `;`'ye kadar oku.
    let i = basRe.lastIndex;
    let tirnakta = false;
    while (i < metin.length) {
      const c = metin[i];
      if (tirnakta) {
        if (c === "'" && metin[i + 1] === "'") { i += 2; continue; }
        if (c === "'") tirnakta = false;
      } else if (c === "'") {
        tirnakta = true;
      } else if (c === ";") {
        break;
      }
      i++;
    }
    bloklar.push({
      kolonlar,
      satirlar: sqlSatirlariniAyikla(metin.slice(basRe.lastIndex, i)),
    });
    basRe.lastIndex = i;
  }
  return bloklar;
}
