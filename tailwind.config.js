/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      keyframes: {
        "gen-inherit-pill": {
          "0%": { opacity: "1", transform: "translateX(-50%) translateY(0)" },
          "100%": { opacity: "0", transform: "translateX(-50%) translateY(-12px)" },
        },
      },
      animation: {
        "gen-inherit-pill": "gen-inherit-pill 900ms ease-out forwards",
      },
      colors: {
        dark: {
          bg: "#1a1a2e",
          surface: "#16213e",
          accent: "#0f3460",
          text: "#e4e4e7",
          muted: "#a1a1aa",
        },
      },
    },
  },
  plugins: [],
};
