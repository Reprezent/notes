import ExpoLocalVectorizer from '../modules/expo-local-vectorizer';
import {
  assertValidTraceMaskRequest,
  completedResponseFromUnknown,
  LocalTraceError,
  type LocalVectorizationServiceContract,
  type TraceMaskRequest,
  type TurnPolicy,
} from './LocalVectorization.types';
import { vectorizationLog } from './Logger';

const turnPolicyCode: Record<TurnPolicy, number> = {
  black: 0,
  white: 1,
  minority: 2,
};

export const localVectorizationService: LocalVectorizationServiceContract = {
  async traceMask(request: TraceMaskRequest) {
    const startedAt = Date.now();
    vectorizationLog.info('Starting native mask trace', {
      width: request.width,
      height: request.height,
      maskBytes: request.pixels.byteLength,
      settings: request.settings,
    });
    try {
      assertValidTraceMaskRequest(request);
      if (!ExpoLocalVectorizer) {
        throw new Error(
          'Image vectorization is unavailable because this build does not include it. Rebuild the app with the vectorizer module included to enable this feature.'
        );
      }
      vectorizationLog.debug('Native trace request validated');
      const { settings } = request;
      const engineStartedAt = Date.now();
      const json = await ExpoLocalVectorizer.traceMaskAsync(
        request.pixels,
        request.width,
        request.height,
        settings.threshold,
        settings.sensitivity,
        settings.speckleMinArea,
        turnPolicyCode[settings.turnPolicy],
        settings.cornerThreshold,
        settings.optimizeCurve,
        settings.maxPathCount,
        settings.maxOutputBytes
      );
      vectorizationLog.info('Native trace engine completed', {
        responseBytes: json.length,
        elapsedMs: Date.now() - engineStartedAt,
      });
      const result: unknown = JSON.parse(json);
      if (typeof result === 'object' && result !== null && 'code' in result) {
        const code = (result as { code?: unknown }).code;
        if (
          code === 'TRACE_INVALID_DIMENSIONS' ||
          code === 'TRACE_INVALID_INPUT' ||
          code === 'TRACE_RESOURCE_LIMIT' ||
          code === 'TRACE_INVALID_OPTIONS' ||
          code === 'TRACE_ENGINE_FAILURE'
        ) {
          throw new LocalTraceError(code);
        }
        throw new LocalTraceError('TRACE_ENGINE_FAILURE');
      }
      const response = completedResponseFromUnknown(
        result,
        ExpoLocalVectorizer.coreVersion(),
        request.pixels.byteLength
      );
      vectorizationLog.info('Native trace response validated', {
        diagnostics: response.diagnostics,
        warningCount: response.warnings.length,
        totalElapsedMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      vectorizationLog.error('Native mask trace failed', {
        code: error instanceof LocalTraceError ? error.code : undefined,
        width: request.width,
        height: request.height,
        maskBytes: request.pixels.byteLength,
        elapsedMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }
  },
};
