export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        tactical: { dark: '#060911', panel: '#0b1220', elevated: '#111c30', border: 'rgba(56, 189, 248, 0.18)', accent: '#06b6d4', cyan: '#38bdf8', alert: '#f43f5e', warning: '#f59e0b', success: '#10b981' }
      },
      fontFamily: { sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
      boxShadow: { 
        'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.25)', 
        'glow-emerald': '0 0 20px rgba(16, 185, 129, 0.25)', 
        'glow-alert': '0 0 20px rgba(244, 63, 94, 0.35)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glass-hover': '0 8px 32px 0 rgba(6, 182, 212, 0.37)'
      },
      backdropBlur: {
        'xs': '2px',
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '24px',
        '3xl': '40px',
      },
      animation: {
        fadeIn: 'fadeIn 0.4s ease-out forwards',
        slideUp: 'slideUp 0.5s ease-out forwards',
        slideDown: 'slideDown 0.5s ease-out forwards',
        scaleIn: 'scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        shimmer: 'shimmer 2s infinite linear',
        pulseGlow: 'pulseGlow 2s infinite ease-in-out',
        float: 'float 3s infinite ease-in-out',
        counterSpin: 'counterSpin 0.5s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(56, 189, 248, 0.2)' },
          '50%': { boxShadow: '0 0 25px rgba(56, 189, 248, 0.5)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        counterSpin: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
