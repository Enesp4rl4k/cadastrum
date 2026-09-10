/**
 * Content Parser Fixture Testleri
 *
 * sahibinden.ts, hepsiemlak.ts ve emlakjet.ts content parser'ları için
 * DOM snapshot/fixture tabanlı regresyon ve dayanıklılık testleri.
 *
 * AMAÇ:
 * Portal sağlayıcıları CSS class'larını, tablo yapılarını veya JSON-LD formatlarını
 * değiştirdiğinde parser'ların sessizce boş/hatalı veri üretmesini engellemek.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { parselDOM as parselSahibinden } from "../src/content/sahibinden";
import { parselDOM as parselHepsiemlak } from "../src/content/hepsiemlak";
import { parselDOM as parselEmlakjet } from "../src/content/emlakjet";

describe("Content Script Parser Fixture Tests", () => {
  let dom: JSDOM;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalLocation = globalThis.location;
  const originalHTMLElement = globalThis.HTMLElement;

  afterEach(() => {
    // Restore global DOM
    // @ts-expect-error global restore
    globalThis.document = originalDocument;
    // @ts-expect-error global restore
    globalThis.window = originalWindow;
    // @ts-expect-error global restore
    globalThis.location = originalLocation;
    // @ts-expect-error global restore
    globalThis.HTMLElement = originalHTMLElement;
  });

  function setupDOM(html: string, url: string) {
    dom = new JSDOM(html, { url });
    // @ts-expect-error global mock
    globalThis.document = dom.window.document;
    // @ts-expect-error global mock
    globalThis.window = dom.window;
    // @ts-expect-error global mock
    globalThis.location = dom.window.location;
    // @ts-expect-error global mock
    globalThis.HTMLElement = dom.window.HTMLElement;
    // @ts-expect-error global mock
    globalThis.Element = dom.window.Element;
    // @ts-expect-error global mock
    globalThis.HTMLAnchorElement = dom.window.HTMLAnchorElement;
  }

  describe("Sahibinden Parser (sahibinden.ts)", () => {
    it("Klasik ul.classifiedInfoList yapısından tüm kritik alanları çıkarır", () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <script type="application/ld+json">
          {
            "@type": "RealEstateListing",
            "name": "Çatalca Nakkaş Köyünde Yatırımlık İmarlı Arsa",
            "geo": {
              "latitude": 41.215,
              "longitude": 28.452
            }
          }
          </script>
        </head>
        <body>
          <div class="classifiedDetailTitle">
            <h1 class="classifiedTitle">Çatalca Nakkaş Köyünde Yatırımlık İmarlı Arsa</h1>
          </div>
          <div class="classifiedInfo">
            <div class="classified-price-wrapper">
              <span class="classified-price">3.250.000 TL</span>
            </div>
            <ul class="classifiedInfoList">
              <li><strong>İlan No</strong> <span>1122334455</span></li>
              <li><strong>İlan Tarihi</strong> <span>01 Eylül 2026</span></li>
              <li><strong>Emlak Tipi</strong> <span>Satılık Arsa</span></li>
              <li><strong>İmar Durumu</strong> <span>Konut</span></li>
              <li><strong>m²</strong> <span>750 m²</span></li>
              <li><strong>Ada No</strong> <span>142</span></li>
              <li><strong>Parsel No</strong> <span>18</span></li>
              <li><strong>Pafta No</strong> <span>F21C12A</span></li>
            </ul>
          </div>
          <ul class="breadcrumb">
            <li><a href="/">Ana Sayfa</a></li>
            <li><a href="/arsa">Arsa</a></li>
            <li><a href="/satilik-arsa">Satılık</a></li>
            <li><a href="/satilik-arsa-istanbul">İstanbul</a></li>
            <li><a href="/satilik-arsa-istanbul-catalca">Çatalca</a></li>
            <li><a href="/satilik-arsa-istanbul-catalca-nakkas">Nakkaş Mh.</a></li>
          </ul>
          <div id="classifiedDescription">
            Yatırıma uygun, yolu açık, ada 142 parsel 18 nolu gayrimenkul.
          </div>
        </body>
        </html>
      `;

      setupDOM(html, "https://www.sahibinden.com/ilan/emlak-arsa-satilik-catalca-nakkas-1122334455/detay");
      const ilan = parselSahibinden();

      expect(ilan.kaynak).toBe("sahibinden");
      expect(ilan.ilanNo).toBe("1122334455");
      expect(ilan.baslik).toContain("Çatalca Nakkaş");
      expect(ilan.fiyat).toBe(3250000);
      expect(ilan.paraBirimi).toBe("TL");
      expect(ilan.m2).toBe(750);
      expect(ilan.adaNo).toBe(142);
      expect(ilan.parselNo).toBe(18);
      expect(ilan.pafta).toBe("F21C12A");
      expect(ilan.imarDurumu).toBe("Konut");
      expect(ilan.il).toBe("İstanbul");
      expect(ilan.ilce).toBe("Çatalca");
      expect(ilan.mahalle).toBe("Nakkaş");
      expect(ilan.lat).toBe(41.215);
      expect(ilan.lng).toBe(28.452);
    });

    it("CSS Obfuscation durumunda Pattern 4 etiket eşlemesi ile parse eder", () => {
      // Sahibinden class isimlerini rastgele hash yaptığında class'lar uyuşmaz
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <h1>Silivri Değirmenköy İmarlı 1000m2</h1>
          <div>
            <span class="random_hash_price">4.500.000 TL</span>
          </div>
          <div class="random_container_xyz">
            <div>
              <strong>İlan No</strong>
              <span>987654321</span>
            </div>
            <div>
              <strong>Metrekare</strong>
              <span>1.000 m²</span>
            </div>
            <div>
              <strong>Ada No</strong>
              <span>305</span>
            </div>
            <div>
              <strong>Parsel No</strong>
              <span>12</span>
            </div>
            <div>
              <strong>İmar Durumu</strong>
              <span>Ticari + Konut</span>
            </div>
          </div>
          <div>
            <a href="#">İstanbul</a>
            <a href="#">Silivri</a>
            <a href="#">Değirmenköy Mh.</a>
          </div>
        </body>
        </html>
      `;

      setupDOM(html, "https://www.sahibinden.com/ilan/arsa-satilik-istanbul-silivri-degirmenkoy-987654321/detay");
      const ilan = parselSahibinden();

      expect(ilan.ilanNo).toBe("987654321");
      expect(ilan.fiyat).toBe(4500000);
      expect(ilan.m2).toBe(1000);
      expect(ilan.adaNo).toBe(305);
      expect(ilan.parselNo).toBe(12);
      expect(ilan.imarDurumu).toBe("Ticari + Konut");
      expect(ilan.il).toBe("İstanbul");
      expect(ilan.ilce).toBe("Silivri");
    });
  });

  describe("Hepsiemlak Parser (hepsiemlak.ts)", () => {
    it("Standart Hepsiemlak detay sayfasını eksiksiz parse eder", () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <script type="application/ld+json">
          {
            "@type": "RealEstateListing",
            "name": "Bodrum Yalıkavak Satılık Villa Arsası",
            "geo": {
              "latitude": 37.105,
              "longitude": 27.291
            }
          }
          </script>
        </head>
        <body>
          <h1 class="det-title fontRB">Bodrum Yalıkavak Satılık Villa Arsası</h1>
          <div class="price-section">
            <span class="detail-price">18.500.000 TL</span>
          </div>
          <section class="properties-wrapper">
            <ul class="short-info-list">
              <li><span class="txt">İlan No</span><span class="val">120239-3336</span></li>
              <li><span class="txt">Metrekare</span><span class="val">1.250 m²</span></li>
              <li><span class="txt">İmar Durumu</span><span class="val">Villa İmarlı</span></li>
              <li><span class="txt">Ada / Parsel No</span><span class="val">214 / 5</span></li>
              <li><span class="txt">Kaks (Emsal)</span><span class="val">0.20</span></li>
              <li><span class="txt">Gabari</span><span class="val">6.50</span></li>
            </ul>
          </section>
          <ul class="breadcrumb-list">
            <li><a href="/mugla-satilik">Muğla</a></li>
            <li><a href="/mugla-bodrum-satilik">Bodrum</a></li>
            <li><a href="/mugla-bodrum-yalikavak-satilik">Yalıkavak</a></li>
          </ul>
          <div class="description-content">
            Yalıkavak marinaya yakın harika konumda ada:214 parsel:5.
          </div>
        </body>
        </html>
      `;

      setupDOM(html, "https://www.hepsiemlak.com/mugla-bodrum-yalikavak-satilik/arsa/120239-3336");
      const ilan = parselHepsiemlak();

      expect(ilan.kaynak).toBe("hepsiemlak");
      expect(ilan.ilanNo).toBe("120239-3336");
      expect(ilan.baslik).toContain("Bodrum Yalıkavak");
      expect(ilan.fiyat).toBe(18500000);
      expect(ilan.m2).toBe(1250);
      expect(ilan.adaNo).toBe(214);
      expect(ilan.parselNo).toBe(5);
      expect(ilan.imarDurumu).toBe("Villa İmarlı");
      expect(ilan.il).toBe("Muğla");
      expect(ilan.ilce).toBe("Bodrum");
      expect(ilan.mahalle).toBe("Yalıkavak");
      expect(ilan.lat).toBe(37.105);
      expect(ilan.lng).toBe(27.291);
    });
  });

  describe("Emlakjet Parser (emlakjet.ts)", () => {
    it("Emlakjet detay sayfasından tablo, JSON-LD ve lokasyon çıkarır", () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <script type="application/ld+json">
          {
            "@type": "Product",
            "name": "Ankara Gölbaşı İncek Satılık Konut Arsası",
            "geo": {
              "latitude": 39.812,
              "longitude": 32.743
            }
          }
          </script>
        </head>
        <body>
          <h1 class="styles_title__abc">Ankara Gölbaşı İncek Satılık Konut Arsası</h1>
          <div data-testid="price">8.750.000 TL</div>
          <div class="styles_featuresTable__xyz">
            <div class="styles_row">
              <span class="styles_label">İlan Numarası</span>
              <span class="styles_value">19680530</span>
            </div>
            <div class="styles_row">
              <span class="styles_label">Metrekare</span>
              <span class="styles_value">850 m2</span>
            </div>
            <div class="styles_row">
              <span class="styles_label">İmar Durumu</span>
              <span class="styles_value">Konut İmarlı</span>
            </div>
            <div class="styles_row">
              <span class="styles_label">Ada No</span>
              <span class="styles_value">1024</span>
            </div>
            <div class="styles_row">
              <span class="styles_label">Parsel No</span>
              <span class="styles_value">8</span>
            </div>
          </div>
          <div class="styles_breadcrumbs__123">
            <a href="/satilik-arsa/ankara">Ankara</a>
            <a href="/satilik-arsa/ankara-golbasi">Gölbaşı</a>
            <a href="/satilik-arsa/ankara-golbasi-incek-mahallesi">İncek Mahallesi</a>
          </div>
        </body>
        </html>
      `;

      setupDOM(html, "https://www.emlakjet.com/ilan/ankara-golbasi-incek-konut-arsasi-19680530");
      const ilan = parselEmlakjet();

      expect(ilan.kaynak).toBe("emlakjet");
      expect(ilan.ilanNo).toBe("19680530");
      expect(ilan.baslik).toContain("Ankara Gölbaşı İncek");
      expect(ilan.fiyat).toBe(8750000);
      expect(ilan.m2).toBe(850);
      expect(ilan.adaNo).toBe(1024);
      expect(ilan.parselNo).toBe(8);
      expect(ilan.imarDurumu).toBe("Konut İmarlı");
      expect(ilan.il).toBe("Ankara");
      expect(ilan.ilce).toBe("Gölbaşı");
      expect(ilan.mahalle).toBe("İncek");
      expect(ilan.lat).toBe(39.812);
      expect(ilan.lng).toBe(32.743);
    });
  });
});
