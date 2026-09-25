/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        tactical: {
          dark: '#060911',
          panel: '#0b1220',
          elevated: '#111c30',
          border: 'rgba(56, 189, 248, 0.18)',
          accent: '#06b6d4',
          cyan: '#38bdf8',
          alert: '#f43f5e',
          warning: '#f59e0b',
          success: '#10b981',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.25)',
        'glow-emerald': '0 0 20px rgba(16, 185, 129, 0.25)',
        'glow-alert': '0 0 20px rgba(244, 63, 94, 0.35)',
      }
    },
  },
  plugins: [],
}
