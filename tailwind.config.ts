import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        tkgm: {
          primary: "#0d6efd",
          ink: "#0f172a",
          muted: "#64748b",
        },
        // Imperial Blue + Champagne — marketing site ile uyumlu kurumsal palet
        imperial: {
          DEFAULT: "#1B2A4A",
          50: "#EEF1F8",
          100: "#D5DCEC",
          200: "#A6B5D4",
          400: "#4D6298",
          500: "#2C4275",
          600: "#1B2A4A",
          700: "#0F1A33",
          900: "#070E1E",
        },
        champagne: {
          DEFAULT: "#C9A86A",
          50: "#FAF5E8",
          100: "#F0E4BD",
          400: "#D2B375",
          500: "#C9A86A",
          600: "#A8884B",
          700: "#7E662F",
        },
        // Semantic accent tokens — kategori göstergesi (sol şerit + ikon)
        accent: {
          info: "#0284c7",     // sky-600 — TKGM resmi analiz
          success: "#059669",  // emerald-600 — fiyat, başarı
          warning: "#d97706",  // amber-600 — uyarı, kısmi başarı
          danger: "#dc2626",   // red-600 — hata
          ai: "#7c3aed",       // violet-600 — AI öngörü
          ilan: "#ea580c",     // orange-600 — sahibinden ilanı
          neutral: "#475569",  // slate-600 — sıradan veri
        },
      },
      fontSize: {
        // Daha tutarlı tipografi sırası
        "2xs": ["0.6875rem", "1rem"],
        "3xs": ["0.625rem", "0.875rem"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 1px rgba(15, 23, 42, 0.04)",
        "card-hover": "0 2px 8px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)",
      },
    },
  },
  plugins: [],
} satisfies Config;
