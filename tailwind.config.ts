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
          background: "#F7F4EF",
          text: "#171717",
          accent: "#6F7D5C",
          secondary: "#D8C7AD",
          muted: "#8A8378",
          panel: "#EEE8DD",
        },
      },
      fontFamily: {
        sans: ["Avenir Next", "Avenir", "Nunito Sans", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 24px 70px rgba(23, 23, 23, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
