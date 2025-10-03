export function getMediapipeConfig(): { wasmBase: string; modelUrls: string[] } {
  const wasmBase = (import.meta.env.VITE_MP_WASM_BASE ?? '').trim();
  const modelUrls = String(import.meta.env.VITE_MP_MODEL_URLS ?? '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);

  if (!wasmBase || modelUrls.length === 0) {
    throw new Error(
      'MediaPipe config missing: set VITE_MP_WASM_BASE and VITE_MP_MODEL_URLS in .env'
    );
  }
  return { wasmBase, modelUrls };
}
