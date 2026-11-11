/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // EPMS theme palette. `ink` is plain body/heading text (EPMS's own --text —
        // near-black on light, near-white on dark, see index.css's .dark-app override)
        // — kept separate from `navy`, which is reserved for intentional brand-teal
        // accents (sidebar, buttons, focus rings, summary-card fills) exactly like
        // EPMS itself never uses --teal as a general text color, only as an accent.
        ink:     '#222222',
        navy:    { DEFAULT: '#0F5565', dark: '#0A3B46', mid: '#0D4A58' },
        gold:    { DEFAULT: '#EB7D23', light: '#F39A4D' },
        teal:    '#12707F',
        success: '#2E7D32',
        danger:  '#D32F2F',
        info:    '#0288D1',
        warn:    '#F9A825',
        muted:   '#6B7780',
        border:  '#E6E9EC',
        bg:      '#F7F9FA',
      },
      fontFamily: {
        sans: ['Montserrat', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 14px rgba(15,85,101,.08)',
      }
    }
  },
  plugins: []
}
