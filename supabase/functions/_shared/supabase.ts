import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { DEFAULT_CONFIG, type EconomyConfig } from '../../../packages/economy/src/index.ts';
import { HttpError } from './http.ts';

/** Service-role client. Bypasses RLS, so it must only run server-side. */
export const admin: SupabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

/** Resolves the calling player from the request's JWT. */
export async function requirePlayer(req: Request): Promise<string> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'unauthorized');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'unauthorized');
  return data.user.id;
}

/** DEFAULT_CONFIG with the live overrides from the `config` table applied. */
export async function loadEconomyConfig(): Promise<EconomyConfig> {
  const { data, error } = await admin.from('config').select('value').eq('key', 'economy').maybeSingle();
  if (error) throw error;
  const live = data?.value ?? {};
  // Grouped blocks merge key by key, so a live override of one number keeps the rest.
  return {
    ...DEFAULT_CONFIG,
    ...live,
    mahalle: { ...DEFAULT_CONFIG.mahalle, ...(live.mahalle ?? {}) },
    career: { ...DEFAULT_CONFIG.career, ...(live.career ?? {}) },
    training: { ...DEFAULT_CONFIG.training, ...(live.training ?? {}) },
    shop: { ...DEFAULT_CONFIG.shop, ...(live.shop ?? {}) },
  };
}

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}
