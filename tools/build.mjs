// Builds the app into build/web (index.html, app.js, styles, fonts, talent icons) and, with --tests,
// the engine tests into build/tests/run.js (they run in Node: the engine never touches the DOM).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const out = path.join(root, 'build', 'web');
const args = new Set(process.argv.slice(2));
const prod = args.has('--prod');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    const src = path.join(from, f), dst = path.join(to, f);
    if (fs.statSync(src).isDirectory()) copyDir(src, dst); else fs.copyFileSync(src, dst);
  }
}
function copyStatic() {
  copyDir(path.join(root, 'web'), out);
  fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
  const fonts = [
    ['@fontsource/cinzel/files/cinzel-latin-600-normal.woff2', 'cinzel-600.woff2'],
    ['@fontsource/cinzel/files/cinzel-latin-700-normal.woff2', 'cinzel-700.woff2'],
    ['@fontsource/inter/files/inter-latin-400-normal.woff2', 'inter-400.woff2'],
    ['@fontsource/inter/files/inter-latin-600-normal.woff2', 'inter-600.woff2'],
    ['@fontsource/inter/files/inter-latin-700-normal.woff2', 'inter-700.woff2'],
  ];
  for (const [from, to] of fonts) fs.copyFileSync(path.join(root, 'node_modules', from), path.join(out, 'fonts', to));
}

const appOpts = {
  entryPoints: [path.join(root, 'src', 'main.ts')],
  bundle: true, format: 'iife', target: ['chrome80'], outfile: path.join(out, 'app.js'),
  sourcemap: prod ? false : 'linked', minify: prod, legalComments: 'none', logLevel: 'info',
  define: { 'BUILD_TIME': JSON.stringify(new Date().toISOString()), 'APP_VERSION': JSON.stringify(fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim()) },
};

if (args.has('--tests')) {
  await esbuild.build({
    entryPoints: [path.join(root, 'tests', 'run.ts')], bundle: true, platform: 'node', format: 'cjs',
    target: ['node18'], outfile: path.join(root, 'build', 'tests', 'run.js'), sourcemap: 'inline', logLevel: 'warning',
    define: { 'BUILD_TIME': '"test"', 'APP_VERSION': '"test"' },
  });
} else if (args.has('--watch')) {
  copyStatic();
  const ctx = await esbuild.context(appOpts);
  await ctx.watch();
} else {
  copyStatic();
  await esbuild.build(appOpts);
}
