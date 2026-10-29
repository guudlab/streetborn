// The scene behind Model3D: frames one rigged model, plays its clips, turns it by hand. Plain
// three.js and DOM, no React Native, because two places run it: the browser (Model3D's
// WebCanvas) and the WebView that draws models on iOS and Android (webview/modelEntry.js).
import type { AnimationClip, Group } from 'three';

import { tintMaterials, type Tint } from './kitTint.ts';

export type Gltf = { scene: Group; animations: AnimationClip[] };
/** The three.js pieces build() needs. */
export interface Three3D { THREE: typeof import('three'); cloneSkinned: typeof import('three/examples/jsm/utils/SkeletonUtils.js').clone }

/** Last step reached, shown by ?3ddebug / the phone's error line when a model never appears. */
export const debug = { stage: 'start' };

export interface Opts { spin: boolean; headroom: number; clip?: string; intro?: string; tint: Tint }

/** What a running scene exposes to the component after it is built. */
export interface Scene {
  setClip(name?: string): void;
  play(name: string): void;
  setTint(t: Tint): void;
  setPaused(p: boolean): void;
  /** Off screen (scrolled away): stop drawing, like a paused scene. */
  setHidden(h: boolean): void;
  /** Resolves once the shaders are compiled and the first frame is drawn. */
  ready: Promise<void>;
  drag(dx: number): void;
  release(vx: number): void;
  dispose(): void;
}

const TURN_SPEED = 0.012; // radians per dragged pixel
const SETTLE_AFTER = 2.5; // seconds after a drag before the model turns back to the front
const BLEND = 0.35;

/** Frames the model, starts the render loop and returns its controls. */
export function build(
  { THREE, cloneSkinned }: Three3D,
  renderer: import('three').WebGLRenderer,
  gltf: Gltf,
  width: number,
  height: number,
  opt: Opts,
  present?: () => void,
): Scene {
  debug.stage = 'render';
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 4, 3);
  scene.add(key);

  const root = cloneSkinned(gltf.scene) as import('three').Group;
  const tint = tintMaterials(THREE, root);
  const pivot = new THREE.Group();
  pivot.add(root);
  scene.add(pivot);

  // Centre the model and fit its bounding box, so wide models are not cropped.
  // A spinning model sweeps a circle, so use its horizontal diagonal as the width.
  // Measured on the parsed original in its bind pose: a fresh skinned clone has no bone
  // matrices yet, so its box comes out wrong.
  const { size, centre } = bounds(THREE, gltf);
  root.position.sub(centre);
  const extra = size.y * opt.headroom;
  const halfH = size.y / 2 + extra / 2;
  const halfW = opt.spin ? Math.hypot(size.x, size.z) / 2 : size.x / 2;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fit = Math.max(halfH / tanV, halfW / (tanV * camera.aspect));
  camera.position.set(0, extra / 2, fit * 1.12 + (opt.spin ? 0 : size.z / 2));
  camera.lookAt(0, extra / 2, 0);

  // Clips by name; a file without names keeps its single clip as the loop.
  const mixer = new THREE.AnimationMixer(root);
  const clips = new Map(gltf.animations.map(c => [c.name, c]));
  const first = gltf.animations[0];
  const actionOf = (name?: string) => {
    const c = (name && clips.get(name)) || (name ? undefined : first);
    return c ? mixer.clipAction(c) : null;
  };
  let loopName = opt.clip;
  let current: import('three').AnimationAction | null = null;
  let once: import('three').AnimationAction | null = null;

  function fadeTo(a: import('three').AnimationAction, loop: boolean) {
    if (a === current && loop) return;
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    a.clampWhenFinished = !loop;
    a.setEffectiveWeight(1).play();
    if (current && current !== a) current.crossFadeTo(a, BLEND, false);
    current = a;
  }
  function backToLoop() {
    once = null;
    const a = actionOf(loopName) ?? actionOf();
    if (a) fadeTo(a, true);
  }
  const introAction = opt.intro ? actionOf(opt.intro) : null;
  if (introAction) { fadeTo(introAction, false); once = introAction; } else backToLoop();

  // Turning by hand: angle follows the finger, then coasts and settles back to 0.
  let angle = 0, base = 0, vel = 0, dragging = false, idleFor = 0;
  let paused = false, hidden = false, disposed = false;
  let frame = 0;
  const clock = new THREE.Clock();
  const tick = () => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.1);
    if (paused || hidden) return;
    if (once && once.time > once.getClip().duration - BLEND) backToLoop();
    mixer.update(dt);
    if (opt.spin) pivot.rotation.y += dt * 0.5;
    else {
      if (!dragging) {
        angle += vel * dt;
        vel *= Math.pow(0.04, dt);
        idleFor += dt;
        if (idleFor > SETTLE_AFTER && Math.abs(vel) < 0.5) {
          // Take the shorter way back to the front.
          const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
          angle = wrapped * Math.pow(0.02, dt);
        }
      }
      pivot.rotation.y = angle;
    }
    renderer.render(scene, camera);
    present?.();
  };
  // Compile the shaders before the first frame: in the browser they compile in parallel
  // (KHR_parallel_shader_compile) instead of freezing the screen that opens the model.
  const ready = (renderer.extensions.has('KHR_parallel_shader_compile') ? renderer.compileAsync(scene, camera) : Promise.resolve())
    .catch(() => {})
    .then(() => { if (!disposed) { clock.getDelta(); tick(); } });

  return {
    setClip(name) { loopName = name; if (!once) backToLoop(); },
    play(name) {
      const a = actionOf(name);
      if (!a) return;
      once = a;
      fadeTo(a, false);
    },
    setTint: tint,
    setPaused(p) { paused = p; if (!p) clock.getDelta(); },
    setHidden(h) { hidden = h; if (!h) clock.getDelta(); },
    ready,
    drag(dx) {
      if (!dragging) { dragging = true; base = angle; vel = 0; }
      angle = base + dx * TURN_SPEED;
      idleFor = 0;
    },
    release(vx) {
      dragging = false;
      // vx is px/ms; keep a little of the throw.
      vel = vx * 1000 * TURN_SPEED * 0.6;
      idleFor = 0;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      mixer.stopAllAction();
      renderer.dispose();
      // Browsers keep only ~16 WebGL contexts and drop the oldest past that (a model that
      // goes blank); a context is otherwise freed only whenever the canvas is collected.
      renderer.forceContextLoss();
    },
  };
}

const measured = new WeakMap<Gltf, { size: import('three').Vector3; centre: import('three').Vector3 }>();
function bounds(THREE: Three3D['THREE'], gltf: Gltf) {
  let b = measured.get(gltf);
  if (!b) {
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene, true);
    b = { size: box.getSize(new THREE.Vector3()), centre: box.getCenter(new THREE.Vector3()) };
    measured.set(gltf, b);
  }
  return b;
}

