import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import { fileURLToPath } from "node:url";

export default defineConfig({
  site: "https://cadastrum.com.tr",
  // Static SSG mode — Cloudflare Pages için ideal, /veri/* client-side fetch yapar
  integrations: [tailwind({ applyBaseStyles: false })],
  build: {
    inlineStylesheets: "auto",
  },
  vite: {
    resolve: {
      alias: {
        // Extension kaynak dosyalarına site'den erişim için
        "@ext": fileURLToPath(new URL("../../src", import.meta.url)),
      },
    },
  },
});
