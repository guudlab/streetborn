// The 3D match inside a WebView (iOS and Android). Bundled by scripts/build-match-webview.mjs
// into one HTML file; the app loads it, sends the models and the config, and then drives the
// scene with `call` messages. Everything the screen decides stays in the app: this file only
// hosts scene.js and relays (see bridgeTypes.ts for the protocol).
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { MeshoptDecoder } from 'meshoptimizer';

import { tintMaterials } from '../../ui/kitTint.ts';
import { assembleG } from '../assemble.ts';
import { createMatch } from '../scene.js';

const post = (msg) => window.ReactNativeWebView.postMessage(JSON.stringify(msg));
const fail = (e) => post({ t: 'error', message: String((e && e.stack) || e).slice(0, 600) });
window.addEventListener('error', (e) => fail(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => fail(e.reason));

const chunks = new Map();   // key -> Uint8Array[]
const models = new Map();   // key -> ArrayBuffer
let scene = null;

function bytesOf(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function addChunk({ key, i, n, d }) {
  const list = chunks.get(key) || [];
  list[i] = bytesOf(d);
  chunks.set(key, list);
  if (list.filter(Boolean).length < n) return;
  const total = list.reduce((s, c) => s + c.length, 0), all = new Uint8Array(total);
  let at = 0;
  for (const c of list) { all.set(c, at); at += c.length; }
  models.set(key, all.buffer);
  chunks.delete(key);
}

async function go(cfg) {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const byKey = {};
  let n = 0;
  for (const key of cfg.keys) {
    const data = models.get(key);
    byKey[key] = await new Promise((resolve, reject) => loader.parse(data, '', resolve, reject));
    models.delete(key);
    post({ t: 'progress', p: ++n / cfg.keys.length });
  }
  const tintOf = (root, t) => tintMaterials(THREE, root)(t === undefined ? cfg.tint : t);
  const ev = (name) => (...a) => post({ t: 'ev', name, a });
  const host = document.getElementById('host');
  scene = createMatch({
    host, G: assembleG(byKey), board: cfg.board, kit: cfg.kit, away: cfg.away,
    tint: tintOf,
    sfx: ev('sfx'),
    on: { phase: ev('phase'), aimed: ev('aimed'), ring: ev('ring'), grade: ev('grade'), result: ev('result'), skipped: ev('skipped'), done: ev('done') },
  });
  await scene.ready;

  // The screen reads the phase, the aim and the ring timing synchronously; keep it posted.
  let last = '';
  const relay = () => {
    const s = scene;
    if (!s) return;
    const phase = s.phase();
    const msg = { t: 'state', phase, aim: s.aim() };
    if (phase === 'pass' || phase === 'defend') msg.timing = s.timing();
    const key = JSON.stringify(msg);
    if (key !== last) { last = key; post(msg); }
    requestAnimationFrame(relay);
  };
  relay();
  post({ t: 'ready' });
}

window.__rn = (msg) => {
  try {
    if (msg.t === 'model') addChunk(msg);
    else if (msg.t === 'go') void go(msg.cfg).catch(fail);
    else if (msg.t === 'call' && scene) {
      if (msg.fn === 'dispose') { scene.dispose(); scene = null; } else scene[msg.fn](...msg.args);
    }
  } catch (e) { fail(e); }
};
post({ t: 'hello' });
