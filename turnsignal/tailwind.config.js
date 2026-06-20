/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        ink: '#14171F',
        steel: '#3A4150',
        asphalt: '#EDEFF2',
        signal: {
          blue: '#2D5BFF',
          amber: '#F5A623',
          red: '#E5483D',
        },
      },
      boxShadow: {
        glowAmber: '0 0 0 1px rgba(245,166,35,0.4), 0 0 12px rgba(245,166,35,0.45)',
        glowRed: '0 0 0 1px rgba(229,72,61,0.45), 0 0 14px rgba(229,72,61,0.5)',
        lift: '0 18px 30px -10px rgba(20,23,31,0.35)',
      },
    },
  },
  plugins: [],
};
