declare module '*artifacts/web/trace.js' {
  export default function initializeWasm(): Promise<unknown>;
  export function coreVersion(): string;
  export function traceMask(
    pixels: Uint8Array,
    width: number,
    height: number,
    options: Record<string, number | boolean>
  ): unknown;
}
