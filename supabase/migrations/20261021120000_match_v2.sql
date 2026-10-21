-- Match engine v2: moments (shot, pass, free kick), assists, the team score and
-- server-side replay. match-finish now replays the recorded inputs and stores
-- them, so the client never reports stats.

alter table public.matches
  add column engine_version  smallint not null default 1,
  add column shooting        smallint,
  add column passing         smallint,
  add column opponent_attack smallint,
  add column assists         smallint,
  add column team_goals      smallint,
  add column opponent_goals  smallint,
  add column inputs          jsonb;

drop function public.begin_match(uuid, integer, smallint, timestamptz, bigint, smallint, smallint, timestamptz);
drop function public.finish_match(uuid, uuid, smallint, smallint, smallint, smallint, integer, text, text[], integer, integer);

create function public.begin_match(
  p_player uuid,
  p_expected_version integer,
  p_energy smallint,
  p_energy_updated_at timestamptz,
  p_engine_version smallint,
  p_seed bigint,
  p_chances smallint,
  p_shooting smallint,
  p_passing smallint,
  p_opponent_goalkeeping smallint,
  p_opponent_attack smallint,
  p_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_match uuid;
begin
  update wallets
     set energy = p_energy, energy_updated_at = p_energy_updated_at, version = version + 1
   where player_id = p_player and version = p_expected_version;
  if not found then
    raise exception 'wallet_version_conflict' using errcode = '40001';
  end if;

  -- One open match per player: starting a new one abandons the old ticket.
  update matches set status = 'expired' where player_id = p_player and status = 'open';

  -- The skills are frozen in the ticket so the replay uses what the match was played with.
  insert into matches (player_id, engine_version, seed, chances, shooting, passing,
                       opponent_goalkeeping, opponent_attack, expires_at)
  values (p_player, p_engine_version, p_seed, p_chances, p_shooting, p_passing,
          p_opponent_goalkeeping, p_opponent_attack, p_expires_at)
  returning id into v_match;

  return v_match;
end $$;

create function public.finish_match(
  p_match uuid,
  p_player uuid,
  p_shots smallint,
  p_shots_on_target smallint,
  p_goals smallint,
  p_assists smallint,
  p_team_goals smallint,
  p_opponent_goals smallint,
  p_rating smallint,
  p_duration_ms integer,
  p_inputs jsonb,
  p_flag_reasons text[],
  p_coin integer,
  p_xp integer,
  p_level integer
) returns table (coin bigint, xp bigint, level integer, already_finished boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_flagged boolean := coalesce(array_length(p_flag_reasons, 1), 0) > 0;
begin
  update matches
     set status = 'finished', shots = p_shots, shots_on_target = p_shots_on_target, goals = p_goals,
         assists = p_assists, team_goals = p_team_goals, opponent_goals = p_opponent_goals,
         rating = p_rating, duration_ms = p_duration_ms, inputs = p_inputs,
         flagged = v_flagged, flag_reasons = p_flag_reasons,
         coin_reward = p_coin, xp_reward = p_xp, finished_at = now()
   where id = p_match and player_id = p_player and status = 'open';

  if not found then
    return query
      select w.coin, p.xp, p.level, true
        from wallets w join players p on p.id = w.player_id
       where w.player_id = p_player;
    return;
  end if;

  perform grant_currency(p_player, 'coin', p_coin, 'match', p_match::text, 'match:' || p_match::text);
  -- The level is computed in TypeScript from the new XP total (levelForXp).
  update players set xp = players.xp + p_xp, level = greatest(players.level, p_level) where id = p_player;

  if v_flagged then
    insert into flags (player_id, kind, detail)
    values (p_player, 'match', jsonb_build_object('match_id', p_match, 'reasons', p_flag_reasons));
  end if;

  return query
    select w.coin, p.xp, p.level, false
      from wallets w join players p on p.id = w.player_id
     where w.player_id = p_player;
end $$;

revoke execute on function public.begin_match, public.finish_match from public, anon, authenticated;
grant execute on function public.begin_match, public.finish_match to service_role;
