# Character clips

`bake-clips.mjs` writes named clips (walk, idle, cheer, dribble, kick, Burak's wave) into the
character files in `assets/models/`, which `ui/Model3D.tsx` plays by name.

1. `node animonly.mjs <meshy>.glb clips/<name>.glb` strips a Meshy export to its skeleton and clip.
2. Optimise a new mesh: `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 1024`.
3. `node bake-clips.mjs job-<name>.json`: retargets each clip onto the target rig (`rig.mjs`),
   removes the on-the-spot spin from idle and cheer clips, trims, and writes the GLB.

Run from a scratch folder with `three@0.170`, `@gltf-transform/core|extensions|functions` and
`meshoptimizer` installed; the job paths are relative to that folder. Source GLBs live in
`/mnt/project-files/3d-assetler/` (karakterler-rig, karakterler-animasyon, mahalle-abisi).
