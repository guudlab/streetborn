// Deletes the caller's account for good: the game data first (delete_account hands the
// mahalle captaincy on and cascades through every per-player table), then the auth user,
// so the email or Google/Apple identity is free to start again. Safe to retry: a second
// call finds no player row and only finishes removing the auth user.
import { handle, HttpError, json } from '../_shared/http.ts';
import { admin, requirePlayer } from '../_shared/supabase.ts';

Deno.serve(handle(async (req) => {
  const playerId = await requirePlayer(req);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  // The app asks twice before calling; this only stops a stray request.
  if (body.confirm !== true) throw new HttpError(400, 'not_confirmed');

  const { error } = await admin.rpc('delete_account', { p_player: playerId });
  if (error) throw error;
  const { error: authError } = await admin.auth.admin.deleteUser(playerId);
  if (authError && authError.status !== 404) throw authError;
  return json({ ok: true });
}));
