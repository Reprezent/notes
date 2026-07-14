import {
  MAX_TRACE_HEIGHT,
  MAX_TRACE_PIXELS,
  MAX_TRACE_WIDTH,
  MAX_TRACE_WORKING_DIMENSION,
  type TraceSettings,
} from './LocalVectorization.types';
import type { DecodedImageMask } from './ImageMask';
import { vectorizationLog } from './Logger';

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const buildIntegralImage = (luminance: Uint8Array, width: number, height: number): Uint32Array => {
  const stride = width + 1;
  const integral = new Uint32Array((height + 1) * stride);

  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += luminance[y * width + x];
      const index = (y + 1) * stride + (x + 1);
      integral[index] = integral[index - stride] + rowSum;
    }
  }

  return integral;
};

const meanLuminance = (
  integral: Uint32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number
): number => {
  const stride = width + 1;
  const left = Math.max(0, x - radius);
  const right = Math.min(width - 1, x + radius);
  const top = Math.max(0, y - radius);
  const bottom = Math.min(height - 1, y + radius);

  const area = (right - left + 1) * (bottom - top + 1);
  const sum =
    integral[(bottom + 1) * stride + (right + 1)] -
    integral[top * stride + (right + 1)] -
    integral[(bottom + 1) * stride + left] +
    integral[top * stride + left];
  return sum / Math.max(area, 1);
};

const normalizeLuminance = (rgba: Uint8ClampedArray, pixelCount: number): Uint8Array => {
  let minimum = 255;
  let maximum = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    if (rgba[offset + 3] < 16) {
      continue;
    }
    const value = Math.round(
      rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114
    );
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }

  const range = Math.max(maximum - minimum, 1);
  const normalized = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    if (rgba[offset + 3] < 16) {
      normalized[index] = 255;
      continue;
    }
    const value = Math.round(
      rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114
    );
    normalized[index] = clamp(Math.round(((value - minimum) * 255) / range), 0, 255);
  }

  return normalized;
};

const cleanupMask = (
  pixels: Uint8Array,
  width: number,
  height: number,
  sensitivity: number
): Uint8Array => {
  const output = new Uint8Array(pixels);
  const addThreshold = sensitivity >= 60 ? 7 : 8;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      let neighbors = 0;
      for (let ny = -1; ny <= 1; ny += 1) {
        for (let nx = -1; nx <= 1; nx += 1) {
          if (nx === 0 && ny === 0) {
            continue;
          }
          neighbors += pixels[(y + ny) * width + (x + nx)];
        }
      }

      if (pixels[index] === 1 && neighbors <= 1) {
        output[index] = 0;
      } else if (pixels[index] === 0 && neighbors >= addThreshold) {
        output[index] = 1;
      }
    }
  }

  return output;
};

export async function decodeImageToMask(
  base64: string,
  settings: TraceSettings,
  mimeType?: string | null
): Promise<DecodedImageMask> {
  const startedAt = Date.now();
  vectorizationLog.info('Starting web image decode', {
    mimeType: mimeType || 'image/png',
    encodedCharacters: base64.length,
    threshold: settings.threshold,
  });
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to decode selected image.'));
  });
  image.src = `data:${mimeType || 'image/png'};base64,${base64}`;
  await loaded;

  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const pixelCount = width * height;
  vectorizationLog.info('Web image decoded', {
    width,
    height,
    pixelCount,
    elapsedMs: Date.now() - startedAt,
  });
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_TRACE_WIDTH ||
    height > MAX_TRACE_HEIGHT ||
    pixelCount > MAX_TRACE_PIXELS
  ) {
    vectorizationLog.warn('Web image exceeds trace dimensions', {
      width,
      height,
      pixelCount,
      maxWidth: MAX_TRACE_WIDTH,
      maxHeight: MAX_TRACE_HEIGHT,
      maxPixels: MAX_TRACE_PIXELS,
    });
    throw new Error('The selected image is too large to vectorize.');
  }

  const scale = Math.min(1, MAX_TRACE_WORKING_DIMENSION / Math.max(width, height));
  const maskWidth = Math.max(1, Math.round(width * scale));
  const maskHeight = Math.max(1, Math.round(height * scale));
  const maskPixelCount = maskWidth * maskHeight;
  const maskStartedAt = Date.now();
  vectorizationLog.debug('Reading web image pixels', {
    width: maskWidth,
    height: maskHeight,
    sourceWidth: width,
    sourceHeight: height,
  });
  const canvas = document.createElement('canvas');
  canvas.width = maskWidth;
  canvas.height = maskHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Image pixel decoding is unavailable.');
  }
  context.drawImage(image, 0, 0, maskWidth, maskHeight);
  const rgba = context.getImageData(0, 0, maskWidth, maskHeight).data;
  const normalizedLuminance = normalizeLuminance(rgba, maskPixelCount);
  const integral = buildIntegralImage(normalizedLuminance, maskWidth, maskHeight);
  const pixels = new Uint8Array(maskPixelCount);
  const sensitivityFactor = clamp(settings.sensitivity / 100, 0, 1);
  const localRadius = Math.max(
    8,
    Math.round(Math.min(maskWidth, maskHeight) * (0.01 + sensitivityFactor * 0.03))
  );
  const localBias = 8 + (1 - sensitivityFactor) * 12;
  const localBlend = 0.35 + sensitivityFactor * 0.45;
  let foregroundPixels = 0;

  for (let y = 0; y < maskHeight; y += 1) {
    for (let x = 0; x < maskWidth; x += 1) {
      const index = y * maskWidth + x;
      const offset = index * 4;
      if (rgba[offset + 3] < 16) {
        pixels[index] = 0;
        continue;
      }

      const localMean = meanLuminance(integral, maskWidth, maskHeight, x, y, localRadius);
      const adaptiveThreshold = localMean - localBias;
      const blendedThreshold =
        settings.threshold * (1 - localBlend) + adaptiveThreshold * localBlend;
      pixels[index] = normalizedLuminance[index] <= blendedThreshold ? 1 : 0;
      foregroundPixels += pixels[index];
    }
  }

  const cleanedPixels = cleanupMask(pixels, maskWidth, maskHeight, settings.sensitivity);
  foregroundPixels = cleanedPixels.reduce((count, pixel) => count + pixel, 0);
  const foregroundCoveragePercent = Number(((foregroundPixels / maskPixelCount) * 100).toFixed(2));
  const warnings: string[] = [];
  if (foregroundCoveragePercent < 0.5) {
    warnings.push('Very little ink detected; writing may be missing in trace output.');
  } else if (foregroundCoveragePercent > 40) {
    warnings.push('Large foreground region detected; result may blob. Try higher threshold.');
  }

  vectorizationLog.info('Web binary mask prepared', {
    width: maskWidth,
    height: maskHeight,
    sourceWidth: width,
    sourceHeight: height,
    maskBytes: cleanedPixels.byteLength,
    foregroundPixels,
    foregroundPercent: foregroundCoveragePercent,
    localRadius,
    localBias: Number(localBias.toFixed(2)),
    warningCount: warnings.length,
    thresholdElapsedMs: Date.now() - maskStartedAt,
    totalElapsedMs: Date.now() - startedAt,
  });
  return {
    pixels: cleanedPixels,
    width: maskWidth,
    height: maskHeight,
    foregroundCoveragePercent,
    warnings,
  };
}
