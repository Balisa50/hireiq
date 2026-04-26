import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas:  "#F9F7F4",
        surface: "#FFFFFF",
        border:  "#E8E4DF",
        ink:     "#1A1714",
        "ink-2": "#2D2926",
        sub:     "#6B6560",
        muted:   "#9C9590",
        danger:  "#DC2626",
        success: "#16A34A",
        warn:    "#D97706",
      },
      fontFamily: {
        sans:  ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        serif: ["Playfair Display", "Georgia", "serif"],
      },
      borderRadius: {
        DEFAULT: "4px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(26,23,20,0.06)",
        pop:  "0 4px 16px rgba(26,23,20,0.10)",
      },
      animation: {
        "fade-in":  "fadeIn 0.25s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};

export default config;
