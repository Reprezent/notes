'use strict';

// Single source of truth for design-system color tokens.
// Both tailwind.config.js (via require) and theme.tsx (via import) reference
// this file so that updating a color value here propagates everywhere.

const colors = {
  canvas: '#F5FAF7',
  paper: '#FEFDFB',
  surface: '#FFFFFF',
  surfaceWarm: '#FFFDF8',
  ink: '#1B3A34',
  muted: '#5B7A73',
  subtle: '#8BA89F',
  line: '#D9E8E3',
  paperLine: '#E8E3DB',
  coral: '#D97B6D',
  coralSoft: '#F0D8D0',
  teal: '#2D5F54',
  tealSoft: '#D9E8E3',
  sky: '#4F8DF7',
  skySoft: '#E2ECFF',
  lavender: '#8B6FE8',
  lavenderSoft: '#EEE8FF',
  amber: '#C9A961',
  amberSoft: '#E8DCC4',
  accent: '#3F7A58',
  accentSoft: '#E1EFE5',
  secondary: '#4D8A63',
  secondarySoft: '#E7F2E9',
  tertiary: '#6E9B5E',
  tertiarySoft: '#EAF2E2',
  danger: '#C05A5A',
  disabled: '#C9D7D3',
};
module.exports = colors;
