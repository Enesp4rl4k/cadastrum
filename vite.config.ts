import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        sidepanel: "src/sidepanel/index.html",
        rapor: "src/rapor/index.html",
      },
      output: {
        // Bundle splitting — ana modüller ayrı chunk'lara çıkar. Sidepanel
        // boot süresi: 5MB tek chunk → ~1.5MB ana + lazy 3.5MB diğerleri.
        manualChunks: (id) => {
          if (!id.includes("node_modules") && !id.includes("src/lib/data/")) return undefined;
          // Statik veri tabloları — büyük tuple objeler
          if (id.includes("src/lib/data/mahalle-baseline")) return "data-mahalle";
          if (id.includes("src/lib/data/mahalle-merkezleri")) return "data-merkez";
          if (id.includes("src/lib/data/mahalle-ozellik")) return "data-ozellik";
          if (id.includes("src/lib/data/")) return "data-statik";
          // Üçüncü taraf
          if (id.includes("maplibre-gl")) return "vendor-maplibre";
          if (id.includes("dexie")) return "vendor-dexie";
          if (id.includes("react-dom")) return "vendor-react-dom";
          if (id.includes("/react/") || id.includes("react-")) return "vendor-react";
          if (id.includes("lucide-react")) return "vendor-icons";
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    hmr: { port: 5174 },
    // CRXJS dev mode: service worker chrome-extension:// origin'inden
    // localhost:5174/@vite/env çekiyor — CORS izni gerek.
    cors: {
      origin: [/^chrome-extension:\/\//, /^http:\/\/localhost/],
    },
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
});
