export const TRACE_CORE_VERSION = '0.1.0';
export const MAX_TRACE_WIDTH = 4_096;
export const MAX_TRACE_HEIGHT = 4_096;
export const MAX_TRACE_PIXELS = 16_777_216;
export const MAX_TRACE_WORKING_DIMENSION = 1_536;
export const MAX_TRACE_PATHS = 16_384;
export const MAX_TRACE_OUTPUT_BYTES = 4 * 1024 * 1024;

export type TurnPolicy = 'black' | 'white' | 'minority';

export interface TraceSettings {
  threshold: number;
  sensitivity: number;
  speckleMinArea: number;
  turnPolicy: TurnPolicy;
  cornerThreshold: number;
  optimizeCurve: boolean;
  maxPathCount: number;
  maxOutputBytes: number;
}

export interface TraceMaskRequest {
  pixels: Uint8Array;
  width: number;
  height: number;
  settings: TraceSettings;
}

export interface PreparedHandwritingMask {
  pixels: Uint8Array;
  width: number;
  height: number;
}

/**
 * Future preprocessing boundary. EXIF normalization, perspective correction,
 * lighting normalization, and thresholding belong here, before tracing.
 */
export interface HandwritingMaskPreparer {
  prepareHandwritingMask(input: unknown): Promise<PreparedHandwritingMask>;
}

export interface FilledSvgPath {
  path: string;
  fillRule: 'evenodd' | 'nonzero';
}

export interface VectorizationDiagnostics {
  coreVersion: string;
  inputPixels: number;
  pathCount: number;
  outputBytes: number;
}

export interface CompletedVectorizationResponse {
  kind: 'completed';
  viewBox: readonly [number, number, number, number];
  paths: readonly FilledSvgPath[];
  diagnostics: VectorizationDiagnostics;
  warnings: readonly string[];
}

export interface NotImplementedVectorizationResponse {
  kind: 'notImplemented';
  code: 'TRACE_NOT_IMPLEMENTED';
  diagnostics: Pick<VectorizationDiagnostics, 'coreVersion' | 'inputPixels'>;
  warnings: readonly string[];
}

export type VectorizationResponse =
  CompletedVectorizationResponse | NotImplementedVectorizationResponse;

export interface LocalVectorizationServiceContract {
  traceMask(request: TraceMaskRequest): Promise<VectorizationResponse>;
}

export class LocalTraceError extends Error {
  constructor(
    public readonly code:
      | 'TRACE_INVALID_DIMENSIONS'
      | 'TRACE_INVALID_INPUT'
      | 'TRACE_RESOURCE_LIMIT'
      | 'TRACE_INVALID_OPTIONS'
      | 'TRACE_ENGINE_FAILURE'
  ) {
    super(code);
    this.name = 'LocalTraceError';
  }
}

const commandArity: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};
const tokenPattern = /([MLHVCSQTAZ])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
const MAX_SVG_COORDINATE = 1_000_000;

function isBoundedInteger(value: number, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

export function assertValidTraceMaskRequest(request: TraceMaskRequest): void {
  if (
    !isBoundedInteger(request.width, 1, MAX_TRACE_WIDTH) ||
    !isBoundedInteger(request.height, 1, MAX_TRACE_HEIGHT)
  ) {
    throw new LocalTraceError('TRACE_INVALID_DIMENSIONS');
  }

  const pixelCount = request.width * request.height;
  if (pixelCount > MAX_TRACE_PIXELS) {
    throw new LocalTraceError('TRACE_RESOURCE_LIMIT');
  }
  if (request.pixels.byteLength !== pixelCount) {
    throw new LocalTraceError('TRACE_INVALID_INPUT');
  }
  if (request.pixels.some((pixel) => pixel > 1)) {
    throw new LocalTraceError('TRACE_INVALID_INPUT');
  }

  const { settings } = request;
  if (
    !isBoundedInteger(settings.threshold, 0, 255) ||
    !isBoundedInteger(settings.sensitivity, 0, 100) ||
    !isBoundedInteger(settings.speckleMinArea, 0, MAX_TRACE_PIXELS) ||
    !['black', 'white', 'minority'].includes(settings.turnPolicy) ||
    !Number.isFinite(settings.cornerThreshold) ||
    settings.cornerThreshold < 0 ||
    settings.cornerThreshold > 1 ||
    typeof settings.optimizeCurve !== 'boolean' ||
    !isBoundedInteger(settings.maxPathCount, 1, MAX_TRACE_PATHS) ||
    !isBoundedInteger(settings.maxOutputBytes, 1, MAX_TRACE_OUTPUT_BYTES)
  ) {
    throw new LocalTraceError('TRACE_INVALID_OPTIONS');
  }
}

function validatePathData(path: string): void {
  if (new TextEncoder().encode(path).byteLength > MAX_TRACE_OUTPUT_BYTES) {
    throw new LocalTraceError('TRACE_RESOURCE_LIMIT');
  }

  const tokens: { command?: string; number?: number }[] = [];
  let previousEnd = 0;
  for (const match of path.matchAll(tokenPattern)) {
    const gap = path.slice(previousEnd, match.index);
    if (!/^[,\s]*$/.test(gap)) {
      throw new LocalTraceError('TRACE_INVALID_INPUT');
    }
    previousEnd = (match.index ?? 0) + match[0].length;
    if (match[1]) {
      tokens.push({ command: match[1] });
    } else {
      const value = Number(match[2]);
      if (!Number.isFinite(value) || Math.abs(value) > MAX_SVG_COORDINATE) {
        throw new LocalTraceError('TRACE_INVALID_INPUT');
      }
      tokens.push({ number: value });
    }
  }
  if (!/^[,\s]*$/.test(path.slice(previousEnd)) || tokens[0]?.command !== 'M') {
    throw new LocalTraceError('TRACE_INVALID_INPUT');
  }

  let activeCommand: string | undefined;
  let values: number[] = [];
  const validateValues = () => {
    if (!activeCommand) {
      return;
    }
    const arity = commandArity[activeCommand];
    if (values.length === 0 && arity !== 0) {
      throw new LocalTraceError('TRACE_INVALID_INPUT');
    }
    if (arity === 0) {
      if (values.length !== 0) {
        throw new LocalTraceError('TRACE_INVALID_INPUT');
      }
      return;
    }
    if (values.length % arity !== 0) {
      throw new LocalTraceError('TRACE_INVALID_INPUT');
    }
    if (activeCommand === 'A') {
      for (let offset = 0; offset < values.length; offset += arity) {
        if (![0, 1].includes(values[offset + 3]) || ![0, 1].includes(values[offset + 4])) {
          throw new LocalTraceError('TRACE_INVALID_INPUT');
        }
      }
    }
  };

  for (const token of tokens) {
    if (token.command) {
      validateValues();
      activeCommand = token.command;
      values = [];
    } else if (activeCommand === undefined || token.number === undefined) {
      throw new LocalTraceError('TRACE_INVALID_INPUT');
    } else {
      values.push(token.number);
    }
  }
  validateValues();
}

/**
 * Local results must pass the same defensive boundary as future remote
 * responses. Only canonical, uppercase filled SVG path commands are accepted.
 */
export function validateLocalVectorizationResponse(
  response: VectorizationResponse
): VectorizationResponse {
  if (response.kind === 'notImplemented') {
    if (response.code !== 'TRACE_NOT_IMPLEMENTED' || !response.diagnostics.coreVersion) {
      throw new LocalTraceError('TRACE_INVALID_INPUT');
    }
    return response;
  }

  const [x, y, width, height] = response.viewBox;
  if (
    ![x, y, width, height].every(
      (value) => Number.isFinite(value) && Math.abs(value) <= MAX_SVG_COORDINATE
    ) ||
    width <= 0 ||
    height <= 0 ||
    response.paths.length > MAX_TRACE_PATHS
  ) {
    throw new LocalTraceError('TRACE_INVALID_INPUT');
  }
  for (const record of response.paths) {
    if (record.fillRule !== 'evenodd' && record.fillRule !== 'nonzero') {
      throw new LocalTraceError('TRACE_INVALID_INPUT');
    }
    validatePathData(record.path);
  }
  return response;
}

export function notImplementedResponse(
  coreVersion: string,
  inputPixels: number
): NotImplementedVectorizationResponse {
  return validateLocalVectorizationResponse({
    kind: 'notImplemented',
    code: 'TRACE_NOT_IMPLEMENTED',
    diagnostics: { coreVersion, inputPixels },
    warnings: ['Local tracing is scaffolded but not implemented.'],
  }) as NotImplementedVectorizationResponse;
}

export function completedResponseFromUnknown(
  value: unknown,
  coreVersion: string,
  inputPixels: number
): CompletedVectorizationResponse {
  if (typeof value !== 'object' || value === null) {
    throw new LocalTraceError('TRACE_INVALID_INPUT');
  }
  const raw = value as {
    viewBox?: unknown;
    paths?: unknown;
    warnings?: unknown;
  };
  if (
    !Array.isArray(raw.viewBox) ||
    raw.viewBox.length !== 4 ||
    !raw.viewBox.every((item) => typeof item === 'number') ||
    !Array.isArray(raw.paths) ||
    !raw.paths.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { path?: unknown }).path === 'string' &&
        ['evenodd', 'nonzero'].includes(String((item as { fillRule?: unknown }).fillRule))
    ) ||
    !Array.isArray(raw.warnings) ||
    !raw.warnings.every((warning) => typeof warning === 'string')
  ) {
    throw new LocalTraceError('TRACE_INVALID_INPUT');
  }

  const paths = raw.paths as FilledSvgPath[];
  const outputBytes = paths.reduce(
    (total, path) => total + new TextEncoder().encode(path.path).byteLength,
    0
  );
  return validateLocalVectorizationResponse({
    kind: 'completed',
    viewBox: raw.viewBox as [number, number, number, number],
    paths,
    diagnostics: {
      coreVersion,
      inputPixels,
      pathCount: paths.length,
      outputBytes,
    },
    warnings: raw.warnings as string[],
  }) as CompletedVectorizationResponse;
}
