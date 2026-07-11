import { SvgTextLine } from './ImportTypes';

const DEFAULT_FONT_SIZE = 18;
const DEFAULT_LINE_HEIGHT = 28;
const HORIZONTAL_PADDING = 24;
const VERTICAL_PADDING = 48;

class TextToSvgService {
  createLines(text: string): SvgTextLine[] {
    const normalizedText = text.trim();

    if (!normalizedText) {
      return [];
    }

    return normalizedText.split('\n').map((line, index) => ({
      text: line,
      x: HORIZONTAL_PADDING,
      y: VERTICAL_PADDING + index * DEFAULT_LINE_HEIGHT,
    }));
  }

  getFontSize(): number {
    return DEFAULT_FONT_SIZE;
  }
}

export const textToSvgService = new TextToSvgService();
