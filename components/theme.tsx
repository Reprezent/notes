import React, { createContext, useContext } from 'react';

export const palette = {
  background: '#F5FAF7',
  surface: '#FFFFFF',
  surfaceSoft: '#FAFCFB',
  ink: '#1B3A34',
  muted: '#5B7A73',
  subtle: '#8BA89F',
  border: '#D9E8E3',
  coral: '#D97B6D',
  coralSoft: '#F0D8D0',
  teal: '#2D5F54',
  tealSoft: '#D9E8E3',
  accent: '#3F7A58',
  accentSoft: '#E1EFE5',
  secondary: '#4D8A63',
  secondarySoft: '#E7F2E9',
  tertiary: '#6E9B5E',
  tertiarySoft: '#EAF2E2',
  paper: '#FAFCFB',
  paperLine: '#DFE9E2',
  danger: '#C05A5A',
  disabled: '#C9D7D3',
} as const;

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
] as const;

export type Palette = { [Key in keyof typeof palette]: string };

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

export const withAlpha = (color: string, opacity: number) => {
  const hex = color.slice(1);
  const normalizedHex =
    hex.length === 3
      ? hex
          .split('')
          .map((component) => component.repeat(2))
          .join('')
      : hex;

  if (!/^([0-9a-f]{6})$/i.test(normalizedHex)) {
    return color;
  }

  const red = Number.parseInt(normalizedHex.slice(0, 2), 16);
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16);
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
};
