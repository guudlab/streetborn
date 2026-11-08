-- Mahalle Ligi, phase 1: mahalleler play each other. Every Monday the active
-- mahalleler are split into groups of eight (bot mahalleler fill empty places) and
-- each day of the week a mahalle meets one other team of its group (single round
-- robin, 7 rounds). The rules live in packages/economy (lig.ts); as everywhere,
-- clients never write: the Edge Functions call the service-role functions below and
-- clients read through mahalle_bugun().

-- Monday of the week a day is in.
create function public.lig_week(d date) returns date
language sql immutable as $$ select d - (extract(isodow from d)::integer - 1) $$;

create table public.lig_grup (
  id         uuid primary key default gen_random_uuid(),
  week       date not null check (extract(isodow from week) = 1),
  -- Phase 2 adds tiers (Toprak Saha .. Stadyum); every group is tier 0 for now.
  tier       smallint not null default 0,
  no         smallint not null,
  created_at timestamptz not null default now(),
  unique (week, tier, no)
);

-- The eight places of a group, frozen for the week: a real mahalle or a bot. The
-- name, crest and level are a snapshot, so the rival's strength cannot change mid-week.
create table public.lig_takim (
  grup_id    uuid not null references public.lig_grup (id) on delete cascade,
  slot       smallint not null check (slot between 0 and 7),
  week       date not null,
  -- Null with a null bot_key: the mahalle was closed during the week (plays as NPC children).
  mahalle_id uuid references public.mahalle (id) on delete set null,
  bot_key    text,
  name       text not null,
  emblem     text not null check (emblem in ('shield', 'circle', 'diamond')),
  color      text not null check (color in ('lime', 'blue', 'red', 'purple', 'teal', 'white')),
  level      smallint not null check (level >= 1),
  primary key (grup_id, slot),
  check (mahalle_id is null or bot_key is null)
);
create unique index lig_takim_mahalle_week on public.lig_takim (mahalle_id, week) where mahalle_id is not null;

-- The 28 matches of a group, created with it; the score is set when the day closes.
create table public.lig_mac (
  grup_id    uuid not null references public.lig_grup (id) on delete cascade,
  round      smallint not null check (round between 0 and 6),
  home       smallint not null check (home between 0 and 7),
  away       smallint not null check (away between 0 and 7),
  home_goals smallint,
  away_goals smallint,
  -- Both halves: {"home": [home, away] in the home side's matches, "away": [home, away] in the away side's}.
  detail     jsonb not null default '{}'::jsonb,
  settled_at timestamptz,
  primary key (grup_id, round, home),
  check (home <> away)
);
create index lig_mac_open on public.lig_mac (grup_id, round) where home_goals is null;

alter table public.lig_grup  enable row level security;
alter table public.lig_takim enable row level security;
alter table public.lig_mac   enable row level security;
-- No policies on purpose: reads go through mahalle_bugun().

-- ---------------------------------------------------------------------------
-- Writes and job reads (service role only; called by mahalle-close and match-start)
-- ---------------------------------------------------------------------------

-- Mahalleler that may join the week's groups: enough real members at the start of the
-- week (EconomyConfig.mahalle, the same rule as the turnout bonus) and a mahalle match
-- in the days before. `level` is the average level of all members.
create function public.lig_adaylari(
  p_week date, p_min_age_hours integer, p_min_matches integer, p_min_real integer, p_active_days integer
) returns table (mahalle_id uuid, name text, emblem text, color text, level integer)
language sql stable security definer set search_path = public as $$
  select m.id, m.name, m.emblem, m.color, round(avg(p.level))::integer
    from mahalle m
    join mahalle_uye u on u.mahalle_id = m.id
    join players p on p.id = u.player_id
   where not exists (select 1 from lig_takim t where t.mahalle_id = m.id and t.week = p_week)
     and exists (select 1 from mahalle_katki k where k.mahalle_id = m.id and k.day >= p_week - p_active_days and k.day < p_week)
   group by m.id
  having count(*) filter (
           where u.joined_at <= (p_week::timestamp at time zone 'Europe/Istanbul') - make_interval(hours => p_min_age_hours)
             and (select count(*) from matches x where x.player_id = u.player_id and x.status = 'finished') >= p_min_matches
         ) >= p_min_real;
$$;

-- Creates the week's groups once. p_groups: [{no, teams: [{slot, mahalleId, botKey, name,
-- emblem, color, level}], fixtures: [{round, home, away}]}]. Returns the number of groups
-- made, 0 when the week already has its groups.
create function public.lig_kur(p_week date, p_groups jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  g jsonb;
  v_id uuid;
  n integer := 0;
begin
  if extract(isodow from p_week) <> 1 then raise exception 'not_monday'; end if;
  perform pg_advisory_xact_lock(hashtext('lig_kur'));
  if exists (select 1 from lig_grup where week = p_week) then return 0; end if;
  for g in select * from jsonb_array_elements(p_groups) loop
    insert into lig_grup (week, no) values (p_week, (g->>'no')::smallint) returning id into v_id;
    insert into lig_takim (grup_id, slot, week, mahalle_id, bot_key, name, emblem, color, level)
    select v_id, (x->>'slot')::smallint, p_week, (x->>'mahalleId')::uuid, x->>'botKey', x->>'name',
           x->>'emblem', x->>'color', (x->>'level')::smallint
      from jsonb_array_elements(g->'teams') x;
    insert into lig_mac (grup_id, round, home, away)
    select v_id, (x->>'round')::smallint, (x->>'home')::smallint, (x->>'away')::smallint
      from jsonb_array_elements(g->'fixtures') x;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Everything the settlement job needs about league rounds that have ended and are not
-- settled yet, oldest first: the group's teams, the real members of its mahalleler and
-- the day's contributions (also of players who left since).
create function public.lig_to_settle(p_min_age_hours integer, p_min_matches integer, p_limit integer) returns jsonb
language sql stable security definer set search_path = public as $$
  with pending as (
    select distinct m.grup_id, g.week, m.round, g.week + m.round as day
      from lig_mac m join lig_grup g on g.id = m.grup_id
     where m.home_goals is null and g.week + m.round < mahalle_today()
     order by day, m.grup_id, m.round
     limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'grup', p.grup_id, 'week', p.week, 'round', p.round, 'day', p.day,
    'teams', (
      select jsonb_agg(jsonb_build_object(
        'slot', t.slot, 'mahalleId', t.mahalle_id, 'botKey', t.bot_key, 'name', t.name,
        'emblem', t.emblem, 'color', t.color, 'level', t.level) order by t.slot)
        from lig_takim t where t.grup_id = p.grup_id),
    'fixtures', (
      select jsonb_agg(jsonb_build_object('home', f.home, 'away', f.away) order by f.home)
        from lig_mac f where f.grup_id = p.grup_id and f.round = p.round),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'mahalleId', u.mahalle_id, 'playerId', u.player_id, 'xp', pl.xp,
        'real', u.joined_at <= (p.day::timestamp at time zone 'Europe/Istanbul') - make_interval(hours => p_min_age_hours)
                and (select count(*) from matches x where x.player_id = u.player_id and x.status = 'finished') >= p_min_matches)), '[]'::jsonb)
        from lig_takim t join mahalle_uye u on u.mahalle_id = t.mahalle_id join players pl on pl.id = u.player_id
       where t.grup_id = p.grup_id),
    'contributions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'mahalleId', k.mahalle_id, 'playerId', k.player_id, 'xp', pl.xp, 'goals', k.goals, 'assists', k.assists,
        'opponentGoals', k.opponent_goals, 'rating', k.rating)), '[]'::jsonb)
        from lig_takim t join mahalle_katki k on k.mahalle_id = t.mahalle_id and k.day = p.day
        join players pl on pl.id = k.player_id
       where t.grup_id = p.grup_id)
  ) order by p.day, p.grup_id, p.round), '[]'::jsonb)
  from pending p;
$$;

-- Closes one round of a group: the four scores, then each real mahalle's day with its
-- bonuses (settle_mahalle_day). p_matches: [{home, away, homeGoals, awayGoals, detail}];
-- p_days: [{mahalle, opponent, our, their, result, summary, payouts}]. Safe to repeat: a
-- settled round returns false and pays nothing again.
create function public.settle_lig_tur(p_grup uuid, p_round smallint, p_matches jsonb, p_days jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_week date;
  v_day date;
  r record;
begin
  select week into v_week from lig_grup where id = p_grup;
  if v_week is null then raise exception 'not_found'; end if;
  v_day := v_week + p_round;
  perform 1 from lig_mac where grup_id = p_grup and round = p_round for update;
  if exists (select 1 from lig_mac where grup_id = p_grup and round = p_round and home_goals is not null) then
    return false;
  end if;

  for r in select * from jsonb_to_recordset(p_matches)
             as t(home smallint, away smallint, "homeGoals" smallint, "awayGoals" smallint, detail jsonb) loop
    update lig_mac
       set home_goals = r."homeGoals", away_goals = r."awayGoals", detail = coalesce(r.detail, '{}'::jsonb), settled_at = now()
     where grup_id = p_grup and round = p_round and home = r.home and away = r.away and home_goals is null;
    if not found then raise exception 'unknown_fixture'; end if;
  end loop;
  if exists (select 1 from lig_mac where grup_id = p_grup and round = p_round and home_goals is null) then
    raise exception 'round_incomplete';
  end if;

  for r in select * from jsonb_to_recordset(p_days)
             as t(mahalle uuid, opponent jsonb, our smallint, their smallint, result text, summary jsonb, payouts jsonb) loop
    -- A mahalle where nobody played has no day row yet; the result is still its to see.
    insert into mahalle_gun (mahalle_id, day, opponent) values (r.mahalle, v_day, r.opponent)
    on conflict (mahalle_id, day) do update set opponent = excluded.opponent where mahalle_gun.status = 'open';
    perform settle_mahalle_day(r.mahalle, v_day, r.our, r.their, r.result, r.summary, r.payouts);
  end loop;
  return true;
end $$;

-- League days are settled by settle_lig_tur, never against the NPC mahalle.
create or replace function public.mahalle_to_settle(p_min_age_hours integer, p_min_matches integer) returns table (
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
     and exists (select 1 from mahalle_katki k2 where k2.mahalle_id = g.mahalle_id and k2.day = g.day)
     and not exists (select 1 from lig_takim t where t.mahalle_id = g.mahalle_id and t.week = lig_week(g.day));
$$;

revoke execute on function public.lig_adaylari, public.lig_kur, public.lig_to_settle, public.settle_lig_tur,
  public.mahalle_to_settle from public, anon, authenticated;
grant execute on function public.lig_adaylari, public.lig_kur, public.lig_to_settle, public.settle_lig_tur,
  public.mahalle_to_settle to service_role;

-- ---------------------------------------------------------------------------
-- Read (authenticated): mahalle_bugun() gains the week's group. `lig.rivalHalf` is the
-- live score of today's rival's own matches (their best 7, as counted at midnight),
-- without names. The 7 slots mirror EconomyConfig.mahalle.slots.
-- ---------------------------------------------------------------------------

create or replace function public.mahalle_bugun() returns jsonb
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
    ),
    'lig', (
      select jsonb_build_object(
        'week', lt.week,
        'round', t.day - lt.week,
        'slot', lt.slot,
        'teams', (
          select jsonb_agg(jsonb_build_object(
            'slot', x.slot, 'name', x.name, 'emblem', x.emblem, 'color', x.color, 'level', x.level,
            'bot', x.mahalle_id is null) order by x.slot)
            from lig_takim x where x.grup_id = lt.grup_id),
        'results', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'round', m.round, 'home', m.home, 'away', m.away, 'homeGoals', m.home_goals, 'awayGoals', m.away_goals
          ) order by m.round, m.home), '[]'::jsonb)
            from lig_mac m where m.grup_id = lt.grup_id and m.home_goals is not null),
        'rivalHalf', (
          select jsonb_build_object('played', count(*), 'us', coalesce(sum(b.opponent_goals), 0), 'them', coalesce(sum(b.goals + b.assists), 0))
            from (
              select k.goals, k.assists, k.opponent_goals
                from lig_mac f
                join lig_takim r on r.grup_id = f.grup_id and r.slot = case when f.home = lt.slot then f.away else f.home end
                join mahalle_katki k on k.mahalle_id = r.mahalle_id and k.day = t.day
               where f.grup_id = lt.grup_id and f.round = t.day - lt.week and lt.slot in (f.home, f.away)
               order by k.rating desc, k.goals + k.assists desc, k.player_id
               limit 7
            ) b
        )
      )
      from lig_takim lt
      where lt.mahalle_id = me.mahalle_id and lt.week = lig_week(t.day)
    )
  )
  from me, today t;
$$;

revoke all on function public.mahalle_bugun() from public, anon;
grant execute on function public.mahalle_bugun() to authenticated;
