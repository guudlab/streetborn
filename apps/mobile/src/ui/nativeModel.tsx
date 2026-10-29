import type React from 'react';

import type { Opts, Scene } from './modelScene.ts';

// Web: Model3D draws into a canvas itself (WebCanvas), so this is never rendered.
// iOS and Android use nativeModel.native.tsx.
export function ModelWebView(_props: { model: number; opts: React.RefObject<Opts>; onReady(s: Scene): void; onFail(e: unknown): void }): null {
  return null;
}
