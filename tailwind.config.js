const c = require('./constants/colors');

/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ['./App.tsx', './components/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        canvas: c.canvas,
        paper: c.paper,
        ink: c.ink,
        muted: c.muted,
        subtle: c.subtle,
        line: c.line,
        coral: c.coral,
        'coral-soft': c.coralSoft,
        teal: c.teal,
        'teal-soft': c.tealSoft,
        sky: c.sky,
        'sky-soft': c.skySoft,
        lavender: c.lavender,
        'lavender-soft': c.lavenderSoft,
        amber: c.amber,
        'amber-soft': c.amberSoft,
      },
    },
  },
  plugins: [],
};
