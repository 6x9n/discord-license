/** Tailwind config for the /summary dashboard (static build via CLI). */
module.exports = {
  content: ['./summary/**/*.{html,js}'],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif'
        ]
      }
    }
  },
  safelist: ['status-AVAILABLE', 'status-SOLD', 'badge-opt', 'selected', 'link'],
  plugins: []
};