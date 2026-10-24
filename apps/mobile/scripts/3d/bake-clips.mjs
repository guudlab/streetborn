// Bakes named animation clips into a character GLB: retargets each source clip onto the
// target rig (rig.mjs), takes the spin out of idle/cheer clips, and writes them with
// gltf-transform next to the mesh. Usage: node bake.mjs <job.json>
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { rigInfo, retarget, lockYaw, rotateWorld, aimBone, subclip } from './rig.mjs';

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const loader = new GLTFLoader();
const load = (f) => new Promise((res, rej) => { const b = fs.readFileSync(f); loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej); });

const dstG = await load(job.rig);
const dst = rigInfo(dstG.scene);
const clips = [];
for (const c of job.clips) {
  let clip;
  if (c.wave) clip = wave(clips.find((k) => k.name === c.base), c);
  else {
    const srcG = await load(c.src);
    const src = rigInfo(srcG.scene);
    clip = retarget(srcG.animations[0], src, dst, { inPlace: c.inPlace !== false, name: c.name });
    if (c.lock) clip = lockYaw(clip, c.lock === 'spine' ? { hips: false, inPlace: c.inPlace !== false } : {});
    if (c.trim) clip = subclip(clip, c.trim[0], c.trim[1], c.name);
    if (c.speed) { for (const t of clip.tracks) for (let i = 0; i < t.times.length; i++) t.times[i] /= c.speed; clip.duration /= c.speed; }
  }
  clip.name = c.name;
  clip.optimize();
  clips.push(clip);
  console.log(c.name, clip.duration.toFixed(2) + 's', clip.tracks.length, 'tracks');
}

/** Burak abi's greeting: the base clip, with the right arm raised and the forearm waving. */
function wave(base, c) {
  const root = dst.root, b = dst.bones;
  const mixer = new THREE.AnimationMixer(root);
  const act = mixer.clipAction(base); act.play();
  const fps = 30, dur = c.duration ?? 2.4, N = Math.round(dur * fps) + 1;
  const names = Object.keys(b);
  const qv = Object.fromEntries(names.map((n) => [n, []]));
  const pv = [], times = [];
  const rest = names.map((n) => b[n].quaternion.clone());
  for (let i = 0; i < N; i++) {
    const t = i / fps; times.push(t);
    names.forEach((n, k) => b[n].quaternion.copy(rest[k]));
    mixer.setTime(t % base.duration); root.updateMatrixWorld(true);
    // raise in 0.35 s, wave, lower in the last 0.45 s
    const up = Math.min(1, t / 0.35) * Math.min(1, Math.max(0, (dur - t) / 0.45));
    const e = up * up * (3 - 2 * up);
    // face the player while greeting: neck and head back to the bind pose
    for (const n of ['Spine02', 'neck', 'Head']) b[n].quaternion.slerp(rest[names.indexOf(n)], e * 0.85);
    root.updateMatrixWorld(true);
    const side = c.side === 'left' ? 1 : -1;
    const P = c.side === 'left' ? 'Left' : 'Right';
    aimBone(b[P + 'Arm'], b[P + 'ForeArm'], new THREE.Vector3(side * 0.85, 0.2, 0.35), e);
    const sw = Math.sin(t * Math.PI * 2 * 1.7) * 0.45;
    aimBone(b[P + 'ForeArm'], b[P + 'Hand'], new THREE.Vector3(side * (0.1 + sw), 1, 0.25), e);
    root.updateMatrixWorld(true);
    // head tilts a little toward the camera
    rotateWorld(b.Head, new THREE.Vector3(0, 0, 1), side * -0.08 * e);
    for (const n of names) qv[n].push(...b[n].quaternion.toArray());
    pv.push(...b.Hips.position.toArray());
  }
  mixer.stopAllAction();
  names.forEach((n, k) => b[n].quaternion.copy(rest[k]));
  const tracks = names.map((n) => new THREE.QuaternionKeyframeTrack(n + '.quaternion', times, qv[n]));
  tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, pv));
  return new THREE.AnimationClip(c.name, dur, tracks);
}

// ---- write
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(job.mesh);
const r = doc.getRoot();
const buf = r.listBuffers()[0];
const keep = new Set(job.keep ?? []);
for (const a of r.listAnimations()) {
  if (job.rename && keep.size === 0) { a.setName(job.rename); continue; }
  a.dispose();
}
const byName = new Map(r.listNodes().map((n) => [n.getName(), n]));
for (const clip of clips) {
  const anim = doc.createAnimation(clip.name);
  for (const t of clip.tracks) {
    const [node, prop] = t.name.split('.');
    const target = byName.get(node);
    if (!target) continue;
    const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(t.times)).setBuffer(buf);
    const output = doc.createAccessor().setType(prop === 'quaternion' ? 'VEC4' : 'VEC3').setArray(new Float32Array(t.values)).setBuffer(buf);
    const s = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(prop === 'quaternion' ? 'rotation' : 'translation').setSampler(s));
  }
}
await io.write(job.out, doc);
console.log('wrote', job.out, fs.statSync(job.out).size);
