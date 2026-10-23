-- Mahalle match (GDD v3.1): every member plays one match a day against the day's
-- NPC mahalle; the best 7 contributions make the mahalle score and empty slots are
-- filled by NPC children at settlement. As everywhere: clients never write. The
-- Edge Functions call the service-role functions below; clients read through
-- mahalle_bugun().

alter table public.players add column respect integer not null default 0 check (respect >= 0);

alter table public.matches
  add column kind        text not null default 'energy' check (kind in ('energy', 'mahalle')),
  add column mahalle_id  uuid references public.mahalle (id) on delete set null,
  add column day         date;
-- One mahalle match per player and day. An abandoned ticket is marked expired by the next start.
create unique index matches_mahalle_day on public.matches (player_id, day)
  where kind = 'mahalle' and status <> 'expired';

-- One row per mahalle and day: the NPC opponent, then the settled result.
create table public.mahalle_gun (
  mahalle_id  uuid not null references public.mahalle (id) on delete cascade,
  day         date not null,
  status      text not null default 'open' check (status in ('open', 'closed')),
  opponent    jsonb not null,
  our_goals   smallint,
  their_goals smallint,
  result      text check (result in ('W', 'D', 'L')),
  summary     jsonb,
  settled_at  timestamptz,
  primary key (mahalle_id, day)
);
create index mahalle_gun_open on public.mahalle_gun (day) where status = 'open';

-- A member's finished mahalle match of the day.
create table public.mahalle_katki (
  mahalle_id     uuid not null references public.mahalle (id) on delete cascade,
  day            date not null,
  player_id      uuid not null references public.players (id) on delete cascade,
  match_id       uuid not null references public.matches (id) on delete cascade,
  goals          smallint not null,
  assists        smallint not null,
  opponent_goals smallint not null,
  rating         smallint not null,
  primary key (mahalle_id, day, player_id)
);

create table public.mahalle_tezahurat (
  mahalle_id  uuid not null references public.mahalle (id) on delete cascade,
  day         date not null,
  from_player uuid not null references public.players (id) on delete cascade,
  to_player   uuid not null references public.players (id) on delete cascade,
  phrase      smallint not null check (phrase between 0 and 4),
  primary key (day, from_player, to_player),
  check (from_player <> to_player)
);

alter table public.mahalle_gun       enable row level security;
alter table public.mahalle_katki     enable row level security;
alter table public.mahalle_tezahurat enable row level security;
-- No policies on purpose: reads go through mahalle_bugun().

create function public.mahalle_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Istanbul')::date $$;

-- ---------------------------------------------------------------------------
-- Writes (service role only)
-- ---------------------------------------------------------------------------

-- Like begin_match, for the daily mahalle match. Errors: not_member, already_played.
create function public.begin_mahalle_match(
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
  p_expires_at timestamptz,
  p_opponent jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_mahalle uuid;
  v_day date := mahalle_today();
  v_match uuid;
begin
  select mahalle_id into v_mahalle from mahalle_uye where player_id = p_player;
  if v_mahalle is null then raise exception 'not_member'; end if;

  -- Free the day when the earlier ticket ran out unfinished.
  update matches set status = 'expired'
   where player_id = p_player and kind = 'mahalle' and day = v_day and status = 'open' and expires_at < now();
  if exists (select 1 from matches where player_id = p_player and kind = 'mahalle' and day = v_day and status <> 'expired') then
    raise exception 'already_played';
  end if;

  update wallets
     set energy = p_energy, energy_updated_at = p_energy_updated_at, version = version + 1
   where player_id = p_player and version = p_expected_version;
  if not found then
    raise exception 'wallet_version_conflict' using errcode = '40001';
  end if;

  insert into mahalle_gun (mahalle_id, day, opponent) values (v_mahalle, v_day, p_opponent)
  on conflict do nothing;

  insert into matches (player_id, kind, mahalle_id, day, engine_version, seed, chances, shooting, passing,
                       opponent_goalkeeping, opponent_attack, expires_at)
  values (p_player, 'mahalle', v_mahalle, v_day, p_engine_version, p_seed, p_chances, p_shooting, p_passing,
          p_opponent_goalkeeping, p_opponent_attack, p_expires_at)
  returning id into v_match;
  return v_match;
end $$;

-- A new energy match only abandons the player's earlier energy ticket.
create or replace function public.begin_match(
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

  update matches set status = 'expired' where player_id = p_player and status = 'open' and kind = 'energy';

  insert into matches (player_id, engine_version, seed, chances, shooting, passing,
                       opponent_goalkeeping, opponent_attack, expires_at)
  values (p_player, p_engine_version, p_seed, p_chances, p_shooting, p_passing,
          p_opponent_goalkeeping, p_opponent_attack, p_expires_at)
  returning id into v_match;

  return v_match;
end $$;

-- Mahalle matches pay under their own ledger reason, so the daily cap (which sums
-- reason 'match') only ever counts energy matches. A finished mahalle match also
-- becomes the player's contribution, unless the day was already settled.
create or replace function public.finish_match(
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
  v_kind text;
  v_mahalle uuid;
  v_day date;
begin
  update matches
     set status = 'finished', shots = p_shots, shots_on_target = p_shots_on_target, goals = p_goals,
         assists = p_assists, team_goals = p_team_goals, opponent_goals = p_opponent_goals,
         rating = p_rating, duration_ms = p_duration_ms, inputs = p_inputs,
         flagged = v_flagged, flag_reasons = p_flag_reasons,
         coin_reward = p_coin, xp_reward = p_xp, finished_at = now()
   where id = p_match and player_id = p_player and status = 'open'
   returning matches.kind, matches.mahalle_id, matches.day into v_kind, v_mahalle, v_day;

  if not found then
    return query
      select w.coin, p.xp, p.level, true
        from wallets w join players p on p.id = w.player_id
       where w.player_id = p_player;
    return;
  end if;

  perform grant_currency(p_player, 'coin', p_coin,
                         case when v_kind = 'mahalle' then 'mahalle_match' else 'match' end,
                         p_match::text, 'match:' || p_match::text);
  -- The level is computed in TypeScript from the new XP total (levelForXp).
  update players set xp = players.xp + p_xp, level = greatest(players.level, p_level) where id = p_player;

  -- A flagged match still pays its small base but never counts toward the mahalle score.
  if v_kind = 'mahalle' and not v_flagged
     and exists (select 1 from mahalle_gun g where g.mahalle_id = v_mahalle and g.day = v_day and g.status = 'open') then
    insert into mahalle_katki (mahalle_id, day, player_id, match_id, goals, assists, opponent_goals, rating)
    values (v_mahalle, v_day, p_player, p_match, p_goals, p_assists, p_opponent_goals, p_rating)
    on conflict do nothing;
  end if;

  if v_flagged then
    insert into flags (player_id, kind, detail)
    values (p_player, 'match', jsonb_build_object('match_id', p_match, 'reasons', p_flag_reasons));
  end if;

  return query
    select w.coin, p.xp, p.level, false
      from wallets w join players p on p.id = w.player_id
     where w.player_id = p_player;
end $$;

-- Everything the settlement job needs about open days before today, one row per
-- contribution plus one per member without one.
create function public.mahalle_to_settle(p_min_age_hours integer, p_min_matches integer) returns table (
  mahalle_id uuid, day date, player_id uuid, xp bigint, is_real boolean,
  played boolean, goals smallint, assists smallint, opponent_goals smallint, rating smallint
)
language sql stable security definer set search_path = public as $$
  select g.mahalle_id, g.day, u.player_id, p.xp,
         -- Real members: in the mahalle for the minimum age and with enough finished matches (EconomyConfig.mahalle).
         (u.joined_at <= (g.day::timestamp at time zone 'Europe/Istanbul') - make_interval(hours => p_min_age_hours)
            and (select count(*) from matches m where m.player_id = u.player_id and m.status = 'finished') >= p_min_matches),
         k.player_id is not null, k.goals, k.assists, k.opponent_goals, k.rating
    from mahalle_gun g
    join mahalle_uye u on u.mahalle_id = g.mahalle_id
    join players p on p.id = u.player_id
    left join mahalle_katki k on k.mahalle_id = g.mahalle_id and k.day = g.day and k.player_id = u.player_id
   where g.status = 'open' and g.day < mahalle_today()
     and exists (select 1 from mahalle_katki k2 where k2.mahalle_id = g.mahalle_id and k2.day = g.day);
$$;

-- Closes one day. p_payouts: [{player, coin, xp, level, respect}]. Safe to repeat:
-- a closed day pays nothing again (grant_currency is idempotent per key too).
create function public.settle_mahalle_day(
  p_mahalle uuid, p_day date, p_our smallint, p_their smallint, p_result text, p_summary jsonb, p_payouts jsonb
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  update mahalle_gun
     set status = 'closed', our_goals = p_our, their_goals = p_their, result = p_result,
         summary = p_summary, settled_at = now()
   where mahalle_id = p_mahalle and day = p_day and status = 'open';
  if not found then return false; end if;

  for r in select * from jsonb_to_recordset(p_payouts) as t(player uuid, coin integer, xp integer, level integer, respect integer) loop
    if r.coin > 0 then
      perform grant_currency(r.player, 'coin', r.coin, 'mahalle_bonus', p_mahalle::text || ':' || p_day::text,
                             'mahalle:' || p_mahalle::text || ':' || p_day::text || ':' || r.player::text);
    end if;
    update players
       set xp = players.xp + r.xp, level = greatest(players.level, r.level),
           respect = greatest(0, players.respect + r.respect)
     where id = r.player;
  end loop;
  return true;
end $$;

-- Errors: not_member, not_played (the receiver has no match today), self, too_many (daily limit
-- of the giver or of the receiver), already_cheered.
create function public.give_cheer(
  p_from uuid, p_to uuid, p_phrase smallint, p_per_day integer, p_received_max integer,
  p_xp_giver integer, p_xp_receiver integer, p_level_giver integer, p_level_receiver integer, p_respect integer
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mahalle uuid;
  v_day date := mahalle_today();
begin
  if p_from = p_to then raise exception 'self'; end if;
  select mahalle_id into v_mahalle from mahalle_uye where player_id = p_from;
  if v_mahalle is null or not exists (select 1 from mahalle_uye where player_id = p_to and mahalle_id = v_mahalle) then
    raise exception 'not_member';
  end if;
  if not exists (select 1 from mahalle_katki where mahalle_id = v_mahalle and day = v_day and player_id = p_to) then
    raise exception 'not_played';
  end if;
  if exists (select 1 from mahalle_tezahurat where day = v_day and from_player = p_from and to_player = p_to) then
    raise exception 'already_cheered';
  end if;
  if (select count(*) from mahalle_tezahurat where day = v_day and from_player = p_from) >= p_per_day
     or (select count(*) from mahalle_tezahurat where day = v_day and to_player = p_to) >= p_received_max then
    raise exception 'too_many';
  end if;

  insert into mahalle_tezahurat (mahalle_id, day, from_player, to_player, phrase)
  values (v_mahalle, v_day, p_from, p_to, p_phrase);
  update players set xp = xp + p_xp_giver, level = greatest(level, p_level_giver) where id = p_from;
  update players set xp = xp + p_xp_receiver, level = greatest(level, p_level_receiver), respect = respect + p_respect
   where id = p_to;
end $$;

revoke execute on function public.begin_mahalle_match, public.settle_mahalle_day, public.give_cheer,
  public.mahalle_to_settle from public, anon, authenticated;
grant execute on function public.begin_mahalle_match, public.settle_mahalle_day, public.give_cheer,
  public.mahalle_to_settle to service_role;
revoke execute on function public.begin_match, public.finish_match from public, anon, authenticated;
grant execute on function public.begin_match, public.finish_match to service_role;

-- ---------------------------------------------------------------------------
-- Read (authenticated): the caller's mahalle, today and the last settled day
-- ---------------------------------------------------------------------------

create function public.mahalle_bugun() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (
    select u.mahalle_id from mahalle_uye u where u.player_id = auth.uid()
  ), today as (
    select mahalle_today() as day
  )
  select jsonb_build_object(
    'me', auth.uid(),
    'day', t.day,
    'opponent', (select g.opponent from mahalle_gun g where g.mahalle_id = me.mahalle_id and g.day = t.day),
    'played', exists (select 1 from mahalle_katki k where k.mahalle_id = me.mahalle_id and k.day = t.day and k.player_id = auth.uid()),
    'contributions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'playerId', k.player_id, 'nick', p.nick, 'goals', k.goals, 'assists', k.assists,
        'opponentGoals', k.opponent_goals, 'rating', k.rating,
        'cheers', (select count(*) from mahalle_tezahurat z where z.day = t.day and z.to_player = k.player_id),
        'cheered', exists (select 1 from mahalle_tezahurat z where z.day = t.day and z.to_player = k.player_id and z.from_player = auth.uid())
      ) order by k.rating desc, k.goals + k.assists desc, k.player_id), '[]'::jsonb)
      from mahalle_katki k join players p on p.id = k.player_id
      where k.mahalle_id = me.mahalle_id and k.day = t.day
    ),
    'cheersLeft', (select greatest(0, 3 - count(*)) from mahalle_tezahurat z where z.day = t.day and z.from_player = auth.uid()),
    'respect', (select respect from players where id = auth.uid()),
    'last', (
      select jsonb_build_object(
        'day', g.day, 'opponent', g.opponent, 'ourGoals', g.our_goals, 'theirGoals', g.their_goals,
        'result', g.result, 'summary', g.summary)
      from mahalle_gun g
      where g.mahalle_id = me.mahalle_id and g.status = 'closed'
      order by g.day desc limit 1
    )
  )
  from me, today t;
$$;

revoke all on function public.mahalle_bugun() from public, anon;
grant execute on function public.mahalle_bugun() to authenticated;
