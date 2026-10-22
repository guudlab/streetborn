// Usage: npm run build:web && node scripts/measure-startup.mjs dist [runs]
// Serves the export with gzip + SPA fallback, loads it in Chromium under
// Lighthouse "mobile" throttling (slow 4G, 4x CPU), and reports timings for a
// new player (sign-in screen) and a returning player (hub, mocked Supabase).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
// Playwright is not a project dependency: point PLAYWRIGHT_DIR at an install (default: the cloud image's).
const require = createRequire((process.env.PLAYWRIGHT_DIR ?? '/opt/node-tools/node_modules') + '/');
const { chromium } = require('playwright');

const dir = path.resolve(process.argv[2]);
const runs = Number(process.argv[3] ?? 3);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.m4a': 'audio/mp4', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dir, 'index.html');
  const ext = path.extname(p);
  let body = fs.readFileSync(p);
  const h = { 'content-type': types[ext] ?? 'application/octet-stream' };
  if (['.js', '.html', '.css', '.json', '.ttf', '.svg'].includes(ext) && /gzip/.test(req.headers['accept-encoding'] ?? '')) { body = zlib.gzipSync(body, { level: 9 }); h['content-encoding'] = 'gzip'; }
  res.writeHead(200, h); res.end(body);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const REF = 'daunbydsmydsvcwemnwx';
const now = Math.floor(Date.now() / 1000);
const session = { access_token: 'x.eyJzdWIiOiIxIn0.x', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r', user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };

async function once(browser, returning, cached) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  if (returning) await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  if (cached) await ctx.addInitScript((v) => localStorage.setItem('streetborn.profile.v1', v), JSON.stringify({ playerId: session.user.id, level: 3, xp: 400, coin: 500, gem: 10, energy: 5, energyUpdatedAt: Date.now(), stats: { shooting: 40, passing: 40, pace: 40, stamina: 40 } }));
  // Supabase stand-in: every call answers after 350 ms (a typical mobile round trip to Frankfurt).
  await ctx.route(/supabase\.co/, async (route) => {
    await new Promise(r => setTimeout(r, 350));
    const u = route.request().url();
    const body = u.includes('/players') ? { level: 3, xp: 400 } : u.includes('/wallets') ? { coin: 500, gem: 10, energy: 5, energy_updated_at: new Date().toISOString() } : u.includes('/player_stats') ? { shooting: 40, passing: 40, pace: 40, stamina: 40 } : {};
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let bytes = 0;
  cdp.on('Network.loadingFinished', e => { bytes += e.encodedDataLength; });
  const t0 = Date.now();
  await page.goto(base + '/', { waitUntil: 'commit' });
  const sel = returning ? '[aria-label="Kariyer"]' : '[aria-label="Başlamak için dokun"]';
  await page.waitForSelector(sel, { state: 'visible', timeout: 120000 });
  // Wait for the boot overlay (if any) to go, so "ready" means the screen is usable.
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 120000 });
  const ready = Date.now() - t0;
  const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null);
  const readyBytes = bytes;
  await ctx.close();
  return { fcp: Math.round(fcp), ready, kb: Math.round(readyBytes / 1024) };
}

const browser = await chromium.launch();
for (const [label, returning, cached] of [['new', false, false], ['returning', true, false], ['returning+cache', true, true]]) {
  const rs = [];
  for (let i = 0; i < runs; i++) rs.push(await once(browser, returning, cached));
  const med = k => rs.map(r => r[k]).sort((a, b) => a - b)[Math.floor(rs.length / 2)];
  console.log(`${label.padEnd(16)}  FCP ${med('fcp')} ms  ready ${med('ready')} ms  transferred ${med('kb')} KB   runs=${JSON.stringify(rs)}`);
}
await browser.close();
server.close();
