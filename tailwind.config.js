/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
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
