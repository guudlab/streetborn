-- Burak abi's first jobs (new player tutorial): play a match, train once and join a
-- mahalle. The one-time coin reward is paid here, never by the client: the function
-- checks the three facts in the database and pays through grant_currency() with a
-- per-player idempotency key, so repeating the call can never pay twice.

create function public.claim_jobs(p_player uuid, p_coin integer) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_key text := 'jobs:' || p_player::text;
begin
  if p_coin <= 0 then return 0; end if;
  perform 1 from players where id = p_player for update;
  if not found then raise exception 'not_found'; end if;
  if exists (select 1 from ledger where idempotency_key = v_key) then return 0; end if;
  if not exists (select 1 from matches where player_id = p_player and status = 'finished')
    or not exists (select 1 from training_log where player_id = p_player)
    or not exists (select 1 from mahalle_uye where player_id = p_player) then
    return 0;
  end if;
  perform grant_currency(p_player, 'coin', p_coin, 'jobs', null, v_key);
  return p_coin;
end $$;

revoke execute on function public.claim_jobs from public, anon, authenticated;
grant execute on function public.claim_jobs to service_role;
