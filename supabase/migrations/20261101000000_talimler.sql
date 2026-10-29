-- Burak abi's mini games and krampon (antrenman doc, decisions 1A and 7A).
-- A drill is now a session: the `train` Edge Function's `start` spends the free
-- drill or the energy and hands out a seed; `finish` sends the inputs back, the
-- function scores them with packages/economy/src/drills.ts and finish_drill()
-- applies the result. Boots add AP to 3-star drills and wear by one talim per drill.
-- AP, XP and coin per grade are unchanged.

alter table public.training_log
  add column seed        bigint,
  add column tier        smallint check (tier between 0 and 2),
  add column score       integer,
  add column stars       smallint check (stars between 0 and 3),
  add column boot_ap     smallint not null default 0,
  add column finished_at timestamptz;

-- Best score per drill, for "yeni rekor" now and the mahalle board later.
create table public.drill_records (
  player_id  uuid not null references public.players (id) on delete cascade,
  stat       text not null check (stat in ('shooting', 'passing', 'pace', 'stamina')),
  best       integer not null,
  updated_at timestamptz not null default now(),
  primary key (player_id, stat)
);
alter table public.drill_records enable row level security;
-- No policies on purpose: reads go through antrenman_bugun().

-- How many talim a pair of boots has left. Null for every other item.
alter table public.inventory add column uses_left smallint check (uses_left >= 0);

-- The three pairs. No catalog price on purpose: buy_item() refuses them, and
-- buy_boots() sells them at the config price with their talim count.
insert into public.items (id, kind, rarity) values
  ('krampon_mahalle', 'boots', 'common'),
  ('krampon_cim', 'boots', 'rare'),
  ('krampon_pro', 'boots', 'epic');

-- ---------------------------------------------------------------------------
-- Writes (service role only)
-- ---------------------------------------------------------------------------

-- Opens a drill: counts it against the day's free drills (p_kind 'free', up to
-- p_limit) or spends the energy computed at p_expected_version. A drill that is
-- never finished stays spent. Errors: limit, wallet_version_conflict (40001).
create function public.start_drill(
  p_player uuid, p_stat text, p_kind text, p_limit integer, p_seed bigint, p_tier smallint,
  p_expected_version integer, p_energy smallint, p_energy_updated_at timestamptz
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_day date := mahalle_today();
  v_seq integer;
  v_id bigint;
begin
  if p_stat not in ('shooting', 'passing', 'pace', 'stamina') then raise exception 'bad_stat'; end if;
  if p_kind not in ('free', 'energy') then raise exception 'bad_kind'; end if;
  perform 1 from players where id = p_player for update;
  if not found then raise exception 'not_found'; end if;

  select count(*) into v_seq from training_log where player_id = p_player and day = v_day and kind = p_kind;
  if p_limit is not null and v_seq >= p_limit then raise exception 'limit'; end if;

  if p_kind = 'energy' then
    update wallets
       set energy = p_energy, energy_updated_at = p_energy_updated_at, version = version + 1
     where player_id = p_player and version = p_expected_version;
    if not found then raise exception 'wallet_version_conflict' using errcode = '40001'; end if;
  end if;

  insert into training_log (player_id, day, kind, stat, ap, xp, seed, tier)
  values (p_player, v_day, p_kind, p_stat, 0, 0, p_seed, p_tier)
  returning id into v_id;
  return v_id;
end $$;

-- Closes a drill with the result the caller scored. p_expected_* are the stat and
-- AP it was computed from, p_boot_uses the talim left on the pair p_boot it wore
-- (null: no boots); a change in between makes the caller retry (40001). Returns
-- {best, previous} for the drill record. Errors: no_session, finished.
create function public.finish_drill(
  p_player uuid, p_session bigint, p_score integer, p_stars smallint, p_grade text,
  p_expected_stat smallint, p_expected_ap smallint, p_stat_after smallint, p_ap_after smallint,
  p_ap smallint, p_xp integer, p_level integer,
  p_boot text, p_boot_uses smallint, p_boot_ap smallint
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s training_log%rowtype;
  v_stat smallint;
  v_ap smallint;
  v_best integer;
begin
  select * into s from training_log where id = p_session and player_id = p_player for update;
  if not found or s.seed is null then raise exception 'no_session'; end if;
  if s.finished_at is not null then raise exception 'finished'; end if;

  execute format('select %I, %I from player_stats where player_id = $1 for update', s.stat, 'ap_' || s.stat)
     into v_stat, v_ap using p_player;
  if v_stat is distinct from p_expected_stat or v_ap is distinct from p_expected_ap then
    raise exception 'training_conflict' using errcode = '40001';
  end if;

  if p_boot is not null then
    update inventory set uses_left = uses_left - 1
     where player_id = p_player and item_id = p_boot and uses_left = p_boot_uses and uses_left > 0;
    if not found then raise exception 'boots_conflict' using errcode = '40001'; end if;
    -- The pair in use is the one shown as worn.
    update inventory inv set equipped = (inv.item_id = p_boot)
      from items it
     where it.id = inv.item_id and inv.player_id = p_player and it.kind = 'boots';
  end if;

  execute format('update player_stats set %I = $1, %I = $2 where player_id = $3', s.stat, 'ap_' || s.stat)
    using p_stat_after, p_ap_after, p_player;
  update players set xp = xp + p_xp, level = greatest(level, p_level) where id = p_player;
  update training_log
     set grade = p_grade, score = p_score, stars = p_stars, ap = p_ap, xp = p_xp,
         boot_ap = coalesce(p_boot_ap, 0), finished_at = now()
   where id = p_session;

  select best into v_best from drill_records where player_id = p_player and stat = s.stat;
  if v_best is null then
    insert into drill_records (player_id, stat, best) values (p_player, s.stat, p_score);
  elsif p_score > v_best then
    update drill_records set best = p_score, updated_at = now() where player_id = p_player and stat = s.stat;
  end if;
  return jsonb_build_object('best', greatest(coalesce(v_best, p_score), p_score), 'previous', v_best);
end $$;

-- Buys a pair of boots for coin (source 'coin': the chain layer never releases
-- it) and puts them on. A worn-out pair can be bought again; one with talim left
-- cannot. Price, talim and level come from the config. Errors: not_for_sale,
-- locked, owned, no_coin.
create function public.buy_boots(p_player uuid, p_item text, p_price integer, p_uses smallint, p_min_level integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_level integer;
  v_n integer;
  v_balance bigint;
begin
  if not exists (select 1 from items where id = p_item and kind = 'boots') then raise exception 'not_for_sale'; end if;
  select level into v_level from players where id = p_player for update;
  if not found then raise exception 'not_found'; end if;
  if v_level < p_min_level then raise exception 'locked'; end if;
  if exists (select 1 from inventory where player_id = p_player and item_id = p_item and uses_left > 0) then
    raise exception 'owned';
  end if;

  select count(*) + 1 into v_n from ledger where player_id = p_player and reason = 'boots' and ref_id = p_item;
  begin
    v_balance := grant_currency(p_player, 'coin', -p_price, 'boots', p_item,
                                'boots:' || p_player::text || ':' || p_item || ':' || v_n::text);
  exception when check_violation then
    raise exception 'no_coin';
  end;

  insert into inventory (player_id, item_id, source, equipped, uses_left)
  values (p_player, p_item, 'coin', true, p_uses)
  on conflict (player_id, item_id) do update set uses_left = excluded.uses_left, equipped = true, acquired_at = now();
  update inventory inv set equipped = (inv.item_id = p_item)
    from items it
   where it.id = inv.item_id and inv.player_id = p_player and it.kind = 'boots';
  return jsonb_build_object('price', p_price, 'balance', v_balance, 'usesLeft', p_uses);
end $$;

revoke execute on function public.start_drill, public.finish_drill, public.buy_boots from public, anon, authenticated;
grant execute on function public.start_drill, public.finish_drill, public.buy_boots to service_role;

-- ---------------------------------------------------------------------------
-- Reads (authenticated)
-- ---------------------------------------------------------------------------

-- Today's counts, today's best stars per drill, the drill records and the boots
-- in use (the worn pair first, then the one closest to wearing out).
create or replace function public.antrenman_bugun() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'free', (select count(*) from training_log where player_id = auth.uid() and day = mahalle_today() and kind = 'free'),
    'energy', (select count(*) from training_log where player_id = auth.uid() and day = mahalle_today() and kind = 'energy'),
    'private', (select count(*) from training_log where player_id = auth.uid() and day = mahalle_today() and kind = 'private'),
    'stars', coalesce((select jsonb_object_agg(stat, best)
                         from (select stat, max(stars) as best from training_log
                                where player_id = auth.uid() and day = mahalle_today() and stars is not null
                                group by stat) x), '{}'::jsonb),
    'records', coalesce((select jsonb_object_agg(stat, best) from drill_records where player_id = auth.uid()), '{}'::jsonb),
    'boots', (select jsonb_build_object('id', inv.item_id, 'usesLeft', inv.uses_left)
                from inventory inv join items it on it.id = inv.item_id
               where inv.player_id = auth.uid() and it.kind = 'boots' and inv.uses_left > 0
               order by inv.equipped desc, inv.uses_left asc
               limit 1)
  );
$$;

-- The shop now also shows how many talim each pair of boots has left.
create or replace function public.dukkan_bugun() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'refills', (select count(*) from shop_log where player_id = auth.uid() and day = mahalle_today() and kind = 'refill'),
    'adEnergy', (select count(*) from shop_log where player_id = auth.uid() and day = mahalle_today() and kind = 'ad_energy'),
    'adDouble', (select count(*) from shop_log where player_id = auth.uid() and day = mahalle_today() and kind = 'ad_double'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', item_id, 'equipped', equipped, 'usesLeft', uses_left) order by acquired_at)
                         from inventory where player_id = auth.uid()), '[]'::jsonb),
    'catalog', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'priceGem', price_gem, 'priceCoin', price_coin) order by id)
                           from items where price_gem is not null or price_coin is not null), '[]'::jsonb)
  );
$$;
