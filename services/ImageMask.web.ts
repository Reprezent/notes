import {
  MAX_TRACE_HEIGHT,
  MAX_TRACE_PIXELS,
  MAX_TRACE_WIDTH,
  MAX_TRACE_WORKING_DIMENSION,
  type TraceSettings,
} from './LocalVectorization.types';
import type { DecodedImageMask } from './ImageMask';
import { vectorizationLog } from './Logger';

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
  const pixels = new Uint8Array(maskPixelCount);
  let foregroundPixels = 0;
  for (let index = 0; index < pixels.length; index += 1) {
    const offset = index * 4;
    const luminance = rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114;
    pixels[index] = rgba[offset + 3] >= 16 && luminance <= settings.threshold ? 1 : 0;
    foregroundPixels += pixels[index];
  }
  vectorizationLog.info('Web binary mask prepared', {
    width: maskWidth,
    height: maskHeight,
    sourceWidth: width,
    sourceHeight: height,
    maskBytes: pixels.byteLength,
    foregroundPixels,
    foregroundPercent: Number(((foregroundPixels / maskPixelCount) * 100).toFixed(2)),
    thresholdElapsedMs: Date.now() - maskStartedAt,
    totalElapsedMs: Date.now() - startedAt,
  });
  return { pixels, width: maskWidth, height: maskHeight };
}
