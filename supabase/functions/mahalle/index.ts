// Create, join and leave a mahalle. The SQL functions do the real work under row
// locks; this function checks names and maps their error codes to HTTP statuses.
import { checkName, levelForXp } from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, loadEconomyConfig, requirePlayer } from '../_shared/supabase.ts';

const EMBLEMS = ['shield', 'circle', 'diamond'];
const COLORS = ['lime', 'blue', 'red', 'purple', 'teal', 'white'];
const CODE = /^[A-Za-z0-9]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Message codes raised by the SQL functions.
const SQL_ERRORS: Record<string, number> = {
  already_member: 409, not_found: 404, full: 409, not_open: 403,
  not_member: 403, not_played: 409, self: 400, too_many: 429, already_cheered: 409,
};

function fail(error: { message: string } | null) {
  if (!error) return;
  const status = SQL_ERRORS[error.message];
  if (status) throw new HttpError(status, error.message);
  throw error;
}

Deno.serve(handle(async (req) => {
  const playerId = await requirePlayer(req);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  switch (body.action) {
    case 'create': {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const problem = checkName(name, 'mahalle');
      if (problem) throw new HttpError(400, `name_${problem}`);
      if (!EMBLEMS.includes(body.emblem as string) || !COLORS.includes(body.color as string)) throw new HttpError(400, 'bad_look');
      const { data, error } = await admin.rpc('create_mahalle', {
        p_player: playerId, p_name: name, p_emblem: body.emblem, p_color: body.color, p_open: body.open === true,
      });
      fail(error);
      return json({ ok: true, mahalle: data?.[0] ?? null });
    }
    case 'join': {
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      const id = typeof body.id === 'string' ? body.id : '';
      if (CODE.test(code)) {
        fail((await admin.rpc('join_mahalle', { p_player: playerId, p_code: code, p_id: null })).error);
      } else if (UUID.test(id)) {
        fail((await admin.rpc('join_mahalle', { p_player: playerId, p_code: null, p_id: id })).error);
      } else {
        throw new HttpError(400, 'bad_code');
      }
      return json({ ok: true });
    }
    case 'leave': {
      fail((await admin.rpc('leave_mahalle', { p_player: playerId })).error);
      return json({ ok: true });
    }
    case 'cheer': {
      // A preset phrase for a teammate who played today: XP for both, respect for the receiver, no coin.
      const to = typeof body.to === 'string' ? body.to : '';
      const phrase = body.phrase;
      if (!UUID.test(to) || !Number.isInteger(phrase) || (phrase as number) < 0 || (phrase as number) > 4) {
        throw new HttpError(400, 'bad_cheer');
      }
      const config = await loadEconomyConfig();
      const m = config.mahalle;
      const { data: rows, error: xpError } = await admin.from('players').select('id, xp').in('id', [playerId, to]);
      if (xpError) throw xpError;
      const xp = (id: string) => Number(rows?.find((r) => r.id === id)?.xp ?? 0);
      fail((await admin.rpc('give_cheer', {
        p_from: playerId, p_to: to, p_phrase: phrase, p_per_day: m.cheersPerDay, p_received_max: m.cheersReceivedMax,
        p_xp_giver: m.cheerXpGiver, p_xp_receiver: m.cheerXpReceiver,
        p_level_giver: levelForXp(xp(playerId) + m.cheerXpGiver, config),
        p_level_receiver: levelForXp(xp(to) + m.cheerXpReceiver, config),
        p_respect: m.respectCheer,
      })).error);
      return json({ ok: true });
    }
    default:
      throw new HttpError(400, 'bad_action');
  }
}));
