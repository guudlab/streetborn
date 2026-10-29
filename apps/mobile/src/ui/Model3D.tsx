import { Image, type ImageSource } from 'expo-image';
import { Asset } from 'expo-asset';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useFocusEffect } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { tintMaterials, type Tint } from './kitTint.ts';

// A rigged or static Meshy model on a transparent GL surface. Native draws through
// expo-gl; the browser has no expo-gl backend, so web renders into a plain <canvas>
// with the same scene code. three.js and the meshopt decoder (~700 KB) load with the
// first model (or preloadModels), not with the app.
//
// Character files carry named clips (walk, idle, cheer, wave…, baked by
// scripts/bake-clips.mjs): `clip` loops, `action` plays once and blends back.
// Nothing is drawn until the model is ready, then it fades in; `poster` is only for
// small props, where a picture first is better than a gap. `fallback` shows when
// WebGL is missing or the file fails.

// Last loading step reached, shown by ?3ddebug when a model never appears.
let stage = 'start';
const load3d = () => import('./three3d.ts');
type Three = Awaited<ReturnType<typeof load3d>>;
type Gltf = { scene: import('three').Group; animations: import('three').AnimationClip[] };

export type { Tint } from './kitTint.ts';

interface Props {
  /** The bundled .glb, from require('../../assets/models/x.glb'). */
  model: number;
  /** Shown only if the model cannot be drawn (no WebGL, failed load). */
  fallback?: ImageSource;
  /** Shown while the model loads (small props only). */
  poster?: ImageSource;
  /** Clip to loop; the first clip when the file has no clip of that name. */
  clip?: string;
  /** Plays `name` once whenever `key` changes, then blends back to `clip`. */
  action?: { name: string; key: number } | null;
  /** Every `seconds`, plays the next of `clips` once (an idle that does something now and then). */
  fidget?: { clips: string[]; seconds: number };
  /** Plays once when the model first appears. */
  intro?: string;
  /** Recolours the lime kit. */
  tint?: Tint;
  /** Turns the model slowly on its vertical axis. */
  spin?: boolean;
  /** Drag sideways to turn the model all the way round; it settles back to the front. */
  rotatable?: boolean;
  /** Extra room above the head for clips that raise the arms (0.18 = 18 % of the height). */
  headroom?: number;
  style?: StyleProp<ViewStyle>;
  label?: string;
}

interface Opts { spin: boolean; headroom: number; clip?: string; intro?: string; tint: Tint }

/** What a running scene exposes to the component after it is built. */
interface Scene {
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

// ---------------------------------------------------------------------------
// Loading and caching
// ---------------------------------------------------------------------------

const bytes = new Map<number, Promise<ArrayBuffer>>();
const parsed = new Map<number, Promise<Gltf>>();

function modelBytes(model: number): Promise<ArrayBuffer> {
  let p = bytes.get(model);
  if (!p) {
    p = (async () => {
      const asset = Asset.fromModule(model);
      if (Platform.OS !== 'web') await asset.downloadAsync();
      return (await fetch(Platform.OS === 'web' ? asset.uri : (asset.localUri ?? asset.uri))).arrayBuffer();
    })();
    p.catch(() => bytes.delete(model));
    bytes.set(model, p);
  }
  return p;
}

/** Parses each file once; every Model3D gets its own clone of the scene. */
function modelGltf(three: Three, model: number): Promise<Gltf> {
  let p = parsed.get(model);
  if (!p) {
    p = (async () => {
      const data = await modelBytes(model);
      stage = 'meshopt wasm';
      await three.MeshoptDecoder.ready;
      stage = 'parse glb';
      const loader = new three.GLTFLoader();
      loader.setMeshoptDecoder(three.MeshoptDecoder);
      return new Promise<Gltf>((resolve, reject) => loader.parse(data, '', resolve, reject));
    })();
    p.catch(() => parsed.delete(model));
    parsed.set(model, p);
  }
  return p;
}

/** The raw bytes of a bundled model, for scenes that parse it somewhere else (the match WebView). */
export const loadModelBytes = modelBytes;

/**
 * Starts downloading and parsing models before their screen opens, so the 3D is there
 * when it is needed. Safe to call often; each file loads once.
 */
export function preloadModels(models: number[]) {
  void load3d().then((three) => Promise.all(models.map(m => modelGltf(three, m)))).catch(() => {});
}

/**
 * A parsed file for scenes that build their own three.js world (the 3D match). The
 * result is shared: clone what you draw (SkeletonUtils) and leave the original alone.
 */
export async function loadModel(model: number): Promise<Gltf> {
  return modelGltf(await load3d(), model);
}

/** The 3D match scene's builder (it lives in the three.js chunk, see three3d.ts). */
export async function loadMatchScene() {
  return (await load3d()).createMatch;
}

/** Recolours one model's kit, for scenes outside Model3D. Each call clones the materials. */
export async function kitTinter(): Promise<(root: import('three').Object3D, tint: Tint) => void> {
  const three = await load3d();
  return (root, tint) => tintMaterials(three.THREE, root)(tint);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Model3D(props: Props) {
  const { model, fallback, poster, clip, action, fidget, intro, tint = null, spin = false, rotatable = false, headroom = 0.06, style, label } = props;
  const scene = useRef<Scene | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState('');
  const fade = useRef(new Animated.Value(0)).current;
  const opts = useRef<Opts>({ spin, headroom, clip, intro, tint });
  opts.current = { spin, headroom, clip, intro, tint };

  // A new file means a new scene.
  useEffect(() => { setReady(false); setFailed(false); fade.setValue(0); }, [model, fade]);

  const onReady = useCallback((s: Scene) => {
    scene.current = s;
    setReady(true);
    Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [fade]);
  const onFail = useCallback((e: unknown) => {
    console.warn('Model3D failed', e);
    setFailed(true);
    if (Platform.OS === 'web' && /3ddebug/.test(window.location.search)) setError(String((e as Error)?.stack ?? e).slice(0, 300));
  }, []);

  useEffect(() => { scene.current?.setClip(clip); }, [clip, ready]);
  useEffect(() => { scene.current?.setTint(tint); }, [tint, ready]);
  useEffect(() => { if (action) scene.current?.play(action.name); }, [action?.key, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Something now and then, so an idle character does not look frozen.
  useEffect(() => {
    if (!fidget || !ready) return;
    let i = 0;
    const id = setInterval(() => scene.current?.play(fidget.clips[i++ % fidget.clips.length]!), fidget.seconds * 1000);
    return () => clearInterval(id);
  }, [fidget?.clips.join(), fidget?.seconds, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tab screens stay mounted: stop drawing while the screen is not on top.
  useFocusEffect(useCallback(() => {
    scene.current?.setPaused(false);
    return () => scene.current?.setPaused(true);
  }, []));

  const pan = useMemo(() => PanResponder.create({
    // Only sideways drags turn the model, so the page still scrolls up and down.
    onMoveShouldSetPanResponder: (_, g) => rotatable && Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => { scene.current?.drag(g.dx); },
    onPanResponderRelease: (_, g) => { scene.current?.release(g.vx); },
    onPanResponderTerminate: (_, g) => { scene.current?.release(g.vx); },
  }), [rotatable]);

  const fill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;
  return (
    <View style={style} accessibilityLabel={label} accessibilityRole="image" accessibilityHint={rotatable ? label : undefined} {...(rotatable ? pan.panHandlers : {})}>
      {poster && !ready && !failed ? <Image source={poster} style={fill} contentFit="contain" /> : null}
      {failed && fallback ? <Image source={fallback} style={fill} contentFit="contain" /> : null}
      {!failed && (
        <Animated.View style={[fill, { opacity: fade }]} pointerEvents="none">
          {Platform.OS === 'web'
            ? <WebCanvas key={model} model={model} opts={opts} onReady={onReady} onFail={onFail} />
            : <NativeCanvas key={model} model={model} opts={opts} onReady={onReady} onFail={onFail} />}
        </Animated.View>
      )}
      {error ? <Text style={{ position: 'absolute', left: 0, right: 0, bottom: 0, color: '#f66', fontSize: 9 }}>{error}</Text> : null}
    </View>
  );
}

interface CanvasProps { model: number; opts: React.RefObject<Opts>; onReady(s: Scene): void; onFail(e: unknown): void }

function WebCanvas({ model, opts, onReady, onFail }: CanvasProps) {
  const host = useRef<React.ComponentRef<typeof View>>(null);
  useEffect(() => {
    const el = host.current as unknown as HTMLElement | null;
    if (!el) return;
    let s: Scene | undefined;
    let io: IntersectionObserver | undefined;
    let cancelled = false;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:pan-y';
    el.appendChild(canvas);
    void (async () => {
      stage = 'import three';
      const three = await load3d();
      stage = 'webgl context';
      const renderer = new three.THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const width = Math.max(el.clientWidth, 1), height = Math.max(el.clientHeight, 1);
      renderer.setSize(width, height, false);
      try {
        const gltf = await modelGltf(three, model);
        if (cancelled) { renderer.dispose(); renderer.forceContextLoss(); return; }
        s = build(three, renderer, gltf, width, height, opts.current!);
        await s.ready;
        if (cancelled) return;
        onReady(s);
        // A model scrolled out of view stops drawing.
        if (typeof IntersectionObserver === 'function') {
          io = new IntersectionObserver((entries) => { for (const e of entries) s?.setHidden(!e.isIntersecting); });
          io.observe(el);
        }
      } catch (e) { renderer.dispose(); renderer.forceContextLoss(); throw e; }
    })().catch((e: unknown) => { if (!cancelled) onFail(e); });
    return () => {
      cancelled = true; io?.disconnect(); s?.dispose(); canvas.remove();
    };
  }, [model]); // eslint-disable-line react-hooks/exhaustive-deps
  return <View ref={host} style={{ flex: 1 }} />;
}

function NativeCanvas({ model, opts, onReady, onFail }: CanvasProps) {
  const s = useRef<Scene | null>(null);
  useEffect(() => () => s.current?.dispose(), []);
  return (
    <GLView
      style={{ flex: 1 }}
      onContextCreate={(gl: ExpoWebGLRenderingContext) => {
        void (async () => {
          const three = await load3d();
          const { drawingBufferWidth: width, drawingBufferHeight: height } = gl;
          const renderer = new three.THREE.WebGLRenderer({
            canvas: { width, height, style: {}, addEventListener() {}, removeEventListener() {}, clientHeight: height, getContext: () => gl } as unknown as HTMLCanvasElement,
            context: gl,
            alpha: true,
          } as ConstructorParameters<typeof import('three').WebGLRenderer>[0]);
          renderer.setSize(width, height);
          s.current = build(three, renderer, await modelGltf(three, model), width, height, opts.current!, () => gl.endFrameEXP());
          onReady(s.current);
        })().catch(onFail);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

const TURN_SPEED = 0.012; // radians per dragged pixel
const SETTLE_AFTER = 2.5; // seconds after a drag before the model turns back to the front
const BLEND = 0.35;

/** Frames the model, starts the render loop and returns its controls. */
function build(
  { THREE, cloneSkinned }: Three,
  renderer: import('three').WebGLRenderer,
  gltf: Gltf,
  width: number,
  height: number,
  opt: Opts,
  present?: () => void,
): Scene {
  stage = 'render';
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
  const ready = (Platform.OS === 'web' && renderer.extensions.has('KHR_parallel_shader_compile') ? renderer.compileAsync(scene, camera) : Promise.resolve())
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
      if (Platform.OS === 'web') renderer.forceContextLoss();
    },
  };
}

const measured = new WeakMap<Gltf, { size: import('three').Vector3; centre: import('three').Vector3 }>();
function bounds(THREE: Three['THREE'], gltf: Gltf) {
  let b = measured.get(gltf);
  if (!b) {
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene, true);
    b = { size: box.getSize(new THREE.Vector3()), centre: box.getCenter(new THREE.Vector3()) };
    measured.set(gltf, b);
  }
  return b;
}
