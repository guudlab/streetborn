// One 3D model in a WebView (iOS and Android), the page behind ui/nativeModel.native.tsx.
// Bundled by scripts/build-match-webview.mjs. Receives the model as base64 chunks, builds
// the same scene the browser's WebCanvas does (modelScene.ts), and relays its controls.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'meshoptimizer';

import { build, debug } from '../modelScene.ts';

const post = (msg) => window.ReactNativeWebView.postMessage(JSON.stringify(msg));
const fail = (e) => post({ t: 'error', message: `${debug.stage}: ${String((e && e.message) || e)}`.slice(0, 400) });
window.addEventListener('error', (e) => fail(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => fail(e.reason));

const parts = [];
let scene = null;

function bytesOf(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function go(opts) {
  debug.stage = 'meshopt';
  await MeshoptDecoder.ready;
  const total = parts.reduce((s, c) => s + c.length, 0), all = new Uint8Array(total);
  let at = 0;
  for (const c of parts) { all.set(c, at); at += c.length; }
  debug.stage = 'parse glb';
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise((resolve, reject) => loader.parse(all.buffer, '', resolve, reject));
  debug.stage = 'webgl';
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const w = Math.max(window.innerWidth, 1), h = Math.max(window.innerHeight, 1);
  renderer.setSize(w, h, false);
  scene = build({ THREE, cloneSkinned }, renderer, gltf, w, h, opts);
  await scene.ready;
  post({ t: 'ready' });
}

window.__rn = (msg) => {
  try {
    if (msg.t === 'model') parts[msg.i] = bytesOf(msg.d);
    else if (msg.t === 'go') void go(msg.opts).catch(fail);
    else if (msg.t === 'call' && scene) {
      if (msg.fn === 'dispose') { scene.dispose(); scene = null; } else scene[msg.fn](...msg.args);
    }
  } catch (e) { fail(e); }
};
post({ t: 'hello' });
