import { holdRedirect, isAuthRedirect } from '../net/auth.ts';

// Every link that opens the app passes here first. A sign-in link from an email carries
// the session after #, which the router would drop, so the whole URL is kept for /hesap.

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (isAuthRedirect(path)) { holdRedirect(path); return '/hesap'; }
  } catch {
    // A bad link must not crash the app; the router gets it as it came.
  }
  return path;
}
