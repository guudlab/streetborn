-- Gems, energy refills, cosmetics and rewarded ads (GDD v3.1 section 9).
-- The `shop` Edge Function handles the player's own actions, `career` pays the
-- starting and level gems on app open, and `ad-reward` is AdMob's server-side
-- verification callback. Amounts come from DEFAULT_CONFIG.shop; item prices come
-- from the `items` catalog. The client never sends an amount.

-- One row per counted action, for the daily limits.
create table public.shop_log (
  id         bigint generated always as identity primary key,
  player_id  uuid not null references public.players (id) on delete cascade,
  day        date not null,
  kind       text not null check (kind in ('refill', 'ad_energy', 'ad_double')),
  ref        text,
  created_at timestamptz not null default now()
);
create index shop_log_player_day on public.shop_log (player_id, day);
alter table public.shop_log enable row level security;
-- No policies on purpose: reads go through dukkan_bugun().

-- Every AdMob callback, rewarded or not; transaction_id makes retries harmless.
alter table public.ad_events
  add column outcome text,
  add column ref     text;

-- One of each item per player.
create unique index inventory_player_item on public.inventory (player_id, item_id);

-- First cosmetic. More come with their art; prices are tuned here.
insert into public.items (id, kind, rarity, price_gem, season)
values ('forma_sonbahar', 'jersey', 'season', 120, 1);

-- The daily cap now also counts the coin a "coin ×2" ad paid.
create or replace function public.match_coin_today(p_player uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(delta), 0)
    from ledger
   where player_id = p_player
     and reason in ('match', 'ad_double')
     and created_at >= (date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul');
$$;

-- ---------------------------------------------------------------------------
-- Writes (service role only)
-- ---------------------------------------------------------------------------

-- Starting coin and gems (once) and level gems for p_levels that the player has
-- reached. Safe to repeat. Returns what was paid now: {coin, gem, levels}.
create function public.claim_gems(
  p_player uuid, p_start_coin integer, p_start_gem integer, p_levels integer[], p_level_gem integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_level integer;
  v_key text;
  v_coin integer := 0;
  v_gem integer := 0;
  v_paid integer[] := '{}';
  l integer;
begin
  select level into v_level from players where id = p_player for update;
  if not found then raise exception 'not_found'; end if;

  v_key := 'start:' || p_player::text;
  if not exists (select 1 from ledger where idempotency_key in (v_key || ':coin', v_key || ':gem')) then
    perform grant_currency(p_player, 'coin', p_start_coin, 'start', null, v_key || ':coin');
    perform grant_currency(p_player, 'gem', p_start_gem, 'start', null, v_key || ':gem');
    v_coin := p_start_coin;
    v_gem := p_start_gem;
  end if;

  foreach l in array coalesce(p_levels, '{}') loop
    v_key := 'level_gem:' || p_player::text || ':' || l::text;
    if l <= v_level and not exists (select 1 from ledger where idempotency_key = v_key) then
      perform grant_currency(p_player, 'gem', p_level_gem, 'level_gem', l::text, v_key);
      v_gem := v_gem + p_level_gem;
      v_paid := v_paid || l;
    end if;
  end loop;

  return jsonb_build_object('coin', v_coin, 'gem', v_gem, 'levels', to_jsonb(v_paid));
end $$;

-- Fills energy for gems. The caller computed the current energy from the wallet
-- at p_expected_version and checked it is not full. Errors: limit, no_gem.
create function public.refill_energy(
  p_player uuid, p_cost integer, p_limit integer, p_expected_version integer, p_energy smallint
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_day date := mahalle_today();
  v_seq integer;
begin
  update wallets
     set energy = p_energy, energy_updated_at = now(), version = version + 1
   where player_id = p_player and version = p_expected_version;
  if not found then raise exception 'wallet_version_conflict' using errcode = '40001'; end if;

  select count(*) into v_seq from shop_log where player_id = p_player and day = v_day and kind = 'refill';
  if v_seq >= p_limit then raise exception 'limit'; end if;

  begin
    perform grant_currency(p_player, 'gem', -p_cost, 'energy_refill', v_day::text,
                           'refill:' || p_player::text || ':' || v_day::text || ':' || (v_seq + 1)::text);
  exception when check_violation then
    raise exception 'no_gem';
  end;
  insert into shop_log (player_id, day, kind) values (p_player, v_day, 'refill');
end $$;

-- Buys one catalog item at its catalog price. Gem items are 'gem' source (the
-- chain layer may release them later), coin items 'coin' (never released).
-- Errors: not_for_sale, owned, no_gem, no_coin.
create function public.buy_item(p_player uuid, p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  i items%rowtype;
  v_currency text;
  v_price integer;
  v_balance bigint;
begin
  select * into i from items where id = p_item;
  if not found or (i.price_gem is null and i.price_coin is null) then raise exception 'not_for_sale'; end if;
  perform 1 from players where id = p_player for update;
  if exists (select 1 from inventory where player_id = p_player and item_id = p_item) then raise exception 'owned'; end if;

  v_currency := case when i.price_gem is not null then 'gem' else 'coin' end;
  v_price := coalesce(i.price_gem, i.price_coin);
  begin
    v_balance := grant_currency(p_player, v_currency, -v_price, 'item', p_item, 'item:' || p_player::text || ':' || p_item);
  exception when check_violation then
    raise exception '%', 'no_' || v_currency;
  end;
  insert into inventory (player_id, item_id, source) values (p_player, p_item, v_currency);
  return jsonb_build_object('currency', v_currency, 'price', v_price, 'balance', v_balance);
end $$;

-- Wears an owned item (and takes off the other items of its kind), or takes it off.
create function public.equip_item(p_player uuid, p_item text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
begin
  select it.kind into v_kind
    from inventory inv join items it on it.id = inv.item_id
   where inv.player_id = p_player and inv.item_id = p_item;
  if not found then raise exception 'not_owned'; end if;
  update inventory inv set equipped = (inv.item_id = p_item and p_on)
    from items it
   where it.id = inv.item_id and inv.player_id = p_player and it.kind = v_kind;
end $$;

-- Applies one verified AdMob reward. p_kind: 'ad_energy' (wallet update at
-- p_expected_version) or 'ad_double' (p_coin more for match p_ref).
-- Returns ok | duplicate | limit | capped.
create function public.apply_ad_reward(
  p_tx text, p_player uuid, p_ad_unit text, p_kind text, p_ref text, p_limit integer,
  p_expected_version integer, p_energy smallint, p_energy_updated_at timestamptz, p_coin integer
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_day date := mahalle_today();
  v_seq integer;
  v_outcome text := 'ok';
begin
  insert into ad_events (transaction_id, player_id, ad_unit, reward, ref)
  values (p_tx, p_player, p_ad_unit, p_kind, p_ref)
  on conflict (transaction_id) do nothing;
  if not found then return 'duplicate'; end if;

  perform 1 from wallets where player_id = p_player for update;
  select count(*) into v_seq from shop_log where player_id = p_player and day = v_day and kind = p_kind;

  if v_seq >= p_limit then
    v_outcome := 'limit';
  elsif p_kind = 'ad_energy' then
    update wallets
       set energy = p_energy, energy_updated_at = p_energy_updated_at, version = version + 1
     where player_id = p_player and version = p_expected_version;
    if not found then raise exception 'wallet_version_conflict' using errcode = '40001'; end if;
  elsif p_kind = 'ad_double' then
    if exists (select 1 from ledger where idempotency_key = 'ad_double:' || p_ref) then
      v_outcome := 'duplicate';
    elsif p_coin <= 0 then
      v_outcome := 'capped';
    else
      perform grant_currency(p_player, 'coin', p_coin, 'ad_double', p_ref, 'ad_double:' || p_ref);
    end if;
  else
    raise exception 'bad_kind';
  end if;

  if v_outcome = 'ok' then
    insert into shop_log (player_id, day, kind, ref) values (p_player, v_day, p_kind, p_ref);
  end if;
  update ad_events set outcome = v_outcome where transaction_id = p_tx;
  return v_outcome;
end $$;

revoke execute on function public.claim_gems, public.refill_energy, public.buy_item, public.equip_item, public.apply_ad_reward
  from public, anon, authenticated;
grant execute on function public.claim_gems, public.refill_energy, public.buy_item, public.equip_item, public.apply_ad_reward
  to service_role;

-- ---------------------------------------------------------------------------
-- Read (authenticated): today's shop counts, the caller's items and the price list
-- ---------------------------------------------------------------------------

create function public.dukkan_bugun() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'refills', (select count(*) from shop_log where player_id = auth.uid() and day = mahalle_today() and kind = 'refill'),
    'adEnergy', (select count(*) from shop_log where player_id = auth.uid() and day = mahalle_today() and kind = 'ad_energy'),
    'adDouble', (select count(*) from shop_log where player_id = auth.uid() and day = mahalle_today() and kind = 'ad_double'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', item_id, 'equipped', equipped) order by acquired_at)
                         from inventory where player_id = auth.uid()), '[]'::jsonb),
    'catalog', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'priceGem', price_gem, 'priceCoin', price_coin) order by id)
                           from items where price_gem is not null or price_coin is not null), '[]'::jsonb)
  );
$$;
revoke all on function public.dukkan_bugun() from public, anon;
grant execute on function public.dukkan_bugun() to authenticated;
