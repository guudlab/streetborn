import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
const io = new NodeIO();
const [, , inp, out, name] = process.argv;
const doc = await io.read(inp);
const r = doc.getRoot();
for (const n of r.listNodes()) { n.setMesh(null); n.setSkin(null); }
for (const m of r.listMeshes()) m.dispose();
for (const s of r.listSkins()) s.dispose();
for (const m of r.listMaterials()) m.dispose();
for (const t of r.listTextures()) t.dispose();
if (name) r.listAnimations()[0].setName(name);
await doc.transform(prune({ keepLeaves: true }));
await io.write(out, doc);
