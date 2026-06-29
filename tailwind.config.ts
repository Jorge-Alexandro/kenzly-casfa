import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Marca CASFASA: remapeamos `orange` a la naranja del logo (#F8921D)
        // para recolorear toda la app sin tocar cada clase.
        orange: {
          50: "#FEF5E9",
          100: "#FCE7C7",
          200: "#F9CE8C",
          300: "#F7B658",
          400: "#F8A235",
          500: "#F8921D", // naranja CASFASA (muestreado del logo)
          600: "#E07B0B",
          700: "#B86109",
          800: "#8F4C0E",
          900: "#743F11",
        },
      },
    },
  },
  plugins: [],
};
export default config;
