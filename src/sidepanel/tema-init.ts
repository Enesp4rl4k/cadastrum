/**
 * React render'dan ÖNCE dark class'ı uygular — FOUC (flash of unstyled content) önler.
 * Chrome MV3 CSP `script-src 'self'` inline script'leri yasakladığı için
 * bu mantık ayrı modül olarak main.tsx'in en üstünde import edilir.
 */

(function temaInit() {
  try {
    const t = localStorage.getItem("tema");
    const isDark =
      t === "koyu" ||
      (t !== "acik" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) document.documentElement.classList.add("dark");
  } catch {
    // localStorage erişimi yoksa (private mode vb.) sessizce geç
  }
})();
