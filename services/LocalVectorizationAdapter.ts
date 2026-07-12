import type {
  LocalVectorizationServiceContract,
  TraceMaskRequest,
} from './LocalVectorization.types';

// Metro resolves the .web or .native implementation first. This fallback
// exists for TypeScript and unsupported platforms.
export const localVectorizationService: LocalVectorizationServiceContract = {
  async traceMask(_request: TraceMaskRequest) {
    throw new Error('Local vectorization is unavailable on this platform.');
  },
};
