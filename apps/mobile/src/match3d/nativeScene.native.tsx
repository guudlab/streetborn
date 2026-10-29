import { Asset } from 'expo-asset';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { colors } from '../theme.ts';
import { loadModelBytes } from '../ui/Model3D.tsx';
import type { FromWebView, MatchConfig, SceneBridge, ToWebView } from './bridgeTypes.ts';
import type { MatchEnv, MatchScene, ScenePhase } from './scene.d.ts';

// iOS and Android: the 3D match runs in a WebView. scene.js needs a DOM and WebGL, which
// both platforms' web views have, so it is the very scene the browser runs, bundled by
// scripts/build-match-webview.mjs. The app keeps the HUD, the engine and the sound: it
// sends the models once, then forwards the scene calls and receives its events.
// What the screen reads synchronously (phase, aim, ring timing) is streamed back.

export const hasNativeScene = true;

let htmlOnce: Promise<string> | null = null;
function loadHtml(): Promise<string> {
  htmlOnce ??= (async () => {
    const asset = Asset.fromModule(require('../../assets/match3d/match.webview.html'));
    await asset.downloadAsync();
    return (await fetch(asset.localUri ?? asset.uri)).text();
  })();
  htmlOnce.catch(() => { htmlOnce = null; });
  return htmlOnce;
}

/** base64 of a byte array, in slices so the string builder never sees a huge argument list. */
function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}

/** Characters of base64 per message (a multiple of 4). */
const CHUNK = 384 * 1024;
const tick = () => new Promise<void>(r => setTimeout(r, 0));

function createBridge(inject: (js: string) => void, onFail: (e: unknown) => void) {
  let hello = false;
  let stage = 'page';
  const queue: ToWebView[] = [];
  const state = { phase: 'menu' as ScenePhase, aim: { aim: 0, lift: 0 }, timing: 0 };
  let env: Pick<MatchEnv, 'on' | 'sfx'> | null = null;
  let progress: (p: number) => void = () => {};
  let ready: { resolve(): void; reject(e: unknown): void } | null = null;

  const flush = (m: ToWebView) => inject(`window.__rn(${JSON.stringify(m)});true;`);
  const send = (m: ToWebView) => { if (hello) flush(m); else queue.push(m); };
  const call = (fn: Extract<ToWebView, { t: 'call' }>['fn'], ...args: unknown[]) => send({ t: 'call', fn, args });

  const handle = (m: FromWebView) => {
    switch (m.t) {
      case 'hello': hello = true; stage = 'models'; queue.splice(0).forEach(flush); break;
      case 'progress': stage = `parse ${Math.round(m.p * 100)}%`; progress(0.5 + m.p / 2); break;
      case 'ready': ready?.resolve(); ready = null; break;
      case 'error': console.warn('3D match (webview):', m.message); if (ready) { ready.reject(new Error(m.message)); ready = null; } else onFail(new Error(m.message)); break;
      case 'state':
        if (m.phase) state.phase = m.phase as ScenePhase;
        if (m.aim) state.aim = m.aim;
        if (m.timing !== undefined) state.timing = m.timing;
        break;
      case 'ev': {
        if (m.name === 'phase') state.phase = m.a[0] as ScenePhase;
        // JSON turns an omitted gain (undefined) into null
        if (m.name === 'sfx') { (env?.sfx as (...a: unknown[]) => void)?.(...m.a.map(x => x ?? undefined)); break; }
        (env?.on[m.name] as ((...a: unknown[]) => void) | undefined)?.(...m.a);
        break;
      }
    }
  };

  const scene: MatchScene = {
    start: (m) => call('start', m),
    phase: () => state.phase,
    aim: () => state.aim,
    setCharging: (v) => call('setCharging', v),
    shoot: (s) => call('shoot', s),
    timing: () => state.timing,
    tackle: (side, timing, outcome) => call('tackle', side, timing, outcome),
    passTo: (side, outcome) => call('passTo', side, outcome),
    setPaused: (p) => call('setPaused', p),
    ready: Promise.resolve(),
    sim: () => {},
    stats: () => ({ calls: 0, triangles: 0, programs: 0, textures: 0, geometries: 0 }),
    dispose: () => call('dispose'),
  };

  const bridge: SceneBridge = {
    async start(cfg: MatchConfig, files, onProgress, e) {
      env = e;
      progress = onProgress;
      const done = new Promise<void>((resolve, reject) => {
        ready = { resolve, reject };
        // A page that never answers (a script that did not start, no WebGL) must not hang the loading bar.
        setTimeout(() => { if (ready) { ready = null; reject(new Error(`timeout at stage ${stage}${hello ? '' : ' (page never said hello)'}`)); } }, 90_000);
      });
      let sent = 0;
      for (const [key, model] of files) {
        const b64 = toBase64(new Uint8Array(await loadModelBytes(model)));
        const n = Math.ceil(b64.length / CHUNK);
        for (let i = 0; i < n; i++) { send({ t: 'model', key, i, n, d: b64.slice(i * CHUNK, (i + 1) * CHUNK) }); await tick(); }
        onProgress(++sent / files.length / 2);
        stage = `models ${sent}/${files.length}`;
      }
      stage = 'build';
      send({ t: 'go', cfg });
      await done;
      return scene;
    },
    dispose() { env = null; ready = null; },
  };
  return { bridge, handle };
}

export function NativeSceneView({ onBridge, onFail }: { onBridge(b: SceneBridge): void; onFail(e: unknown): void }) {
  const web = useRef<WebView<unknown>>(null);
  const [html, setHtml] = useState<string | null>(null);
  const core = useRef<ReturnType<typeof createBridge> | null>(null);
  core.current ??= createBridge((js) => web.current?.injectJavaScript(js), onFail);

  useEffect(() => {
    let alive = true;
    loadHtml().then((h) => { if (alive) { setHtml(h); onBridge(core.current!.bridge); } }, (e: unknown) => onFail(new Error(`html asset: ${String((e as Error)?.message ?? e)}`)));
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (html === null) return <View style={{ flex: 1, backgroundColor: colors.ink }} />;
  return (
    <WebView
      ref={web}
      style={{ flex: 1, backgroundColor: colors.ink }}
      originWhitelist={['*']}
      source={{ html }}
      javaScriptEnabled
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      allowsLinkPreview={false}
      cacheEnabled={false}
      androidLayerType="hardware"
      onMessage={(e: WebViewMessageEvent) => core.current!.handle(JSON.parse(e.nativeEvent.data) as FromWebView)}
      onContentProcessDidTerminate={() => onFail(new Error('web content process terminated'))}
      onRenderProcessGone={() => onFail(new Error('render process gone'))}
      onError={(e) => onFail(new Error(`webview: ${e.nativeEvent.description}`))}
      onHttpError={(e) => onFail(new Error(`webview http ${e.nativeEvent.statusCode}`))}
    />
  );
}
