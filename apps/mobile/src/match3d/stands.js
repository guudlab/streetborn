// Stands and crowd round the halısaha: stepped concrete terraces behind both goals and
// along the sides, a few hundred fans, banners, flags and phone lights. The stands are
// plain geometry merged into one mesh; the fans are the four Meshy fan models, instanced,
// with their arms, jumps and colours worked out in the shaders, so a full stand costs no
// more CPU per frame than an empty one.
//
// The scene calls update() every frame and cheer() when something happens. The fans
// next to the fences (skinned copies of the same models, in scene.js) are animated with
// clips: these fill the terraces behind them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { aimBone } from './rig.js';

const STEP_H = 0.42, STEP_D = 0.8, BASE = 0.3;   // terrace riser, tread, first step height
const SEAT = 0.62;                               // shoulder to shoulder along a row
const FAN_SIZE = [1, 1, 1, 0.84];                // fan4 is the kid
// stand.glb (Meshy S1): a roofed four-row module, about 1.9 x 1.3 x 1.1 in its own units,
// rows along x, facing +z. Row centres (z) and seat tops (y) measured off the model.
const MODULE = { scale: 3.4, floor: -0.632, front: 0.555, width: 1.88, seatX: 0.72, rows: [[0.18, -0.38], [0.02, -0.268], [-0.17, -0.142], [-0.32, -0.015]] };

/**
 * opts: { goalZ, goal2Z, kit: our colour '#rrggbb', board: our banner text, away?: their
 *         banner text, fans: the fan GLTFs, module?: the stand module GLTF, seed,
 *         canvasTex(w, h, draw) }
 */
export function buildStands(scene, opts) {
  let seed = opts.seed || 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const group = new THREE.Group(); group.name = 'stands'; scene.add(group);

  // ------------------------------------------------------------ terraces
  // Each stand: a run of steps rising away from the pitch. `at` is the front edge centre,
  // `dir` the way the rows go back (unit, on the ground), `len` the row length.
  const STANDS = [
    { name: 'home', at: [0, opts.goalZ + 6.3], dir: [0, 1], len: 25, rows: 9, team: 'us' },          // behind the goal we attack
    { name: 'away', at: [0, opts.goal2Z - 5.2], dir: [0, -1], len: 21, rows: 7, team: 'them' },      // behind the far goal
    // the long sides: a row of the roofed modules (stand.glb), or plain steps without it
    { name: 'main', at: [16.4, -5], dir: [1, 0], len: 24, rows: 8, team: 'mixed', roof: true, modular: true },
    { name: 'side', at: [-16.4, -5], dir: [-1, 0], len: 20, rows: 4, team: 'mixed', modular: true },
  ];
  const concrete = [], trim = [], rails = [];
  const box = (list, w, h, d, x, y, z, ry) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(ry); g.translate(x, y, z); list.push(g); };
  const seats = [];   // where a fan can stand: { p: Vector3, yaw, stand }
  const dimmed = new Map();
  // the module's concrete is daylight grey: darker here, at night outside the floodlights
  const moduleMat = (m) => { if (!dimmed.has(m)) { const c = m.clone(); c.color.multiplyScalar(0.55); dimmed.set(m, c); } return dimmed.get(m); };
  for (const s of STANDS) {
    const [ax, az] = s.at, [dx, dz] = s.dir, ry = Math.atan2(dx, dz);   // ry: rows run along local x
    if (s.modular && opts.module) { placeModules(s, ry + Math.PI); continue; }
    const top = BASE + STEP_H * s.rows, depth = STEP_D * s.rows;
    const along = (u, v) => [ax + dx * v + dz * u, az + dz * v - dx * u];   // u: along the row, v: back from the front
    for (let i = 0; i < s.rows; i++) {
      const h = BASE + STEP_H * (i + 1), [x, z] = along(0, STEP_D * (i + 0.5));
      box(concrete, s.len, h, STEP_D, x, h / 2, z, ry);
      // lime paint on every other riser, as on a mahalle ground
      if (i % 2 === 0) { const [tx, tz] = along(0, STEP_D * i + 0.012); box(trim, s.len, 0.07, 0.02, tx, h - STEP_H + 0.06, tz, ry); }
      for (let k = 0; k < s.len / SEAT - 1; k++) {
        const u = -s.len / 2 + SEAT * (k + 0.5) + (rnd() - 0.5) * 0.12;
        const [fx, fz] = along(u, STEP_D * (i + 0.55) + (rnd() - 0.5) * 0.12);
        seats.push({ p: new THREE.Vector3(fx, h, fz), yaw: ry + Math.PI + (rnd() - 0.5) * 0.5 - u * 0.012 * Math.sign(dz || dx), stand: s, u, row: i });
      }
    }
    // back wall and side walls
    { const [x, z] = along(0, depth + 0.15); box(concrete, s.len + 0.6, top + 1.4, 0.3, x, (top + 1.4) / 2, z, ry); }
    for (const sd of [-1, 1]) { const [x, z] = along(sd * (s.len / 2 + 0.15), depth / 2); box(concrete, 0.3, top + 0.6, depth + 0.3, x, (top + 0.6) / 2, z, ry); }
    // front parapet with a rail on top
    { const [x, z] = along(0, -0.15); box(concrete, s.len + 0.6, 1.0, 0.25, x, 0.5, z, ry); }
    { const [x, z] = along(0, -0.15); box(rails, s.len + 0.6, 0.06, 0.06, x, 1.12, z, ry); }
    for (let k = 0; k <= s.len / 3; k++) { const [x, z] = along(-s.len / 2 + k * 3, -0.15); box(rails, 0.05, 0.14, 0.05, x, 1.05, z, ry); }
    // the main stand's roof: a slab on posts, lit from under its front edge
    if (s.roof) {
      const [x, z] = along(0, depth * 0.45); box(concrete, s.len + 1.2, 0.18, depth + 1.6, x, top + 3.4, z, ry);
      for (let k = 0; k <= 4; k++) { const [px, pz] = along(-s.len / 2 + (k * s.len) / 4, depth - 0.2); box(rails, 0.16, 3.5, 0.16, px, top + 1.65, pz, ry); }
      const [lx, lz] = along(0, -0.4); box(trim, s.len, 0.06, 0.12, lx, top + 3.28, lz, ry);
    }
  }
  // modules side by side along the stand; a fan behind each seat, feet on the tread, so the
  // seat in front hides the shins
  function placeModules(s, yaw) {
    const k = MODULE.scale, w = MODULE.width * k, n = Math.round(s.len / w);
    const [dx, dz] = s.dir, back = MODULE.front * k;
    for (let i = 0; i < n; i++) {
      const u = (i - (n - 1) / 2) * w;
      const m = opts.module.scene.clone();
      m.traverse((o) => { if (o.isMesh) o.material = moduleMat(o.material); });
      m.scale.setScalar(k); m.rotation.y = yaw;
      m.position.set(s.at[0] + dx * back + dz * u, -MODULE.floor * k, s.at[1] + dz * back - dx * u);
      m.updateMatrix(); m.updateMatrixWorld(true); m.matrixAutoUpdate = false;
      m.traverse((o) => { if (o.isMesh) o.matrixAutoUpdate = false; });
      group.add(m);
      MODULE.rows.forEach(([z, y], row) => {
        for (let x = -MODULE.seatX; x <= MODULE.seatX + 1e-6; x += SEAT / k) {
          const p = new THREE.Vector3(x + (rnd() - 0.5) * 0.02, y - 0.13, z - 0.04).applyMatrix4(m.matrixWorld);
          seats.push({ p, yaw: yaw + (rnd() - 0.5) * 0.5, stand: s, u: u + x * k, row });
        }
      });
    }
  }
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x2a2d28, roughness: 0.92, metalness: 0 });
  const trimMat = new THREE.MeshBasicMaterial({ color: 0x9bbf43, toneMapped: false });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x1b1f18, roughness: 0.6, metalness: 0.5 });
  for (const [list, mat] of [[concrete, concreteMat], [trim, trimMat], [rails, railMat]]) {
    const m = new THREE.Mesh(mergeGeometries(list), mat); m.matrixAutoUpdate = false; group.add(m);
  }

  // ------------------------------------------------------------ banners on the parapets
  const banner = (text, bg, fg, w, s, u) => {
    const tex = opts.canvasTex(512, 96, (g, W, H) => {
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.fillStyle = fg; g.font = `800 italic ${text.length > 14 ? 44 : 58}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, W / 2, H / 2 + 3, W - 30);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 96 / 512), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide }));
    const [dx, dz] = s.dir; const ry = Math.atan2(dx, dz);
    m.position.set(s.at[0] + dz * u - dx * 0.3, 0.62, s.at[1] - dx * u - dz * 0.3); m.rotation.y = ry + Math.PI;
    m.rotation.z = (rnd() - 0.5) * 0.04; group.add(m);
  };
  const home = STANDS[0], away = STANDS[1], main = STANDS[2];
  banner(opts.board, opts.kit, '#0d0d0d', 4.6, home, -5.5);
  banner('MAHALLEDE DOĞDU', '#0d0d0d', opts.kit, 4.6, home, 5.5);
  if (opts.away) banner(opts.away, '#2a2c2e', '#f2f2f2', 4.2, away, 3.5);
  banner('STREETBORN', '#0d0d0d', '#CFFD5C', 4.4, main, 2);

  // ------------------------------------------------------------ the crowd
  // The four Meshy fans (fan1-4.glb), each posed once with the arms down and frozen into a
  // plain mesh, drawn as one InstancedMesh per fan per stand so a stand out of shot is
  // culled. The vertex shader swings the arms round the shoulder and makes them jump; the
  // fragment shader puts each one's shirt (the lime texels) in their side's colours.
  const bodies = opts.fans.map((g, i) => bakeFan(g.scene, FAN_SIZE[i] ?? 1));

  // a few empty places, more on the higher rows of the away end (they travelled fewer). An
  // empty place gets no instance: a fan squashed to nothing would have zero-length normals,
  // and one NaN pixel spreads over the whole screen through the bloom
  for (let i = seats.length - 1; i >= 0; i--) { const st = seats[i]; if ((st.stand.team === 'them' && st.row > 3 && rnd() < 0.35) || rnd() < 0.08) seats.splice(i, 1); }
  const kit = new THREE.Color(opts.kit), graphite = new THREE.Color(0x2c2e31);
  const casual = [0xf2f2f2, 0x161616, 0x5b6068, 0x1f2a44, 0x3c5a7a, 0x7a2e2e, 0xd9d2c3].map((c) => new THREE.Color(c));
  const U = { uTime: { value: 0 }, uCheer: { value: new THREE.Vector2() }, uChant: { value: 0.6 } };
  const dummy = new THREE.Object3D();
  const groups = new Map();   // stand + body -> seats
  for (const st of bodies.length ? seats : []) {
    const r = rnd(), b = r < 0.3 ? 0 : r < 0.55 ? 1 : r < 0.8 ? 2 : 3;
    const key = st.stand.name + b;
    if (!groups.has(key)) groups.set(key, { body: bodies[b % bodies.length], seats: [] });
    groups.get(key).seats.push(st);
  }
  for (const { body, seats: list } of groups.values()) {
    const n = list.length, geo = body.geometry.clone();
    const shirt = new Float32Array(n * 3), info = new Float32Array(n * 4);
    const crowd = new THREE.InstancedMesh(geo, body.material, n);
    list.forEach((st, i) => {
      const s = st.stand;
      // home end: our colours; away end: theirs; the side stands split at the halfway line
      let team = s.team === 'us' ? 0 : s.team === 'them' ? 1 : (st.p.z > -5 ? 0 : 1);
      if (rnd() < 0.12) team = 2;   // neutrals, here for the football
      const r = rnd();
      // ours: the kit, black and whatever they came in; theirs: graphite and white
      const c = team === 2 || r < 0.2 ? casual[Math.floor(rnd() * casual.length)] : team === 0 ? (r < 0.42 ? casual[1] : kit) : (r < 0.35 ? casual[0] : graphite);
      shirt.set([c.r, c.g, c.b], i * 3);
      // phase, team, light (the terraces sit outside the floodlights' pool; the home end
      // faces the key light), energy (how much this one jumps)
      info.set([rnd(), team, (s.name === 'home' ? 0.55 : 0.8) + rnd() * 0.25, 0.5 + rnd() * 0.5], i * 4);
      dummy.position.copy(st.p); dummy.rotation.set(0, st.yaw, 0); dummy.scale.setScalar(0.94 + rnd() * 0.1); dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
    });
    geo.setAttribute('aShirt', new THREE.InstancedBufferAttribute(shirt, 3));
    geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
    crowd.computeBoundingSphere();
    group.add(crowd);
  }
  for (const b of bodies) b.material.onBeforeCompile = (sh) => crowdShader(sh, U);

  // ------------------------------------------------------------ flags waved over the crowd
  const flagSeats = seats.filter(() => rnd() < 0.03);
  // the cloth runs +x from its pole (x = 0); the pole is the thin box below it
  const cloth = new THREE.PlaneGeometry(0.85, 0.52, 8, 1); cloth.translate(0.445, 0, 0);
  const pole = new THREE.BoxGeometry(0.03, 1.5, 0.03); pole.translate(0, -0.45, 0);
  for (const g of [cloth, pole]) for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const flagGeo = mergeGeometries([cloth, pole]);
  const flags = new THREE.InstancedMesh(flagGeo, null, flagSeats.length);
  const flagCol = new Float32Array(flagSeats.length * 3), flagPh = new Float32Array(flagSeats.length);
  flagSeats.forEach((st, i) => {
    const ours = st.stand.team === 'us' || (st.stand.team === 'mixed' && st.p.z > -5);
    const c = ours ? (i % 3 === 2 ? new THREE.Color(0xf2f2f2) : kit) : (i % 2 ? graphite : new THREE.Color(0xf2f2f2));
    flagCol.set([c.r, c.g, c.b], i * 3); flagPh[i] = rnd() * 6.28;
    dummy.position.copy(st.p).add(new THREE.Vector3(0, 2.15, 0)); dummy.rotation.set(0, st.yaw, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
    flags.setMatrixAt(i, dummy.matrix);
  });
  flagGeo.setAttribute('aCol', new THREE.InstancedBufferAttribute(flagCol, 3));
  flagGeo.setAttribute('aPh', new THREE.InstancedBufferAttribute(flagPh, 1));
  const flagMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  flagMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform float uTime; uniform vec2 uCheer; attribute vec3 aCol; attribute float aPh; varying vec3 vCrowd;\n' + sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position;
  { float k = position.x, sp = 3.0 + 3.0 * max(uCheer.x, uCheer.y);
    transformed.z += sin(uTime * sp + aPh - k * 3.2) * 0.16 * k;                 // the cloth ripples from the pole
    transformed.y += sin(uTime * 1.6 + aPh) * 0.12 + sin(uTime * sp * 0.5 + aPh) * 0.06 * k; }
  vCrowd = position.x < 0.03 ? vec3(0.1) : aCol;`);
    sh.fragmentShader = 'varying vec3 vCrowd;\n' + sh.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb *= vCrowd;');
  };
  flags.material = flagMat; flags.computeBoundingSphere(); group.add(flags);

  // ------------------------------------------------------------ phone lights: a few, more after a goal
  const flash = seats.filter(() => rnd() < 0.12);
  const fpos = new Float32Array(flash.length * 3), fph = new Float32Array(flash.length);
  flash.forEach((st, i) => { fpos.set([st.p.x, st.p.y + 1.75, st.p.z], i * 3); fph[i] = rnd(); });
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3)); fgeo.setAttribute('aPh', new THREE.BufferAttribute(fph, 1));
  const lights = new THREE.Points(fgeo, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `uniform float uTime; uniform vec2 uCheer; attribute float aPh; varying float vA;
      void main() {
        float on = step(0.86 - 0.5 * max(uCheer.x, uCheer.y), fract(aPh * 13.7 + floor(uTime * 1.3 + aPh * 7.0) * 0.618));
        vA = on * (0.55 + 0.45 * sin(uTime * 23.0 + aPh * 40.0));
        vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = vA > 0.0 ? clamp(90.0 / -mv.z, 1.5, 7.0) : 0.0;
      }`,
    fragmentShader: `varying float vA; void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard; gl_FragColor = vec4(vec3(1.0, 0.98, 0.92) * vA * (1.0 - r * 4.0), 1.0); }`,
  }));
  lights.frustumCulled = false; group.add(lights);

  // ------------------------------------------------------------ reactions
  const target = new THREE.Vector2(), decay = { us: 0, them: 0 };
  return {
    group,
    /** A side of the crowd goes up: 1 = a goal, less for a save or a near miss. */
    cheer(team, amount = 1) { if (team === 'us') { target.x = Math.max(target.x, amount); decay.us = 3.2 + amount * 1.6; } else { target.y = Math.max(target.y, amount); decay.them = 3.2 + amount * 1.6; } },
    update(dt, time) {
      U.uTime.value = time;
      decay.us -= dt; decay.them -= dt;
      if (decay.us <= 0) target.x = 0;
      if (decay.them <= 0) target.y = 0;
      const c = U.uCheer.value, k = 1 - Math.exp(-dt * 6), kd = 1 - Math.exp(-dt * 1.8);
      c.x += (target.x - c.x) * (target.x > c.x ? k : kd); c.y += (target.y - c.y) * (target.y > c.y ? k : kd);
    },
  };
}

/**
 * One fan model posed with the arms hanging and frozen: world-space positions and normals
 * skinned on the CPU, once. `arm` holds, per vertex, how much it follows its upper arm and
 * that shoulder's pivot (x, y), for the shader to swing. Feet on y = 0, facing +z.
 */
function bakeFan(src, size) {
  const root = SkeletonUtils.clone(src);
  root.updateMatrixWorld(true);
  let sm = null;
  root.traverse((o) => { if (o.isSkinnedMesh && !sm) sm = o; });
  const sk = sm.skeleton, bones = {};
  sk.bones.forEach((b) => { bones[b.name] = b; });
  const wp = (b) => b.getWorldPosition(new THREE.Vector3());
  const hips = wp(bones.Hips);
  for (const side of ['Left', 'Right']) {
    const s = Math.sign(wp(bones[side + 'Arm']).x - hips.x);
    aimBone(bones[side + 'Arm'], bones[side + 'ForeArm'], new THREE.Vector3(s * 0.2, -1, 0.04));
    aimBone(bones[side + 'ForeArm'], bones[side + 'Hand'], new THREE.Vector3(s * 0.1, -1, 0.32));
  }
  root.updateMatrixWorld(true);
  const pre = new THREE.Matrix4().multiplyMatrices(sm.matrixWorld, sm.bindMatrixInverse);
  const K = sk.bones.map((b, i) => pre.clone().multiply(b.matrixWorld).multiply(sk.boneInverses[i]).multiply(sm.bindMatrix));
  const sideOf = sk.bones.map((b) => (/^Left(Arm|ForeArm|Hand)$/.test(b.name) ? 1 : /^Right(Arm|ForeArm|Hand)$/.test(b.name) ? 2 : 0));
  const pivots = [null, wp(bones.LeftArm), wp(bones.RightArm)];
  const g = sm.geometry, pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const n = pos.count, P = new Float32Array(n * 3), N = new Float32Array(n * 3), A = new Float32Array(n * 3);
  const p = new THREE.Vector3(), q = new THREE.Vector3(), nn = new THREE.Vector3(), acc = new THREE.Vector3(), accN = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (let v = 0; v < n; v++) {
    p.fromBufferAttribute(pos, v); nn.fromBufferAttribute(nor, v);
    acc.set(0, 0, 0); accN.set(0, 0, 0);
    const w = [0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const wt = sw.getComponent(v, k); if (!wt) continue;
      const j = si.getComponent(v, k);
      acc.addScaledVector(q.copy(p).applyMatrix4(K[j]), wt);
      accN.addScaledVector(q.copy(nn).applyMatrix3(nm.setFromMatrix4(K[j])), wt);
      w[sideOf[j]] += wt;
    }
    acc.toArray(P, v * 3); accN.normalize().toArray(N, v * 3);
    const side = w[1] >= w[2] ? 1 : 2;
    if (w[side] > 0.001) A.set([w[side], pivots[side].x, pivots[side].y], v * 3);
  }
  // feet on the ground, centred on the hips, to the fan's height
  let minY = Infinity;
  for (let v = 0; v < n; v++) minY = Math.min(minY, P[v * 3 + 1]);
  for (let v = 0; v < n; v++) { P[v * 3] = (P[v * 3] - hips.x) * size; P[v * 3 + 1] = (P[v * 3 + 1] - minY) * size; P[v * 3 + 2] = (P[v * 3 + 2] - hips.z) * size; }
  for (let v = 0; v < n; v++) if (A[v * 3]) { A[v * 3 + 1] = (A[v * 3 + 1] - hips.x) * size; A[v * 3 + 2] = (A[v * 3 + 2] - minY) * size; }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geometry.setAttribute('uv', g.attributes.uv);
  geometry.setAttribute('arm', new THREE.BufferAttribute(A, 3));
  geometry.setIndex(g.index);
  const material = new THREE.MeshLambertMaterial({ map: sm.material.map });
  material.customProgramCacheKey = () => 'crowd';
  return { geometry, material };
}

function crowdShader(sh, U) {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = `
uniform float uTime; uniform vec2 uCheer; uniform float uChant;
attribute vec3 arm; attribute vec3 aShirt; attribute vec4 aInfo;
varying vec3 vShirt; varying float vLit;
float fanCheer() { return aInfo.y < 0.5 ? uCheer.x : aInfo.y < 1.5 ? uCheer.y : 0.5 * max(uCheer.x, uCheer.y); }
// how far an arm swings out and up from hanging (radians): waving overhead when they cheer,
// a clap now and then while they chant
float armAngle() {
  float ph = aInfo.x * 6.2832, c = fanCheer();
  float wave = c * (2.45 + 0.3 * sin(uTime * 9.0 + ph));
  float clap = (1.0 - c) * uChant * step(0.72, fract(aInfo.x * 3.7)) * (0.7 + 0.4 * sin(uTime * 7.5 + ph));
  return max(wave, clap);
}
// an arm turns round its shoulder in the body's plane, out to its own side and up
vec2 turn(vec2 d, float a) { float ang = sign(arm.y) * a, cs = cos(ang), sn = sin(ang); return vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y); }
` + sh.vertexShader
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  float armA = armAngle();
  objectNormal.xy = mix(objectNormal.xy, turn(objectNormal.xy, armA), arm.x);`)
    .replace('#include <begin_vertex>', `vec3 transformed = position;
  transformed.xy = mix(position.xy, arm.yz + turn(position.xy - arm.yz, armA), arm.x);
  {
    float ph = aInfo.x * 6.2832, c = fanCheer();
    transformed.y += c * aInfo.w * max(0.0, sin(uTime * 8.0 + ph)) * 0.24;                                    // jumping
    transformed.y += (1.0 - c) * uChant * aInfo.w * max(0.0, sin(uTime * 4.4 + floor(aInfo.x * 4.0))) * 0.05; // bouncing to the chant
    transformed.x += sin(uTime * 1.1 + ph) * 0.03 * transformed.y;                                            // swaying
  }
  vShirt = aShirt; vLit = aInfo.z;`);
  // the shirts (and T1's scarf) are lime in the texture: same hue rule as the kit tint in ui/Model3D
  sh.fragmentShader = `varying vec3 vShirt; varying float vLit;
vec3 fanHsv(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn, h = 0.0;
  if (d > 1e-5) { if (mx == c.r) h = mod((c.g - c.b) / d, 6.0); else if (mx == c.g) h = (c.b - c.r) / d + 2.0; else h = (c.r - c.g) / d + 4.0; }
  return vec3(h / 6.0, mx > 0.0 ? d / mx : 0.0, mx);
}
` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec3 hsv = fanHsv(pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2)));
    if (hsv.x >= 42.0 / 360.0 && hsv.x <= 115.0 / 360.0 && hsv.y > 0.18) diffuseColor.rgb = vShirt * pow(min(1.0, hsv.z * 1.05), 2.2);
    diffuseColor.rgb *= vLit;
  }`);
}
