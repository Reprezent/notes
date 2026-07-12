import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import {
  MAX_TRACE_HEIGHT,
  MAX_TRACE_PIXELS,
  MAX_TRACE_WIDTH,
  type TraceSettings,
} from './LocalVectorization.types';
import type { DecodedImageMask } from './ImageMask';
import { vectorizationLog } from './Logger';

export async function decodeImageToMask(
  base64: string,
  settings: TraceSettings,
  _mimeType?: string | null
): Promise<DecodedImageMask> {
  const startedAt = Date.now();
  vectorizationLog.info('Starting native image decode', {
    encodedCharacters: base64.length,
    threshold: settings.threshold,
  });
  const data = Skia.Data.fromBase64(base64);
  const encodedImage = Skia.Image.MakeImageFromEncoded(data);
  const image = encodedImage?.makeNonTextureImage() ?? encodedImage;
  if (!image) {
    throw new Error('Failed to decode selected image.');
  }
  const width = image.width();
  const height = image.height();
  const pixelCount = width * height;
  vectorizationLog.info('Native image decoded', {
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
    vectorizationLog.warn('Native image exceeds trace dimensions', {
      width,
      height,
      pixelCount,
      maxWidth: MAX_TRACE_WIDTH,
      maxHeight: MAX_TRACE_HEIGHT,
      maxPixels: MAX_TRACE_PIXELS,
    });
    throw new Error('The selected image is too large to vectorize.');
  }
  const maskStartedAt = Date.now();
  vectorizationLog.debug('Reading native image pixels', { width, height });
  const rgba = image.readPixels(0, 0, {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!(rgba instanceof Uint8Array) || rgba.byteLength !== width * height * 4) {
    throw new Error('Failed to read image pixels.');
  }
  const pixels = new Uint8Array(pixelCount);
  let foregroundPixels = 0;
  for (let index = 0; index < pixels.length; index += 1) {
    const offset = index * 4;
    const luminance =
      rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114;
    pixels[index] = rgba[offset + 3] >= 16 && luminance <= settings.threshold ? 1 : 0;
    foregroundPixels += pixels[index];
  }
  vectorizationLog.info('Native binary mask prepared', {
    width,
    height,
    maskBytes: pixels.byteLength,
    foregroundPixels,
    foregroundPercent: Number(((foregroundPixels / pixelCount) * 100).toFixed(2)),
    thresholdElapsedMs: Date.now() - maskStartedAt,
    totalElapsedMs: Date.now() - startedAt,
  });
  return { pixels, width, height };
}
