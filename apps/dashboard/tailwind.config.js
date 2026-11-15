/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sentinel: {
          bg: '#0a0a14',
          surface: '#12121f',
          surface2: '#1a1a2b',
          border: '#262640',
          accent: '#7c5cff',
          accent2: '#8b5cf6',
          indigo: '#6366f1',
          silver: '#cbd5e1',
          text: '#e2e8f0',
          muted: '#8b8ba3',
          success: '#34d399',
          warn: '#fbbf24',
          danger: '#f87171',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.875rem',
      },
      boxShadow: {
        glow: '0 0 24px -6px rgba(124, 92, 255, 0.5)',
      },
    },
  },
  plugins: [],
};