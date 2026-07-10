import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts", "src/**/*.spec.ts", "scripts/**/*.spec.mjs"],
    exclude: ["node_modules", "dist", "backend"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/data/**", // statik tablolar, test'lenmez
        "src/lib/**/*.spec.ts",
        "src/lib/sahibinden-dom-monitor.ts", // browser API
        "src/lib/detay-zenginlestirme.ts", // chrome.tabs/scripting
      ],
      thresholds: {
        // Hedef başlangıç: %50, kademeli artış. Şu an ~30%.
        statements: 30,
        branches: 30,
        functions: 30,
        lines: 30,
      },
    },
  },
});
