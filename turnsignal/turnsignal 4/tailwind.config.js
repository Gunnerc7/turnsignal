/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#14171F',
        steel: '#3A4150',
        signal: {
          blue: '#2D5BFF',
          amber: '#F2A93B',
          red: '#E5483D',
        },
      },
    },
  },
  plugins: [],
};
