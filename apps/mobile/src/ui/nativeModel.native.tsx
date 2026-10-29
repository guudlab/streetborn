import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { Opts, Scene } from './modelScene.ts';
import { loadPage, modelChunks } from './webviewAssets.native.ts';

// iOS and Android: one model in a small WebView running the same scene as the browser
// (modelScene.ts, bundled into model.webview.html by scripts/build-match-webview.mjs).
// The app sends the model as base64 chunks, then forwards the scene's controls.

type ToPage =
  | { t: 'model'; i: number; n: number; d: string }
  | { t: 'go'; opts: Opts }
  | { t: 'call'; fn: keyof Omit<Scene, 'ready'>; args: unknown[] };
type FromPage = { t: 'hello' } | { t: 'ready' } | { t: 'error'; message: string };

interface Props { model: number; opts: React.RefObject<Opts>; onReady(s: Scene): void; onFail(e: unknown): void }

export function ModelWebView({ model, opts, onReady, onFail }: Props) {
  const web = useRef<WebView<unknown>>(null);
  const [html, setHtml] = useState<string | null>(null);
  const run = useRef({ hello: false, queue: [] as ToPage[], ready: null as null | (() => void), dead: false, stage: 'page' });

  const send = (m: ToPage) => {
    const r = run.current;
    if (!r.hello) r.queue.push(m);
    else web.current?.injectJavaScript(`window.__rn(${JSON.stringify(m)});true;`);
  };

  useEffect(() => {
    let alive = true;
    loadPage(require('../../assets/webview/model.webview.html')).then((h) => { if (alive) setHtml(h); }, (e: unknown) => { if (alive) onFail(new Error(`page asset: ${String((e as Error)?.message ?? e)}`)); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Once the page has said hello: send the model, then ask for the scene.
  const start = async () => {
    const r = run.current;
    r.hello = true;
    r.stage = 'send model';
    const chunks = await modelChunks(model);
    chunks.forEach((d, i) => send({ t: 'model', i, n: chunks.length, d }));
    r.stage = 'build scene';
    send({ t: 'go', opts: opts.current! });
    r.queue.splice(0).forEach(m => web.current?.injectJavaScript(`window.__rn(${JSON.stringify(m)});true;`));
  };

  useEffect(() => () => { if (!run.current.dead) { run.current.dead = true; web.current?.injectJavaScript('window.__rn({"t":"call","fn":"dispose","args":[]});true;'); } }, []);

  const scene: Scene = {
    setClip: (name) => send({ t: 'call', fn: 'setClip', args: [name] }),
    play: (name) => send({ t: 'call', fn: 'play', args: [name] }),
    setTint: (t) => send({ t: 'call', fn: 'setTint', args: [t] }),
    setPaused: (p) => send({ t: 'call', fn: 'setPaused', args: [p] }),
    setHidden: (h) => send({ t: 'call', fn: 'setHidden', args: [h] }),
    ready: Promise.resolve(),
    drag: (dx) => send({ t: 'call', fn: 'drag', args: [dx] }),
    release: (vx) => send({ t: 'call', fn: 'release', args: [vx] }),
    dispose: () => send({ t: 'call', fn: 'dispose', args: [] }),
  };

  const onMessage = (e: WebViewMessageEvent) => {
    const m = JSON.parse(e.nativeEvent.data) as FromPage;
    if (m.t === 'hello') void start().catch(onFail);
    else if (m.t === 'ready') onReady(scene);
    else if (m.t === 'error') onFail(new Error(`${run.current.stage}: ${m.message}`));
  };

  if (html === null) return null;
  return (
    <WebView
      ref={web}
      style={{ flex: 1, backgroundColor: 'transparent' }}
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
      onMessage={onMessage}
      onContentProcessDidTerminate={() => onFail(new Error('web content process terminated'))}
      onRenderProcessGone={() => onFail(new Error('render process gone'))}
      onError={(e) => onFail(new Error(`webview: ${e.nativeEvent.description}`))}
    />
  );
}
