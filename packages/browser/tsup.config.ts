import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: {
      resolve: true,
    },
    sourcemap: true,
    clean: true,
    target: 'es2022',
  },
  {
    entry: { 'design-mode-runtime': 'src/runtime/design-mode-runtime.ts' },
    format: ['iife'],
    globalName: 'AgentBridgeDesignModeRuntime',
    sourcemap: false,
    target: 'es2022',
    outExtension() {
      return { js: '.global.js' };
    },
  },
]);
