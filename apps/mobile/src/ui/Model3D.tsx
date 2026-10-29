import { Image, type ImageSource } from 'expo-image';
import { Asset } from 'expo-asset';
import { useFocusEffect } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { tintMaterials, type Tint } from './kitTint.ts';
import { build, debug, type Gltf, type Opts, type Scene } from './modelScene.ts';
import { ModelWebView } from './nativeModel';

// A rigged or static Meshy model on a transparent GL surface. The browser renders into a
// plain <canvas>; iOS and Android draw in a small WebView (nativeModel.native.tsx), because
// expo-gl has no image decoding for the textures inside the .glb files. Both run the same
// scene code (modelScene.ts). On the web, three.js and the meshopt decoder (~700 KB) load
// with the first model (or preloadModels), not with the app.
//
// Character files carry named clips (walk, idle, cheer, wave…, baked by
// scripts/bake-clips.mjs): `clip` loops, `action` plays once and blends back.
// Nothing is drawn until the model is ready, then it fades in; `poster` is only for
// small props, where a picture first is better than a gap. `fallback` shows when
// WebGL is missing or the file fails.

// Last loading step reached, shown by ?3ddebug when a model never appears.
const load3d = () => import('./three3d.ts');
type Three = Awaited<ReturnType<typeof load3d>>;

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
      debug.stage = 'meshopt wasm';
      await three.MeshoptDecoder.ready;
      debug.stage = 'parse glb';
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
  // The phone draws models in a WebView, which parses them itself: only fetch the bytes.
  if (Platform.OS !== 'web') { for (const m of models) modelBytes(m).catch(() => {}); return; }
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
    // On the phone the cause is shown under the fallback picture until native 3D is proven on devices.
    if (Platform.OS !== 'web' || /3ddebug/.test(window.location.search)) setError(`${debug.stage}: ${String((e as Error)?.message ?? e)}`.slice(0, 160));
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
            : <ModelWebView key={model} model={model} opts={opts} onReady={onReady} onFail={onFail} />}
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
      debug.stage = 'import three';
      const three = await load3d();
      debug.stage = 'webgl context';
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
