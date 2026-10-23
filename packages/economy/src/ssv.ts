// AdMob rewarded ad server-side verification (SSV). Google calls our callback with
// the reward in the query string, signed with ECDSA P-256 / SHA-256. The signed
// message is the query string up to `&signature=`; `signature` and `key_id` come
// last. Keys: https://www.gstatic.com/admob/reward/verifier-keys.json
// Uses WebCrypto, which Deno and Node both have.

export interface SsvKey { keyId: number; base64: string }

export interface SsvCallback {
  /** The signed part of the query string. */
  message: string;
  signature: Uint8Array;
  keyId: number;
  params: URLSearchParams;
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const std = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Splits a callback query string (without `?`). Null when it is not a signed SSV callback. */
export function parseSsv(query: string): SsvCallback | null {
  const at = query.indexOf('&signature=');
  if (at <= 0) return null;
  const params = new URLSearchParams(query);
  const signature = params.get('signature');
  const keyId = Number(params.get('key_id'));
  if (!signature || !Number.isInteger(keyId)) return null;
  try {
    return { message: query.slice(0, at), signature: base64ToBytes(signature), keyId, params };
  } catch {
    return null;
  }
}

/** DER ECDSA signature (SEQUENCE of two INTEGERs) to the 64-byte r‖s form WebCrypto verifies. */
export function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (der.length < 8 || der[0] !== 0x30) return null;
  let i = 2;
  if (der[1]! & 0x80) i = 2 + (der[1]! & 0x7f);
  const out = new Uint8Array(64);
  for (let part = 0; part < 2; part++) {
    if (der[i] !== 0x02) return null;
    let len = der[i + 1]!;
    let start = i + 2;
    i = start + len;
    if (i > der.length) return null;
    // Drop the sign byte; left-pad short integers.
    while (len > 32 && der[start] === 0) { start++; len--; }
    if (len > 32) return null;
    out.set(der.subarray(start, start + len), part * 32 + (32 - len));
  }
  return out;
}

/** True when the callback is signed by one of Google's keys. */
export async function verifySsv(cb: SsvCallback, keys: SsvKey[]): Promise<boolean> {
  const key = keys.find((k) => k.keyId === cb.keyId);
  const raw = derToRaw(cb.signature);
  if (!key || !raw) return false;
  const subtle = globalThis.crypto.subtle;
  const pub = await subtle.importKey('spki', base64ToBytes(key.base64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, raw, new TextEncoder().encode(cb.message));
}
