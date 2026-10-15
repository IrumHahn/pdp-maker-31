import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1.5rem",
        lg: "2rem",
        xl: "2.5rem"
      }
    },
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        muted: "var(--muted)",
        primary: "var(--primary)",
        border: "var(--border)",
        card: "var(--card)",
        accent: "var(--accent)"
      },
      borderRadius: {
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 6px)",
        "2xl": "calc(var(--radius) + 16px)"
      },
      fontFamily: { sans: ["var(--font-sans)"] },
      boxShadow: {
        soft: "0 24px 80px rgba(17, 25, 20, 0.08)",
        card: "0 12px 40px rgba(17, 25, 20, 0.06)"
      },
      keyframes: {
        "fade-up": {
          "0%": {
            opacity: "0",
            transform: "translateY(18px)"
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)"
          }
        }
      },
      animation: {
        "fade-up": "fade-up 0.7s ease-out both",
        "fade-up-delayed": "fade-up 0.9s ease-out both"
      }
    }
  },
  plugins: []
};

export default config;
