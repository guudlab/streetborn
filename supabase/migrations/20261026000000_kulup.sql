-- Amateur club career (GDD v3.1 section 7): offers, contracts, a 14-day NPC league
-- per player, league and trial matches, daily salary, coach trust and season end.
-- Clients never write; the `career`, `match-start` and `match-finish` functions call
-- the service-role functions below. Clients read through kariyer().

alter table public.players
  add column coach_trust smallint not null default 50 check (coach_trust between 0 and 100);

create table public.offers (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.players (id) on delete cascade,
  kind          text not null check (kind in ('direct', 'trial', 'better', 'renew', 'promote', 'weaker')),
  tier          smallint not null check (tier >= 0),
  club_key      text not null,
  club_name     text not null,
  salary_weekly integer not null check (salary_weekly > 0),
  status        text not null default 'open'
                check (status in ('open', 'trial_passed', 'trial_failed', 'accepted', 'closed')),
  created_at    timestamptz not null default now()
);
create index offers_player_live on public.offers (player_id) where status in ('open', 'trial_passed');

create table public.league_seasons (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.players (id) on delete cascade,
  -- Seed of the season's schedule and NPC scores (the accepted offer's id).
  seed       text not null,
  tier       smallint not null,
  start_day  date not null,
  teams      jsonb not null,
  status     text not null default 'active' check (status in ('active', 'done')),
  place      smallint,
  prize      integer,
  created_at timestamptz not null default now()
);
create index league_seasons_player on public.league_seasons (player_id, created_at desc);

-- One row per decided round of the player's team: played, or missed and simulated.
create table public.league_days (
  season_id uuid not null references public.league_seasons (id) on delete cascade,
  round     smallint not null check (round between 0 and 63),
  player_id uuid not null references public.players (id) on delete cascade,
  played    boolean not null,
  match_id  uuid references public.matches (id) on delete set null,
  us        smallint not null,
  them      smallint not null,
  primary key (season_id, round)
);

-- The player's current (or last) contract.
create table public.contracts (
  player_id     uuid primary key references public.players (id) on delete cascade,
  tier          smallint not null,
  club_key      text not null,
  club_name     text not null,
  salary_weekly integer not null,
  season_id     uuid references public.league_seasons (id) on delete set null,
  active        boolean not null default true,
  signed_at     timestamptz not null default now()
);

alter table public.offers         enable row level security;
alter table public.league_seasons enable row level security;
alter table public.league_days    enable row level security;
alter table public.contracts      enable row level security;
-- No policies on purpose: reads go through kariyer().

alter table public.matches drop constraint matches_kind_check;
alter table public.matches
  add constraint matches_kind_check check (kind in ('energy', 'mahalle', 'league', 'trial')),
  add column season_id uuid references public.league_seasons (id) on delete set null,
  add column round     smallint,
  add column offer_id  uuid references public.offers (id) on delete set null;
create unique index matches_league_round on public.matches (season_id, round)
  where kind = 'league' and status <> 'expired';
create unique index matches_trial_offer on public.matches (offer_id)
  where kind = 'trial' and status <> 'expired';

-- ---------------------------------------------------------------------------
-- Writes (service role only)
-- ---------------------------------------------------------------------------

-- League or trial match ticket. Errors: no_contract, not_found, already_played.
create function public.begin_fixture_match(
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
  p_kind text,
  p_season uuid,
  p_round smallint,
  p_offer uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_match uuid;
begin
  if p_kind = 'league' then
    if not exists (select 1 from contracts c join league_seasons s on s.id = c.season_id
                    where c.player_id = p_player and c.active and s.id = p_season and s.status = 'active') then
      raise exception 'no_contract';
    end if;
    -- Free the round when the earlier ticket ran out unfinished.
    update matches set status = 'expired'
     where season_id = p_season and round = p_round and kind = 'league' and status = 'open' and expires_at < now();
    if exists (select 1 from league_days where season_id = p_season and round = p_round)
       or exists (select 1 from matches where season_id = p_season and round = p_round and kind = 'league' and status <> 'expired') then
      raise exception 'already_played';
    end if;
  elsif p_kind = 'trial' then
    if not exists (select 1 from offers where id = p_offer and player_id = p_player and kind = 'trial' and status = 'open') then
      raise exception 'not_found';
    end if;
    update matches set status = 'expired'
     where offer_id = p_offer and kind = 'trial' and status = 'open' and expires_at < now();
    if exists (select 1 from matches where offer_id = p_offer and kind = 'trial' and status <> 'expired') then
      raise exception 'already_played';
    end if;
  else
    raise exception 'bad_kind';
  end if;

  update wallets
     set energy = p_energy, energy_updated_at = p_energy_updated_at, version = version + 1
   where player_id = p_player and version = p_expected_version;
  if not found then
    raise exception 'wallet_version_conflict' using errcode = '40001';
  end if;

  insert into matches (player_id, kind, season_id, round, offer_id, day, engine_version, seed, chances, shooting, passing,
                       opponent_goalkeeping, opponent_attack, expires_at)
  values (p_player, p_kind,
          case when p_kind = 'league' then p_season end, case when p_kind = 'league' then p_round end,
          case when p_kind = 'trial' then p_offer end, mahalle_today(),
          p_engine_version, p_seed, p_chances, p_shooting, p_passing,
          p_opponent_goalkeeping, p_opponent_attack, p_expires_at)
  returning id into v_match;
  return v_match;
end $$;

-- finish_match gains p_extra: {trustDelta} for league matches, {trialPassed} for trials.
-- Each kind pays under its own ledger reason, so the daily cap (reason 'match')
-- only ever counts energy matches.
drop function public.finish_match(uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, smallint, integer, jsonb, text[], integer, integer, integer);

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
  p_level integer,
  p_extra jsonb default '{}'::jsonb
) returns table (coin bigint, xp bigint, level integer, already_finished boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_flagged boolean := coalesce(array_length(p_flag_reasons, 1), 0) > 0;
  v_kind text;
  v_mahalle uuid;
  v_day date;
  v_season uuid;
  v_round smallint;
  v_offer uuid;
begin
  update matches
     set status = 'finished', shots = p_shots, shots_on_target = p_shots_on_target, goals = p_goals,
         assists = p_assists, team_goals = p_team_goals, opponent_goals = p_opponent_goals,
         rating = p_rating, duration_ms = p_duration_ms, inputs = p_inputs,
         flagged = v_flagged, flag_reasons = p_flag_reasons,
         coin_reward = p_coin, xp_reward = p_xp, finished_at = now()
   where id = p_match and player_id = p_player and status = 'open'
   returning matches.kind, matches.mahalle_id, matches.day, matches.season_id, matches.round, matches.offer_id
        into v_kind, v_mahalle, v_day, v_season, v_round, v_offer;

  if not found then
    return query
      select w.coin, p.xp, p.level, true
        from wallets w join players p on p.id = w.player_id
       where w.player_id = p_player;
    return;
  end if;

  perform grant_currency(p_player, 'coin', p_coin,
                         case v_kind when 'mahalle' then 'mahalle_match' when 'league' then 'league_match'
                                     when 'trial' then 'trial_match' else 'match' end,
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

  if v_kind = 'league' then
    insert into league_days (season_id, round, player_id, played, match_id, us, them)
    values (v_season, v_round, p_player, true, p_match, p_team_goals, p_opponent_goals)
    on conflict do nothing;
    if found then
      update players
         set coach_trust = greatest(0, least(100, coach_trust + coalesce((p_extra->>'trustDelta')::integer, 0)))
       where id = p_player;
    end if;
  end if;

  if v_kind = 'trial' then
    update offers
       set status = case when coalesce((p_extra->>'trialPassed')::boolean, false) then 'trial_passed' else 'trial_failed' end
     where id = v_offer and status = 'open';
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

-- League days the player let pass: the NPC result is stored and each costs trust once.
-- p_rows: [{round, us, them}].
create function public.mark_missed_rounds(p_player uuid, p_season uuid, p_rows jsonb, p_trust_delta integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in select * from jsonb_to_recordset(p_rows) as t(round smallint, us smallint, them smallint) loop
    insert into league_days (season_id, round, player_id, played, us, them)
    select p_season, r.round, p_player, false, r.us, r.them
     where exists (select 1 from league_seasons s where s.id = p_season and s.player_id = p_player and s.status = 'active')
    on conflict do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;
  if v_count > 0 then
    update players set coach_trust = greatest(0, least(100, coach_trust + v_count * p_trust_delta)) where id = p_player;
  end if;
  return v_count;
end $$;

-- Pays the day's salary once (first login of the day). Returns whether it paid now.
create function public.claim_salary(p_player uuid, p_day date, p_amount integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_key text := 'salary:' || p_player::text || ':' || p_day::text;
begin
  if p_amount <= 0 or not exists (select 1 from contracts where player_id = p_player and active) then return false; end if;
  if exists (select 1 from ledger where idempotency_key = v_key) then return false; end if;
  perform grant_currency(p_player, 'coin', p_amount, 'salary', p_day::text, v_key);
  return true;
end $$;

-- Inserts offers when the player has neither a contract nor a live offer. p_offers: OfferDraft[].
create function public.create_offers(p_player uuid, p_offers jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  perform 1 from players where id = p_player for update;
  if exists (select 1 from contracts where player_id = p_player and active)
     or exists (select 1 from offers where player_id = p_player and status in ('open', 'trial_passed')) then
    return 0;
  end if;
  insert into offers (player_id, kind, tier, club_key, club_name, salary_weekly)
  select p_player, o.kind, o.tier, o."clubKey", o."clubName", o."salaryWeekly"
    from jsonb_to_recordset(p_offers) as o(kind text, tier smallint, "clubKey" text, "clubName" text, "salaryWeekly" integer);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Signs an offer: new season from today, contract, other offers closed, first contract gem.
-- A new club starts coach trust over at p_trust_start. Errors: not_found, has_contract, needs_trial.
create function public.accept_offer(p_player uuid, p_offer uuid, p_teams jsonb, p_first_gem integer, p_trust_start smallint)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o offers%rowtype;
  v_season uuid;
  v_same_club boolean;
begin
  select * into o from offers where id = p_offer and player_id = p_player for update;
  if not found or o.status not in ('open', 'trial_passed') then raise exception 'not_found'; end if;
  if o.kind = 'trial' and o.status <> 'trial_passed' then raise exception 'needs_trial'; end if;
  if exists (select 1 from contracts where player_id = p_player and active) then raise exception 'has_contract'; end if;

  v_same_club := exists (select 1 from contracts where player_id = p_player and club_key = o.club_key);

  insert into league_seasons (player_id, seed, tier, start_day, teams)
  values (p_player, o.id::text, o.tier, mahalle_today(), p_teams)
  returning id into v_season;

  insert into contracts (player_id, tier, club_key, club_name, salary_weekly, season_id, active, signed_at)
  values (p_player, o.tier, o.club_key, o.club_name, o.salary_weekly, v_season, true, now())
  on conflict (player_id) do update
    set tier = excluded.tier, club_key = excluded.club_key, club_name = excluded.club_name,
        salary_weekly = excluded.salary_weekly, season_id = excluded.season_id, active = true, signed_at = now();

  update offers set status = case when id = p_offer then 'accepted' else 'closed' end
   where player_id = p_player and status in ('open', 'trial_passed', 'trial_failed');

  if not v_same_club then
    update players set coach_trust = p_trust_start where id = p_player;
  end if;
  if p_first_gem > 0 then
    -- The key makes this a once-per-player grant.
    perform grant_currency(p_player, 'gem', p_first_gem, 'first_contract', o.id::text, 'first_contract:' || p_player::text)
     where not exists (select 1 from ledger where idempotency_key = 'first_contract:' || p_player::text);
  end if;
  return v_season;
end $$;

-- Closes a finished season: place, prize, contract ends, next offers. Returns false when already closed.
create function public.end_season(p_player uuid, p_season uuid, p_place smallint, p_prize integer, p_offers jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update league_seasons set status = 'done', place = p_place, prize = p_prize
   where id = p_season and player_id = p_player and status = 'active';
  if not found then return false; end if;
  if p_prize > 0 then
    perform grant_currency(p_player, 'coin', p_prize, 'season_prize', p_season::text, 'season:' || p_season::text);
  end if;
  update contracts set active = false where player_id = p_player and season_id = p_season;
  insert into offers (player_id, kind, tier, club_key, club_name, salary_weekly)
  select p_player, o.kind, o.tier, o."clubKey", o."clubName", o."salaryWeekly"
    from jsonb_to_recordset(p_offers) as o(kind text, tier smallint, "clubKey" text, "clubName" text, "salaryWeekly" integer);
  return true;
end $$;

revoke execute on function public.begin_fixture_match, public.finish_match, public.mark_missed_rounds, public.claim_salary,
  public.create_offers, public.accept_offer, public.end_season from public, anon, authenticated;
grant execute on function public.begin_fixture_match, public.finish_match, public.mark_missed_rounds, public.claim_salary,
  public.create_offers, public.accept_offer, public.end_season to service_role;

-- ---------------------------------------------------------------------------
-- Read (authenticated): the caller's career
-- ---------------------------------------------------------------------------

create function public.kariyer() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'today', mahalle_today(),
    'trust', p.coach_trust,
    'progress', jsonb_build_object(
      'level', p.level,
      'matches', (select count(*) from matches m where m.player_id = p.id and m.status = 'finished'),
      'mahalleMatches', (select count(*) from matches m where m.player_id = p.id and m.status = 'finished' and m.kind = 'mahalle')
    ),
    'contract', (
      select jsonb_build_object('tier', c.tier, 'clubKey', c.club_key, 'clubName', c.club_name,
                                'salaryWeekly', c.salary_weekly, 'seasonId', c.season_id, 'active', c.active)
        from contracts c where c.player_id = p.id
    ),
    'season', (
      select jsonb_build_object(
        'id', s.id, 'seed', s.seed, 'tier', s.tier, 'startDay', s.start_day, 'teams', s.teams, 'status', s.status,
        'place', s.place, 'prize', s.prize,
        'days', (select coalesce(jsonb_agg(jsonb_build_object('round', d.round, 'played', d.played, 'us', d.us, 'them', d.them)
                                            order by d.round), '[]'::jsonb)
                   from league_days d where d.season_id = s.id)
      )
        from league_seasons s where s.player_id = p.id
       order by s.created_at desc limit 1
    ),
    'offers', (
      select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'kind', o.kind, 'tier', o.tier, 'clubKey', o.club_key,
                                                   'clubName', o.club_name, 'salaryWeekly', o.salary_weekly, 'status', o.status)
                                order by o.created_at, o.kind), '[]'::jsonb)
        from offers o where o.player_id = p.id and o.status in ('open', 'trial_passed', 'trial_failed')
          and not exists (select 1 from contracts c where c.player_id = p.id and c.active)
    )
  )
  from players p where p.id = auth.uid();
$$;

revoke all on function public.kariyer() from public, anon;
grant execute on function public.kariyer() to authenticated;
