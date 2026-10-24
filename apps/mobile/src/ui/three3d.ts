// Everything Model3D needs from three.js, in one module so it loads as a single
// on-demand chunk (Metro would hoist modules shared by two chunks into the startup bundle).
export * as THREE from 'three';
export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
export { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
export { MeshoptDecoder } from 'meshoptimizer';
