-- Career features: morale, the pre-match choice, injuries, achievements and the weekly
-- friend duel. The rules live in packages/economy (kariyer.ts); these tables and
-- functions only store the result atomically. Clients never write and never read the
-- tables: the `oyuncu` Edge Function (service role) answers for them.

create table public.kariyer_durum (
  player_id    uuid primary key references public.players (id) on delete cascade,
  morale       smallint not null default 60 check (morale between 0 and 100),
  injury_until timestamptz,
  injury_kind  text check (injury_kind in ('ankle', 'muscle', 'knee')),
  -- The last finished match that updated this row, so a retried finish counts once.
  last_match   uuid,
  -- Pre-match choice: one a day. The choice is used up by the next finished match;
  -- choice_day stays, so the day's choice cannot be made twice.
  choice       text check (choice in ('rest', 'work', 'hang')),
  choice_day   date,
  updated_at   timestamptz not null default now()
);

create table public.basarimlar (
  player_id    uuid not null references public.players (id) on delete cascade,
  key          text not null,
  unlocked_at  timestamptz not null default now(),
  primary key (player_id, key)
);

-- One duel per player per week (Monday in Turkey). rival_id null: Kerem, the NPC.
create table public.rakip_hafta (
  player_id  uuid not null references public.players (id) on delete cascade,
  week       date not null,
  rival_id   uuid references public.players (id) on delete set null,
  status     text not null default 'open' check (status in ('open', 'win', 'lose', 'draw', 'void')),
  coin       integer not null default 0,
  respect    integer not null default 0,
  closed_at  timestamptz,
  primary key (player_id, week)
);

alter table public.kariyer_durum enable row level security;
alter table public.basarimlar    enable row level security;
alter table public.rakip_hafta   enable row level security;
-- No policies on purpose.

-- ---------------------------------------------------------------------------
-- Writes (service role only)
-- ---------------------------------------------------------------------------

-- After a finished match: morale change and a possible injury. Returns false when this
-- match was already counted. An injury never shortens or replaces one that is running.
create function public.kariyer_mac_sonrasi(p_player uuid, p_match uuid, p_morale_delta integer, p_injury_days integer, p_injury_kind text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  d kariyer_durum%rowtype;
begin
  insert into kariyer_durum (player_id) values (p_player) on conflict do nothing;
  select * into d from kariyer_durum where player_id = p_player for update;
  if d.last_match = p_match then return false; end if;
  update kariyer_durum
     set morale = greatest(0, least(100, morale + p_morale_delta)),
         last_match = p_match,
         choice = null,
         injury_until = case when p_injury_days > 0 and (injury_until is null or injury_until <= now())
                             then now() + make_interval(days => p_injury_days) else injury_until end,
         injury_kind = case when p_injury_days > 0 and (injury_until is null or injury_until <= now())
                            then p_injury_kind else injury_kind end,
         updated_at = now()
   where player_id = p_player;
  return true;
end $$;

-- The day's choice. Errors: already_chosen. Respect is the mahalle respect of players.
create function public.kariyer_secim(p_player uuid, p_day date, p_choice text, p_morale_delta integer, p_respect integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  d kariyer_durum%rowtype;
begin
  insert into kariyer_durum (player_id) values (p_player) on conflict do nothing;
  select * into d from kariyer_durum where player_id = p_player for update;
  if d.choice_day = p_day then raise exception 'already_chosen'; end if;
  update kariyer_durum
     set choice = p_choice, choice_day = p_day, morale = greatest(0, least(100, morale + p_morale_delta)), updated_at = now()
   where player_id = p_player;
  if p_respect <> 0 then
    update players set respect = greatest(0, respect + p_respect) where id = p_player;
  end if;
end $$;

-- Ends a running injury for coin. Errors: not_injured; a balance below the price fails
-- on the wallet's CHECK (code 23514).
create function public.kariyer_masaj(p_player uuid, p_cost integer) returns void
language plpgsql security definer set search_path = public as $$
declare
  d kariyer_durum%rowtype;
begin
  select * into d from kariyer_durum where player_id = p_player for update;
  if not found or d.injury_until is null or d.injury_until <= now() then raise exception 'not_injured'; end if;
  perform grant_currency(p_player, 'coin', -p_cost, 'masaj', null, 'masaj:' || p_player::text || ':' || extract(epoch from d.injury_until)::bigint::text);
  update kariyer_durum set injury_until = null, injury_kind = null, updated_at = now() where player_id = p_player;
end $$;

-- Opens the week's duel once; later calls return the stored one.
create function public.rakip_ac(p_player uuid, p_week date, p_rival uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r rakip_hafta%rowtype;
begin
  insert into rakip_hafta (player_id, week, rival_id) values (p_player, p_week, p_rival) on conflict do nothing;
  select * into r from rakip_hafta where player_id = p_player and week = p_week;
  return jsonb_build_object('rivalId', r.rival_id, 'status', r.status);
end $$;

-- Settles a duel once. A win pays coin and respect; returns false when it was already settled.
create function public.rakip_kapat(p_player uuid, p_week date, p_status text, p_coin integer, p_respect integer) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update rakip_hafta
     set status = p_status, coin = case when p_status = 'win' then p_coin else 0 end,
         respect = case when p_status = 'win' then p_respect else 0 end, closed_at = now()
   where player_id = p_player and week = p_week and status = 'open';
  if not found then return false; end if;
  if p_status = 'win' then
    perform grant_currency(p_player, 'coin', p_coin, 'rakip_hafta', p_week::text, 'rakip:' || p_player::text || ':' || p_week::text);
    update players set respect = respect + p_respect where id = p_player;
  end if;
  return true;
end $$;

-- What the achievements count. Flagged matches do not count.
create function public.basarim_ozet(p_player uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'matches', (select count(*) from matches m where m.player_id = p_player and m.status = 'finished' and not m.flagged),
    'goals', (select coalesce(sum(m.goals), 0) from matches m where m.player_id = p_player and m.status = 'finished' and not m.flagged),
    'assists', (select coalesce(sum(m.assists), 0) from matches m where m.player_id = p_player and m.status = 'finished' and not m.flagged),
    'bestMatchGoals', (select coalesce(max(m.goals), 0) from matches m where m.player_id = p_player and m.status = 'finished' and not m.flagged),
    'bestRating', (select coalesce(max(m.rating), 0) from matches m where m.player_id = p_player and m.status = 'finished' and not m.flagged),
    'mahalleMatches', (select count(*) from matches m where m.player_id = p_player and m.status = 'finished' and not m.flagged and m.kind = 'mahalle'),
    'duelWins', (select count(*) from rakip_hafta r where r.player_id = p_player and r.status = 'win'),
    'contracts', (select count(*) from contracts c where c.player_id = p_player),
    'seasonsDone', (select count(*) from league_seasons s where s.player_id = p_player and s.status = 'done'),
    'bestPlace', (select coalesce(min(s.place), 0) from league_seasons s where s.player_id = p_player and s.status = 'done'),
    'level', (select level from players where id = p_player)
  );
$$;

-- Unlocks achievements and pays each one once. p_rows: [{key, coin}]. Returns the keys unlocked now.
create function public.basarim_ac(p_player uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_keys jsonb := '[]'::jsonb;
begin
  for r in select * from jsonb_to_recordset(p_rows) as t(key text, coin integer) loop
    insert into basarimlar (player_id, key) values (p_player, r.key) on conflict do nothing;
    if found then
      if r.coin > 0 then
        perform grant_currency(p_player, 'coin', r.coin, 'basarim', r.key, 'basarim:' || p_player::text || ':' || r.key);
      end if;
      v_keys := v_keys || to_jsonb(r.key);
    end if;
  end loop;
  return v_keys;
end $$;

revoke execute on function public.kariyer_mac_sonrasi, public.kariyer_secim, public.kariyer_masaj, public.rakip_ac,
  public.rakip_kapat, public.basarim_ozet, public.basarim_ac from public, anon, authenticated;
grant execute on function public.kariyer_mac_sonrasi, public.kariyer_secim, public.kariyer_masaj, public.rakip_ac,
  public.rakip_kapat, public.basarim_ozet, public.basarim_ac to service_role;
