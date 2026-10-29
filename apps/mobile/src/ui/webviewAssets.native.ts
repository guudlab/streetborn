import { Asset } from 'expo-asset';

import { loadModelBytes } from './Model3D.tsx';

// Shared by the WebViews that run three.js on iOS and Android (the 3D match and Model3D):
// loading their bundled page, and sending a model to it as base64 chunks.

const pages = new Map<number, Promise<string>>();

/** The text of a bundled page (a generated .html asset, see scripts/build-match-webview.mjs). */
export function loadPage(module: number): Promise<string> {
  let p = pages.get(module);
  if (!p) {
    p = (async () => {
      const asset = Asset.fromModule(module);
      await asset.downloadAsync();
      return (await fetch(asset.localUri ?? asset.uri)).text();
    })();
    p.catch(() => pages.delete(module));
    pages.set(module, p);
  }
  return p;
}

/** base64 of a byte array, in slices so the string builder never sees a huge argument list. */
function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}

/** Characters of base64 per message (a multiple of 4). */
const CHUNK = 384 * 1024;
const chunked = new Map<number, Promise<string[]>>();

/** A model's bytes as base64 chunks. The last few are kept: the hub model comes back often. */
export function modelChunks(model: number): Promise<string[]> {
  let p = chunked.get(model);
  if (!p) {
    p = (async () => {
      const b64 = toBase64(new Uint8Array(await loadModelBytes(model)));
      const out: string[] = [];
      for (let i = 0; i < b64.length; i += CHUNK) out.push(b64.slice(i, i + CHUNK));
      return out;
    })();
    p.catch(() => chunked.delete(model));
    chunked.set(model, p);
    if (chunked.size > 6) chunked.delete(chunked.keys().next().value as number);
  }
  return p;
}
