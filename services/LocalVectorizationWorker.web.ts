import { localVectorizationService } from './LocalVectorizationAdapter.web';
import {
  isTraceWorkerRequest,
  type TraceWorkerResponse,
} from './LocalVectorizationWorker.protocol';
import { LocalTraceError } from './LocalVectorization.types';

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isTraceWorkerRequest(event.data)) {
    return;
  }

  const { id, request } = event.data;
  void localVectorizationService
    .traceMask({ ...request, pixels: new Uint8Array(request.pixels) })
    .then((result) => {
      const response: TraceWorkerResponse = { kind: 'result', id, result };
      self.postMessage(response);
    })
    .catch((error: unknown) => {
      const response: TraceWorkerResponse = {
        kind: 'error',
        id,
        code: error instanceof LocalTraceError ? error.code : 'TRACE_LOCAL_FAILURE',
      };
      self.postMessage(response);
    });
});
