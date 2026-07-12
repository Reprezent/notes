import type { TraceMaskRequest, VectorizationResponse } from './LocalVectorization.types';

export interface TraceWorkerRequest {
  kind: 'trace';
  id: string;
  request: Omit<TraceMaskRequest, 'pixels'> & { pixels: ArrayBuffer };
}

export interface TraceWorkerSuccess {
  kind: 'result';
  id: string;
  result: VectorizationResponse;
}

export interface TraceWorkerFailure {
  kind: 'error';
  id: string;
  code: string;
}

export type TraceWorkerResponse = TraceWorkerSuccess | TraceWorkerFailure;

export function isTraceWorkerRequest(value: unknown): value is TraceWorkerRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<TraceWorkerRequest>;
  return (
    candidate.kind === 'trace' &&
    typeof candidate.id === 'string' &&
    typeof candidate.request === 'object' &&
    candidate.request !== null &&
    candidate.request.pixels instanceof ArrayBuffer
  );
}
