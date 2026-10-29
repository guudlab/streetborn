// Bundles the 3D match for the native WebView: src/match3d/webview/entry.js, with three.js
// and scene.js, into one HTML file the app loads as an asset. The output is generated (not
// committed), so run this after changing anything under src/match3d or src/ui/kitTint.ts:
//   npm run build:match-webview
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'assets/match3d/match.webview.html');

const result = await build({
  entryPoints: [resolve(root, 'src/match3d/webview/entry.js')],
  bundle: true, write: false, format: 'iife', minify: true, target: 'safari15', legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<style>
html,body{margin:0;height:100%;background:#0d0d0d;overflow:hidden;overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
#host{position:fixed;inset:0;touch-action:none}
</style></head>
<body><div id="host"></div><script>${js}</script></body></html>`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`match webview: ${(html.length / 1024).toFixed(0)} KB -> ${out}`);
