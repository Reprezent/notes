import React, { createContext, useContext } from 'react';

export const palette = {
  background: '#F5FAF7',
  surface: '#FFFFFF',
  surfaceWarm: '#FAFCFB',
  ink: '#1B3A34',
  muted: '#5B7A73',
  subtle: '#8BA89F',
  border: '#D9E8E3',
  coral: '#D97B6D',
  coralSoft: '#F0D8D0',
  teal: '#2D5F54',
  tealSoft: '#D9E8E3',
  sky: '#3F7A58',
  skySoft: '#E1EFE5',
  lavender: '#4D8A63',
  lavenderSoft: '#E7F2E9',
  amber: '#6E9B5E',
  amberSoft: '#EAF2E2',
  paper: '#FAFCFB',
  paperLine: '#DFE9E2',
  danger: '#C05A5A',
  disabled: '#C9D7D3',
};

export const drawingColors = [
  '#2F2A3A',
  '#F9736A',
  '#F4B740',
  '#13A6A1',
  '#4F8DF7',
  '#8B6FE8',
  '#C65FA7',
  '#6B8E23',
  '#D97745',
  '#6B7280',
];

export type Palette = typeof palette;

export interface AppTheme {
  palette: Palette;
  drawingColors: readonly string[];
}

export const defaultTheme: AppTheme = {
  palette,
  drawingColors,
};

const ThemeContext = createContext<AppTheme>(defaultTheme);

export const ThemeProvider = ({
  children,
  theme = defaultTheme,
}: {
  children: React.ReactNode;
  theme?: AppTheme;
}) => <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;

export const useTheme = () => useContext(ThemeContext);
