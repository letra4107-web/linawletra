module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 20px 60px rgba(15, 23, 42, 0.08)',
      },
      colors: {
        brand: {
          50: '#effaf4',
          100: '#d8f0e3',
          200: '#ade2c4',
          300: '#73c59e',
          400: '#3ca67a',
          500: '#21805f',
          600: '#1c6a4f',
          700: '#1a5a44',
          800: '#174b39',
          900: '#143c2f',
        },
      },
    },
  },
  plugins: [],
};
