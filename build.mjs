import { build } from 'esbuild';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const shim = (n) => require.resolve(`@kiagent/connector-sdk/ui-shims/${n}.js`);

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/index.js',
});
await build({
  entryPoints: { calendar: 'ui/calendar.tsx' },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  jsx: 'automatic',
  outdir: 'dist/ui',
  alias: { react: shim('react'), 'react-dom': shim('react-dom'), 'react/jsx-runtime': shim('jsx-runtime') },
});
