/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,jsx,html}'],
  theme: {
    extend: {
      colors: {
        navy:  { DEFAULT: '#002663', dark: '#001a4d', light: '#003380' },
        gold:  { DEFAULT: '#FFC72C', hover: '#FFD54F' },
      },
    },
  },
}
