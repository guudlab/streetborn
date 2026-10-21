-- STREETBORN initial schema.
-- Rule: clients only READ their own rows (RLS). Every write goes through an Edge
-- Function using the service role, and every coin/gem change goes through
-- grant_currency(), which writes the append-only ledger.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Players
-- ---------------------------------------------------------------------------

create table public.players (
  id          uuid primary key references auth.users (id) on delete cascade,
  nick        text,
  level       integer not null default 1 check (level >= 1),
  xp          bigint  not null default 0 check (xp >= 0),
  perde       smallint not null default 1,
  created_at  timestamptz not null default now()
);

create table public.player_stats (
  player_id  uuid primary key references public.players (id) on delete cascade,
  shooting   smallint not null default 40 check (shooting between 1 and 100),
  passing    smallint not null default 40 check (passing between 1 and 100),
  dribbling  smallint not null default 40 check (dribbling between 1 and 100),
  pace       smallint not null default 40 check (pace between 1 and 100),
  stamina    smallint not null default 40 check (stamina between 1 and 100)
);

-- Balance cache. The ledger is the source of truth; a nightly job compares them.
create table public.wallets (
  player_id          uuid primary key references public.players (id) on delete cascade,
  coin               bigint not null default 0 check (coin >= 0),
  gem                bigint not null default 0 check (gem >= 0),
  -- Default must match EconomyConfig.energyMax.
  energy             smallint not null default 5 check (energy >= 0),
  energy_updated_at  timestamptz not null default now(),
  -- Optimistic lock for energy updates computed in TypeScript.
  version            integer not null default 0
);

create table public.ledger (
  id               bigint generated always as identity primary key,
  player_id        uuid not null references public.players (id) on delete cascade,
  currency         text not null check (currency in ('coin', 'gem')),
  delta            bigint not null,
  balance_after    bigint not null,
  reason           text not null,
  ref_id           text,
  idempotency_key  text not null unique,
  created_at       timestamptz not null default now()
);
create index ledger_player_time on public.ledger (player_id, created_at desc);
create index ledger_reason_time on public.ledger (reason, created_at);

create function public.ledger_is_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'ledger rows cannot be updated';
end $$;

-- Rows are never edited. Deletes stay possible so account deletion (KVKK) can cascade.
create trigger ledger_no_update
  before update on public.ledger
  for each row execute function public.ledger_is_append_only();

-- ---------------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------------

create table public.items (
  id          text primary key,
  kind        text not null,
  rarity      text not null default 'common',
  price_coin  integer check (price_coin >= 0),
  price_gem   integer check (price_gem >= 0),
  season      integer
);

create table public.inventory (
  id           bigint generated always as identity primary key,
  player_id    uuid not null references public.players (id) on delete cascade,
  item_id      text not null references public.items (id),
  -- The future chain layer never releases items whose source is 'coin'.
  source       text not null check (source in ('coin', 'gem', 'first_sale', 'season', 'achievement')),
  equipped     boolean not null default false,
  acquired_at  timestamptz not null default now()
);
create index inventory_player on public.inventory (player_id);

-- ---------------------------------------------------------------------------
-- Matches
-- ---------------------------------------------------------------------------

create table public.matches (
  id                    uuid primary key default gen_random_uuid(),
  player_id             uuid not null references public.players (id) on delete cascade,
  seed                  bigint not null check (seed between 0 and 4294967295),
  chances               smallint not null,
  opponent_goalkeeping  smallint not null,
  issued_at             timestamptz not null default now(),
  expires_at            timestamptz not null,
  status                text not null default 'open' check (status in ('open', 'finished', 'expired')),
  shots                 smallint,
  shots_on_target       smallint,
  goals                 smallint,
  rating                smallint,
  duration_ms           integer,
  input_hash            text,
  flagged               boolean not null default false,
  flag_reasons          text[] not null default '{}',
  coin_reward           integer,
  xp_reward             integer,
  finished_at           timestamptz
);
create index matches_player_finished on public.matches (player_id, finished_at desc);
create index matches_open on public.matches (player_id) where status = 'open';

-- ---------------------------------------------------------------------------
-- Server-only tables
-- ---------------------------------------------------------------------------

-- Overrides on top of DEFAULT_CONFIG in packages/economy (key 'economy').
create table public.config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);
insert into public.config (key, value) values ('economy', '{}');

create table public.flags (
  id          bigint generated always as identity primary key,
  player_id   uuid not null references public.players (id) on delete cascade,
  kind        text not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index flags_player on public.flags (player_id, created_at desc);

create table public.iap_events (
  id           bigint generated always as identity primary key,
  player_id    uuid references public.players (id) on delete set null,
  rc_event_id  text not null unique,
  product_id   text,
  type         text not null,
  gem_delta    integer not null default 0,
  store        text,
  created_at   timestamptz not null default now()
);

create table public.ad_events (
  transaction_id  text primary key,
  player_id       uuid references public.players (id) on delete set null,
  ad_unit         text,
  reward          text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security: clients read their own rows, nothing else.
-- ---------------------------------------------------------------------------

alter table public.players      enable row level security;
alter table public.player_stats enable row level security;
alter table public.wallets      enable row level security;
alter table public.ledger       enable row level security;
alter table public.items        enable row level security;
alter table public.inventory    enable row level security;
alter table public.matches      enable row level security;
alter table public.config       enable row level security;
alter table public.flags        enable row level security;
alter table public.iap_events   enable row level security;
alter table public.ad_events    enable row level security;

revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
-- Explicit grants, so the schema does not depend on the project's auto-expose setting.
grant select on public.players, public.player_stats, public.wallets, public.ledger,
  public.inventory, public.matches, public.items, public.config to authenticated;
grant all on all tables in schema public to service_role;

create policy "own player"    on public.players      for select to authenticated using (id = auth.uid());
create policy "own stats"     on public.player_stats for select to authenticated using (player_id = auth.uid());
create policy "own wallet"    on public.wallets      for select to authenticated using (player_id = auth.uid());
create policy "own ledger"    on public.ledger       for select to authenticated using (player_id = auth.uid());
create policy "own inventory" on public.inventory    for select to authenticated using (player_id = auth.uid());
create policy "own matches"   on public.matches      for select to authenticated using (player_id = auth.uid());
create policy "item catalog"  on public.items        for select to authenticated using (true);
create policy "economy config" on public.config      for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- New account: create the player, stats and wallet.
-- ---------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.players (id) values (new.id);
  insert into public.player_stats (player_id) values (new.id);
  insert into public.wallets (player_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- The only door for coin and gem changes.
-- Locks the wallet, is idempotent on p_idem, and relies on the CHECK
-- constraints to refuse a negative balance.
-- ---------------------------------------------------------------------------

create function public.grant_currency(
  p_player uuid, p_currency text, p_amount bigint, p_reason text, p_ref text, p_idem text
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_balance bigint;
begin
  if p_currency not in ('coin', 'gem') then
    raise exception 'unknown currency %', p_currency;
  end if;

  perform 1 from wallets where player_id = p_player for update;
  if not found then
    raise exception 'wallet not found for %', p_player;
  end if;

  -- A retried request returns the original result instead of paying twice.
  select balance_after into v_balance from ledger where idempotency_key = p_idem;
  if found then
    return v_balance;
  end if;

  if p_currency = 'coin' then
    update wallets set coin = coin + p_amount where player_id = p_player returning coin into v_balance;
  else
    update wallets set gem = gem + p_amount where player_id = p_player returning gem into v_balance;
  end if;

  if p_amount <> 0 then
    insert into ledger (player_id, currency, delta, balance_after, reason, ref_id, idempotency_key)
    values (p_player, p_currency, p_amount, v_balance, p_reason, p_ref, p_idem);
  end if;

  return v_balance;
end $$;

-- ---------------------------------------------------------------------------
-- Match lifecycle. Rules live in packages/economy (TypeScript); these
-- functions only apply the result atomically.
-- ---------------------------------------------------------------------------

create function public.begin_match(
  p_player uuid,
  p_expected_version integer,
  p_energy smallint,
  p_energy_updated_at timestamptz,
  p_seed bigint,
  p_chances smallint,
  p_opponent_goalkeeping smallint,
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

  insert into matches (player_id, seed, chances, opponent_goalkeeping, expires_at)
  values (p_player, p_seed, p_chances, p_opponent_goalkeeping, p_expires_at)
  returning id into v_match;

  return v_match;
end $$;

create function public.finish_match(
  p_match uuid,
  p_player uuid,
  p_shots smallint,
  p_shots_on_target smallint,
  p_goals smallint,
  p_rating smallint,
  p_duration_ms integer,
  p_input_hash text,
  p_flag_reasons text[],
  p_coin integer,
  p_xp integer
) returns table (coin bigint, xp bigint, already_finished boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_flagged boolean := coalesce(array_length(p_flag_reasons, 1), 0) > 0;
begin
  update matches
     set status = 'finished', shots = p_shots, shots_on_target = p_shots_on_target, goals = p_goals,
         rating = p_rating, duration_ms = p_duration_ms, input_hash = p_input_hash,
         flagged = v_flagged, flag_reasons = p_flag_reasons,
         coin_reward = p_coin, xp_reward = p_xp, finished_at = now()
   where id = p_match and player_id = p_player and status = 'open';

  if not found then
    return query
      select w.coin, p.xp, true
        from wallets w join players p on p.id = w.player_id
       where w.player_id = p_player;
    return;
  end if;

  perform grant_currency(p_player, 'coin', p_coin, 'match', p_match::text, 'match:' || p_match::text);
  update players set xp = players.xp + p_xp where id = p_player;

  if v_flagged then
    insert into flags (player_id, kind, detail)
    values (p_player, 'match', jsonb_build_object('match_id', p_match, 'reasons', p_flag_reasons));
  end if;

  return query
    select w.coin, p.xp, false
      from wallets w join players p on p.id = w.player_id
     where w.player_id = p_player;
end $$;

-- Coin earned from matches today, Turkey time (for the daily cap).
create function public.match_coin_today(p_player uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)
    from ledger
   where player_id = p_player
     and reason = 'match'
     and created_at >= (date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul');
$$;

revoke execute on function public.grant_currency, public.begin_match, public.finish_match, public.match_coin_today
  from public, anon, authenticated;
grant execute on function public.grant_currency, public.begin_match, public.finish_match, public.match_coin_today
  to service_role;
