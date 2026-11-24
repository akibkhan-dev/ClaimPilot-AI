// Tailwind CSS configuration — design tokens for ClaimPilot AI's professional theme
/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        navy:     { DEFAULT: "#0F1E33", light: "#1B3050", dark: "#0A1524" },
        paper:    { DEFAULT: "#F5F4F0", dark: "#EAE8E1" },
        slate:    { DEFAULT: "#48546A" },
        brass:    { DEFAULT: "#B8863B", light: "#D4A65C", dark: "#8F6A2E" },
        verified: { DEFAULT: "#146D5F", light: "#1E8C7B", dark: "#0E5449" },
        rust:     { DEFAULT: "#B0432F", light: "#C96450", dark: "#8A3324" },
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        sans:    ["Inter", "sans-serif"],
        mono:    ["IBM Plex Mono", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,30,51,0.04), 0 4px 16px rgba(15,30,51,0.06)",
        seal: "0 0 0 4px rgba(184,134,59,0.15)",
      },
      keyframes: {
        sealPop: {
          "0%":   { transform: "scale(0.6) rotate(-8deg)", opacity: "0" },
          "60%":  { transform: "scale(1.08) rotate(2deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0deg)",    opacity: "1" },
        },
      },
      animation: {
        seal: "sealPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards",
      },
    },
  },
  plugins: [],
};