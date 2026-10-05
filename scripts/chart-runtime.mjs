import path from 'node:path';

// Resolve the actual Vite chunk URL so a failed browser module fetch can be retried
// with a fresh URL. Pages never need to know the generated filename or platform.
export function chartRuntime() {
  const id = '\0aio-chart-runtime';
  let reference, dev = false;
  return {
    name: 'aio-chart-runtime-url',
    apply: () => process.env.UNI_PLATFORM === 'h5',
    configResolved(config) { dev = config.command === 'serve'; },
    buildStart() {
      if (!dev) reference = this.emitFile({ type: 'chunk', id: path.resolve('src/services/chart-engine-runtime.ts'), preserveSignature: 'strict' });
    },
    resolveId(source) { if (source === 'virtual:aio-chart-runtime') return id; },
    load(module) {
      if (module === id) return dev
        ? 'export default "/src/services/chart-engine-runtime.ts";'
        : `export default import.meta.ROLLUP_FILE_URL_${reference};`;
    },
  };
}
