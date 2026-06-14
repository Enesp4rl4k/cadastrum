import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  site: "https://cadastrum.com.tr",
  // Static SSG mode — Cloudflare Pages için ideal, /veri/* client-side fetch yapar
  integrations: [tailwind({ applyBaseStyles: false })],
  build: {
    inlineStylesheets: "auto",
  },
});
