-- Test mode: a per-player switch that unlocks the `dev-tools` Edge Function for that
-- player only (skip league days, add coin or gem, set the level, fill energy, set coach
-- trust). Nobody can turn it on from the app: there is no write policy, so the owner sets
-- it in the SQL editor:
--   update players set test_mode = true where id = '<player id>';
-- Every function below refuses a player whose test_mode is false, and only the service
-- role can call them. Currency still moves only through grant_currency() with a ledger row.

alter table public.players add column test_mode boolean not null default false;

create function public.dev_check(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select test_mode from players where id = p_player), false) then
    raise exception 'forbidden';
  end if;
end $$;

-- Moves the player's calendar forward: the active league season started p_days earlier,
-- so the next career refresh simulates the rounds that "passed". The day's pre-match
-- choice is released too.
create function public.dev_skip_days(p_player uuid, p_days integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform dev_check(p_player);
  update league_seasons set start_day = start_day - p_days where player_id = p_player and status = 'active';
  update kariyer_durum set choice_day = null where player_id = p_player;
end $$;

create function public.dev_grant(p_player uuid, p_currency text, p_amount bigint) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  perform dev_check(p_player);
  return grant_currency(p_player, p_currency, p_amount, 'dev', null, 'dev:' || gen_random_uuid()::text);
end $$;

create function public.dev_set_level(p_player uuid, p_level integer, p_xp bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform dev_check(p_player);
  update players set level = p_level, xp = p_xp where id = p_player;
end $$;

create function public.dev_fill_energy(p_player uuid, p_energy smallint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform dev_check(p_player);
  update wallets set energy = p_energy, energy_updated_at = now(), version = version + 1 where player_id = p_player;
end $$;

create function public.dev_set_trust(p_player uuid, p_trust integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform dev_check(p_player);
  update players set coach_trust = greatest(0, least(100, p_trust)) where id = p_player;
end $$;

revoke all on function public.dev_check(uuid), public.dev_skip_days(uuid, integer), public.dev_grant(uuid, text, bigint),
  public.dev_set_level(uuid, integer, bigint), public.dev_fill_energy(uuid, smallint), public.dev_set_trust(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.dev_check(uuid), public.dev_skip_days(uuid, integer), public.dev_grant(uuid, text, bigint),
  public.dev_set_level(uuid, integer, bigint), public.dev_fill_energy(uuid, smallint), public.dev_set_trust(uuid, integer)
  to service_role;
