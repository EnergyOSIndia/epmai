/** @type {import('tailwindcss').Config} */
module.exports = {
  // `dark:` follows the app theme (src/theme): Dark picked (data-theme="dark"), the always-dark Tech
  // palette, or System mode on a dark OS (anything but Light picked).
  darkMode: ["variant", [
    '&:is([data-theme="dark"] *)',
    '&:is([data-palette="tech"] *)',
    '@media (prefers-color-scheme: dark) { &:not([data-theme="light"] *) }',
  ]],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Archivo", "DejaVu Sans", "system-ui", "sans-serif"] },
      colors: {
        border: "hsl(var(--border))", input: "hsl(var(--input))", ring: "hsl(var(--ring))",
        background: "hsl(var(--background))", foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        sidebar: { DEFAULT: "var(--sidebar)", fg: "var(--sidebar-fg)", muted: "var(--sidebar-muted)", active: "var(--sidebar-active)" },
        seafoam: "var(--seafoam)",
        ok: { DEFAULT: "var(--ch-pos)", soft: "var(--pos-soft)" },
        bad: { DEFAULT: "var(--ch-neg)", soft: "var(--neg-soft)" },
        warn: { DEFAULT: "var(--ch-warn)", soft: "var(--warn-soft)" },
        info: { DEFAULT: "var(--ch-c-isgs)", soft: "var(--info-soft)" },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: { "accordion-down": "accordion-down 0.2s ease-out", "accordion-up": "accordion-up 0.2s ease-out" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
