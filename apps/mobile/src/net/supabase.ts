import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Public client settings. The publishable key is meant to ship inside the app;
// row level security and the Edge Functions decide what it can do.
// EXPO_PUBLIC_* variables override them (for a local Supabase, for example).
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://daunbydsmydsvcwemnwx.supabase.co';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_r3PG8v8LtrA1X0tqD2g-Kw_FvMvJmKg';

/** Set EXPO_PUBLIC_OFFLINE=1 to play with local rules only (no account, nothing saved). */
export const offline = process.env.EXPO_PUBLIC_OFFLINE === '1';

export const supabase: SupabaseClient = createClient(URL, KEY, {
  auth: {
    // Web uses localStorage; static rendering on the server has neither.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    persistSession: Platform.OS !== 'web' || typeof window !== 'undefined',
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
