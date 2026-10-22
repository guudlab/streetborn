import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { SESSION_KEY, SUPABASE_KEY, SUPABASE_URL } from './config.ts';

// Loaded on demand by api.ts, so the client is not part of the startup bundle.
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // Web uses localStorage; static rendering on the server has neither.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    storageKey: SESSION_KEY,
    persistSession: Platform.OS !== 'web' || typeof window !== 'undefined',
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
