/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Imperial Blue — Cadastrum'un kurumsal kimliği
        // Sotheby's/Christie's gayrimenkul tonu, otoriter ve güvenilir
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
        // Champagne Gold — premium aksan, "değer biçme" sembolü
        champagne: {
          DEFAULT: "#C9A86A",
          50: "#FAF5E8",
          100: "#F0E4BD",
          200: "#E0CB8A",
          400: "#D2B375",
          500: "#C9A86A",
          600: "#A8884B",
          700: "#7E662F",
        },
        // Backward-compat: brand → imperial alias (mevcut sınıflar kırılmasın)
        brand: {
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
        ink: "#0f172a",
        muted: "#64748b",
        cream: "#FBF8F1",
        accent: {
          info: "#0284c7",
          success: "#059669",
          warning: "#d97706",
          danger: "#dc2626",
          ai: "#7c3aed",
          ilan: "#ea580c",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ["'Source Serif 4'", "Georgia", "serif"],
      },
      maxWidth: {
        prose: "65ch",
      },
    },
  },
  plugins: [],
};
