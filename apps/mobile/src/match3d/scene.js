// The 3D mahalle match (web): a halısaha at night, our player, the keeper, the rival
// forward, teammates and fans. Ported from the 3D match prototype (artifact
// MNaf1ynwKFD8nP1UrC9aon, v6); the animation code is kept as close to it as possible so
// fixes made there carry over.
//
// The scene never decides anything. Every outcome comes from the match engine through
// the screen (app/mac.tsx → match3d/Match3D.tsx): the screen sends the player's input
// to the engine, then tells the scene what happened, and the scene acts it out.
// Randomness here is only cosmetic (curl, which way a beaten keeper guesses, confetti).
//
// Needs a DOM: textures are drawn on <canvas>. Native builds use the 2D match scenes.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { rigInfo, retarget, mirror, subclip, rotateWorld, lockYaw, PoseGuard, cleanSkin, GroundClamp, FootLock, rigFor } from './rig.js';
import { Keeper } from './keeper.js';

// ---------------------------------------------------------------- constants
const GOAL_Z = 7.5;          // the goal we attack (and defend); the first shot spot is at z = 0
const GOAL2_Z = -18;         // far goal, scenery
const GW = 5, GH = 2.2, GD = 1.6;
const BALL_R = 0.11;
const KICK_CONTACT = 0.52, KICK_FROM = 0.16, KICK_SPEED = 1.3;
const KICK_PLANT = 0.3, KICK_STEP = 0.8;   // the clip's plant foot lands at 0.3; the last stride plays at 0.8
const SLIDE_CONTACT = 0.45;  // the slide foot reaches the ball here (clip seconds)
const DEF_Z = -6.5, ATT_START = 10;   // defender spot, attacker start distance
const PASS_PERIOD = 1.6;     // seconds for the pass ring 0 → 1 → 0
// where the shots are taken from, in turn (x, z); free kicks are further out, past a wall
const SHOT_SPOTS = [[0, 0], [-3.1, -1.2], [2.7, -0.8]];
const FREEKICK_SPOTS = [[-2.2, -10.5], [2.4, -11]];
const WALL_GAP = 5.5, WALL_H = 2.05;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const V2 = (x = 0, y = 0) => new THREE.Vector2(x, y);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));   // −π..π, so turns take the short way
const smooth = (a, b, t) => { const u = clamp((t - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const tri = (t, period) => { const ph = (t / period) % 1; return ph < 0.5 ? ph * 2 : 2 - ph * 2; };
// cubic Hermite: from p0 to p1 with end velocities m0, m1 (already scaled by the span's duration)
const hermite = (out, p0, m0, p1, m1, u) => { const u2 = u * u, u3 = u2 * u;
  return out.set(0, 0, 0).addScaledVector(p0, 2 * u3 - 3 * u2 + 1).addScaledVector(m0, u3 - 2 * u2 + u).addScaledVector(p1, 3 * u2 - 2 * u3).addScaledVector(m1, u3 - u2); };
// a striker's last stride into the ball: from his run (at p0, velocity v0) to the kick spot p1.
// He slows to a walk by the time the clip's plant foot lands (tA), the planted boot takes the
// rest, and he is still by the strike (T). The kick clip itself is an in-place kick
const STRIDE_A = (KICK_PLANT - KICK_FROM) / KICK_STEP, STRIDE_T = STRIDE_A + (KICK_CONTACT - KICK_PLANT) / KICK_SPEED, STRIDE_V = 1.2;
const strideLen = (sp) => (sp + STRIDE_V) / 2 * STRIDE_A + STRIDE_V * (STRIDE_T - STRIDE_A) / 2;
function lastStride(p0, v0, p1) {
  const d = p1.clone().sub(p0).setY(0).normalize(), pA = p1.clone().addScaledVector(d, -STRIDE_V * (STRIDE_T - STRIDE_A) / 2);
  return { tA: STRIDE_A, T: STRIDE_T, p0: p0.clone(), p1: p1.clone(), pA, m0: v0.clone().setY(0).multiplyScalar(STRIDE_A), mA: d.clone().multiplyScalar(STRIDE_V * STRIDE_A), mB: d.clone().multiplyScalar(STRIDE_V * (STRIDE_T - STRIDE_A)) };
}
function strideMove(model, anim, k, t) {
  strideAt(k, model.position, t); model.rotation.y = lerp(k.y0, k.y1, smooth(0, k.tA, t));
  if (anim.cur === anim.A.kick) anim.A.kick.timeScale = t < k.tA ? KICK_STEP : KICK_SPEED;
}
function strideAt(k, out, t) {
  if (t < k.tA) return hermite(out, k.p0, k.m0, k.pA, k.mA, t / k.tA);
  return hermite(out, k.pA, k.mB, k.p1, V(), Math.min(1, (t - k.tA) / (k.T - k.tA)));
}
const timingGrade = (p) => (Math.abs(p - 0.75) <= 0.06 ? 'perfect' : Math.abs(p - 0.75) <= 0.15 ? 'good' : p > 0.9 ? 'over' : 'weak');

/**
 * Where the engine's shot went (goal units: x −1000..1000 is post to post seen from the
 * shooter, y 0..1000 ground to bar) as a point on the goal plane, and how it looks: a near
 * miss hits the woodwork. Screen left is world +x here (the camera looks down +z).
 */
function shotTarget(outcome, x, y) {
  const tx = -(x / 1000) * (GW / 2), ty = Math.max(0.12, (y / 1000) * GH);
  const inX = GW / 2 - BALL_R - 0.06, inY = GH - BALL_R - 0.06;
  if (outcome === 'goal' || outcome === 'saved') return { kind: outcome === 'goal' ? 'goal' : 'save', at: V2(clamp(tx, -inX, inX), Math.min(ty, inY)) };
  if (outcome === 'wide') {
    const s = Math.sign(tx) || 1;
    if (Math.abs(x) <= 1060 && ty < GH) return { kind: 'post', at: V2(s * (GW / 2 + 0.03), Math.min(ty, GH - 0.3)) };
    return { kind: 'miss', at: V2(s * clamp(Math.abs(tx), GW / 2 + BALL_R + 0.15, GW / 2 + 1.6), Math.min(ty, GH + 0.8)) };
  }
  if (y <= 1060 && Math.abs(tx) < GW / 2 - 0.2) return { kind: 'post', at: V2(tx, GH + 0.04) };
  return { kind: 'miss', at: V2(clamp(tx, -GW / 2 - 0.6, GW / 2 + 0.6), clamp(ty, GH + BALL_R + 0.2, GH + 1.6)) };
}

/**
 * Builds the scene into `host` (a DOM element) and starts drawing.
 * env: { host, G: parsed glTFs { hero, keeper, rival, ball, mates[], anim-* }, tint(root),
 *        board: text on the advertising boards, on: event handlers, sfx(id, gain) }
 */
export function createMatch(env) {
  const { host, G, on } = env;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sfx = (id, gain) => env.sfx(id, gain);
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* not supported */ } };
  const size = () => ({ w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) });

  // -------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  let { w: W, h: H } = size();
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x070a06, 30, 80);
  const camera = new THREE.PerspectiveCamera(48, W / H, 0.05, 200);
  { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.32; pm.dispose(); }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(V2(W / 2, H / 2), 0.42, 0.5, 0.96);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // scenery only

  // -------------------------------------------------------------- sky + lights
  scene.background = canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#020304'); gr.addColorStop(0.55, '#0a0e12'); gr.addColorStop(0.8, '#151d10'); gr.addColorStop(1, '#1c2612');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  {
    const n = 260, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, e = 0.25 + rnd() * 1.1; pos.set([Math.sin(a) * 90, Math.sin(e) * 70 + 10, Math.cos(a) * 90], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfd0ff, size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0.6, fog: false })));
  }
  scene.add(new THREE.HemisphereLight(0x9fb2d8, 0x1a2a0e, 0.5));
  const key = new THREE.DirectionalLight(0xf4ffe8, 2.4);
  key.position.set(-6, 14, -6); key.target.position.set(0, 0, -2);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -11, right: 11, top: 17, bottom: -17, near: 1, far: 45 });
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xdfffb0, 1.0); rim.position.set(6, 6, 16); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xcfe0ff, 0.7); rim2.position.set(4, 7, -24); scene.add(rim2);
  const goalGlow = new THREE.PointLight(0xe6ffc4, 18, 14, 1.6); goalGlow.position.set(0, 4, GOAL_Z + 1); scene.add(goalGlow);

  // -------------------------------------------------------------- pitch: stripes + lines, with a tiled grass detail on top
  const PW = 30, PL = 48, PZ0 = -21.5; // pitch covers z = -21.5 … 26.5
  const TX = 12;                       // touchlines
  const MID_Z = (GOAL_Z + GOAL2_Z) / 2;
  const pitchTex = canvasTex(1024, 1640, (g, w, h) => {
    const s = w / PW; const Z = (z) => h - (z - PZ0) * s; const X = (x) => (x + PW / 2) * s;
    for (let i = 0; i < 26; i++) { g.fillStyle = i % 2 ? '#235e27' : '#29692d'; const z0 = GOAL_Z + 0.25 - i * 2.4; g.fillRect(0, Z(z0), w, 2.4 * s + 1); }
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#235e27' : '#29692d'; const z0 = GOAL_Z + 0.25 + (i + 1) * 2.4; g.fillRect(0, Z(z0), w, 2.4 * s + 1); }
    g.strokeStyle = 'rgba(245,250,240,0.9)'; g.lineWidth = 0.1 * s;
    g.strokeRect(X(-TX), Z(GOAL_Z), 2 * TX * s, (GOAL_Z - GOAL2_Z) * s);
    for (const [gz, dz] of [[GOAL_Z, -1], [GOAL2_Z, 1]]) {
      const top = dz < 0 ? Z(gz) : Z(gz + 6.5);
      g.strokeRect(X(-6.5), top, 13 * s, 6.5 * s);
      g.strokeRect(X(-3.6), dz < 0 ? Z(gz) : Z(gz + 2.4), 7.2 * s, 2.4 * s);
      g.beginPath(); g.arc(X(0), Z(gz + dz * 7.5), 0.16 * s, 0, Math.PI * 2); g.fillStyle = 'rgba(245,250,240,0.95)'; g.fill();
    }
    g.beginPath(); g.moveTo(X(-TX), Z(MID_Z)); g.lineTo(X(TX), Z(MID_Z)); g.stroke();
    g.beginPath(); g.arc(X(0), Z(MID_Z), 3.2 * s, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(X(0), Z(MID_Z), 0.16 * s, 0, Math.PI * 2); g.fill();
  });
  const grassTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const x = rnd() * w, y = rnd() * h, l = 3 + rnd() * 7, v = 90 + rnd() * 110; g.strokeStyle = `rgb(${v},${v + 12},${v - 10})`; g.globalAlpha = 0.5; g.lineWidth = 1 + rnd(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - l); g.stroke(); }
    g.globalAlpha = 1;
  }, false);
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  const pitchMat = new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.95, metalness: 0 });
  pitchMat.onBeforeCompile = (sh) => {
    sh.uniforms.grassMap = { value: grassTex };
    sh.fragmentShader = 'uniform sampler2D grassMap;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  { vec3 gd = texture2D(grassMap, vMapUv * vec2(26.0, 42.0)).rgb; diffuseColor.rgb *= mix(vec3(1.0), gd * 1.7, 0.7) * 0.86; }');
  };
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PW, PL), pitchMat);
  pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, 0, PZ0 + PL / 2); pitch.receiveShadow = true; scene.add(pitch);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x0f140c, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.01; scene.add(outer);

  // -------------------------------------------------------------- goals + nets
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1, emissive: 0x222222 });
  const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.32 });
  function goalFrame(z, dir) { // dir = +1: net behind the line toward +z
    const g = new THREE.Group(); g.position.z = z; if (dir < 0) g.rotation.y = Math.PI; scene.add(g);
    const bar = (len, axis, x, y, zz, r = 0.06) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 16), white); if (axis === 'x') m.rotation.z = Math.PI / 2; if (axis === 'z') m.rotation.x = Math.PI / 2; m.position.set(x, y, zz); m.castShadow = true; g.add(m); };
    bar(GH, 'y', -GW / 2, GH / 2, 0); bar(GH, 'y', GW / 2, GH / 2, 0); bar(GW + 0.12, 'x', 0, GH, 0);
    bar(GD, 'z', -GW / 2, 0.03, GD / 2, 0.03); bar(GD, 'z', GW / 2, 0.03, GD / 2, 0.03);
    bar(GW, 'x', 0, 0.03, GD, 0.03); bar(GH, 'y', -GW / 2, GH / 2, GD, 0.03); bar(GH, 'y', GW / 2, GH / 2, GD, 0.03);
    bar(GW, 'x', 0, GH, GD, 0.03); bar(GD, 'z', -GW / 2, GH, GD / 2, 0.03); bar(GD, 'z', GW / 2, GH, GD / 2, 0.03);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH, 44, 20), netMat); back.position.set(0, GH / 2, GD); g.add(back);
    for (const sx of [-1, 1]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(GD, GH, 14, 20), netMat); side.rotation.y = Math.PI / 2; side.position.set(sx * GW / 2, GH / 2, GD / 2); g.add(side); }
    const top = new THREE.Mesh(new THREE.PlaneGeometry(GW, GD, 44, 14), netMat); top.rotation.x = Math.PI / 2; top.position.set(0, GH, GD / 2); g.add(top);
    return back;
  }
  const backNet = goalFrame(GOAL_Z, 1); goalFrame(GOAL2_Z, -1);
  const netBase = backNet.geometry.attributes.position.array.slice();
  const net = { amp: 0, vel: 0, x: 0, y: 1 };
  function updateNet(dt) {
    net.vel += (-90 * net.amp - 7 * net.vel) * dt; net.amp += net.vel * dt;
    const p = backNet.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const bx = netBase[i * 3], by = netBase[i * 3 + 1] + GH / 2;
      const d2 = (bx - net.x) ** 2 + (by - net.y) ** 2;
      const edge = Math.min(1, (GW / 2 - Math.abs(bx)) * 2, by * 2, (GH - by) * 2);
      p.array[i * 3 + 2] = net.amp * Math.exp(-d2 / 0.45) * Math.max(0, edge);
    }
    p.needsUpdate = true;
  }

  // -------------------------------------------------------------- mahalle surroundings
  const postMat = new THREE.MeshStandardMaterial({ color: 0x1b1f18, roughness: 0.6, metalness: 0.5 });
  {
    const fenceMat = new THREE.MeshBasicMaterial({ color: 0x9fbf6a, wireframe: true, transparent: true, opacity: 0.06 });
    const fence = (w, h, x, z, ry) => {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h, Math.round(w * 3), Math.round(h * 3)), fenceMat);
      f.position.set(x, h / 2, z); f.rotation.y = ry; scene.add(f);
      for (let i = 0; i <= w / 4; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h, 8), postMat); const t = -w / 2 + i * 4; p.position.set(x + Math.cos(ry) * t, h / 2, z - Math.sin(ry) * t); scene.add(p); }
    };
    fence(30, 6, 0, GOAL_Z + 4.5, 0); fence(30, 6, 0, GOAL2_Z - 3, 0); fence(44, 4, -15, -4, Math.PI / 2); fence(44, 4, 15, -4, -Math.PI / 2);
    const label = `STREETBORN  ·  ${env.board}`;
    const board = canvasTex(1024, 64, (g, w, h) => { g.fillStyle = '#0d0d0d'; g.fillRect(0, 0, w, h); g.fillStyle = '#7d9a35'; g.font = '800 italic 34px Inter, sans-serif'; g.textBaseline = 'middle'; const step = Math.max(520, g.measureText(label).width + 80); for (let i = 0; i < 4; i++) g.fillText(label, i * step - 40, h / 2); });
    board.wrapS = THREE.RepeatWrapping; board.repeat.set(1.6, 1);
    const boardMat = new THREE.MeshBasicMaterial({ map: board, toneMapped: false });
    for (const [z, ry] of [[GOAL_Z + 3.8, 0], [GOAL2_Z - 2.4, Math.PI]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(26, 0.7, 0.1), [postMat, postMat, postMat, postMat, postMat, boardMat]);
      b.position.set(0, 0.35, z); b.rotation.y = ry; scene.add(b);
    }
    // floodlights
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    for (const [x, z] of [[-12.5, GOAL_Z + 4], [12.5, GOAL_Z + 4], [-12.5, -6], [12.5, -6], [-12.5, GOAL2_Z - 2], [12.5, GOAL2_Z - 2]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 13, 10), postMat); pole.position.set(x, 6.5, z); scene.add(pole);
      const head = new THREE.Group(); head.position.set(x, 13.2, z); head.lookAt(0, 0, z * 0.6); scene.add(head);
      for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.12), headMat); l.position.set((i % 3 - 1) * 0.62, Math.floor(i / 3) * 0.48 - 0.24, 0); head.add(l); }
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.15, 0.1), postMat); frame.position.z = -0.08; head.add(frame);
    }
    // apartment blocks with lit windows
    const facade = (seedN) => canvasTex(128, 256, (g, w, h) => {
      seed = seedN; g.fillStyle = '#0b0d0c'; g.fillRect(0, 0, w, h);
      for (let y = 8; y < h - 8; y += 22) for (let x = 8; x < w - 8; x += 20) {
        const r = rnd(); g.fillStyle = r < 0.72 ? '#121512' : r < 0.93 ? '#e8b866' : r < 0.985 ? '#f3e6c8' : '#CFFD5C'; g.globalAlpha = r < 0.72 ? 1 : 0.35 + rnd() * 0.4; g.fillRect(x, y, 12, 14); g.globalAlpha = 1;
      }
    });
    const tex = [facade(11), facade(29), facade(57)];
    const blocks = [[-20, 26, 9, 18], [-9, 30, 10, 24], [3, 27, 8, 15], [14, 31, 11, 21], [25, 25, 9, 13], [-27, 14, 7, 12], [28, 12, 8, 16], [-30, 0, 8, 10], [31, -2, 7, 14],
      [-24, -30, 10, 16], [-10, -33, 9, 22], [4, -31, 11, 14], [18, -32, 9, 19], [29, -22, 8, 12], [-30, -16, 8, 14]];
    blocks.forEach(([x, z, w, h], i) => {
      const t = tex[i % 3].clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 4, h / 7); t.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 7), new THREE.MeshStandardMaterial({ color: 0x0c0e0d, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.55, roughness: 1 }));
      m.position.set(x, h / 2, z); m.lookAt(0, h / 2, 0); scene.add(m);
    });
  }

  // -------------------------------------------------------------- particles: confetti + trail + cue ring
  const CONF = 320;
  const confMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.04), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), CONF);
  const confData = Array.from({ length: CONF }, () => ({ p: V(0, -10, 0), v: V(), r: new THREE.Euler(), w: V(), life: 0 }));
  { const cols = [0xCFFD5C, 0xDEFE83, 0xffffff, 0x9BBF43]; for (let i = 0; i < CONF; i++) confMesh.setColorAt(i, new THREE.Color(cols[i % 4])); }
  confMesh.frustumCulled = false; scene.add(confMesh);
  const dummy = new THREE.Object3D();
  function burst(at, n = CONF, up = 6) {
    for (let i = 0; i < n; i++) { const c = confData[i]; c.p.copy(at); c.v.set((Math.random() - 0.5) * 7, up * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * 7); c.w.set(Math.random() * 12, Math.random() * 12, Math.random() * 12); c.life = 2.6 + Math.random(); }
  }
  function updateConfetti(dt) {
    for (let i = 0; i < CONF; i++) {
      const c = confData[i];
      if (c.life > 0) { c.life -= dt; c.v.y -= 6 * dt; c.v.multiplyScalar(1 - 1.6 * dt); c.p.addScaledVector(c.v, dt); c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt; if (c.p.y < 0.02) { c.p.y = 0.02; c.v.set(0, 0, 0); } }
      dummy.position.copy(c.life > 0 ? c.p : V(0, -10, 0)); dummy.rotation.copy(c.r); dummy.updateMatrix(); confMesh.setMatrixAt(i, dummy.matrix);
    }
    confMesh.instanceMatrix.needsUpdate = true;
  }
  const TRAIL = 22;
  const glowTex = canvasTex(64, 64, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(230,255,170,1)'); gr.addColorStop(1, 'rgba(207,253,92,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
  const trail = Array.from({ length: TRAIL }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false })); scene.add(s); return s; });
  const trailPts = [];
  let trailFade = 1;
  const ringTex = canvasTex(128, 128, (g, w) => { g.strokeStyle = '#CFFD5C'; g.lineWidth = 9; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 10, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 0.35; g.lineWidth = 22; g.stroke(); });
  const cue = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: 0 }));
  cue.scale.setScalar(0.5); cue.renderOrder = 11; scene.add(cue);
  // the marked teammate in a pass moment: a red ring at the marker's feet
  const markTex = canvasTex(128, 128, (g, w) => { g.strokeStyle = '#FF7A66'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 12, 0, Math.PI * 2); g.stroke(); });
  const openTex = canvasTex(128, 128, (g, w) => { g.strokeStyle = '#CFFD5C'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 12, 0, Math.PI * 2); g.stroke(); });
  const floorRing = (tex) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.visible = false; scene.add(m); return m; };
  const mateRings = [floorRing(openTex), floorRing(openTex)];
  const markRing = floorRing(markTex);

  // -------------------------------------------------------------- aim reticle
  const reticle = new THREE.Group();
  {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 48), new THREE.MeshBasicMaterial({ color: 0xCFFD5C, transparent: true, opacity: 0.95, toneMapped: false, side: THREE.DoubleSide, depthTest: false }));
    const dotM = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthTest: false, side: THREE.DoubleSide }));
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.33, 48), new THREE.MeshBasicMaterial({ color: 0xCFFD5C, transparent: true, opacity: 0.35, toneMapped: false, depthTest: false, side: THREE.DoubleSide }));
    reticle.add(ring, dotM, halo); reticle.renderOrder = 10; reticle.children.forEach((c) => (c.renderOrder = 10));
    reticle.position.set(1.4, 1.3, GOAL_Z - 0.05); reticle.visible = false; scene.add(reticle);
  }
  const aim = V2(1.4, 1.3);

  // -------------------------------------------------------------- models
  const prep = (o, shadow = true) => o.traverse((m) => {
    if (!m.isMesh) return;
    cleanSkin(m);
    m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false;
    if (m.material && m.material.isMeshStandardMaterial && m.material.metalnessMap) { m.material.metalness = 0; m.material.envMapIntensity = 1; }
  });
  // every model is a copy: the parsed files are shared with the rest of the app
  const copy = (g) => SkeletonUtils.clone(g.scene);
  const heroM = copy(G.hero), rivalM = copy(G.rival), keeperM = copy(G.keeper);
  const mateMs = (G.mates || []).map(copy);
  // rest data before anything animates
  const R = { street: rigInfo(heroM), rival: rigInfo(rivalM), streetSrc: rigInfo(G['anim-street-idle'].scene), keeperSrc: rigInfo(G['anim-slide'].scene) };
  const mateRigs = mateMs.map(rigInfo);
  const clip = (f) => G[f].animations[0];
  // idle and cheer turn the body around on the spot; lock their facing so characters stay put
  const C = { idle: lockYaw(clip('anim-street-idle')), kick: clip('anim-kick'), cheer: lockYaw(clip('anim-cheer')), run: clip('anim-run'), slide: clip('anim-slide'), leap: clip('anim-leap') };
  const readySrc = subclip(C.leap, 0, 0.25, 'ready');

  class Actor {
    constructor(model, clips) { this.model = model; this.mixer = new THREE.AnimationMixer(model); this.A = {}; for (const k in clips) this.A[k] = this.mixer.clipAction(clips[k]); this.cur = null; }
    update(dt) { if (!this.guard) this.guard = new PoseGuard(this.model); this.guard.restore(); this.mixer.update(dt); this.guard.capture(); }
    play(name, { fade = 0.2, loop = true, from = 0, speed = 1 } = {}) {
      const a = this.A[name];
      if (loop && this.cur === a && a.isRunning()) { a.timeScale = speed; return a; }   // already playing: a reset would snap the pose
      a.reset(); a.setLoop(loop ? (this.pingpong && this.pingpong.has(name) ? THREE.LoopPingPong : THREE.LoopRepeat) : THREE.LoopOnce, loop ? Infinity : 1); a.clampWhenFinished = !loop;
      a.timeScale = speed; a.time = from; a.setEffectiveWeight(1); a.play();
      if (this.cur && this.cur !== a) this.cur.crossFadeTo(a, fade, false);
      this.cur = a; return a;
    }
    snap(name, opts) { this.mixer.stopAllAction(); this.cur = null; return this.play(name, opts); }
  }
  // where a bone is (model space) at clip time t, e.g. the kicking foot at contact
  function boneAt(model, rig, c, t, bone) {
    const mx = new THREE.AnimationMixer(model); const a = mx.clipAction(c); a.play(); mx.setTime(t);
    model.position.set(0, 0, 0); model.rotation.set(0, 0, 0); model.updateMatrixWorld(true);
    const p = rig.bones[bone].getWorldPosition(V());
    a.stop(); mx.uncacheRoot(model); return p;
  }

  // hero: our player in his kit. Street clips are retargeted from the street rig, keeper clips from the keeper's
  env.tint(heroM); mateMs.forEach((m) => env.tint(m));
  prep(heroM); scene.add(heroM);
  const kickClip = lockYaw(C.kick, { hips: false, inPlace: false });
  const heroSlide = retarget(lockYaw(C.slide, { hips: false, inPlace: false }), R.keeperSrc, R.street, { name: 'slide' });
  const rh = (c, name) => retarget(c, R.streetSrc, R.street, { name });
  const hero = new Actor(heroM, {
    idle: rh(C.idle, 'idle'), kick: rh(kickClip, 'kick'), cheer: rh(C.cheer, 'cheer'), run: rh(C.run, 'run'),
    jockey: retarget(readySrc, R.keeperSrc, R.street, { name: 'jockey', inPlace: true }),
    slideR: heroSlide, slideL: mirror(heroSlide, R.street, 'slideL'),
  });
  hero.A.jockey.timeScale = 0.4;
  hero.pingpong = new Set(['jockey']);   // a held stance, not a cycle: rock back and forth instead of jumping to the start
  const heroFoot = boneAt(heroM, R.street, hero.A.kick.getClip(), KICK_CONTACT, 'RightToeBase');
  const heroSlideFoot = { R: boneAt(heroM, R.street, hero.A.slideR.getClip(), SLIDE_CONTACT, 'RightFoot'), L: boneAt(heroM, R.street, hero.A.slideL.getClip(), SLIDE_CONTACT, 'LeftFoot') };

  // teammates for pass moments: they stand, take one touch at goal and celebrate
  const mates = mateMs.map((m, i) => {
    prep(m); m.visible = false; scene.add(m);
    const rig = mateRigs[i], r = (c, name) => retarget(c, R.streetSrc, rig, { name });
    const a = new Actor(m, { idle: r(C.idle, 'idle'), kick: r(kickClip, 'kick'), cheer: r(C.cheer, 'cheer') });
    return { m, a, rig, foot: boneAt(m, rig, a.A.kick.getClip(), KICK_CONTACT, 'RightToeBase'), feet: new FootLock(rig), ground: new GroundClamp(m) };
  });

  // rival: the other mahalle's forward (also the marker in pass moments)
  prep(rivalM); scene.add(rivalM);
  const rt = (c, src, name, o = {}) => retarget(c, src, R.rival, { name, ...o });
  const rival = new Actor(rivalM, {
    idle: rt(C.idle, R.streetSrc, 'idle'), run: rt(C.run, R.streetSrc, 'run'), kick: rt(kickClip, R.streetSrc, 'kick'),
    cheer: rt(C.cheer, R.streetSrc, 'cheer'), hurdle: rt(subclip(C.leap, 0.3, 1.5, 'hurdle'), R.keeperSrc, 'hurdle', { inPlace: true }),
  });
  const rivalFoot = boneAt(rivalM, R.rival, rival.A.kick.getClip(), KICK_CONTACT, 'RightToeBase');
  // the hurdle is a standing jump: start it as the boots leave the turf and run on from the
  // landing, so the feet never stand still on a body that keeps running
  const HURDLE_OFF = 0.26, HURDLE_LAND = 0.93;

  // run cycle on a rig: how fast the planted boot pushes back at clip speed 1 (so ground speed
  // and leg speed can match: no skating), and when/where the right boot is furthest forward
  // (the dribble touch)
  function runCycle(model, rig, c) {
    const mx = new THREE.AnimationMixer(model); const a = mx.clipAction(c); a.play();
    const N = 80, sam = [];
    for (let i = 0; i <= N; i++) {
      mx.setTime((c.duration * i) / N); model.position.set(0, 0, 0); model.rotation.set(0, 0, 0); model.updateMatrixWorld(true);
      sam.push({ t: (c.duration * i) / N, R: rig.bones.RightToeBase.getWorldPosition(V()), L: rig.bones.LeftToeBase.getWorldPosition(V()) });
    }
    a.stop(); mx.uncacheRoot(model);
    const push = (k) => { // mean backward speed of a foot while it is on the ground
      const minY = Math.min(...sam.map((s) => s[k].y)); let d = 0, t = 0;
      for (let i = 1; i < sam.length; i++) if (sam[i][k].y < minY + 0.035 && sam[i - 1][k].y < minY + 0.035) { d += sam[i - 1][k].z - sam[i][k].z; t += sam[i].t - sam[i - 1].t; }
      return t > 0 ? d / t : 3;
    };
    const touch = sam.reduce((b, s) => (s.R.z > b.R.z ? s : b));
    return { dur: c.duration, ground: (push('R') + push('L')) / 2, touchT: touch.t, toe: touch.R.clone() };
  }
  const heroGround = new GroundClamp(heroM), rivalGround = new GroundClamp(rivalM);   // skin never under the turf
  const heroFeet = new FootLock(R.street), rivalFeet = new FootLock(R.rival);          // planted boots do not skate
  const RUN_SPEED = 4.4;                        // the forward's carry speed, m/s
  const rivalRun = runCycle(rivalM, R.rival, rival.A.run.getClip());
  const heroRun = runCycle(heroM, R.street, hero.A.run.getClip());
  const RIVAL_RUN = RUN_SPEED / rivalRun.ground; // clip speed that makes his boots grip the pitch

  // keeper (Meshy kaleci-v2): procedural dives on its own rig
  prep(keeperM);
  const keeper = new Keeper(keeperM, retarget(C.leap, R.keeperSrc, rigInfo(keeperM), { name: 'leap' }));
  scene.add(keeper.root);

  // free kick wall: three of their players, standing
  const wall = [0, 1, 2].map((i) => {
    const m = SkeletonUtils.clone(rivalM); prep(m); m.visible = false; scene.add(m);
    const a = new Actor(m, { idle: rival.A.idle.getClip() }); a.play('idle', { from: i * 1.3, speed: 0.9 + i * 0.07 });
    return { m, a, feet: new FootLock(rigFor(m, R.rival)) };
  });

  // fans behind the fences: clones share meshes and textures
  const fans = [];
  {
    const fanClips = { us: { idle: hero.A.idle.getClip(), cheer: hero.A.cheer.getClip() }, them: { idle: rival.A.idle.getClip(), cheer: rival.A.cheer.getClip() } };
    const spots = [[-4.6, GOAL_Z + 5.4, 'us'], [-2.9, GOAL_Z + 5.7, 'them'], [-1.2, GOAL_Z + 5.3, 'us'], [1.4, GOAL_Z + 5.6, 'us'], [3.3, GOAL_Z + 5.3, 'them'], [5.2, GOAL_Z + 5.6, 'us'],
      [-3.6, GOAL2_Z - 4, 'them'], [-0.6, GOAL2_Z - 4.3, 'us'], [2.6, GOAL2_Z - 4, 'them']];
    spots.forEach(([x, z, team], i) => {
      const m = SkeletonUtils.clone(team === 'us' ? heroM : rivalM); prep(m, false);
      m.position.set(x, 0, z); m.rotation.y = Math.atan2(-x * 0.3, (z > 0 ? -1 : 1));
      scene.add(m);
      const a = new Actor(m, fanClips[team]); a.play('idle', { from: (i * 0.9) % 4, speed: 0.8 + (i % 3) * 0.12 });
      fans.push({ a, team, feet: new FootLock(rigFor(m, team === 'us' ? R.street : R.rival)) });
    });
  }
  // The cheer clip starts and ends with the arms down and has them overhead in between. Fans
  // play it once from the start and go back to idle only once the arms are down again: a
  // crossfade between arms-up and arms-down (~170° apart) flips the shoulders mid-blend.
  const CHEER_DOWN = 6.5;
  function fansCheer(team) { fans.forEach((f, i) => { if (f.team !== team || f.a.cur === f.a.A.cheer) return; f.a.play('cheer', { fade: 0.3, loop: false, from: (i * 0.11) % 0.3, speed: 1.2 + (i % 3) * 0.08 }); }); }
  function fansCalm() { fans.forEach((f, i) => { if (f.a.cur === f.a.A.cheer && f.a.cur.time > CHEER_DOWN) f.a.play('idle', { fade: 0.6, from: i % 4, speed: 0.8 + (i % 3) * 0.12 }); }); }

  const ball = copy(G.ball); prep(ball);
  { ball.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(ball); const s = (BALL_R * 2) / Math.max(...b.getSize(V()).toArray()); ball.scale.setScalar(s); }
  const ballHolder = new THREE.Group(); ballHolder.add(ball); scene.add(ballHolder);
  const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  ballShadow.rotation.x = -Math.PI / 2; scene.add(ballShadow);

  // -------------------------------------------------------------- camera rig
  const camPos = V(9, 3, 0), camLook = V(0, 1, GOAL_Z - 2);
  const camTarget = { pos: camPos.clone(), look: camLook.clone(), k: 3 };
  const camAvoid = V(), CAM_CLEAR = 1.5;
  let shake = 0, fovTarget = 48, worldScale = 1, slowTimer = 0;
  function celebrateCam(time) { // slow orbit round the scorer, starting just off his face
    const m = S.star || heroM, a = 0.5 + (time - S.celebrateAt) * 0.3 + (m === heroM ? shot.yaw : m.rotation.y);
    camTarget.pos.set(m.position.x + Math.sin(a) * 3.2, 1.45, m.position.z + Math.cos(a) * 3.2); camTarget.look.set(m.position.x, 1.15, m.position.z);
  }
  function camTo(pos, look, k = 2.6) { camTarget.pos.copy(pos); camTarget.look.copy(look); camTarget.k = k; }

  // -------------------------------------------------------------- moment state
  const S = { phase: 'menu', t: 0, shots: 0, freekicks: 0, defenses: 0, first: true };
  const flight = { active: false, u: 0, D: 0.6, p0: V(), c: V(), p1: V(), vel: V(), mode: 'curve', outcome: null, resolved: false, spin: V(), held: false, by: 'us' };
  const shot = { B0: V(), dir: V(), right: V(), R: V(), start: V(), ctrl: V(), yaw: 0 };
  const setPhase = (p) => { S.phase = p; on.phase(p); };
  const done = () => { if (S.phase !== 'done') { setPhase('done'); on.done(); } };

  function startMoment(m) {
    timers.forEach((t) => (t.dead = true)); timers.length = 0;   // nothing from the last moment carries over
    heroFeet.reset(); rivalFeet.reset();
    fans.forEach((f, i) => { if (f.a.cur !== f.a.A.idle) { f.a.snap('idle', { from: i % 4, speed: 0.8 + (i % 3) * 0.12 }); f.feet.reset(); } });
    resetScene();
    const first = S.first; S.first = false;
    if (m.kind === 'shot' || m.kind === 'freekick') setupShot(m, first);
    else if (m.kind === 'pass') setupPass(m);
    else setupDefense(m);
  }
  function resetScene() {
    flight.active = false; flight.held = false; flight.resolved = false; trailPts.length = 0; trailFade = 1;
    slowTimer = 0; worldScale = 1; reticle.visible = false; cue.material.opacity = 0; net.amp = 0; net.vel = 0;
    ball.rotation.set(0, 0, 0); D.active = false; P.active = false; S.star = null;
    mates.forEach((x) => { x.m.visible = false; x.feet.reset(); }); mateRings.forEach((r) => (r.visible = false)); markRing.visible = false;
    wall.forEach((x) => (x.m.visible = false)); S.wall = false; S.passFrom = null;
  }
  // TV-style cut: fade to black, reset the scene, fade back (game clock, so tests stay in step)
  const cutEl = document.createElement('div');
  cutEl.style.cssText = 'position:absolute;inset:0;background:#050607;opacity:0;pointer-events:none';
  host.appendChild(cutEl);
  const cut = { v: 0, dir: 0, fn: null };
  function cutTo(fn) { cut.dir = 1; cut.fn = fn; }
  function updateCut(rdt) {
    if (!cut.dir) return;
    cut.v += (rdt / 0.2) * cut.dir;
    if (cut.dir > 0 && cut.v >= 1) { cut.v = 1; cut.dir = -1; const fn = cut.fn; cut.fn = null; if (fn) fn(); }
    else if (cut.dir < 0 && cut.v <= 0) { cut.v = 0; cut.dir = 0; }
    cutEl.style.opacity = cut.v.toFixed(3);
  }

  // -------------------------------------------------------------- shot moment (and free kick)
  function setupShot(m, first) {
    setPhase('intro');
    const freekick = m.kind === 'freekick';
    const spot = freekick ? FREEKICK_SPOTS[S.freekicks++ % FREEKICK_SPOTS.length] : SHOT_SPOTS[S.shots++ % SHOT_SPOTS.length];
    const B0 = shot.B0.set(spot[0], BALL_R, spot[1]);
    shot.dir.set(-B0.x * 0.95, 0, GOAL_Z - B0.z).normalize();          // toward the goal, a touch inside the far post
    shot.right.set(-shot.dir.z, 0, shot.dir.x);                            // screen right when looking at the goal
    shot.yaw = Math.atan2(shot.dir.x, shot.dir.z);
    const off = heroFoot.clone().applyAxisAngle(V(0, 1, 0), shot.yaw); off.y = 0;
    shot.R.copy(B0).sub(off).setY(0);
    shot.start.copy(shot.R).addScaledVector(shot.dir, -1.8).addScaledVector(shot.right, -0.32);
    shot.ctrl.copy(shot.R).addScaledVector(shot.dir, -0.9).addScaledVector(shot.right, -0.08);
    ballHolder.position.copy(B0);
    heroM.position.copy(shot.start); heroM.rotation.set(0, Math.atan2(B0.x - shot.start.x, B0.z - shot.start.z) * 0.5 + shot.yaw * 0.5, 0);
    hero.snap('idle', { from: Math.random() * 3 });
    rivalM.visible = false;
    keeper.reset(B0.x * 0.12, GOAL_Z - 0.35, B0);
    aim.set(B0.x < -1 ? 1.4 : B0.x > 1 ? -1.4 : 1.4, 1.3); reticle.position.set(aim.x, aim.y, GOAL_Z - 0.05);
    reticle.scale.setScalar(freekick ? 1.7 : 1); S.reticleScale = freekick ? 1.7 : 1;
    S.aimed = false;
    if (freekick) {
      // the wall stands WALL_GAP from the ball on the line to the goal centre, shoulder to shoulder
      S.wall = true;
      const toGoal = V(-B0.x, 0, GOAL_Z - B0.z).normalize(), side = V(-toGoal.z, 0, toGoal.x);
      const c = B0.clone().addScaledVector(toGoal, WALL_GAP).setY(0);
      wall.forEach((x, i) => {
        x.m.position.copy(c).addScaledVector(side, (i - 1) * 0.55); x.m.rotation.set(0, Math.atan2(B0.x - x.m.position.x, B0.z - x.m.position.z), 0);
        x.m.visible = true; x.feet.reset();
      });
      S.wallFrac = WALL_GAP / B0.distanceTo(V(0, 1, GOAL_Z));
    }
    const camAim = shotCam();
    if (first) { camPos.set(B0.x + 7, 2.2, B0.z + 2.5); camLook.set(0, 1, GOAL_Z); }
    else { camPos.copy(camAim.pos).addScaledVector(shot.dir, -1.4).add(V(0, 0.35, 0)); camLook.copy(camAim.look); }
    camTo(camAim.pos, camAim.look, 1.8);
    later(first ? 1.5 : 1.1, () => { sfx('whistle_start', 0.6); setPhase('aim'); reticle.visible = true; });
  }
  function shotCam() {
    const far = S.wall ? 1.6 : 0;
    const pos = shot.B0.clone().addScaledVector(shot.dir, -5.0 - far).addScaledVector(shot.right, 0.05).setY(2.0 + far * 0.25);
    if (camera.aspect < 0.7) pos.addScaledVector(shot.dir, -0.4);
    const look = shot.B0.clone().lerp(V(0, 0, GOAL_Z), 0.6).setY(0.85);
    return { pos, look };
  }

  // input: tap/drag on the goal to aim
  const ray = new THREE.Raycaster(), ndc = V2(), goalPlane = new THREE.Plane(V(0, 0, -1), GOAL_Z - 0.05), hit = V();
  function aimAt(ev) {
    if (S.phase !== 'aim' || S.charging) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(goalPlane, hit)) {
      aim.set(clamp(hit.x, -GW / 2, GW / 2), clamp(hit.y, 0.15, GH));
      if (!S.aimed) { S.aimed = true; on.aimed(); }
    }
  }
  let dragging = false;
  const onDown = (e) => { dragging = true; aimAt(e); };
  const onMove = (e) => { if (dragging) aimAt(e); };
  const onUp = () => (dragging = false);
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  /** The player's shot, as told by the engine: power 0..1, outcome and where the ball went. */
  function shoot({ power, outcome, x, y, perfect, assisted }) {
    if (S.phase !== 'aim') return;
    setPhase('runup'); reticle.visible = false;
    let q = timingGrade(power);
    if (assisted) q = 'good';
    else if (perfect) q = 'perfect';
    else if (q === 'perfect') q = 'good';
    if (!assisted) on.grade(q);
    const t = shotTarget(outcome, x, y);
    S.central = Math.abs(t.at.x - keeper.root.position.x) < 1.2;
    S.perfect = !!perfect;
    launch({ from: shot.B0, target: t.at, power, q, outcome: t.kind, by: 'us' });
    // run-up: three quick strides into the kick. He moves along the curve at the speed his
    // boots push the turf back (arc length, not curve parameter), so they never skate
    const lut = [0]; let pp = shot.start.clone();
    for (let i = 1; i <= 40; i++) { const q2 = runPoint(i / 40); lut.push(lut[i - 1] + q2.distanceTo(pp)); pp = q2; }
    S.run = { t: 0, s: 0, lut }; S.stride = null;
    hero.play('run', { fade: 0.12, speed: 0.4 }); heroFeet.stepNow(0.16, 0.05);   // first step: both boots leave the stance, none drags
    keeper.hop();
  }
  function runPoint(u) { const a = 1 - u; return V().addScaledVector(shot.start, a * a).addScaledVector(shot.ctrl, 2 * a * u).addScaledVector(shot.R, u * u); }
  function updateRunup(dt) {
    const r = S.run; r.t += dt;
    const v = heroRun.ground * 1.35 * Math.min(1, 0.25 + r.t / 0.32);   // first stride accelerates
    r.s += v * dt; if (hero.cur === hero.A.run) hero.A.run.timeScale = v / heroRun.ground;
    const L = r.lut, total = L[L.length - 1]; let i = 1; while (i < L.length - 1 && L[i] < r.s) i++;
    const u = r.s >= total ? 1 : (i - 1 + (r.s - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1])) / (L.length - 1);
    const a = 1 - u, p = runPoint(u);
    const tan = V().addScaledVector(shot.ctrl.clone().sub(shot.start), 2 * a).addScaledVector(shot.R.clone().sub(shot.ctrl), 2 * u);
    heroM.position.copy(p); heroM.rotation.y = Math.atan2(tan.x, tan.z);
    if (total - r.s <= strideLen(v) || u >= 1) { // last stride into the ball
      S.stride = Object.assign(lastStride(p, tan.normalize().multiplyScalar(v), shot.R), { y0: heroM.rotation.y, y1: heroM.rotation.y + wrapAngle(shot.yaw - heroM.rotation.y) });
      hero.play('kick', { fade: 0.08, loop: false, from: KICK_FROM, speed: KICK_STEP }); heroFeet.stepNow(STRIDE_A, 0.08, 'Left');
      setPhase('kick'); S.kickT = 0; S.kickAt = STRIDE_T;
      camTo(shot.B0.clone().addScaledVector(shot.dir, -2.4).addScaledVector(shot.right, -1.4).setY(1.15), shot.B0.clone().addScaledVector(shot.dir, 3).setY(0.75), 3);
    }
  }

  // generic shot flight (ours, a teammate's or theirs) + keeper plan
  function launch({ from, target, power, q, outcome, by }) {
    flight.outcome = outcome; flight.q = q; flight.by = by; flight.power = power;
    const dist = from.distanceTo(V(target.x, target.y, GOAL_Z));
    const D = lerp(0.95, 0.5, clamp(power, 0, 1)) * (q === 'weak' ? 1.15 : 1) * (dist / 7.5) ** 0.8;
    flight.D = D; flight.u = 0; flight.mode = 'curve'; flight.resolved = false; flight.held = false;
    flight.p0.copy(from); flight.p1.set(target.x, target.y, GOAL_Z);
    const curl = (Math.random() - 0.5) * 0.8 + Math.sign(target.x - from.x) * 0.25;
    flight.c.copy(from).lerp(flight.p1, 0.5); flight.c.x += curl; flight.c.y = Math.max(target.y, 0.3) * 0.55 + 0.35 + (q === 'over' ? 0.6 : 0);
    if (S.wall && by === 'us') { // over the wall: high enough where the curve passes it
      const u = S.wallFrac, need = (WALL_H - (1 - u) ** 2 * flight.p0.y - u * u * flight.p1.y) / (2 * u * (1 - u));
      flight.c.y = Math.max(flight.c.y, need);
    }
    flight.spin.set(-18 - power * 14, curl * 10, 0);
    // keeper plan: where his hands go, and how late
    const kx = keeper.root.position.x;
    let tx = target.x, ty = target.y, delay = 0.06;
    if (outcome === 'goal') {
      const central = Math.abs(target.x - kx) < 1.3;
      if (central) { tx = kx + (Math.random() < 0.5 ? 1 : -1) * 2.0; ty = 0.7 + Math.random() * 0.6; }    // guessed the wrong way
      else { tx = target.x - Math.sign(target.x - kx) * (0.65 + Math.random() * 0.35); ty = Math.max(0.3, target.y - 0.2); delay = 0.12; } // late and short
    } else if (outcome !== 'save') { tx = kx + (target.x - kx) * 0.6; ty = Math.min(target.y, 1.6); delay = 0.14; }
    flight.keeper = { at: V(tx, ty, GOAL_Z - 0.45), delay, catch: outcome === 'save' && (q === 'weak' || Math.abs(target.x - kx) < 0.9) };
  }
  function keeperGo() {
    const k = flight.keeper; const tc = Math.max(0.24, flight.D * 0.93 - k.delay);
    keeper.start(k.at, tc, { catch: k.catch });
  }

  function resolve(kind) {
    if (flight.resolved) return; flight.resolved = true; trailFade = 0.999;
    const by = flight.by, ours = by !== 'them';
    const goal = kind === 'goal';
    setPhase('resolved');
    on.result({ kind, by, q: flight.q, central: !!S.central, perfect: !!S.perfect });
    if (goal) {
      net.x = ballHolder.position.x; net.y = ballHolder.position.y; net.vel = 2.6; sfx('net');
      camTo(V(ballHolder.position.x * 0.6, 1.5, GOAL_Z - 4.2), V(ballHolder.position.x * 0.8, 1.0, GOAL_Z + 1), 2.6);
      if (ours) {
        sfx('crowd_cheer'); buzz([30, 40, 60]); shake = reduced ? 0 : 0.18;
        burst(V(ballHolder.position.x, 1.2, GOAL_Z + 0.6), 200, 5); fansCheer('us');
        const star = by === 'mate' ? S.mate : null;
        // TV cut to the scorer (a swoop across the pitch showed empty grass for half a second)
        later(0.8, () => cutTo(() => {
          setPhase('celebrate'); S.celebrateAt = simTime;
          if (star) { S.star = star.m; star.a.play('cheer', { fade: 0.3 }); } else { S.star = heroM; hero.play('cheer', { fade: 0.3 }); }
          celebrateCam(simTime); camPos.copy(camTarget.pos); camLook.copy(camTarget.look);
          burst(V(S.star.position.x, 2.2, S.star.position.z + 0.3), 140, 4);
        }));
      } else {
        sfx('crowd_groan'); buzz(40); fansCheer('them');
        later(0.8, () => cutTo(() => { // cut to the scorer, not two seconds of an empty net
          setPhase('celebrate'); S.celebrateAt = simTime; S.star = rivalM; rival.play('cheer', { fade: 0.2 }); celebrateCam(simTime); camPos.copy(camTarget.pos); camLook.copy(camTarget.look);
        }));
      }
    } else if (kind === 'save') {
      sfx('save'); buzz(25); shake = reduced ? 0 : 0.07;
      if (ours) { sfx('crowd_groan', 0.7); fansCheer('them'); } else { sfx('crowd_cheer', 0.7); fansCheer('us'); }
      const kp = keeper.b.Hips.getWorldPosition(V()), side = flight.p1.x > keeper.root.position.x ? 1 : -1;
      camTo(V(kp.x + side * 2.2, 1.35, GOAL_Z - 4.2), V(kp.x, 0.6, GOAL_Z - 0.3), 2.2);
    } else if (kind === 'post') {
      sfx('post'); sfx('crowd_groan', 0.6); buzz([20, 30, 20]); shake = reduced ? 0 : 0.1;
    } else {
      sfx(ours ? 'crowd_groan' : 'crowd_cheer', 0.6);
    }
    later(goal ? 3.4 : 2.6, done);
  }

  // -------------------------------------------------------------- pass moment
  // The player stands on the ball with a teammate on each side; the other mahalle's man
  // marks one of them. The player picks a side on the ring; the engine says whether the
  // pass found its man (he finishes first time) or was lost.
  const P = { active: false };
  const MATE_SPOTS = { left: V(4.4, 0, 2.4), right: V(-4.4, 0, 2.4) };   // screen left is +x (camera looks down +z)
  function setupPass(m) {
    setPhase('pass-intro');
    const B0 = shot.B0.set(0, BALL_R, -4.2);
    shot.dir.set(0, 0, 1); shot.right.set(-1, 0, 0); shot.yaw = 0;
    const off = heroFoot.clone(); off.y = 0;
    shot.R.copy(B0).sub(off).setY(0);
    ballHolder.position.copy(B0);
    heroM.position.copy(shot.R).addScaledVector(shot.dir, -strideLen(STRIDE_V)); heroM.rotation.set(0, 0, 0);
    hero.snap('idle', { from: Math.random() * 3 });
    keeper.reset(0, GOAL_Z - 0.35, B0);
    Object.assign(P, { active: true, t: 0, open: m.openSide, mates: {} });
    // each mate stands so his right boot meets a ball rolled to his spot, facing the goal
    ['left', 'right'].forEach((side, i) => {
      const x = mates[i]; if (!x) return;
      const spot = MATE_SPOTS[side], yaw = Math.atan2(-spot.x * 0.6, GOAL_Z - spot.z);
      const foot = x.foot.clone().applyAxisAngle(V(0, 1, 0), yaw); foot.y = 0;
      x.m.position.copy(spot).sub(foot); x.m.rotation.set(0, yaw, 0); x.m.visible = true; x.yaw = yaw; x.spot = spot.clone().setY(BALL_R);
      x.a.snap('idle', { from: i * 1.7 }); x.feet.reset();
      P.mates[side] = x;
      mateRings[i].position.set(spot.x, 0.02, spot.z); mateRings[i].visible = side === m.openSide;
    });
    // the marker stands goal-side of the marked mate, a step toward the ball, facing it
    const marked = m.openSide === 'left' ? 'right' : 'left', ms = MATE_SPOTS[marked];
    const mk = ms.clone().lerp(V(B0.x, 0, B0.z), 0.16); mk.x += Math.sign(ms.x) * -0.15;
    rivalM.visible = true; rivalM.position.copy(mk); rivalM.rotation.set(0, Math.atan2(B0.x - mk.x, B0.z - mk.z), 0);
    rival.snap('idle', { from: 1.1 }); rivalFeet.reset();
    P.marker = mk.clone(); markRing.position.set(mk.x, 0.02, mk.z); markRing.visible = true;
    camPos.copy(B0).add(V(0.4, 3.6, -6.4)); camLook.set(0, 0.6, 1.2);
    camTo(V(B0.x + 0.3, 3.3, B0.z - 5.6), V(0, 0.5, 1.6), 2);
    later(1.1, () => { sfx('whistle_start', 0.6); setPhase('pass'); P.t = 0; });
  }
  /** Timing of the pass ring right now (0..1000), the value the screen sends to the engine. */
  const passTiming = () => Math.round(tri(P.t, PASS_PERIOD) * 1000);
  function passTo(side, outcome) {
    if (S.phase !== 'pass') return;
    setPhase('passing');
    const x = P.mates[side]; if (!x) return;
    const open = side === P.open;
    P.side = side; P.outcome = outcome; P.x = x;
    // the ball's end point: the mate's boot, the marker's boot (cut out), or past the mate (overhit)
    const B0 = shot.B0.clone();
    if (outcome === 'assist') P.to = x.spot.clone();
    else if (!open) P.to = P.marker.clone().addScaledVector(B0.clone().sub(P.marker).setY(0).normalize(), 0.45).setY(BALL_R);
    else P.to = x.spot.clone().addScaledVector(x.spot.clone().sub(B0).setY(0).normalize(), 6).add(V(Math.sign(x.spot.x) * 1.5, 0, -1)).setY(BALL_R);
    const dir = P.to.clone().sub(B0).setY(0).normalize(), yaw = Math.atan2(dir.x, dir.z);
    const off = heroFoot.clone().applyAxisAngle(V(0, 1, 0), yaw); off.y = 0;
    const R = B0.clone().sub(off).setY(0);
    S.stride = Object.assign(lastStride(heroM.position.clone(), dir.clone().multiplyScalar(STRIDE_V), R), { y0: heroM.rotation.y, y1: heroM.rotation.y + wrapAngle(yaw - heroM.rotation.y) });
    hero.play('kick', { fade: 0.08, loop: false, from: KICK_FROM, speed: KICK_STEP }); heroFeet.stepNow(STRIDE_A, 0.08, 'Left');
    S.kickT = 0; S.kickAt = STRIDE_T; S.passFrom = B0;
    mateRings.forEach((r) => (r.visible = false)); markRing.visible = false;
    camTo(B0.clone().add(V(-dir.x * 3 + 0.6, 2.4, -dir.z * 3 - 1.5)), P.to.clone().lerp(B0, 0.35).setY(0.6), 2.4);
  }
  function updatePass(dt) {
    if (!P.active) return;
    P.t += dt;
    if (S.phase === 'passing' && S.stride) {
      S.kickT += dt; strideMove(heroM, hero, S.stride, S.kickT);
      if (S.kickT >= S.kickAt && !P.roll) {
        sfx('kick', 0.8); buzz(12);
        const dist = S.passFrom.distanceTo(P.to);
        P.roll = { u: 0, D: clamp(dist / 9.5, 0.55, 1.6), from: S.passFrom.clone() };
        // the mate times his first-time finish so the boot meets the ball as it arrives
        if (P.outcome === 'assist') P.kickIn = P.roll.D - (KICK_CONTACT - KICK_PLANT) / KICK_SPEED;
      }
    }
    if (P.roll && !P.roll.end) {
      const r = P.roll; r.u = Math.min(1, r.u + dt / r.D);
      const e = 1 - (1 - r.u) * (1 - r.u) * 0.55 - (1 - r.u) * 0.45 * (1 - r.u);   // slows as it goes
      const was = ballHolder.position.clone();
      ballHolder.position.lerpVectors(r.from, P.to, clamp(r.u * 0.4 + e * 0.6, 0, 1));
      ball.rotation.x += ballHolder.position.distanceTo(was) / BALL_R;
      if (P.kickIn !== undefined && r.u * r.D >= P.kickIn && !P.kicked) {
        P.kicked = true; S.mate = P.x;
        P.x.a.play('kick', { fade: 0.08, loop: false, from: KICK_PLANT, speed: KICK_SPEED });
      }
      if (r.u >= 1) { r.end = true; passArrived(); }
    }
    if (P.loose) { // a cleared or overhit ball rolls on and stops
      const v = P.loose; v.y -= 9.8 * dt; ballHolder.position.addScaledVector(v, dt);
      if (ballHolder.position.y < BALL_R) { ballHolder.position.y = BALL_R; v.y = Math.abs(v.y) * 0.35; v.x *= 0.9; v.z *= 0.9; }
      v.multiplyScalar(Math.exp(-1.2 * dt)); ball.rotation.x += v.length() * dt / BALL_R;
    }
  }
  function passArrived() {
    const x = P.x;
    if (P.outcome === 'assist') {
      // first-time finish into the corner away from the keeper; the keeper is beaten
      const from = ballHolder.position.clone(), corner = from.x > 0 ? -1 : 1;
      launch({ from, target: V2(corner * (GW / 2 - 0.55), 0.5 + Math.random() * 0.7), power: 0.82, q: 'good', outcome: 'goal', by: 'mate' });
      keeper.hop();
      startFlight();
      camTo(from.clone().add(V(-corner * 1.2, 1.6, -3.4)), V(from.x * 0.3, 0.9, GOAL_Z), 2.6);
      return;
    }
    setPhase('resolved');
    on.result({ kind: 'lost', by: 'us', marked: P.side !== P.open });
    if (P.side !== P.open) { // the marker cuts it out and clears it back up the pitch
      sfx('kick', 0.6); sfx('crowd_cheer', 0.5); fansCheer('them');
      P.loose = V((Math.random() - 0.5) * 3, 2.4, -7);
    } else { // overhit: past the mate toward the touchline
      sfx('crowd_groan', 0.6);
      P.loose = P.to.clone().sub(S.passFrom).setY(0).normalize().multiplyScalar(2.5);
    }
    camTo(x.m.position.clone().add(V(Math.sign(x.m.position.x) * -2, 2.2, -4.5)), x.m.position.clone().setY(0.6), 2);
    later(2.4, done);
  }

  // -------------------------------------------------------------- defense moment
  const D = { active: false };
  function setupDefense(m) {
    setPhase('defend-intro');
    const s = m.attackSide === 'left' ? -1 : 1;   // engine attackSide: the forward goes (and drops his shoulder) this way; +1 = screen right (+x)
    Object.assign(D, { active: true, t: 0, s, lane: (Math.random() - 0.5) * 0.8, speed: RUN_SPEED, z: DEF_Z - ATT_START - 0.9 * RUN_SPEED, x: 0, dip: 0, cut: 0, cutDir: s, tapped: false, side: 0, timing: 0, result: null, after: null, skip: m.skip, phase: 'approach', slideT: -1, past: false, shotQueued: false, touchPhase: 0, contact: false, hurdle: false, yaw: 0, hurdleT: -1, cutT: 0, brake: undefined, free: false, bvel: null, kick: null, shooting: false, slide: null, shot: null, reverse: false, revCam: false, vel: null, ballV: null });
    D.x = D.lane;
    heroM.position.set(0, 0, DEF_Z); heroM.rotation.set(0, Math.PI, 0); hero.snap('jockey', { from: 0 });
    rivalM.visible = true; rivalM.position.set(D.x, 0, D.z); rivalM.rotation.set(0, 0, 0); rival.snap('run', { speed: RIVAL_RUN, from: rivalRun.touchT });
    ballHolder.position.set(D.x + 0.1, BALL_R, D.z + 0.6);
    keeper.reset(0, GOAL_Z - 0.35, V(0, 0, 0));
    camPos.set(0.4, 2.4, DEF_Z + 5.5); camLook.set(0, 1, DEF_Z - 6);
    camTo(V(0.35, 2.05, DEF_Z + 4.0), V(0, 0.55, DEF_Z - 5), 2.2);
    later(0.9, () => { sfx('whistle_start', 0.6); setPhase('defend'); });
  }
  const defTiming = (d) => clamp(750 * (ATT_START - d) / (ATT_START - 2.4), 0, 1000);

  /** The player's slide: side +1 right, −1 left, at the timing the screen sent, with the engine's outcome. */
  function tackle(side, timing, outcome) {
    if (S.phase !== 'defend' || D.tapped) return;
    D.tapped = true; D.side = side; D.timing = timing; D.after = outcome;
    setPhase('tackle');
    const read = side === D.s, timed = Math.abs(D.timing - 750) <= 150;
    D.result = outcome === 'stopped' ? 'stopped' : 'beaten';
    on.grade(timed ? (Math.abs(D.timing - 750) <= 60 ? 'perfect' : 'timed') : D.timing < 600 ? 'early' : 'late');
    // the slide: aim it at where the ball will be when the foot gets there
    const speed = 1.15, tc = SLIDE_CONTACT / speed;
    const ahead = D.z + 0.6 + D.speed * tc;
    const sideX = (read ? D.lane + side * 0.75 : D.lane + side * 1.0);
    const I = V(D.result === 'stopped' ? sideX : sideX + side * 0.25, 0, Math.min(ahead, heroM.position.z - 0.6));
    const yaw = Math.atan2(I.x - heroM.position.x, I.z - heroM.position.z);
    const foot = (side > 0 ? heroSlideFoot.R : heroSlideFoot.L).clone().applyAxisAngle(V(0, 1, 0), yaw); foot.y = 0;
    D.slide = { from: heroM.position.clone(), to: I.clone().sub(foot), yaw0: heroM.rotation.y, yaw: heroM.rotation.y + wrapAngle(yaw - heroM.rotation.y), tc, t: 0, I };
    D.slideT = 0;
    hero.play(side > 0 ? 'slideR' : 'slideL', { fade: 0.1, loop: false, speed });
    if (D.result === 'stopped') { D.stopAt = I.clone(); }
    // the forward reacts: cut away (beaten) or carry on into the tackle
    later(D.result === 'stopped' ? 99 : 0.12, () => { if (D.result === 'beaten') { D.cut = 1; D.cutDir = read ? side : D.s; } });
    slowTimer = reduced ? 0 : 0.5;
  }

  function updateDefense(dt) {
    if (!D.active) return;
    D.t += dt;
    const hz = heroM.position.z;
    const d = hz - D.z;
    // forward: run, dip the shoulder, cut
    let vx = 0, vz = D.speed;
    if (D.cut) { vx = D.cutDir * 3.6 * (1 - smooth(0.3, 0.9, D.cutT || 0)); D.cutT = (D.cutT || 0) + dt; }
    if (D.result === 'stopped' && D.contact) { D.brake = Math.max(0, (D.brake ?? D.speed) - dt * 11); vz = D.brake; }
    if (D.past) { const tgt = V(D.cutDir * 1.3, 0, GOAL_Z - 8.3); vx = clamp((tgt.x - D.x) * 2.2, -3, 3); }
    if (D.result === 'beaten') { // go round the defender's body, not through it
      const body = heroBody(); const gap = D.x - body.x, ahead = body.z - D.z;
      if (ahead > -0.3 && ahead < 2.8 && Math.abs(gap) < 1.25) vx += (Math.sign(gap) || D.cutDir) * 4.5 * (1.25 - Math.abs(gap));
    }
    if (D.hurdleT >= 0) D.hurdleT += dt;
    if (D.shooting) { // last stride into the ball (he slows from his run), plant, strike, stay planted
      const k = D.shot; k.t += dt;
      strideMove(rivalM, rival, k, k.t); D.x = rivalM.position.x; D.z = rivalM.position.z; D.yaw = rivalM.rotation.y;
      if (!flight.active) { const was = ballHolder.position.clone(); hermite(ballHolder.position, k.b0, k.bm0, k.b1, k.bm1, Math.min(1, k.t / k.T)); ball.rotation.x += ballHolder.position.distanceTo(was) / BALL_R; }
      vx = 0; vz = 0;
    } else {
      if (S.phase === 'defend' || S.phase === 'defend-intro' || D.result) { D.x += vx * dt; D.z += vz * dt; D.vel = V(vx, 0, vz); }
      separate();
      D.yaw += (Math.atan2(vx, vz) * 0.6 - D.yaw) * (1 - Math.exp(-9 * dt));   // turns into a cut, never snaps
      rivalM.position.set(D.x, 0, D.z); rivalM.rotation.y = D.yaw;
    }
    // legs turn over at the speed he actually covers ground
    if (rival.cur === rival.A.run) rival.A.run.timeScale = clamp(Math.hypot(vx, vz) / rivalRun.ground, 0.4, 2.2);
    // shoulder drop toward the side he will go
    if (d < 5.6 && !D.cut) D.dip = Math.min(1, D.dip + dt / 0.32);
    else if (D.cut) D.dip = Math.max(0, D.dip - dt / 0.4);
    // ball: touches ahead of the forward until someone takes it
    if (!D.free) {
      // the ball's phase runs on the run clip's clock: 0 = the right boot touches it
      const ra = rival.A.run, cyc = 2 * rivalRun.dur;          // one touch every second stride cycle
      D.touchPhase += (dt * (rival.cur === ra ? ra.timeScale : RIVAL_RUN)) / cyc;
      if (D.touchPhase >= 1) D.touchPhase -= 1;
      const u = D.touchPhase;
      const lead = rivalRun.toe.z + BALL_R * 0.9 + 0.62 * Math.sin(Math.PI * u);
      const prev = ballHolder.position.clone();
      const off = V(rivalRun.toe.x * 0.85, 0, lead).applyAxisAngle(V(0, 1, 0), rivalM.rotation.y);
      ballHolder.position.set(D.x + off.x, BALL_R, D.z + off.z);
      const moved = ballHolder.position.distanceTo(prev);
      if (moved < 0.5) { ball.rotation.x += moved / BALL_R; D.ballV = ballHolder.position.clone().sub(prev).divideScalar(Math.max(dt, 1e-4)); }
    }
    // defender: jockey back a little until the tackle
    if (!D.tapped) {
      if (S.phase === 'defend') { heroM.position.z = Math.min(DEF_Z + 1.2, hz + dt * 0.7); heroM.position.x = lerp(heroM.position.x, D.x * 0.5, dt * 2); }
      if (S.phase === 'defend') on.ring(defTiming(heroM.position.z - D.z) / 1000);
      if (d < 1.7 && S.phase === 'defend') { // never tackled: he goes past
        D.tapped = true; D.result = 'beaten'; D.after = D.skip === 'conceded' ? 'conceded' : 'survived'; D.cut = 1; D.cutDir = D.s; D.side = 0; D.timing = 1000;
        setPhase('tackle'); on.skipped();
        hero.play('idle', { fade: 0.3 });
      }
    } else if (D.slide && D.slideT >= 0) {
      D.slideT += dt; const sl = D.slide; const u = smooth(0, sl.tc * 0.8, D.slideT);
      heroM.position.lerpVectors(sl.from, sl.to, u); heroM.rotation.y = lerp(sl.yaw0, sl.yaw, smooth(0, 0.15, D.slideT));
      if (D.result === 'stopped' && !D.contact) { // steer the ball onto the boot
        const k = smooth(0, sl.tc, D.slideT); D.free = true;
        ballHolder.position.lerp(V(sl.I.x, BALL_R, sl.I.z), Math.min(1, k * 0.35 + dt * 6));
        if (D.slideT >= sl.tc) {
          D.contact = true; sfx('kick', 0.7); buzz([20, 30]); shake = reduced ? 0 : 0.1;
          D.bvel = V(D.side * 3.5 + (Math.random() - 0.5), 1.6, 2.6);
          rival.play('hurdle', { fade: 0.12, loop: false, speed: 1.4, from: HURDLE_OFF });
          defenseStopped();
        }
      }
    }
    if (D.free && D.bvel) { // loose ball after a tackle
      D.bvel.y -= 9.8 * dt; ballHolder.position.addScaledVector(D.bvel, dt);
      if (ballHolder.position.y < BALL_R) { ballHolder.position.y = BALL_R; D.bvel.y = Math.abs(D.bvel.y) * 0.4; D.bvel.x *= 0.8; D.bvel.z *= 0.8; }
      ball.rotation.x += dt * 10;
    }
    // beaten: hurdle the slide if it came his way, then run at goal and shoot
    if (D.result === 'beaten' && !D.past && D.z > hz + 0.8) { D.past = true; D.cut = 0; D.reverse = !D.revCam; D.revCam = true; }
    if (D.result === 'beaten' && D.side === D.s && !D.hurdle && d < 1.2) { D.hurdle = true; D.hurdleT = 0; rival.play('hurdle', { fade: 0.1, loop: false, speed: 1.5, from: HURDLE_OFF }); later((HURDLE_LAND - HURDLE_OFF) / 1.5, () => rival.play('run', { fade: 0.15, speed: RIVAL_RUN, from: (rivalRun.touchT + D.touchPhase * 2 * rivalRun.dur) % rivalRun.dur }), true); }
    if (D.past && !D.shotQueued && D.z > GOAL_Z - 8.6) { D.shotQueued = true; rivalShot(); }
    // cue ring over the dropping shoulder
    const sh = rival.model.getObjectByName(D.s > 0 ? 'LeftArm' : 'RightArm');
    if (sh) { sh.getWorldPosition(cue.position); cue.material.opacity = D.tapped ? 0 : D.dip * 0.9 * (0.75 + 0.25 * Math.sin(D.t * 12)); }
    // camera: behind the defender, then with the forward
    // beaten: the moment the forward is about to leave the shot, cut to the reverse angle behind him
    if (D.result === 'beaten' && !D.revCam) { const p = rivalM.getObjectByName('Hips').getWorldPosition(camAvoid).project(camera); if (Math.abs(p.x) > 0.75 || p.z > 1) D.revCam = D.reverse = true; }
    if (D.contact) camTo(V(D.side * 2.6, 2.3, DEF_Z + 3.6), V(heroM.position.x * 0.5, 0.5, DEF_Z - 1.5), 1.8);
    else if (!D.revCam && !D.shooting) { const cz = Math.max(heroM.position.z, DEF_Z) + 4.0; camTo(V(0.35 + D.x * 0.2, 2.05, cz), V(D.x * 0.5, 0.55, D.z + 1.5), D.tapped ? 3 : 2.2); }
    else if (D.revCam && !D.shooting) {
      camTo(V(D.x - D.cutDir * 0.3, 1.75, D.z - 3.2), V(D.x * 0.4, 0.8, GOAL_Z), 3);
      // reverse angle: a hard cut like TV (swinging round 180° pointed the camera at the grass)
      if (D.reverse) { D.reverse = false; camPos.copy(camTarget.pos); camLook.copy(camTarget.look); }
    }
  }
  // the defender's body on the ground plane (follows the slide), and the push that keeps the
  // forward outside it; legs are skipped while he hurdles them
  function heroBody() { const h = heroM.getObjectByName('Hips').getWorldPosition(V()); return { x: h.x, z: h.z }; }
  const BODY = [['Hips', 0.68], ['Spine02', 0.66], ['Head', 0.55]], LEGS = [['LeftLeg', 0.5], ['RightLeg', 0.5], ['LeftFoot', 0.46], ['RightFoot', 0.46]];
  function separate() {
    const air = D.hurdleT >= 0 && D.hurdleT < 0.5;
    for (const [n, r] of air ? BODY : BODY.concat(LEGS)) {
      const p = heroM.getObjectByName(n).getWorldPosition(V());
      const dx = D.x - p.x, dz = D.z - p.z;
      if (dx * dx + dz * dz >= r * r) continue;
      // slide sideways to the edge (keeps his run line), toward the side he is already on
      const sx = Math.sign(dx) || D.cutDir || 1;
      D.x = p.x + sx * Math.sqrt(Math.max(0, r * r - dz * dz));
    }
  }
  // pose layer for the forward: shoulder drop (after the mixer)
  function poseRival() {
    if (!D.active || !rivalM.visible || D.dip <= 0) return;
    const b = (n) => rivalM.getObjectByName(n);
    const fwd = V(0, 0, 1).applyQuaternion(rivalM.quaternion);
    const a = D.dip * 0.32 * D.s;   // + s drops toward +x
    rotateWorld(b('Spine01'), fwd, -a * 0.6); rotateWorld(b('Spine'), fwd, -a * 0.5); rotateWorld(b('neck'), fwd, a * 0.5);
  }
  function defenseStopped() {
    setPhase('resolved');
    on.result({ kind: 'stopped', by: 'us' });
    sfx('crowd_cheer', 0.7); fansCheer('us');
    later(2.6, done);
  }
  function rivalShot() {
    // set the forward behind the ball and strike
    D.shooting = true; D.free = true;
    const s = D.cutDir;
    // last stride straight on from his run; the ball rolls on, slowing, onto the striking boot
    const T = STRIDE_T, p0 = rivalM.position.clone(), v0 = (D.vel || V(0, 0, RUN_SPEED)).clone();
    const p1 = p0.clone().addScaledVector(v0.clone().normalize(), strideLen(v0.length()));
    const toGoal = (at) => V(-at.x * 0.9, 0, GOAL_Z - at.z).normalize();
    const g0 = toGoal(p1), off = rivalFoot.clone().applyAxisAngle(V(0, 1, 0), Math.atan2(g0.x, g0.z)); off.y = 0;
    const b0 = ballHolder.position.clone(), from = p1.clone().add(off); from.y = BALL_R;
    const dir = toGoal(from), yaw = Math.atan2(dir.x, dir.z);
    const roll = from.distanceTo(b0), bm0 = (D.ballV || v0).clone().setY(0).multiplyScalar(T);
    if (bm0.length() > roll * 2.5) bm0.setLength(roll * 2.5);   // never past the boot and back
    D.shot = Object.assign(lastStride(p0, v0, p1), { t: 0, y0: D.yaw, y1: D.yaw + wrapAngle(yaw - D.yaw), b0, b1: from.clone(), bm0, bm1: from.clone().sub(b0).setY(0).normalize().multiplyScalar(0.5 * T) });
    rivalFeet.stepNow(STRIDE_A, 0.08, 'Left');
    rival.play('kick', { fade: 0.1, loop: false, from: KICK_FROM, speed: KICK_STEP });
    // the engine said whether he scores; a miss is a save or wide, for the look of it
    const tx = -s * (1.2 + Math.random() * 0.9), ty = 0.3 + Math.random() * 1.2;
    let target, outcome;
    if (D.after === 'conceded') { target = V2(tx, ty); outcome = 'goal'; }
    else if (Math.random() < 0.6) { target = V2(tx * 0.7, ty); outcome = 'save'; }
    else { target = V2(-s * (GW / 2 + 0.5 + Math.random() * 0.6), ty + 0.3); outcome = 'miss'; }
    launch({ from, target, power: 0.75, q: 'good', outcome, by: 'them' });
    D.kick = { t: 0, at: T };
    camTo(from.clone().addScaledVector(dir, -3.4).add(V(-s * 0.5, 1.6, 0)), V(from.x * 0.3, 0.9, GOAL_Z), 2.4);
  }

  // -------------------------------------------------------------- per-frame
  const tmp = V(), tmp2 = V();
  function bez(u, out) { const a = 1 - u; return out.set(0, 0, 0).addScaledVector(flight.p0, a * a).addScaledVector(flight.c, 2 * a * u).addScaledVector(flight.p1, u * u); }
  function bezD(u, out) { return out.copy(flight.c).sub(flight.p0).multiplyScalar(2 * (1 - u)).addScaledVector(tmp2.copy(flight.p1).sub(flight.c), 2 * u); }

  function updateKick(dt) {
    if (S.phase === 'runup') updateRunup(dt);
    else if (S.phase === 'kick') {
      S.kickT += dt;
      if (S.stride) strideMove(heroM, hero, S.stride, S.kickT);
      if (S.kickT >= S.kickAt) startFlight();
    }
    if (D.kick && D.kick.t >= 0) { D.kick.t += dt; if (D.kick.t >= D.kick.at) { D.kick.t = -1; startFlight(); } }
  }
  function startFlight() {
    if (S.phase === 'kick') setPhase('flight');
    flight.active = true; sfx(flight.by === 'us' && S.perfect ? 'kick_power' : 'kick'); buzz(18); fovTarget = 44;
    later(flight.keeper.delay, keeperGo, true);
  }
  function updateBall(dt) {
    if (!flight.active) return;
    const pos = ballHolder.position;
    if (flight.held) { pos.copy(keeper.handsWorld()); return; }
    if (flight.mode === 'curve') {
      flight.u += dt / flight.D;
      const u = Math.min(flight.u, 1); bez(u, pos);
      if (!slowTimer && (flight.outcome === 'goal' || flight.outcome === 'save') && pos.z > GOAL_Z - 2.2 && !reduced) slowTimer = 0.55;
      const hands = keeper.handsWorld();
      if (flight.outcome === 'save' && (pos.distanceTo(hands) < 0.3 || pos.z >= GOAL_Z - 0.4)) {
        flight.mode = 'free'; bezD(u, flight.vel).multiplyScalar(1 / flight.D);
        if (flight.keeper.catch) flight.held = true;
        else flight.vel.set(Math.sign(pos.x - keeper.root.position.x || 1) * (1.6 + Math.random()), 2.4 + Math.random() * 1.2, -Math.abs(flight.vel.z) * 0.3);
        resolve('save');
      } else if (flight.u >= 1) {
        bezD(1, flight.vel).multiplyScalar(1 / flight.D);
        flight.mode = 'free';
        if (flight.outcome === 'post') { flight.vel.z *= -0.45; flight.vel.x *= -0.6; flight.vel.y = 1.5; resolve('post'); }
        else if (flight.outcome === 'miss') resolve('miss');
      }
    } else {
      flight.vel.y -= 9.8 * dt; pos.addScaledVector(flight.vel, dt);
      if (flight.outcome === 'goal' && !flight.resolved && pos.z >= GOAL_Z + GD - 0.2) { pos.z = GOAL_Z + GD - 0.2; flight.vel.z *= -0.15; flight.vel.x *= 0.3; flight.vel.y *= 0.3; resolve('goal'); }
      if (flight.outcome === 'goal' && flight.resolved) pos.z = Math.min(pos.z, GOAL_Z + GD - 0.15);
      if (pos.z > GOAL_Z + 3.5) { pos.z = GOAL_Z + 3.5; flight.vel.z *= -0.2; }
      if (pos.y < BALL_R) { // a bounce scrubs speed; a rolling ball only slows a little
        pos.y = BALL_R; const impact = -flight.vel.y;
        if (impact > 0.4) { flight.vel.y = impact * 0.45; flight.vel.x *= 0.85; flight.vel.z *= 0.85; }
        else { flight.vel.y = 0; const f = Math.exp(-0.9 * dt); flight.vel.x *= f; flight.vel.z *= f; }
      }
    }
    ball.rotation.x += flight.spin.x * dt * (flight.mode === 'curve' ? 1 : 0.3); ball.rotation.y += flight.spin.y * dt;
    if ((S.phase === 'flight' || D.shooting || (P.active && S.phase === 'passing')) && !flight.resolved) {
      camTarget.look.lerp(tmp.set(pos.x * 0.7, Math.max(0.8, pos.y), GOAL_Z), 0.15);
      const back = flight.p1.clone().sub(flight.p0).setY(0).normalize();
      camTarget.pos.copy(pos).addScaledVector(back, -3.2).setY(1.55 + pos.y * 0.15); camTarget.pos.x = camTarget.pos.x * 0.6 + 0.4;
      if (camTarget.pos.z > GOAL_Z - 4.6) camTarget.pos.z = GOAL_Z - 4.6;
      camTarget.k = 3.2;
    }
    trailPts.unshift(pos.clone()); if (trailPts.length > TRAIL) trailPts.pop();
  }
  function updateTrail(dt) {
    if (trailFade < 1) trailFade = Math.max(0, trailFade - dt * 1.6);
    const lit = flight.active && (flight.mode === 'curve' || trailFade < 1);
    trail.forEach((s, i) => { const p = trailPts[i]; if (!p || !lit) { s.material.opacity = 0; return; } s.position.copy(p); const k = 1 - i / TRAIL; s.scale.setScalar(0.32 * k + 0.05); s.material.opacity = 0.55 * k * (flight.resolved ? trailFade : 1); });
  }

  // -------------------------------------------------------------- loop
  const clock = new THREE.Clock();
  let simTime = 0, worldTime = 0, raf = 0, paused = false, disposed = false;
  const timers = [];
  // later(): game-clock timers so slow motion and test stepping stay in sync
  function later(sec, fn, world = false) { timers.push({ at: (world ? worldTime : simTime) + sec, fn, world }); }
  function runTimers() { const due = timers.filter((t) => (t.world ? worldTime : simTime) >= t.at); if (!due.length) return; for (const t of due) timers.splice(timers.indexOf(t), 1); for (const t of due) if (!t.dead) t.fn(); }
  function frame() {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const rdt = Math.min(clock.getDelta(), 1 / 20);
    if (paused) return;
    step(rdt); composer.render();
  }
  function step(rdt) {
    simTime += rdt; const time = simTime;
    if (slowTimer > 0) { slowTimer -= rdt; worldScale = lerp(worldScale, 0.3, 0.25); if (slowTimer <= 0) slowTimer = -1; } else worldScale = lerp(worldScale, 1, 0.08);
    if (S.phase === 'aim' || S.phase === 'intro' || S.phase === 'defend-intro' || S.phase === 'pass') slowTimer = 0;
    const dt = rdt * worldScale;
    worldTime += dt; runTimers(); updateCut(rdt);

    reticle.position.x += (aim.x - reticle.position.x) * Math.min(1, rdt * 14);
    reticle.position.y += (aim.y - reticle.position.y) * Math.min(1, rdt * 14);
    reticle.scale.setScalar((S.reticleScale || 1) * (1 + Math.sin(time * 5) * 0.06 + (S.charging ? -0.12 : 0)));
    reticle.children[2].material.opacity = 0.25 + Math.sin(time * 5) * 0.15;

    hero.update(dt); if (rivalM.visible) rival.update(dt);
    for (const x of mates) if (x.m.visible) x.a.update(dt);
    for (const x of wall) if (x.m.visible) x.a.update(dt);
    for (const f of fans) f.a.update(dt);
    fansCalm();
    updateKick(dt); updateDefense(dt); updatePass(dt); poseRival();
    if (S.phase === 'pass') on.ring(tri(P.t, PASS_PERIOD));
    keeper.update(dt, time, flight.active ? ballHolder.position : null);
    heroFeet.on = hero.cur !== hero.A.slideR && hero.cur !== hero.A.slideL; heroFeet.apply(dt);
    if (rivalM.visible) { rivalFeet.on = rival.cur !== rival.A.hurdle; rivalFeet.apply(dt); }
    for (const x of mates) if (x.m.visible) { x.feet.apply(dt); x.m.position.y = 0; x.ground.apply(); }
    for (const x of wall) if (x.m.visible) x.feet.apply(dt);
    for (const f of fans) f.feet.apply(dt);
    heroM.position.y = 0; heroGround.apply(); if (rivalM.visible) { rivalM.position.y = 0; rivalGround.apply(); }
    updateBall(dt); updateNet(dt); updateConfetti(dt); updateTrail(dt);
    ballShadow.position.set(ballHolder.position.x, 0.005, ballHolder.position.z); ballShadow.material.opacity = 0.4 / (1 + ballHolder.position.y * 1.5);

    if (S.phase === 'celebrate') celebrateCam(time);
    if (S.phase === 'aim') { fovTarget = 46; const c = shotCam(); camTarget.pos.copy(c.pos).add(tmp.set(Math.sin(time * 0.5) * 0.05, Math.sin(time * 0.8) * 0.02, 0)); camTarget.look.copy(c.look).add(tmp.set((aim.x - shot.B0.x * 0.25) * 0.12, (aim.y - 1.1) * 0.08, 0)); }
    if (S.phase === 'menu') { const a = time * 0.12; camTarget.pos.set(Math.sin(a) * 9, 3.2, GOAL_Z - Math.cos(a) * 9 + 1); camTarget.look.set(0, 1, GOAL_Z - 2); camTarget.k = 1; }
    if (S.phase === 'defend' || S.phase === 'defend-intro') fovTarget = 50;
    if (S.phase === 'pass' || S.phase === 'pass-intro') fovTarget = 52;

    const k = 1 - Math.exp(-camTarget.k * rdt);
    camPos.lerp(camTarget.pos, k); camLook.lerp(camTarget.look, k);
    // the camera never passes through a player: it slides round him
    for (const m of [heroM, rivalM, ...mates.map((x) => x.m)]) if (m.visible) {
      const h = m.getObjectByName('Hips').getWorldPosition(camAvoid), dx = camPos.x - h.x, dz = camPos.z - h.z, d = Math.hypot(dx, dz);
      if (camPos.y < 2.1 && d < CAM_CLEAR && d > 1e-4) { camPos.x = h.x + (dx * CAM_CLEAR) / d; camPos.z = h.z + (dz * CAM_CLEAR) / d; }
      // chasing the ball past the striker: go over his shoulder, not past his ear
      if (flight.active && !flight.resolved && d < 2.6) camPos.y = Math.max(camPos.y, 1.55 + (1 - Math.max(d, CAM_CLEAR) / 2.6) * 1.2);
    }
    camera.position.copy(camPos); if (shake > 0.001) { camera.position.add(tmp.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0)); shake *= Math.pow(0.02, rdt); }
    camera.lookAt(camLook);
    camera.fov += (fovTarget - camera.fov) * Math.min(1, rdt * 4); camera.updateProjectionMatrix();
  }

  function resize() {
    ({ w: W, h: H } = size());
    renderer.setSize(W, H); canvas.style.width = '100%'; canvas.style.height = '100%';
    composer.setSize(W, H); bloom.setSize(W / 2, H / 2); camera.aspect = W / H; camera.updateProjectionMatrix();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  ro?.observe(host);

  // pre-match scenery: keeper in goal, our player by the ball, the camera circling
  shot.B0.set(0, BALL_R, 0); ballHolder.position.copy(shot.B0); heroM.position.set(0.6, 0, -1.8); heroM.rotation.set(0, 0, 0); hero.snap('idle'); rivalM.visible = false; keeper.reset(0, GOAL_Z - 0.35, shot.B0);
  frame();

  return {
    /** Sets up a moment: { kind, attackSide?, openSide?, skip? }. The first one opens without a cut. */
    start(m) { if (S.phase === 'menu') startMoment(m); else cutTo(() => startMoment(m)); },
    phase: () => S.phase,
    /** The aim in engine units: aim −1000 (left post) .. 1000, lift 0 .. 1000 (bar). */
    aim: () => ({ aim: Math.round(clamp(-aim.x / (GW / 2), -1, 1) * 1000), lift: Math.round(clamp(aim.y / GH, 0, 1) * 1000) }),
    setCharging(v) { S.charging = !!v; },
    shoot,
    /** Timing of the defense or pass ring right now, 0..1000. */
    timing: () => (S.phase === 'pass' ? passTiming() : Math.round(defTiming(heroM.position.z - D.z))),
    tackle,
    passTo,
    setPaused(p) { paused = !!p; if (!paused) clock.getDelta(); },
    /** Test hook: steps the game clock by `sec` at 60 fps and draws once. */
    sim(sec) { for (let i = 0; i < sec * 60; i++) step(1 / 60); composer.render(); },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); ro?.disconnect();
      canvas.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      composer.dispose(); renderer.dispose(); renderer.forceContextLoss();
      canvas.remove(); cutEl.remove();
    },
  };
}
