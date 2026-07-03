/**
 * Rapor sekmesi giriş noktası.
 * Side panel chrome.storage.local'a RaporVerisi yazıp bu sayfayı açar.
 * Burada veriyi okuyup saf `raporHtmlUret` üretecini çalıştırır ve tüm dokümanı yazar
 * (aynı üreteç backend shareable-link'te de kullanılır — tek kaynak).
 */
import { raporVerisiniOku } from "../lib/rapor-data";
import { raporHtmlUret } from "../lib/rapor-html";

async function goster(): Promise<void> {
  const root = document.getElementById("rapor-root");
  try {
    const veri = await raporVerisiniOku();
    if (!veri) {
      if (root) {
        root.innerHTML =
          `<p style="padding:24px;font-family:system-ui;color:#475569">Rapor verisi bulunamadı. Side panel'den <b>"PDF Rapor İndir"</b> ile yeniden açın.</p>`;
      }
      return;
    }
    // etkilesim:false → inline script/toolbar yok (extension CSP inline script'i bloklar).
    // Değerler progressive-enhancement ile JS'siz doğru görünür.
    const html = raporHtmlUret(veri, { etkilesim: false });
    // Tüm dokümanı üretecin kendine yeten HTML'iyle değiştir (inline script + stil dahil)
    document.open();
    document.write(html);
    document.close();
  } catch (e) {
    if (root) {
      root.innerHTML =
        `<p style="padding:24px;font-family:system-ui;color:#b91c1c">Rapor oluşturulamadı: ${
          e instanceof Error ? e.message : String(e)
        }</p>`;
    }
  }
}

void goster();
