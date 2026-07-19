import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./data/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        hooma: {
          background: "#FFF8F2",
          text: "#24324A",
          accent: "#CF4328",
          secondary: "#FFC857",
          muted: "#6F6B73",
          panel: "#FFECE4",
        },
      },
      fontFamily: {
        sans: ["Avenir Next", "Avenir", "Nunito Sans", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 24px 70px rgba(36, 50, 74, 0.14)",
      },
    },
  },
  plugins: [],
};

export default config;
