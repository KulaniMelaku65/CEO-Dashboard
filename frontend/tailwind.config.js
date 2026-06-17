/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy:    { DEFAULT: '#02404F', dark: '#013B47', mid: '#3A4656' },
        gold:    { DEFAULT: '#EB7D23', light: '#F5A870' },
        teal:    '#1FB6A6',
        success: '#2EBD85',
        danger:  '#E5544B',
        muted:   '#6B7C93',
        border:  '#E3E9F2',
        bg:      '#F4F6FA',
      },
      fontFamily: {
        sans: ['Montserrat', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 14px rgba(2,64,79,.07)',
      }
    }
  },
  plugins: []
}
