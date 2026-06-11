/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ['./App.tsx', './components/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        canvas: '#FFF8F0',
        paper: '#FFFDF8',
        ink: '#2F2A3A',
        muted: '#756C86',
        subtle: '#A49AB6',
        line: '#E9DCCE',
        coral: '#F9736A',
        'coral-soft': '#FFE2DA',
        teal: '#13A6A1',
        'teal-soft': '#D9F4F1',
        sky: '#4F8DF7',
        'sky-soft': '#E2ECFF',
        lavender: '#8B6FE8',
        'lavender-soft': '#EEE8FF',
        amber: '#F4B740',
        'amber-soft': '#FFF0C9',
      },
    },
  },
  plugins: [],
};
