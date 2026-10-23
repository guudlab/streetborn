// Create, join and leave a mahalle. The SQL functions do the real work under row
// locks; this function checks names and maps their error codes to HTTP statuses.
import { checkName } from '../../../packages/economy/src/index.ts';
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, requirePlayer } from '../_shared/supabase.ts';

const EMBLEMS = ['shield', 'circle', 'diamond'];
const COLORS = ['lime', 'blue', 'red', 'purple', 'teal', 'white'];
const CODE = /^[A-Za-z0-9]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Message codes raised by the SQL functions.
const SQL_ERRORS: Record<string, number> = { already_member: 409, not_found: 404, full: 409, not_open: 403 };

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
    default:
      throw new HttpError(400, 'bad_action');
  }
}));
