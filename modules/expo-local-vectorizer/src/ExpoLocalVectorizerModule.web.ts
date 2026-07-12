import { registerWebModule, NativeModule } from 'expo';
import type { NativeTraceJson } from './ExpoLocalVectorizer.types';

class ExpoLocalVectorizerModule extends NativeModule<Record<string, never>> {
  coreVersion(): string {
    return '0.1.0';
  }

  async traceMaskAsync(): Promise<NativeTraceJson> {
    return '{"code":"TRACE_ENGINE_FAILURE"}';
  }
}

export default registerWebModule(ExpoLocalVectorizerModule, 'ExpoLocalVectorizerModule');
