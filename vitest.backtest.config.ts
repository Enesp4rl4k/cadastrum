/**
 * Gerçek motor backtest'i için ayrı Vitest config.
 *
 * NEDEN ayrı config gerekli:
 * test/backtest/real-engine.spec.ts yüzlerce async fiyatTahminEt() çağrısı yapar
 * (her biri dinamik import + emsal havuzu rafinerisi içerir) — normal `npm test`
 * koşusuna karışırsa hem yavaşlatır hem de doğruluk eşiği ihlali normal test
 * suit'ini kırar (o zaten ayrı bir CI adımının işi, bkz. package.json:backtest:real).
 *
 * vitest.config.ts ile aynı define/setupFiles'ı paylaşır, sadece include/exclude
 * ve testTimeout farklıdır.
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
    include: ["test/backtest/**/*.spec.ts"],
    globals: false,
    setupFiles: ["./test/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
