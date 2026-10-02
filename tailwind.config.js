/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        midnight: "#080B14",
        ink: "#101626",
        accent: "#8B5CF6",
        cyan: "#22D3EE",
      },
      boxShadow: {
        glow: "0 18px 70px rgba(139, 92, 246, 0.18)",
      },
    },
  },
  plugins: [],
};
