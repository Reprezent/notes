/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ['./App.tsx', './components/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        canvas: '#F5FAF7',
        paper: '#FEFDFB',
        ink: '#1B3A34',
        muted: '#5B7A73',
        subtle: '#8BA89F',
        line: '#D9E8E3',
        coral: '#D97B6D',
        'coral-soft': '#F0D8D0',
        teal: '#2D5F54',
        'teal-soft': '#D9E8E3',
        sky: '#4F8DF7',
        'sky-soft': '#E2ECFF',
        lavender: '#8B6FE8',
        'lavender-soft': '#EEE8FF',
        amber: '#C9A961',
        'amber-soft': '#E8DCC4',
      },
    },
  },
  plugins: [],
};
