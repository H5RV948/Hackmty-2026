import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      /*
       * Cada color va en forma de canales con <alpha-value>, no como var()
       * pelon: es lo unico que deja funcionar `bg-brand/40` y compania. Ver el
       * comentario de los -rgb en globals.css.
       */
      colors: {
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        surface: "rgb(var(--surface-rgb) / <alpha-value>)",
        muted: "rgb(var(--muted-rgb) / <alpha-value>)",
        "muted-soft": "rgb(var(--muted-soft-rgb) / <alpha-value>)",
        line: "rgb(var(--line-rgb) / <alpha-value>)",
        brand: "rgb(var(--brand-rgb) / <alpha-value>)",
        "brand-soft": "rgb(var(--brand-soft-rgb) / <alpha-value>)",
        positive: "rgb(var(--positive-rgb) / <alpha-value>)",
        warning: "rgb(var(--warning-rgb) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        tabular: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
