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
  const world = {}, local = {};
  for (const n in bones) { world[n] = bones[n].getWorldQuaternion(new THREE.Quaternion()); local[n] = bones[n].quaternion.clone(); }
  const hips = bones.Hips;
  return { root, bones, world, local, hipsRest: hips.position.clone(), hipsY: hips.position.y };
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
  const mixer = new THREE.AnimationMixer(rig.root); const act = mixer.clipAction(clip); act.play();
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
