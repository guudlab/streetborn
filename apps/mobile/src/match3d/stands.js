// Stands and crowd round the halısaha: stepped concrete terraces behind both goals and
// along the sides, a few hundred fans, banners, flags and phone lights. Everything is
// built from plain geometry (no model files) and drawn in a handful of calls: the stands
// are one merged mesh, the fans one InstancedMesh whose arms, jumps and colours are
// worked out in the vertex shader, so a full stand costs no more CPU per frame than an
// empty one.
//
// The scene calls update() every frame and cheer() when something happens. The fans
// next to the fences (the skinned ones in scene.js) stay as they are: these fill the
// terraces behind them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const STEP_H = 0.42, STEP_D = 0.8, BASE = 0.3;   // terrace riser, tread, first step height
const SEAT = 0.62;                               // shoulder to shoulder along a row

/**
 * opts: { goalZ, goal2Z, kit: our colour '#rrggbb', board: our banner text, away?: their
 *         banner text, seed, canvasTex(w, h, draw) }
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
    { name: 'main', at: [16.4, -5], dir: [1, 0], len: 24, rows: 8, team: 'mixed', roof: true },       // the long side, with a roof
    { name: 'side', at: [-16.4, -5], dir: [-1, 0], len: 20, rows: 4, team: 'mixed' },
  ];
  const concrete = [], trim = [], rails = [];
  const box = (list, w, h, d, x, y, z, ry) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(ry); g.translate(x, y, z); list.push(g); };
  const seats = [];   // where a fan can stand: { p: Vector3, yaw, stand }
  for (const s of STANDS) {
    const [ax, az] = s.at, [dx, dz] = s.dir, ry = Math.atan2(dx, dz);   // ry: rows run along local x
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
  // One low-poly fan, standing, facing +z in its own frame. `part` tags each vertex:
  // 0 shirt, 1 left arm, 2 right arm, 3 head (hair above the brow), 4 legs.
  const part = (g, k) => { g.setAttribute('part', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(k), 1)); return g; };
  const piece = (g, k, x, y, z) => { g.translate(x, y, z); return part(g, k); };
  const fan = mergeGeometries([
    piece(new THREE.BoxGeometry(0.3, 0.8, 0.2), 4, 0, 0.4, 0),
    piece(new THREE.CylinderGeometry(0.19, 0.16, 0.62, 6, 1, true), 0, 0, 1.11, 0),   // open: the head and legs close it
    piece(new THREE.SphereGeometry(0.115, 6, 4), 3, 0, 1.55, 0.01),
    piece(new THREE.BoxGeometry(0.09, 0.58, 0.09), 1, -0.245, 1.1, 0),
    piece(new THREE.BoxGeometry(0.09, 0.58, 0.09), 2, 0.245, 1.1, 0),
  ].map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'part'].includes(k)) g.deleteAttribute(k); return g; }));

  // a few empty places, more on the higher rows of the away end (they travelled fewer). An
  // empty place gets no instance: a fan squashed to nothing would have zero-length normals,
  // and one NaN pixel spreads over the whole screen through the bloom
  for (let i = seats.length - 1; i >= 0; i--) { const st = seats[i]; if ((st.stand.team === 'them' && st.row > 3 && rnd() < 0.35) || rnd() < 0.08) seats.splice(i, 1); }
  const N = seats.length;
  const kit = new THREE.Color(opts.kit), graphite = new THREE.Color(0x2c2e31);
  const casual = [0xf2f2f2, 0x161616, 0x5b6068, 0x1f2a44, 0x3c5a7a, 0x7a2e2e, 0xd9d2c3].map((c) => new THREE.Color(c));
  const shirt = new Float32Array(N * 3), info = new Float32Array(N * 4);
  const crowd = new THREE.InstancedMesh(fan, null, N);
  const dummy = new THREE.Object3D();
  seats.forEach((st, i) => {
    const s = st.stand;
    // home end: our colours; away end: theirs; the side stands split at the halfway line
    let team = s.team === 'us' ? 0 : s.team === 'them' ? 1 : (st.p.z > -5 ? 0 : 1);
    if (rnd() < 0.12) team = 2;   // neutrals, here for the football
    const r = rnd();
    // ours: the kit, black hoodies and whatever they came in; theirs: graphite and white
    const c = team === 2 || r < 0.2 ? casual[Math.floor(rnd() * casual.length)] : team === 0 ? (r < 0.42 ? casual[1] : kit) : (r < 0.35 ? casual[0] : graphite);
    // the terraces sit outside the floodlights' pool; the home end faces the key light
    const lit = (s.name === 'home' ? 0.22 : 0.45) + rnd() * 0.18;
    shirt.set([c.r * lit, c.g * lit, c.b * lit], i * 3);
    // phase, team, skin tone, energy (how much this one jumps)
    info.set([rnd(), team, Math.pow(rnd(), 1.6), 0.5 + rnd() * 0.5], i * 4);
    const sc = 0.92 + rnd() * 0.16;
    dummy.position.copy(st.p); dummy.rotation.set(0, st.yaw, 0); dummy.scale.setScalar(sc); dummy.updateMatrix();
    crowd.setMatrixAt(i, dummy.matrix);
  });
  fan.setAttribute('aShirt', new THREE.InstancedBufferAttribute(shirt, 3));
  fan.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  crowd.computeBoundingSphere();

  const U = { uTime: { value: 0 }, uCheer: { value: new THREE.Vector2() }, uChant: { value: 0.6 } };
  const crowdMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  crowdMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = `
uniform float uTime; uniform vec2 uCheer; uniform float uChant;
attribute float part; attribute vec3 aShirt; attribute vec4 aInfo;
varying vec3 vCrowd;
float fanCheer() { return aInfo.y < 0.5 ? uCheer.x : aInfo.y < 1.5 ? uCheer.y : 0.5 * max(uCheer.x, uCheer.y); }
// how far an arm swings out and up from hanging (radians): waving overhead when they cheer,
// a clap now and then while they chant
float armAngle() {
  float ph = aInfo.x * 6.2832, c = fanCheer();
  float wave = c * (2.35 + 0.35 * sin(uTime * 9.0 + ph));
  float clap = (1.0 - c) * uChant * step(0.72, fract(aInfo.x * 3.7)) * (0.9 + 0.5 * sin(uTime * 7.5 + ph));
  return max(wave, clap);
}
// arms turn round the shoulder in the body's plane: the left one (−x) clockwise, the right one anticlockwise
vec2 turn(vec2 d, float a) { float ang = (part < 1.5 ? -1.0 : 1.0) * a, cs = cos(ang), sn = sin(ang); return vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y); }
vec3 swing(vec3 p, float a) {
  if (part < 0.5 || part > 2.5) return p;
  vec2 piv = vec2(part < 1.5 ? -0.23 : 0.23, 1.38);
  return vec3(piv + turn(p.xy - piv, a), p.z);
}
` + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
  float armA = armAngle();
  if (part > 0.5 && part < 2.5) objectNormal.xy = turn(objectNormal.xy, armA);`)
      .replace('#include <begin_vertex>', `vec3 transformed = swing(position, armA);
  {
    float ph = aInfo.x * 6.2832, c = fanCheer();
    transformed.y += c * aInfo.w * max(0.0, sin(uTime * 8.0 + ph)) * 0.24;                                    // jumping
    transformed.y += (1.0 - c) * uChant * aInfo.w * max(0.0, sin(uTime * 4.4 + floor(aInfo.x * 4.0))) * 0.05; // bouncing to the chant
    transformed.x += sin(uTime * 1.1 + ph) * 0.03 * transformed.y;                                            // swaying
  }
  vec3 skin = mix(vec3(0.62, 0.42, 0.3), vec3(0.2, 0.12, 0.08), aInfo.z);
  vCrowd = part < 0.5 ? aShirt : part < 2.5 ? (position.y < 0.88 ? skin : aShirt) : part < 3.5 ? (position.y > 1.61 || position.z < -0.04 ? vec3(0.035, 0.03, 0.025) : skin) : vec3(0.08, 0.085, 0.1);`);
    sh.fragmentShader = 'varying vec3 vCrowd;\n' + sh.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.rgb *= vCrowd;');
  };
  crowd.material = crowdMat;
  group.add(crowd);

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
