-- Test mode, part 2: more tools for the players who have players.test_mode (see
-- 20261110000000_test_modu.sql). Same rules: dev_check first, service role only.

-- Today's limits start over: training, shop, phone and pre-match choice rows of today are
-- removed, and today's finished matches (and mahalle contribution) are moved to yesterday,
-- so the daily match, mahalle and coin caps count them no more.
create function public.dev_reset_day(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  perform dev_check(p_player);
  delete from training_log where player_id = p_player and day = v_today;
  delete from shop_log     where player_id = p_player and day = v_today;
  delete from telefon_cevap where player_id = p_player and day = v_today;
  delete from mahalle_katki where player_id = p_player and day = v_today;
  update matches set day = day - 1 where player_id = p_player and day = v_today;
  update matches set finished_at = finished_at - interval '1 day'
   where player_id = p_player and finished_at >= (v_today::timestamp at time zone 'Europe/Istanbul');
  update kariyer_durum set choice = null, choice_day = null where player_id = p_player;
end $$;

-- Injury on or off.
create function public.dev_injury(p_player uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform dev_check(p_player);
  insert into kariyer_durum (player_id) values (p_player) on conflict do nothing;
  if p_on then
    update kariyer_durum set injury_until = now() + interval '3 days', injury_kind = 'muscle', updated_at = now()
     where player_id = p_player;
  else
    update kariyer_durum set injury_until = null, injury_kind = null, updated_at = now() where player_id = p_player;
  end if;
end $$;

create function public.dev_set_morale(p_player uuid, p_morale integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform dev_check(p_player);
  insert into kariyer_durum (player_id) values (p_player) on conflict do nothing;
  update kariyer_durum set morale = greatest(0, least(100, p_morale)), updated_at = now() where player_id = p_player;
end $$;

create function public.dev_set_respect(p_player uuid, p_respect integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform dev_check(p_player);
  update players set respect = greatest(0, p_respect) where id = p_player;
end $$;

-- All four stats to one value (1..100).
create function public.dev_set_stats(p_player uuid, p_value integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform dev_check(p_player);
  update player_stats set shooting = p_value, passing = p_value, pace = p_value, stamina = p_value
   where player_id = p_player;
end $$;

-- Puts an open offer in the list: kind 'direct' or 'trial' at the given tier, any club
-- name and key from the caller (the club key is only a label for the offer card).
create function public.dev_offer(p_player uuid, p_kind text, p_tier smallint, p_club_key text, p_club_name text, p_salary integer)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform dev_check(p_player);
  insert into offers (player_id, kind, tier, club_key, club_name, salary_weekly)
  values (p_player, p_kind, p_tier, p_club_key, p_club_name, p_salary)
  returning id into v_id;
  return v_id;
end $$;

-- Back to the mahalle: contract, offers and leagues are removed; level, stats and wallet stay.
create function public.dev_reset_career(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform dev_check(p_player);
  delete from contracts where player_id = p_player;
  delete from offers where player_id = p_player;
  delete from league_seasons where player_id = p_player;
end $$;

revoke all on function public.dev_reset_day(uuid), public.dev_injury(uuid, boolean), public.dev_set_morale(uuid, integer),
  public.dev_set_respect(uuid, integer), public.dev_set_stats(uuid, integer),
  public.dev_offer(uuid, text, smallint, text, text, integer), public.dev_reset_career(uuid)
  from public, anon, authenticated;
grant execute on function public.dev_reset_day(uuid), public.dev_injury(uuid, boolean), public.dev_set_morale(uuid, integer),
  public.dev_set_respect(uuid, integer), public.dev_set_stats(uuid, integer),
  public.dev_offer(uuid, text, smallint, text, text, integer), public.dev_reset_career(uuid)
  to service_role;
