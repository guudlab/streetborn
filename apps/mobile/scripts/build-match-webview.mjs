// Bundles the pages the native WebViews run, each with three.js, into one HTML file the app
// loads as an asset:
//   - the 3D match: src/match3d/webview/entry.js (with scene.js) -> assets/match3d/match.webview.html
//   - one Model3D model: src/ui/webview/modelEntry.js (with modelScene.ts) -> assets/webview/model.webview.html
// The output is generated (not committed), so run this after changing anything under
// src/match3d, src/ui/modelScene.ts or src/ui/kitTint.ts:
//   npm run build:match-webview
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const pages = [
  { entry: 'src/match3d/webview/entry.js', out: 'assets/match3d/match.webview.html', background: '#0d0d0d', body: '<div id="host"></div>', css: '#host{position:fixed;inset:0;touch-action:none}' },
  { entry: 'src/ui/webview/modelEntry.js', out: 'assets/webview/model.webview.html', background: 'transparent', body: '<canvas id="c"></canvas>', css: '#c{position:fixed;inset:0;width:100%;height:100%;display:block}' },
];

for (const page of pages) {
  const result = await build({
    entryPoints: [resolve(root, page.entry)],
    bundle: true, write: false, format: 'iife', minify: true, target: 'safari15', legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<style>
html,body{margin:0;height:100%;background:${page.background};overflow:hidden;overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
${page.css}
</style></head>
<body>${page.body}<script>${js}</script></body></html>`;
  const out = resolve(root, page.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`webview page: ${(html.length / 1024).toFixed(0)} KB -> ${page.out}`);
}
