/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark-first surface tokens.
        ink: {
          950: '#0f0f0f', // app background
          900: '#1a1a1a', // card surface
          850: '#1f1f1f', // hovered card
          800: '#262626', // borders / dividers
          700: '#333333',
          600: '#4b4b4b',
          400: '#737373',
          300: '#a3a3a3',
          200: '#d4d4d4',
          100: '#f5f5f5',
        },
        // Light theme tokens (toggled by removing `dark` class).
        paper: {
          DEFAULT: '#fafafa',
          card: '#ffffff',
          hover: '#f0f0f0',
          border: '#e5e5e5',
          text: '#171717',
          muted: '#737373',
        },
        accent: {
          amber: '#f59e0b',
          blue: '#60a5fa',
          green: '#34d399',
          rose: '#fb7185',
          violet: '#a78bfa',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
