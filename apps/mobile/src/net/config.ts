// Public client settings. The publishable key is meant to ship inside the app;
// row level security and the Edge Functions decide what it can do.
// EXPO_PUBLIC_* variables override them (for a local Supabase, for example).
// Kept apart from supabase.ts so startup can read them without loading the Supabase client.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://daunbydsmydsvcwemnwx.supabase.co';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_r3PG8v8LtrA1X0tqD2g-Kw_FvMvJmKg';

/** Set EXPO_PUBLIC_OFFLINE=1 to play with local rules only (no account, nothing saved). */
export const offline = process.env.EXPO_PUBLIC_OFFLINE === '1';

/** Where supabase-js keeps the session (its default key: sb-<project ref>-auth-token). */
export const SESSION_KEY = `sb-${SUPABASE_URL.replace(/^https?:\/\//, '').split(/[.:/]/)[0]}-auth-token`;

/** Where invite links point. The web build opens them directly; the app takes over once it has a domain. */
export const INVITE_BASE = process.env.EXPO_PUBLIC_INVITE_BASE ?? 'https://streetborn.guudlab.workers.dev';

/**
 * RevenueCat public SDK keys (appl_… / goog_…, from RevenueCat → API keys). Public by
 * design, like the Supabase publishable key. Empty: store purchases stay off and the
 * shop keeps its prototype flow.
 */
export const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
export const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';
