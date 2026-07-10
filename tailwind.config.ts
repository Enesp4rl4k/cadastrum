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
        // Imperial Blue + Champagne — kurumsal palet
        imperial: {
          DEFAULT: "#1B2A4A",
          50:  "#EEF1F8",
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
          50:  "#FAF5E8",
          100: "#F0E4BD",
          400: "#D2B375",
          500: "#C9A86A",
          600: "#A8884B",
          700: "#7E662F",
        },
        // Semantic accent tokens
        accent: {
          info:    "#0284c7",
          success: "#059669",
          warning: "#d97706",
          danger:  "#dc2626",
          ai:      "#7c3aed",
          ilan:    "#ea580c",
          neutral: "#475569",
        },
        // Surface depth tokens (CSS vars preferred; these are Tailwind fallbacks)
        surface: {
          0: "#f8fafc",
          1: "#ffffff",
          2: "#f1f5f9",
          3: "#e2e8f0",
        },
      },
      fontSize: {
        "2xs": ["0.6875rem", "1rem"],
        "3xs": ["0.625rem", "0.875rem"],
      },
      boxShadow: {
        card:      "0 1px 2px rgba(15,23,42,0.04), 0 1px 1px rgba(15,23,42,0.04)",
        "card-hover": "0 2px 8px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)",
        xs:  "0 1px 2px rgba(15,23,42,0.04)",
        sm:  "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
        md:  "0 4px 8px rgba(15,23,42,0.06), 0 2px 4px rgba(15,23,42,0.04)",
        lg:  "0 8px 24px rgba(15,23,42,0.08), 0 2px 8px rgba(15,23,42,0.04)",
        xl:  "0 16px 48px rgba(15,23,42,0.10), 0 4px 16px rgba(15,23,42,0.06)",
        // Glow shadows
        "glow-primary": "0 0 0 1px rgba(13,110,253,0.15), 0 0 16px rgba(13,110,253,0.2)",
        "glow-success": "0 0 0 1px rgba(5,150,105,0.15), 0 0 16px rgba(5,150,105,0.18)",
        "glow-ai":      "0 0 0 1px rgba(124,58,237,0.15), 0 0 20px rgba(124,58,237,0.22)",
        "glow-ilan":    "0 0 0 1px rgba(234,88,12,0.15), 0 0 16px rgba(234,88,12,0.2)",
      },
      backgroundImage: {
        // Subtle gradient for premium surfaces
        "gradient-surface": "linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)",
        "gradient-primary": "linear-gradient(135deg, #0d6efd 0%, #0284c7 100%)",
        "gradient-ai":      "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
        "gradient-ilan":    "linear-gradient(135deg, #ea580c 0%, #f97316 100%)",
        "gradient-gold":    "linear-gradient(135deg, #c9a86a 0%, #d2b375 100%)",
        "gradient-success": "linear-gradient(135deg, #059669 0%, #10b981 100%)",
        "gradient-dark":    "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      transitionTimingFunction: {
        spring:     "cubic-bezier(0.34, 1.56, 0.64, 1)",
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-quart":"cubic-bezier(0.25, 1, 0.5, 1)",
      },
      animation: {
        "fade-up":      "fade-up-in 380ms cubic-bezier(0.16,1,0.3,1) forwards",
        "slide-right":  "slide-in-right 280ms cubic-bezier(0.16,1,0.3,1) forwards",
        "content-enter":"content-enter 320ms cubic-bezier(0.16,1,0.3,1) forwards",
        "spin-smooth":  "spin-smooth 750ms linear infinite",
        "skeleton":     "skeleton-sweep 1.6s ease-in-out infinite",
        "status-ring":  "status-ring 2.2s cubic-bezier(0.16,1,0.3,1) infinite",
        "icon-pop":     "icon-pop 280ms cubic-bezier(0.34,1.56,0.64,1) forwards",
      },
    },
  },
  plugins: [],
} satisfies Config;
