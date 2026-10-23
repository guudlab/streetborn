import { Image, type ImageSource } from 'expo-image';
import { Asset } from 'expo-asset';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Platform, Text, View, type StyleProp, type ViewStyle } from 'react-native';

// A rigged or static Meshy model, shown on a transparent GL surface.
// Native draws through expo-gl; the browser has no expo-gl backend, so web
// renders into a plain <canvas> with the same scene code. The PNG shows while
// loading and stays if WebGL is unavailable. three.js and the meshopt decoder
// (~700 KB) load with the first model, not with the app.

// Last loading step reached, shown by ?3ddebug when a model never appears.
let stage = 'start';
const load3d = () => import('./three3d.ts');

interface Props {
  /** The bundled .glb, from require('../../assets/models/x.glb'). */
  model: number;
  /** The PNG render shown on web, and while the model loads. */
  fallback: ImageSource;
  /** Play the first animation clip in a loop (walk, idle). */
  loop?: boolean;
  /** Turns the model slowly on its vertical axis. */
  spin?: boolean;
  style?: StyleProp<ViewStyle>;
  label?: string;
}

export function Model3D({ model, fallback, loop = false, spin = false, style, label }: Props) {
  if (Platform.OS === 'web') {
    return <Web model={model} fallback={fallback} loop={loop} spin={spin} style={style} label={label} />;
  }
  return <Native model={model} fallback={fallback} loop={loop} spin={spin} style={style} label={label} />;
}

function Web({ model, fallback, loop, spin, style, label }: Props) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const host = useRef<React.ComponentRef<typeof View>>(null);

  useEffect(() => {
    const el = host.current as unknown as HTMLElement | null;
    if (!el) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    el.appendChild(canvas);
    const debug = /3ddebug/.test(window.location.search);
    const stuck = debug
      ? setTimeout(() => !cancelled && setError(`stuck after: ${stage}`), 12000)
      : undefined;
    void setupWeb(canvas, el, model, { loop, spin })
      .then((d) => {
        if (cancelled) return d.dispose();
        dispose = d.dispose;
        clearTimeout(stuck);
        setError('');
        setReady(true);
      })
      .catch((e: unknown) => {
        // No WebGL or a failed load: the PNG stays. Add ?3ddebug to the URL to see why.
        console.warn('Model3D failed', e);
        if (debug && !cancelled) setError(String((e as Error)?.stack ?? e).slice(0, 300));
      });
    return () => {
      cancelled = true;
      clearTimeout(stuck);
      dispose?.();
      canvas.remove();
    };
  }, [model, loop, spin]);

  return (
    <View ref={host} style={style} accessibilityLabel={label} accessibilityRole="image">
      <Image source={fallback} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: ready ? 0 : 1 }} contentFit="contain" />
      {error ? <Text style={{ position: 'absolute', left: 0, right: 0, bottom: 0, color: '#f66', fontSize: 9 }}>{error}</Text> : null}
    </View>
  );
}

function Native({ model, fallback, loop, spin, style, label }: Props) {
  const [ready, setReady] = useState(false);
  const ctx = useRef<{ dispose?: () => void }>({});

  useEffect(() => () => ctx.current.dispose?.(), []);

  return (
    <View style={style} accessibilityLabel={label} accessibilityRole="image">
      <Image source={fallback} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} contentFit="contain" />
      <GLView
        style={{ flex: 1, opacity: ready ? 1 : 0 }}
        onContextCreate={(gl) => {
          void setup(gl, model, { loop, spin }).then((d) => {
            ctx.current.dispose = d.dispose;
            setReady(true);
          });
        }}
      />
    </View>
  );
}

type Three = Awaited<ReturnType<typeof load3d>>;

/** Native: three.js on the expo-gl context. */
async function setup(gl: ExpoWebGLRenderingContext, model: number, opt: { loop?: boolean; spin?: boolean }) {
  const three = await load3d();
  const { width, height } = { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };
  const renderer = new three.THREE.WebGLRenderer({
    canvas: { width, height, style: {}, addEventListener() {}, removeEventListener() {}, clientHeight: height, getContext: () => gl } as unknown as HTMLCanvasElement,
    context: gl,
    alpha: true,
  } as ConstructorParameters<typeof import('three').WebGLRenderer>[0]);
  renderer.setSize(width, height);
  const asset = Asset.fromModule(model);
  await asset.downloadAsync();
  return run(three, renderer, await fetchBytes(asset.localUri ?? asset.uri), width, height, opt, () => gl.endFrameEXP());
}

/** Web: three.js on a <canvas> that fills its host element. */
async function setupWeb(canvas: HTMLCanvasElement, host: HTMLElement, model: number, opt: { loop?: boolean; spin?: boolean }) {
  stage = 'import three';
  const three = await load3d();
  stage = 'webgl context';
  const renderer = new three.THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const width = Math.max(host.clientWidth, 1);
  const height = Math.max(host.clientHeight, 1);
  renderer.setSize(width, height, false);
  stage = 'fetch glb';
  const bytes = await fetchBytes(Asset.fromModule(model).uri);
  return run(three, renderer, bytes, width, height, opt);
}

async function fetchBytes(uri: string) {
  return (await fetch(uri)).arrayBuffer();
}

/** Parses the model, frames it and starts the render loop on an existing renderer. */
async function run(
  { THREE, GLTFLoader, MeshoptDecoder }: Three,
  renderer: import('three').WebGLRenderer,
  bytes: ArrayBuffer,
  width: number,
  height: number,
  opt: { loop?: boolean; spin?: boolean },
  present?: () => void,
) {
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 4, 3);
  scene.add(key);

  stage = 'meshopt wasm';
  await MeshoptDecoder.ready;
  stage = 'parse glb';
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise<{ scene: import('three').Group; animations: import('three').AnimationClip[] }>((resolve, reject) => {
    loader.parse(bytes, '', resolve, reject);
  });

  stage = 'render';
  const root = gltf.scene;
  scene.add(root);

  // Centre the model and fit its bounding box, so wide models are not cropped.
  // A spinning model sweeps a circle, so use its horizontal diagonal as the width.
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  root.position.sub(centre);
  const halfW = opt.spin ? Math.hypot(size.x, size.z) / 2 : size.x / 2;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fit = Math.max(size.y / 2 / tanV, halfW / (tanV * camera.aspect));
  camera.position.set(0, 0, fit * 1.12 + (opt.spin ? 0 : size.z / 2));
  camera.lookAt(0, 0, 0);

  let mixer: import('three').AnimationMixer | null = null;
  if (opt.loop && gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(gltf.animations[0]!).play();
  }

  let frame = 0;
  const clock = new THREE.Clock();
  const tick = () => {
    frame = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    mixer?.update(dt);
    if (opt.spin) root.rotation.y += dt * 0.5;
    renderer.render(scene, camera);
    present?.();
  };
  tick();

  return {
    dispose: () => {
      cancelAnimationFrame(frame);
      mixer?.stopAllAction();
      renderer.dispose();
    },
  };
}
