import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f1419',
          raised: '#1a2332',
          overlay: '#243447',
        },
        accent: {
          green: '#22c55e',
          amber: '#f59e0b',
          red: '#ef4444',
        },
      },
      animation: {
        'pulse-live': 'pulse-live 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'pulse-live': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      screens: {
        'tablet': '768px',
        'desktop': '1920px',
      },
    },
  },
  plugins: [],
};

export default config;
