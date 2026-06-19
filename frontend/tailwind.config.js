/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // App canvas
        canvas: '#0b0b12',
        // Glassmorphism accents
        accent: {
          purple: '#7c6ef9',
          amber: '#f59e0b',
          teal: '#1d9e75',
        },
        // Per-category tint fills (low-opacity, applied via rgba in components)
        tint: {
          purple: 'rgba(124,110,249,0.13)',
          teal: 'rgba(29,158,117,0.12)',
          amber: 'rgba(239,159,39,0.11)',
          blue: 'rgba(96,165,250,0.12)',
          pink: 'rgba(244,114,182,0.12)',
          violet: 'rgba(167,139,250,0.12)',
          red: 'rgba(248,113,113,0.12)',
          neutral: 'rgba(255,255,255,0.04)',
        },
      },
      fontFamily: {
        // System sans-serif per spec; weights 400 + 500 only elsewhere.
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        bubble: '18px',
      },
      boxShadow: {
        // Subtle glow ring used by account-avatar circles in the sidebar.
        glow: '0 0 0 2px rgba(0,0,0,0.4), 0 0 12px 1px var(--glow,rgba(124,110,249,0.6))',
      },
      backdropBlur: {
        glass: '24px',
      },
    },
  },
  plugins: [],
}
