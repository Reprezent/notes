import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { NativeTraceJson } from './ExpoLocalVectorizer.types';

declare class ExpoLocalVectorizerModule extends NativeModule<Record<string, never>> {
  coreVersion(): string;
  traceMaskAsync(
    pixels: Uint8Array,
    width: number,
    height: number,
    threshold: number,
    sensitivity: number,
    speckleMinArea: number,
    turnPolicy: number,
    cornerThreshold: number,
    optimizeCurve: boolean,
    maxPathCount: number,
    maxOutputBytes: number
  ): Promise<NativeTraceJson>;
}

export default requireOptionalNativeModule<ExpoLocalVectorizerModule>('ExpoLocalVectorizer');
