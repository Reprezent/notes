import type { TraceSettings } from './LocalVectorization.types';

export interface DecodedImageMask {
  pixels: Uint8Array;
  width: number;
  height: number;
}

export function decodeImageToMask(
  _base64: string,
  _settings: TraceSettings,
  _mimeType?: string | null
): Promise<DecodedImageMask> {
  return Promise.reject(new Error('Image decoding is unavailable on this platform.'));
}
