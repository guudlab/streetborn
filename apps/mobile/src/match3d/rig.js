// Vendored from the 3D match prototype (artifact MNaf1ynwKFD8nP1UrC9aon, v6, rig.js).
// Keep it in step with the prototype: animation fixes land there first.
// Rig helpers for the Meshy characters. Every Meshy rig has the same 24 bones and the
// same armature, but each model is bound in its own rest pose and some bones (Head)
// are bound with a different roll. Copying local rotations keeps the bone directions
// right; the per-bone twist offset fixes the roll so the mesh does not twist.
import * as THREE from 'three';

const Y = new THREE.Vector3(0, 1, 0);
// the Meshy rig; clip-only files have these as plain nodes (no skin), so match by name
export const BONES = new Set(['Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head', 'head_end', 'headfront',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']);
const isBone = (o) => o.isBone || BONES.has(o.name);

/** Rest data for a rig: bones by name, world rest rotations, twist frames, hips height. */
export function rigInfo(root) {
  root.updateMatrixWorld(true);
  const bones = {};
  root.traverse((o) => { if (isBone(o)) bones[o.name] = o; });
  const world = {}, local = {}, pos = {};
  for (const n in bones) { world[n] = bones[n].getWorldQuaternion(new THREE.Quaternion()); local[n] = bones[n].quaternion.clone(); pos[n] = bones[n].getWorldPosition(new THREE.Vector3()); }
  const hips = bones.Hips;
  return { root, bones, world, local, pos, hipsRest: hips.position.clone(), hipsY: hips.position.y };
}

// End bones keep their world attitude from the source (face forward, feet flat); the
// rest keep their direction and only get the roll fixed.
const FULL = new Set(['Head', 'LeftHand', 'RightHand', 'LeftFoot', 'RightFoot']);

// offset that turns the source bone frame into the target bone frame for the same body part
function offsets(src, dst) {
  const tw = {};
  const a = new THREE.Vector3(), b = new THREE.Vector3(), s = new THREE.Quaternion();
  for (const n in dst.bones) {
    if (!src.world[n]) { tw[n] = new THREE.Quaternion(); continue; }
    if (FULL.has(n)) { tw[n] = src.world[n].clone().invert().multiply(dst.world[n]); continue; }
    a.copy(Y).applyQuaternion(src.world[n]); b.copy(Y).applyQuaternion(dst.world[n]);
    s.setFromUnitVectors(a, b);
    tw[n] = s.clone().multiply(src.world[n]).invert().multiply(dst.world[n]);
  }
  return tw;
}

/**
 * Retarget a clip made on `src` to `dst`: rotations only (twist-corrected), hips translation
 * scaled by leg length. `opts.inPlace` drops horizontal root motion.
 */
export function retarget(clip, src, dst, opts = {}) {
  const tw = offsets(src, dst);
  const parentName = (n) => { const p = dst.bones[n] && dst.bones[n].parent; return p && isBone(p) ? p.name : null; };
  const k = dst.hipsY / src.hipsY;
  const tracks = [];
  const q = new THREE.Quaternion(), tp = new THREE.Quaternion();
  for (const t of clip.tracks) {
    const [bone, prop] = t.name.split('.');
    if (!dst.bones[bone]) continue;
    if (prop === 'quaternion') {
      const v = t.values.slice();
      const pn = parentName(bone);
      tp.copy(pn ? tw[pn] : new THREE.Quaternion()).invert();
      for (let i = 0; i < v.length; i += 4) {
        q.fromArray(v, i); q.premultiply(tp).multiply(tw[bone]); q.toArray(v, i);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(t.name, t.times.slice(), v));
    } else if (prop === 'position' && bone === 'Hips') {
      const v = t.values.slice();
      const x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) {
        v[i] = opts.inPlace ? dst.hipsRest.x : dst.hipsRest.x + (v[i] - x0) * k;
        v[i + 1] = v[i + 1] * k;
        v[i + 2] = opts.inPlace ? dst.hipsRest.z : dst.hipsRest.z + (v[i + 2] - z0) * k;
      }
      tracks.push(new THREE.VectorKeyframeTrack(t.name, t.times.slice(), v));
    }
  }
  return new THREE.AnimationClip(opts.name || clip.name, clip.duration, tracks);
}

/**
 * Mirror a clip left ↔ right on a rig. Sampled in world space (reflect across x = 0, swap
 * sides, re-apply each bone's rest offset), so it works whatever the bone frames are.
 */
export function mirror(clip, rig, name) {
  const swap = (n) => n.startsWith('Left') ? 'Right' + n.slice(4) : n.startsWith('Right') ? 'Left' + n.slice(5) : n;
  const M = new THREE.Matrix4().makeScale(-1, 1, 1);
  const refl = (q) => { const m = new THREE.Matrix4().makeRotationFromQuaternion(q); m.premultiply(M).multiply(M); return new THREE.Quaternion().setFromRotationMatrix(m); };
  const names = Object.keys(rig.bones);
  const rootQ = rig.bones.Hips.parent.getWorldQuaternion(new THREE.Quaternion());
  // rest offset between the reflected frame of b and the frame of its mirror bone
  const off = {};
  for (const n of names) off[n] = refl(rig.world[n]).invert().multiply(rig.world[swap(n)]);
  const saved = names.map((n) => rig.bones[n].quaternion.clone()); const savedP = rig.bones.Hips.position.clone();
  const mixer = new THREE.AnimationMixer(rig.root); const act = mixer.clipAction(clip);
  act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.play();   // a looping action wraps t = duration to the first frame
  const fps = 30, N = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = [], qv = {}, pv = [];
  for (const n of names) qv[n] = [];
  const wq = {};
  for (let i = 0; i < N; i++) {
    const t = Math.min(clip.duration, i / fps); times.push(t);
    mixer.setTime(t); rig.root.updateMatrixWorld(true);
    for (const n of names) wq[n] = rig.bones[n].getWorldQuaternion(new THREE.Quaternion());
    const nw = {};
    for (const n of names) nw[swap(n)] = refl(wq[n]).multiply(off[n]);
    for (const n of names) {
      const p = rig.bones[n].parent; const pw = isBone(p) ? nw[p.name] : rootQ;
      qv[n].push(...pw.clone().invert().multiply(nw[n]).toArray());
    }
    const hp = rig.bones.Hips.position; pv.push(2 * rig.hipsRest.x - hp.x, hp.y, hp.z);
  }
  mixer.stopAllAction(); mixer.uncacheRoot(rig.root);
  names.forEach((n, i) => rig.bones[n].quaternion.copy(saved[i])); rig.bones.Hips.position.copy(savedP);
  const tracks = names.map((n) => new THREE.QuaternionKeyframeTrack(n + '.quaternion', times, qv[n]));
  tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, pv));
  return new THREE.AnimationClip(name || clip.name + '_mirror', clip.duration, tracks);
}

/** Cut [t0, t1] out of a clip and rebase it to start at 0. */
export function subclip(clip, t0, t1, name) {
  const tracks = clip.tracks.map((t) => {
    const n = t.getValueSize();
    const times = [], values = [];
    const interp = t.createInterpolant(new Float32Array(n));
    const steps = Math.max(2, Math.round((t1 - t0) * 30) + 1);
    for (let i = 0; i < steps; i++) { const tt = t0 + (t1 - t0) * (i / (steps - 1)); times.push(tt - t0); values.push(...interp.evaluate(tt)); }
    const T = t.constructor; return new T(t.name, times, values);
  });
  return new THREE.AnimationClip(name || clip.name, t1 - t0, tracks);
}

// ---------------------------------------------------------------- procedural posing

const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _v = new THREE.Vector3();
/** Rotate a bone by `angle` around a world-space axis (applied on top of its current pose). */
export function rotateWorld(bone, axis, angle) {
  if (!angle) return;
  bone.parent.getWorldQuaternion(_pq);
  _q.setFromAxisAngle(_v.copy(axis).applyQuaternion(_pq.clone().invert()), angle);
  bone.quaternion.premultiply(_q);
  bone.updateMatrixWorld(true);
}

/** Turn a bone so that the direction from it to `child` points along `dir` (world), blended by w. */
export function aimBone(bone, child, dir, w = 1) {
  const a = bone.getWorldPosition(new THREE.Vector3()), b = child.getWorldPosition(new THREE.Vector3());
  const cur = b.sub(a).normalize();
  const want = dir.clone().normalize();
  const rot = new THREE.Quaternion().setFromUnitVectors(cur, want);
  if (w < 1) rot.slerp(new THREE.Quaternion(), 1 - w);
  bone.parent.getWorldQuaternion(_pq);
  const wq = bone.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(_pq.invert().multiply(rot.multiply(wq)));
  bone.updateMatrixWorld(true);
}

/**
 * Two-bone IK (upper → lower → end) so `end` reaches `target`; `pole` is a world point the
 * middle joint bends toward. Blend weight w.
 */
export function twoBoneIK(upper, lower, end, target, pole, w = 1) {
  if (w <= 0) return;
  const pa = upper.getWorldPosition(new THREE.Vector3());
  const pb = lower.getWorldPosition(new THREE.Vector3());
  const pc = end.getWorldPosition(new THREE.Vector3());
  const l1 = pa.distanceTo(pb), l2 = pb.distanceTo(pc);
  const t = pa.clone().lerp(target, 1); // full target; blend at the end
  const toT = t.clone().sub(pa); let d = toT.length();
  d = THREE.MathUtils.clamp(d, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const dirT = toT.normalize();
  // bend plane from the pole
  const poleDir = pole.clone().sub(pa); poleDir.sub(dirT.clone().multiplyScalar(poleDir.dot(dirT))).normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
  const elbow = pa.clone().addScaledVector(dirT, Math.cos(a) * l1).addScaledVector(poleDir, Math.sin(a) * l1);
  const end2 = pa.clone().addScaledVector(dirT, d);
  aimBone(upper, lower, elbow.sub(pa), w);
  const pb2 = lower.getWorldPosition(new THREE.Vector3());
  aimBone(lower, end, end2.sub(pb2), w);
}

/**
 * Take the turning out of a clip: Meshy's Idle and Victory_Cheer swing the hips up to ±80°
 * around the vertical, which looks like the character spinning on the spot. Removes the
 * hips' yaw (keeps lean and bob) and, with inPlace, its horizontal drift.
 */
const SPINE = new Set(['Spine02.quaternion', 'Spine01.quaternion', 'Spine.quaternion', 'neck.quaternion']);
export function lockYaw(clip, { inPlace = true, hips = true } = {}) {
  const c = clip.clone();
  const q = new THREE.Quaternion(), tw = new THREE.Quaternion();
  for (const t of c.tracks) {
    if (hips && t.name === 'Hips.quaternion') {
      const v = t.values;
      for (let i = 0; i < v.length; i += 4) {
        q.fromArray(v, i);
        tw.set(0, q.y, 0, q.w).normalize();      // twist around the armature's up axis
        q.premultiply(tw.invert()); q.toArray(v, i);
      }
    } else if (SPINE.has(t.name)) {
      // the spine chain turns too (looking around); keep a quarter of it
      const v = t.values;
      for (let i = 0; i < v.length; i += 4) {
        q.fromArray(v, i);
        tw.set(0, q.y, 0, q.w).normalize();      // spine bones point up, so local Y twist ≈ yaw
        const keep = new THREE.Quaternion().slerp(tw, 0.25);
        q.premultiply(tw.invert()).premultiply(keep); q.toArray(v, i);
      }
    } else if (inPlace && t.name === 'Hips.position') {
      const v = t.values, x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
  }
  return c;
}

/**
 * Keeps procedural edits from piling up. three.js's mixer only writes a bone when the clip
 * value changed since its last write (held poses, clamped clips, tiny slow-motion steps);
 * a bone we rotated on top then keeps our rotation and gets rotated again next frame, so
 * it spins. Call restore() before mixer.update() and capture() right after it: every frame
 * then starts from the clip pose, whether or not the mixer wrote it.
 */
export class PoseGuard {
  constructor(root) {
    this.bones = [];
    root.traverse((o) => { if (isBone(o)) this.bones.push(o); });
    this.base = this.bones.map((b) => b.quaternion.clone());
    this.pos = this.bones.map((b) => b.position.clone());
  }
  restore() { this.bones.forEach((b, i) => { b.quaternion.copy(this.base[i]); b.position.copy(this.pos[i]); }); }
  capture() { this.bones.forEach((b, i) => { this.base[i].copy(b.quaternion); this.pos[i].copy(b.position); }); }
}

/**
 * A two-bone limb with a fixed hinge, measured on the rest pose (rig.world must be in
 * model space). `bendModel` is the direction the lower bone swings toward when the joint
 * flexes (forward for elbows, backward for knees); a bent rest pose wins over it.
 */
export function makeLimb(rig, upper, lower, end, bendModel) {
  const U = rig.bones[upper], L = rig.bones[lower], E = rig.bones[end];
  // rest positions recorded with the rig (the bones themselves may already be posed)
  const P = (n) => rig.pos[n].clone();
  const d1 = P(lower).sub(P(upper)).normalize(), d2 = P(end).sub(P(lower)).normalize();
  let n = d1.clone().cross(d2);
  if (n.length() < 0.15) n = d1.clone().cross(bendModel);       // nearly straight: anatomical hinge
  n.normalize();
  const loc = (name, v) => v.clone().applyQuaternion(rig.world[name].clone().invert()).normalize();
  const aU = loc(upper, d1), aL = loc(lower, d2);
  const ortho = (a, v) => v.sub(a.clone().multiplyScalar(a.dot(v))).normalize();
  return { U, L, E, aU, nU: ortho(aU, loc(upper, n)), aL, nL: ortho(aL, loc(lower, n)) };
}

const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
// world rotation that takes local axes (a, n) onto world axes (A, N)
function frameRot(a, n, A, N) {
  _m1.makeBasis(a, n, a.clone().cross(n)); _m2.makeBasis(A, N, A.clone().cross(N));
  return new THREE.Quaternion().setFromRotationMatrix(_m2.multiply(_m1.transpose()));
}
function setWorld(bone, q, w) {
  const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  const lq = pq.multiply(q);
  bone.quaternion.slerp(lq, w);
  bone.updateMatrixWorld(true);
}

/**
 * Hinge-correct two-bone IK: the end reaches `target`, the middle joint points toward
 * `pole`, and both bones keep their rest roll around the hinge, so the elbow/knee bends
 * the way the mesh was built to bend and the skin does not twist. Blend weight w.
 */
export function limbIK(limb, target, pole, w = 1, arcHint = null) {
  if (w <= 0) return;
  const { U, L, E } = limb;
  if (w < 1) {
    // blend the goal, not the rotations: the hand/foot travels from where the clip has it
    // to the target, and the joint from the clip's bend to the pole (a rotation slerp can
    // swing the limb behind the body on the way). The goal swings on an arc around the
    // shoulder/hip: a straight line from the hip to over the head would pass through the
    // shoulder, where the reach direction is undefined and the arm flips.
    const pa = U.getWorldPosition(new THREE.Vector3());
    const e = E.getWorldPosition(new THREE.Vector3()).sub(pa), t = target.clone().sub(pa);
    const le = e.length(), lt = t.length();
    if (le > 1e-4 && lt > 1e-4) {
      e.normalize(); t.normalize();
      // a wide swing bows out toward arcHint (an arm comes up in front, never round the
      // back): a curve on the sphere through a midpoint pulled toward the hint, which stays
      // well defined even when start and end point opposite ways
      const m = e.clone().add(t);
      if (arcHint) m.addScaledVector(arcHint, 1 - e.dot(t));
      if (m.lengthSq() < 1e-8) m.copy(Math.abs(e.y) < 0.9 ? Y : new THREE.Vector3(1, 0, 0)).cross(e);
      m.normalize();
      const sl = (a, b, k) => a.clone().applyQuaternion(new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(a, b), k));
      const a1 = sl(e, m, w), b1 = sl(m, t, w);
      target = pa.addScaledVector(sl(a1, b1, w).normalize(), THREE.MathUtils.lerp(le, lt, w));
    } else target = E.getWorldPosition(new THREE.Vector3()).lerp(target, w);
    pole = L.getWorldPosition(new THREE.Vector3()).lerp(pole, w);
    w = Math.min(1, w * 3);
  }
  const pa = U.getWorldPosition(new THREE.Vector3());
  const l1 = pa.distanceTo(L.getWorldPosition(new THREE.Vector3()));
  const l2 = L.getWorldPosition(new THREE.Vector3()).distanceTo(E.getWorldPosition(new THREE.Vector3()));
  const toT = target.clone().sub(pa);
  const d = THREE.MathUtils.clamp(toT.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const dirT = toT.normalize();
  const P = pole.clone().sub(pa); P.sub(dirT.clone().multiplyScalar(P.dot(dirT)));
  if (P.lengthSq() < 1e-8) { const ref = Math.abs(dirT.y) < 0.9 ? Y.clone() : new THREE.Vector3(1, 0, 0); P.copy(ref).sub(dirT.clone().multiplyScalar(dirT.dot(ref))); }
  P.normalize();
  // when the pole lines up with the reach the bend plane is ill-defined and can flip between
  // frames: let it turn at most 15° per frame from last frame's plane. Last frame's plane is
  // carried along with the reach (turned by however the reach turned), so it stays defined
  // even when the reach swings through where the elbow pointed.
  if (limb.lastP && limb.lastDir) {
    const keep = limb.lastP.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(limb.lastDir, dirT));
    keep.sub(dirT.clone().multiplyScalar(keep.dot(dirT)));
    if (keep.lengthSq() > 1e-6) {
      keep.normalize();
      const turn = new THREE.Quaternion().setFromUnitVectors(keep, P), ang = 2 * Math.acos(Math.min(1, Math.abs(turn.w)));
      const MAX = 0.26;
      if (ang > MAX) { turn.slerp(new THREE.Quaternion(), 1 - MAX / ang); P.copy(keep).applyQuaternion(turn).normalize(); }
    }
  }
  limb.lastP = P.clone(); limb.lastDir = dirT.clone();
  const a = Math.acos(THREE.MathUtils.clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const elbow = pa.clone().addScaledVector(dirT, Math.cos(a) * l1).addScaledVector(P, Math.sin(a) * l1);
  const endP = pa.clone().addScaledVector(dirT, d);
  const N = P.clone().cross(dirT).normalize();                     // hinge axis, same for both bones
  const u = elbow.clone().sub(pa).normalize(), v = endP.clone().sub(elbow).normalize();
  setWorld(U, frameRot(limb.aU, limb.nU, u, N.clone().sub(u.clone().multiplyScalar(u.dot(N))).normalize()), w);
  setWorld(L, frameRot(limb.aL, limb.nL, v, N.clone().sub(v.clone().multiplyScalar(v.dot(N))).normalize()), w);
}

/**
 * Meshy's auto-skinning sometimes glues a hand to whatever it touched in the rest pose
 * (rakip-2: left hand ↔ left thigh; the keeper's forearms ↔ chest). When the arm swings,
 * those vertices stretch into a ribbon between the two. Each forearm/hand vertex is given
 * wholly to its arm or to the body, whichever holds more of its weight. Returns the
 * number of vertices fixed.
 */
const ARMS = { Left: new Set(['LeftArm', 'LeftForeArm', 'LeftHand']), Right: new Set(['RightArm', 'RightForeArm', 'RightHand']) };
export function cleanSkin(mesh) {
  const g = mesh.geometry; if (!mesh.isSkinnedMesh || g.userData.skinClean !== undefined) return g.userData.skinClean || 0;
  const names = mesh.skeleton.bones.map((b) => b.name);
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  let fixed = 0;
  for (let i = 0; i < si.count; i++) {
    const idx = [0, 1, 2, 3].map((j) => si.getComponent(i, j)), w = [0, 1, 2, 3].map((j) => sw.getComponent(i, j));
    const lower = idx.findIndex((b, j) => w[j] > 0 && /(ForeArm|Hand)$/.test(names[b]));
    if (lower < 0) continue;
    const arm = ARMS[names[idx[lower]].startsWith('Left') ? 'Left' : 'Right'];
    const inArm = idx.map((b, j) => arm.has(names[b]) && w[j] > 0);
    const wa = w.reduce((s, x, j) => s + (inArm[j] ? x : 0), 0), wb = w.reduce((s, x, j) => s + (!inArm[j] ? x : 0), 0);
    if (wb < 1e-3 || wa < 1e-3) continue;
    const keepArm = wa >= wb, sum = keepArm ? wa : wb;
    for (let j = 0; j < 4; j++) sw.setComponent(i, j, inArm[j] === keepArm ? w[j] / sum : 0);
    fixed++;
  }
  fixed += armpits(mesh);
  sw.needsUpdate = true;
  // where the hand was modelled touching the thigh the surface itself is fused: cut the
  // triangles that join a forearm/hand vertex to a vertex that belongs to the body
  const dom = new Int16Array(si.count);   // 1 left lower arm, 2 right lower arm, 3 other arm bone, 0 body
  for (let i = 0; i < si.count; i++) {
    let best = 0, bw = -1;
    for (let j = 0; j < 4; j++) { const x = sw.getComponent(i, j); if (x > bw) { bw = x; best = si.getComponent(i, j); } }
    const n = names[best];
    dom[i] = /^Left(ForeArm|Hand)$/.test(n) ? 1 : /^Right(ForeArm|Hand)$/.test(n) ? 2 : /Arm$/.test(n) ? 3 : 0;
  }
  const arm = (d) => (d === 1 ? 'L' : d === 2 ? 'R' : null);
  if (g.index) {
    const ix = g.index.array, keep = [];
    for (let t = 0; t < ix.length; t += 3) {
      const d = [dom[ix[t]], dom[ix[t + 1]], dom[ix[t + 2]]];
      const sides = new Set(d.map(arm).filter(Boolean));
      const body = d.includes(0);
      const bad = sides.size > 1 || (sides.size === 1 && body);
      if (!bad) keep.push(ix[t], ix[t + 1], ix[t + 2]);
    }
    const cut = (ix.length - keep.length) / 3;
    if (cut) { g.setIndex(keep); fixed += cut; fixed += unstain(mesh, dom, ix, keep); }
  }
  g.userData.skinClean = fixed;
  return fixed;
}

// Meshy binds the arms hanging down, so the side of the shirt all the way to the waist follows
// the upper arm. With the arm overhead (a dive, a cheer) that drags the shirt up into a torn
// flap. A body vertex keeps its upper-arm weight only near the armpit; lower down it fades to
// nothing and the body bone takes it over.
function armpits(mesh) {
  const g = mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, P = g.attributes.position;
  const names = mesh.skeleton.bones.map((b) => b.name);
  const bindY = (n) => new THREE.Vector3().applyMatrix4(mesh.skeleton.boneInverses[names.indexOf(n)].clone().invert()).y;
  if (names.indexOf('LeftArm') < 0 || names.indexOf('Hips') < 0) return 0;
  const shY = (bindY('LeftArm') + bindY('RightArm')) / 2, L = shY - bindY('Hips');
  const torso = /^(Hips|Spine\d*|neck)$/, upper = /^(Left|Right)Arm$/;
  const v = new THREE.Vector3(); let n = 0;
  for (let i = 0; i < si.count; i++) {
    let best = -1, bw = -1, arm = 0;
    for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j), b = names[si.getComponent(i, j)]; if (w > bw) { bw = w; best = j; } if (upper.test(b)) arm += w; }
    if (arm <= 0 || !torso.test(names[si.getComponent(i, best)])) continue;
    const below = shY - v.fromBufferAttribute(P, i).applyMatrix4(mesh.bindMatrix).y;
    const keep = THREE.MathUtils.clamp(1 - (below - 0.08 * L) / (0.22 * L), 0, 1);
    if (keep >= 1) continue;
    let moved = 0;
    for (let j = 0; j < 4; j++) if (upper.test(names[si.getComponent(i, j)])) { const w = sw.getComponent(i, j); sw.setComponent(i, j, w * keep); moved += w * (1 - keep); }
    sw.setComponent(i, best, sw.getComponent(i, best) + moved);
    n++;
  }
  return n;
}

// After the cut, the patch of the body that the fingers were fused into still carries the
// skin texture of the fingers. Give those body vertices the texture of the cloth around them.
function unstain(mesh, dom, oldIx, newIx) {
  const g = mesh.geometry, uv = g.attributes.uv, map = mesh.material && mesh.material.map;
  if (!uv || !map || !map.image || typeof document === 'undefined') return 0;
  const img = map.image, W = img.width, H = img.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
  const px = cx.getImageData(0, 0, W, H).data;
  const flipY = map.flipY;
  const texel = (i) => { const u = uv.getX(i), v = uv.getY(i); const x = Math.min(W - 1, Math.max(0, Math.floor(u * W))), y = Math.min(H - 1, Math.max(0, Math.floor((flipY ? 1 - v : v) * H))); const k = (y * W + x) * 4; return [px[k], px[k + 1], px[k + 2]]; };
  const skin = ([r, g, b]) => r > 90 && r - b > 35 && r >= g && g - b > 8 && !(r > 200 && g > 200 && b > 190);
  // the stain: small islands of skin-coloured body vertices (the bare thigh is one big island,
  // a finger print on the shorts is a few dozen vertices) near where the hand rested
  const n = uv.count, adj = Array.from({ length: n }, () => []);
  for (let t = 0; t < newIx.length; t += 3) { const a = newIx[t], b = newIx[t + 1], c = newIx[t + 2]; adj[a].push(b, c); adj[b].push(a, c); adj[c].push(a, b); }
  const names = mesh.skeleton.bones.map((b) => b.name), P = g.attributes.position;
  const bindPos = (i) => new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(mesh.bindMatrix);
  const hands = ['LeftHand', 'RightHand'].map((h) => new THREE.Vector3().applyMatrix4(mesh.skeleton.boneInverses[names.indexOf(h)].clone().invert()));
  const isSkin = new Uint8Array(n); for (let i = 0; i < n; i++) isSkin[i] = dom[i] === 0 && skin(texel(i)) ? 1 : 0;
  const seen = new Uint8Array(n), stain = new Uint8Array(n), queue = [];
  for (let s0 = 0; s0 < n; s0++) {
    if (!isSkin[s0] || seen[s0]) continue;
    const comp = [s0]; seen[s0] = 1;
    for (let q = 0; q < comp.length; q++) for (const j of adj[comp[q]]) if (isSkin[j] && !seen[j]) { seen[j] = 1; comp.push(j); }
    if (comp.length > 400) continue;
    const near = comp.some((i) => { const p = bindPos(i); return hands.some((h) => p.distanceTo(h) < 0.3); });
    if (!near) continue;
    for (const i of comp) { stain[i] = 1; queue.push(i); }
  }
  if (!queue.length) return 0;
  // paint over it in the texture with the colour of the cloth around it
  const rim = [];
  for (const i of queue) for (const j of adj[i]) if (!stain[j] && dom[j] === 0 && !skin(texel(j))) rim.push(texel(j));
  if (!rim.length) return 0;
  const med = (k) => rim.map((c) => c[k]).sort((x, y) => x - y)[rim.length >> 1];
  cx.fillStyle = cx.strokeStyle = `rgb(${med(0)},${med(1)},${med(2)})`; cx.lineWidth = 3; cx.lineJoin = 'round';
  const ring = new Uint8Array(n); for (const i of queue) { ring[i] = 1; for (const j of adj[i]) if (dom[j] === 0) ring[j] = 1; }
  const xy = (i) => [uv.getX(i) * W, (flipY ? 1 - uv.getY(i) : uv.getY(i)) * H];
  for (let t = 0; t < newIx.length; t += 3) {
    const tri = [newIx[t], newIx[t + 1], newIx[t + 2]];
    if (!tri.some((i) => stain[i]) || !tri.every((i) => ring[i])) continue;
    cx.beginPath(); tri.forEach((i, k) => { const [x, y] = xy(i); if (k) cx.lineTo(x, y); else cx.moveTo(x, y); }); cx.closePath(); cx.fill(); cx.stroke();
  }
  map.image = cv; map.needsUpdate = true;
  return queue.length;
}

/**
 * Keeps a character's skin out of the turf: after the pose is final, finds the lowest point
 * of the skinned mesh (a sample of its vertices) and lifts the model by what is under the
 * floor. Call once per frame with the model at its unlifted height.
 */
export class GroundClamp {
  constructor(model, { every = 11, floor = -0.012 } = {}) {
    this.model = model; this.floor = floor; this.v = new THREE.Vector3();
    model.traverse((o) => { if (o.isSkinnedMesh && !this.mesh) this.mesh = o; });
    const n = this.mesh.geometry.attributes.position.count;
    this.idx = []; for (let i = 0; i < n; i += every) this.idx.push(i);
  }
  lowest() {
    const m = this.mesh, v = this.v; let y = Infinity;
    m.updateMatrixWorld(true); m.skeleton.update();
    for (const i of this.idx) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); if (v.y < y) y = v.y; }
    return y;
  }
  apply() {
    this.model.updateMatrixWorld(true);
    const lift = this.floor - this.lowest();
    if (lift > 0) { this.model.position.y += lift; this.model.updateMatrixWorld(true); }
    return Math.max(0, lift);
  }
}

/** Same rig, another copy of the model (SkeletonUtils clone): its bones, the original's rest data. */
export function rigFor(model, rig) {
  const bones = {};
  model.traverse((o) => { if (isBone(o)) bones[o.name] = o; });
  return { ...rig, root: model, bones };
}

/**
 * Pins each boot to the turf while the clip has it planted, so hips that drift in the clip,
 * or a root that moves a little faster than the stride, cannot make it skate. Leg IK bends
 * the knee to keep the ankle on its spot; the pin eases in and out and lets go if the body
 * has moved too far from it. Call after the pose and the root are final for the frame.
 */
export class FootLock {
  constructor(rig, { drift = 0.22, stepT = 0.2, lift = 0.07 } = {}) {
    this.on = true; this.drift = drift; this.stepT = stepT; this.lift = lift;
    // a toe bone sits a few cm above the sole: planted means within 2 cm of its standing height
    this.legs = ['Left', 'Right'].map((s) => ({ side: s, U: rig.bones[s + 'UpLeg'], L: rig.bones[s + 'Leg'], E: rig.bones[s + 'Foot'], toe: rig.bones[s + 'ToeBase'], toeY: rig.pos[s + 'ToeBase'].y + 0.02, lock: null, w: 0, step: null, last: null }));
  }
  reset() { for (const l of this.legs) { l.lock = null; l.w = 0; l.step = null; l.last = null; } }
  // a scripted step: each boot leaves where it was last drawn and lands where the clip has it
  // T seconds later (for clips whose own feet glide into place). The start is kept relative to
  // the hip, so a boot that was swinging moves on with the body instead of being left behind
  // the boot named by `plant` is pinned where it lands, whatever the clip's toe height says
  stepNow(T, lift = this.lift, plant = null) {
    for (const l of this.legs) if (l.last) { l.step = { from: l.last.clone().sub(l.U.getWorldPosition(new THREE.Vector3())), rel: true, t: 0, T, lift, plant: plant === l.side }; l.lock = null; l.w = 0; }
  }
  apply(dt) {
    for (const l of this.legs) { this.leg(l, dt); l.last = l.toe.getWorldPosition(l.last || new THREE.Vector3()); }
  }
  leg(l, dt) {
    const ankle = l.E.getWorldPosition(new THREE.Vector3()), toe = l.toe.getWorldPosition(new THREE.Vector3());
    const planted = this.on && toe.y < l.toeY + (l.lock ? 0.015 : 0);   // a pinned boot lets go a little later than it plants
    // the body moved on too far from a planted boot: pick it up and put it down where the
    // clip has it (a quick step), never slide it there
    if (!l.step && l.lock && planted && Math.hypot(l.lock.x - toe.x, l.lock.z - toe.z) > this.drift) {
      const from = toe.clone().lerp(l.lock, Math.min(1, l.w)); from.y = toe.y;
      l.step = { from, t: 0 }; l.lock = null;
    }
    if (l.step) {
      if (!this.on) { l.step = null; l.w = 0; return; }
      l.step.t += dt; const u = Math.min(1, l.step.t / (l.step.T || this.stepT)), e = u * u * (3 - 2 * u);
      const at = (l.step.rel ? l.U.getWorldPosition(new THREE.Vector3()).add(l.step.from) : l.step.from.clone()).lerp(toe, e);
      at.y += Math.sin(Math.PI * u) * (l.step.lift ?? this.lift);
      this.reach(l, ankle.add(at.sub(toe)));
      if (u >= 1) { const pin = planted || (l.step.plant && this.on); l.step = null; l.lock = pin ? toe.clone() : null; l.w = pin ? 1 : 0; }
      return;
    }
    if (planted && !l.lock) l.lock = toe.clone();
    l.w += ((planted ? 1 : 0) - l.w) * (1 - Math.exp(-(planted ? 30 : 12) * dt));
    if (!planted && l.w < 0.02) { l.lock = null; l.w = 0; }
    if (!l.lock || l.w <= 0.01) return;
    // keep the toe on its spot: move the ankle by how far the toe has drifted
    const drift = V3(l.lock.x - toe.x, 0, l.lock.z - toe.z).multiplyScalar(Math.min(1, l.w));
    this.reach(l, ankle.add(drift));
  }
  // move the ankle; the boot keeps the clip's angle to the ground (it does not tip with the shin)
  reach(l, ankle) { const fq = l.E.getWorldQuaternion(new THREE.Quaternion()); reachIK(l.U, l.L, l.E, ankle); setWorld(l.E, fq, 1); }
}

/**
 * Minimal two-bone reach: the knee/elbow opens or closes around its current hinge and the
 * upper bone swings the shortest way, so the clip's roll is kept (no flips, no twisting).
 */
export function reachIK(U, L, E, target) {
  const pa = U.getWorldPosition(new THREE.Vector3()), pb = L.getWorldPosition(new THREE.Vector3()), pc = E.getWorldPosition(new THREE.Vector3());
  const l1 = pa.distanceTo(pb), l2 = pb.distanceTo(pc);
  const d = THREE.MathUtils.clamp(pa.distanceTo(target), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  // 1. knee angle for the new reach, around the current bend axis
  const u = pb.clone().sub(pa).normalize(), v = pc.clone().sub(pb).normalize();
  let axis = u.clone().cross(v);
  if (axis.lengthSq() < 1e-6) return;                       // dead straight: nothing to bend around
  axis.normalize();
  const cur = Math.acos(THREE.MathUtils.clamp(u.dot(v), -1, 1));
  const want = Math.PI - Math.acos(THREE.MathUtils.clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
  rotateWorld(L, axis, want - cur);
  // 2. swing the upper bone so the end lands on the target
  const pc2 = E.getWorldPosition(new THREE.Vector3());
  const rot = new THREE.Quaternion().setFromUnitVectors(pc2.sub(pa).normalize(), target.clone().sub(pa).normalize());
  const pq = U.parent.getWorldQuaternion(new THREE.Quaternion()), wq = U.getWorldQuaternion(new THREE.Quaternion());
  U.quaternion.copy(pq.invert().multiply(rot.multiply(wq))); U.updateMatrixWorld(true);
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
