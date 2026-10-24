// Stores the nickname and the new-player choices. The choices do not change any
// number yet; they are kept so mahalle members see each other's names.
import { checkName } from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, requirePlayer } from '../_shared/supabase.ts';

const POSITIONS = ['bitirici', 'oyunKurucu', 'kanat'];
const TRAITS = ['hirsli', 'sakin', 'caliskan', 'sovmen', 'lider', 'sert'];
const DREAMS = ['milli', 'avrupa', 'saha'];
const HEROES = ['street', 'gercekci', 'ciliz3', 'ciliz4', 'pro'];
const JERSEYS = ['lime', 'red', 'blue', 'orange', 'purple', 'white'];

Deno.serve(handle(async (req) => {
  const playerId = await requirePlayer(req);
  const body = await req.json().catch(() => ({})) as { nick?: unknown; character?: Record<string, unknown> };

  const nick = typeof body.nick === 'string' ? body.nick.trim() : '';
  const problem = checkName(nick, 'nick');
  if (problem) throw new HttpError(400, `nick_${problem}`);

  const c = body.character ?? {};
  if (!POSITIONS.includes(c.position as string) || !TRAITS.includes(c.trait as string) || !DREAMS.includes(c.dream as string)
    || !HEROES.includes(c.hero as string) || !JERSEYS.includes(c.jersey as string)) {
    throw new HttpError(400, 'bad_character');
  }
  const character = { position: c.position, trait: c.trait, dream: c.dream, hero: c.hero, jersey: c.jersey };

  const { error } = await admin.rpc('set_profile', { p_player: playerId, p_nick: nick, p_character: character });
  if (error) throw error;
  return json({ ok: true });
}));
