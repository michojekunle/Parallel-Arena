/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'arena-bg': '#070B14',
        'arena-card': '#111827',
        'arena-cyan': '#00FFE5',
        'arena-orange': '#FF6B35',
        'arena-red': '#FF2D55',
        'arena-green': '#39FF14',
        'arena-border': '#1A2332',
      },
      fontFamily: {
        mono: ['"Share Tech Mono"', 'monospace'],
        display: ['"Orbitron"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
