import React, { createContext, useContext } from 'react';
import colors from '../constants/colors';

export const palette = {
  background: colors.canvas,
  surface: colors.surface,
  whiteSoft: colors.paper,
  ink: colors.ink,
  muted: colors.muted,
  subtle: colors.subtle,
  border: colors.line,
  coral: colors.coral,
  coralSoft: colors.coralSoft,
  teal: colors.teal,
  tealSoft: colors.tealSoft,
  accent: colors.accent,
  accentSoft: colors.accentSoft,
  secondary: colors.secondary,
  secondarySoft: colors.secondarySoft,
  tertiary: colors.tertiary,
  tertiarySoft: colors.tertiarySoft,
  paper: colors.paper,
  paperLine: colors.paperLine,
  danger: colors.danger,
  disabled: colors.disabled,
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
] as const;

export type ThemePalette = { [Key in keyof typeof palette]: string };

export interface AppTheme {
  palette: ThemePalette;
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
