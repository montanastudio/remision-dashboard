/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    __dirname + '/app/**/*.{js,ts,jsx,tsx,mdx}',
    __dirname + '/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      colors: {
        brand: {
          blue: '#1a3a8f',
          red: '#d42020',
        },
        day: {
          bg: '#f8fafc',
          sidebar: '#ffffff',
          card: '#ffffff',
          border: '#f0f2f8',
          text: '#0f172a',
          textSub: '#64748b',
          textMuted: '#94a3b8',
          navHover: '#f1f5f9',
          barBg: '#f1f5f9',
        },
        night: {
          bg: '#0f1623',
          sidebar: '#141c2e',
          card: '#1a2438',
          border: '#1e2d47',
          text: '#f0f4ff',
          textSub: '#8ba3c7',
          textMuted: '#4e6585',
          navHover: '#1e2d47',
          barBg: '#1e2d47',
        },
      },
      borderRadius: {
        shell: '14px',
        card: '10px',
        nav: '7px',
        pill: '7px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,.05)',
        'card-hover': '0 4px 16px rgba(0,0,0,.09)',
        'shell-day': '0 24px 80px rgba(0,0,0,.22)',
        'shell-night': '0 24px 80px rgba(0,0,0,.60)',
      },
    },
  },
  safelist: [
    'md:w-[220px]',
    'md:w-0',
    'md:overflow-y-auto',
    'md:overflow-hidden',
  ],
  plugins: [],
}
