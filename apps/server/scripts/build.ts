// Tooling script (runs under Bun, not shipped): bundles the server for Node.
// Workspace packages (@cookit/*) are bundled in; npm dependencies stay external
// and are installed in the production image.
import pkg from '../package.json';

const dependencies: Record<string, string> = pkg.dependencies ?? {};
const external = Object.keys(dependencies).filter((name) => !name.startsWith('@cookit/'));

const result = await Bun.build({
  entrypoints: ['src/index.ts', 'src/cli.ts'],
  outdir: 'dist',
  target: 'node',
  format: 'esm',
  sourcemap: 'linked',
  external,
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
