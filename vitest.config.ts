/**
 * Vitest ayrı config.
 *
 * NEDEN ayrı config gerekli:
 * vite.config.ts function-form kullanır ve @crxjs/vite-plugin'i import eder.
 * Vitest bu config'i yükleyince crxjs → Chrome Extension context arar → crash.
 *
 * import.meta.env: Vitest node ortamında Vite inject etmez; `define` ile stub'larız.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    "import.meta.env.VITE_SCRAPING_ENABLED": JSON.stringify("false"),
    "import.meta.env.MODE": JSON.stringify("test"),
    "import.meta.env.DEV": JSON.stringify(false),
    "import.meta.env.PROD": JSON.stringify(false),
    "import.meta.env.SSR": JSON.stringify(false),
  },
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
    exclude: ["scripts/**"],
    globals: false,
    // Dexie + chrome API stub'ları — node ortamında IndexedDB/extension API yok
    setupFiles: ["./test/setup.ts"],
  },
});
