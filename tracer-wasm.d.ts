declare module '*artifacts/web/trace.js' {
  interface WasmModule {
    memory: WebAssembly.Memory;
  }
  export default function initializeWasm(wasmUrl?: string): Promise<WasmModule>;
  export function coreVersion(): string;
  export function traceMask(
    pixels: Uint8Array,
    width: number,
    height: number,
    options: Record<string, number | boolean>
  ): unknown;
}
