import type { SceneBridge } from './bridgeTypes.ts';

// Web: the 3D match draws straight into a canvas (Match3D.tsx), so there is no bridge.
// iOS and Android use nativeScene.native.tsx, which hosts the same scene in a WebView.
export const hasNativeScene = false;

export function NativeSceneView(_props: { onBridge(b: SceneBridge): void; onFail(e: unknown): void }): null {
  return null;
}
