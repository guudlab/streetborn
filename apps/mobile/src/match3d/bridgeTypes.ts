import type { Tint } from '../ui/kitTint.ts';
import type { MatchScene } from './scene.d.ts';

// The message protocol between the app (React Native) and the 3D match running in a
// WebView on iOS and Android. The scene itself (scene.js) is the same code the browser
// runs; the WebView bundle (webview/entry.js) hosts it and relays calls and events.

/** What the WebView needs to build the match. Models travel separately, as `model` chunks. */
export interface MatchConfig {
  /** Model keys, as the screen names them (hero, keeper, mate0, opp0…). */
  keys: string[];
  tint: Tint;
  board: string;
  kit?: string;
  away?: string;
}

export type ToWebView =
  | { t: 'model'; key: string; i: number; n: number; d: string }
  | { t: 'go'; cfg: MatchConfig }
  | { t: 'call'; fn: 'start' | 'shoot' | 'tackle' | 'passTo' | 'setPaused' | 'setCharging' | 'dispose'; args: unknown[] };

export type FromWebView =
  | { t: 'hello' }
  | { t: 'progress'; p: number }
  | { t: 'ready' }
  | { t: 'error'; message: string }
  /** A callback of `MatchEnv.on` or `MatchEnv.sfx`. */
  | { t: 'ev'; name: 'phase' | 'aimed' | 'ring' | 'grade' | 'result' | 'skipped' | 'done' | 'sfx'; a: unknown[] }
  /** What the screen reads synchronously from the scene: the phase, the aim and the ring timing. */
  | { t: 'state'; phase?: string; aim?: { aim: number; lift: number }; timing?: number };

/** The app side of the bridge: a MatchScene whose calls travel to the WebView. */
export interface SceneBridge {
  /** Sends the models and builds the match. Resolves with the scene once it is drawing. */
  start(cfg: MatchConfig, files: [string, number][], on: (p: number) => void, env: Pick<import('./scene.d.ts').MatchEnv, 'on' | 'sfx'>): Promise<MatchScene>;
  dispose(): void;
}
