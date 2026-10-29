// Keeps the lower body of the idle and wave clips still (Meshy idles shuffle and cross the feet).
// Usage: node calm-legs.mjs in.glb out.glb (needs @gltf-transform/core|extensions and meshoptimizer).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [src, out] = process.argv.slice(2);
const d = await io.read(src);
d.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
const LOWER = /^(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase))$/;
for (const a of d.getRoot().listAnimations()) {
  if (a.getName() !== 'idle' && a.getName() !== 'wave') continue;
  for (const c of a.listChannels()) {
    if (!LOWER.test(c.getTargetNode().getName())) continue;
    const acc = c.getSampler().getOutput(); const arr = acc.getArray(); const n = acc.getElementSize();
    for (let i = 1; i < acc.getCount(); i++) for (let k = 0; k < n; k++) arr[i * n + k] = arr[k];
    acc.setArray(arr);
  }
}
await io.write(out, d);
