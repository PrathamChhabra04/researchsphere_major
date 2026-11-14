import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        lime: {
          DEFAULT: "hsl(var(--lime))",
          foreground: "hsl(var(--lime-foreground))",
        },
        hero: {
          DEFAULT: "hsl(var(--hero-bg))",
          bg: "hsl(var(--hero-bg))",
          surface: "hsl(var(--hero-surface))",
          border: "hsl(var(--hero-border))",
          "border-hover": "hsl(var(--hero-border-hover))",
          text: "hsl(var(--hero-text))",
          "text-body": "hsl(var(--hero-text-body))",
          "text-muted": "hsl(var(--hero-text-muted))",
          accent: {
            DEFAULT: "hsl(var(--hero-accent))",
            foreground: "hsl(var(--hero-accent-foreground))",
            hover: "hsl(var(--hero-accent-hover))",
            subtle: "hsl(var(--hero-accent-subtle))",
            "subtle-border": "hsl(var(--hero-accent-subtle-border))",
            text: "hsl(var(--hero-accent-text))",
          },
        },
        badge: {
          blue: "hsl(var(--badge-blue))",
          "blue-foreground": "hsl(var(--badge-blue-foreground))",
          green: "hsl(var(--badge-green))",
          "green-foreground": "hsl(var(--badge-green-foreground))",
          purple: "hsl(var(--badge-purple))",
          "purple-foreground": "hsl(var(--badge-purple-foreground))",
          orange: "hsl(var(--badge-orange))",
          "orange-foreground": "hsl(var(--badge-orange-foreground))",
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['"Inter Tight"', 'Inter', 'sans-serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        "hero-h1": [
          "clamp(2.5rem, 5.2vw, 4.25rem)",
          {
            lineHeight: "1.18",
            letterSpacing: "0",
            fontWeight: "600",
          },
        ],
        "hero-sub": [
          "clamp(1.0625rem, 1.3vw, 1.125rem)",
          {
            lineHeight: "1.6",
            letterSpacing: "0",
          },
        ],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
