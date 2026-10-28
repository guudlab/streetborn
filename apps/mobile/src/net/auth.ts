import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { ApiError } from './api.ts';
import { INVITE_BASE } from './config.ts';

// Account linking. Every player starts as an anonymous Supabase user; linking an
// email, Google or Apple identity keeps the same user id, so nothing has to move.
// "Hesabım var" signs in to an existing account instead (replacing the session).
// Google and Apple need their providers and manual linking turned on in Supabase.

const client = () => import('./supabase.ts').then(m => m.supabase);

export type Provider = 'google' | 'apple';

export interface Account {
  anonymous: boolean;
  email: string | null;
  /** An email waiting for its confirmation link. */
  pendingEmail: string | null;
  providers: Provider[];
}

export async function loadAccount(): Promise<Account> {
  const supabase = await client();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new ApiError(error?.code ?? 'no_session');
  const u = data.user;
  return {
    anonymous: u.is_anonymous ?? false,
    email: u.email || null,
    pendingEmail: u.new_email || null,
    providers: (u.identities ?? []).map(i => i.provider).filter((p): p is Provider => p === 'google' || p === 'apple'),
  };
}

/** Where the provider sends the player back: the /hesap route on the web, the app's scheme on a phone. */
function redirectTo(): string {
  return Platform.OS === 'web' ? `${window.location.origin}/hesap` : Linking.createURL('hesap');
}

const fail = (e: { code?: string; message: string } | null) => { if (e) throw new ApiError(e.code ?? e.message); };

/**
 * Opens the provider's page. On a phone it returns when the player comes back;
 * on the web the page leaves and app/hesap.tsx finishes the sign-in.
 */
async function openProvider(url: string): Promise<'ok' | 'cancel'> {
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return new Promise(() => {});
  }
  const r = await WebBrowser.openAuthSessionAsync(url, redirectTo());
  if (r.type !== 'success') return 'cancel';
  await finishRedirect(r.url);
  return 'ok';
}

/** Reads the provider's answer from the redirect URL (code, tokens or error) and stores the session. */
export async function finishRedirect(url: string): Promise<void> {
  const params = new URLSearchParams([url.split('#')[1], url.split('?')[1]?.split('#')[0]].filter(Boolean).join('&'));
  const error = params.get('error_code') ?? params.get('error');
  if (error) throw new ApiError(error);
  const supabase = await client();
  const code = params.get('code');
  if (code) return fail((await supabase.auth.exchangeCodeForSession(code)).error);
  const access = params.get('access_token'), refresh = params.get('refresh_token');
  if (access && refresh) return fail((await supabase.auth.setSession({ access_token: access, refresh_token: refresh })).error);
  throw new ApiError('no_session');
}

/** Adds a Google or Apple identity to the current (anonymous) player. */
export async function linkProvider(provider: Provider): Promise<'ok' | 'cancel'> {
  const supabase = await client();
  const { data, error } = await supabase.auth.linkIdentity({ provider, options: { redirectTo: redirectTo(), skipBrowserRedirect: true } });
  fail(error);
  return openProvider(data.url!);
}

/** Signs in to an existing account with Google or Apple. */
export async function signInProvider(provider: Provider): Promise<'ok' | 'cancel'> {
  const supabase = await client();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo(), skipBrowserRedirect: true } });
  fail(error);
  return openProvider(data.url!);
}

/** Adds an email to the current player; it counts once the player opens the confirmation link. */
export async function linkEmail(email: string): Promise<void> {
  const supabase = await client();
  fail((await supabase.auth.updateUser({ email }, { emailRedirectTo: `${INVITE_BASE}/hesap` })).error);
}

/**
 * Sends a sign-in email to an existing account: a code to type in, and a link that
 * signs in on the web (/hesap). Supabase's default email has only the link; the
 * code needs the custom template, which needs a custom SMTP server.
 */
export async function sendEmailCode(email: string): Promise<void> {
  const supabase = await client();
  fail((await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${INVITE_BASE}/hesap` } })).error);
}

export async function verifyEmailCode(email: string, code: string): Promise<void> {
  const supabase = await client();
  fail((await supabase.auth.verifyOtp({ email, token: code, type: 'email' })).error);
}

/**
 * Signs out of this device for good. The anonymous guest session is only kept in this
 * device's storage, so a guest who signs out can never reach that player again; the
 * profile screen warns about it first.
 */
export async function signOutAll(): Promise<void> {
  const supabase = await client();
  // Even when the server cannot be reached, the local session must go.
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw new ApiError(error.code ?? error.message);
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
