// Builds the game into build/web (index.html, game.js, styles, fonts) and, with --tests, the
// simulation tests into build/tests/run.js (they run in Node: the simulation never touches the DOM).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const out = path.join(root, 'build', 'web');
const args = new Set(process.argv.slice(2));
const prod = args.has('--prod');

function copyStatic() {
  fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
  for (const f of fs.readdirSync(path.join(root, 'web'))) {
    const src = path.join(root, 'web', f);
    if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(out, f));
  }
  const fonts = [
    ['@fontsource/pixelify-sans/files/pixelify-sans-latin-400-normal.woff2', 'pixelify-400.woff2'],
    ['@fontsource/pixelify-sans/files/pixelify-sans-latin-600-normal.woff2', 'pixelify-600.woff2'],
    ['@fontsource/pixelify-sans/files/pixelify-sans-latin-700-normal.woff2', 'pixelify-700.woff2'],
    ['@fontsource/inter/files/inter-latin-400-normal.woff2', 'inter-400.woff2'],
    ['@fontsource/inter/files/inter-latin-600-normal.woff2', 'inter-600.woff2'],
    ['@fontsource/inter/files/inter-latin-700-normal.woff2', 'inter-700.woff2'],
  ];
  for (const [from, to] of fonts) fs.copyFileSync(path.join(root, 'node_modules', from), path.join(out, 'fonts', to));
}

const gameOpts = {
  entryPoints: [path.join(root, 'src', 'main.ts')],
  bundle: true, format: 'iife', target: ['chrome80'], outfile: path.join(out, 'game.js'),
  sourcemap: prod ? false : 'linked', minify: prod, legalComments: 'none', logLevel: 'info',
  define: { 'BUILD_TIME': JSON.stringify(new Date().toISOString()) },
};

if (args.has('--tests')) {
  await esbuild.build({
    entryPoints: [path.join(root, 'tests', 'run.ts')], bundle: true, platform: 'node', format: 'cjs',
    target: ['node18'], outfile: path.join(root, 'build', 'tests', 'run.js'), sourcemap: 'inline', logLevel: 'warning',
  });
} else if (args.has('--watch')) {
  copyStatic();
  const ctx = await esbuild.context(gameOpts);
  await ctx.watch();
} else {
  copyStatic();
  await esbuild.build(gameOpts);
}
