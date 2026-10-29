// Shrinks the Meshy fan characters (T1-T4, 3D-assetler/mac-tribun) for the match stands:
// drops the walk clip and every map but the base colour, simplifies the mesh (the skin
// stays, so the fans by the fences can play idle and cheer), and writes meshopt GLBs.
// Usage: node fans.mjs <out dir> <T1-rig.glb> [T2-rig.glb ...]  (FAN_RATIO, default 0.22)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, weld, textureCompress, meshopt, dedup, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [out, ...inputs] = process.argv.slice(2);
const ratio = Number(process.env.FAN_RATIO || 0.22);
await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
fs.mkdirSync(out, { recursive: true });

for (const file of inputs) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) a.dispose();
  for (const m of root.listMaterials()) {
    for (const t of [m.getNormalTexture(), m.getMetallicRoughnessTexture(), m.getOcclusionTexture(), m.getEmissiveTexture()]) if (t) t.dispose();
    m.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
    m.setMetallicFactor(0).setRoughnessFactor(0.9);
  }
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) simplifySeams(p);
  await doc.transform(
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }),
    dedup(), prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  let tris = 0;
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
  const dst = path.join(out, path.basename(file).replace(/-rig\.glb$/, '.glb').toLowerCase().replace(/^t/, 'fan'));
  await io.write(dst, doc);
  console.log(path.basename(dst), tris, 'tris', (fs.statSync(dst).size / 1024).toFixed(0) + 'KB');
}

// Meshy unwraps into hundreds of small UV islands, and the plain simplifier will not
// collapse an edge along an island border, so it stops at ~90%. Permissive lets it cross
// them; the UV and normal weights keep it from smearing the texture where it does.
function simplifySeams(prim) {
  const pos = prim.getAttribute('POSITION'), uv = prim.getAttribute('TEXCOORD_0'), nor = prim.getAttribute('NORMAL');
  const n = pos.getCount(), P = new Float32Array(pos.getArray()), A = new Float32Array(n * 5), t = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    uv.getElement(i, t); A[i * 5] = t[0]; A[i * 5 + 1] = t[1];
    nor.getElement(i, t); A.set(t, i * 5 + 2);
  }
  const idx = new Uint32Array(prim.getIndices().getArray());
  const [out, err] = MeshoptSimplifier.simplifyWithAttributes(idx, P, 3, A, 5, [1.5, 1.5, 0.4, 0.4, 0.4], null,
    Math.floor((idx.length * ratio) / 3) * 3, Number(process.env.FAN_ERR || 0.05), ['Permissive']);
  prim.getIndices().setArray(out);
  compactPrimitive(prim);
  console.log('  simplified', idx.length / 3, '->', out.length / 3, 'error', err.toFixed(4));
}
