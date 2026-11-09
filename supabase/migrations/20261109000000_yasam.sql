-- Yaşam (GDD v3.1 section 8.1; Kaan 2026-11-08 "Şimdi aç + vitrin"): the house, ride and land
-- bought with coin, shown on the profile, the mahalle member card and at kick-off. Status only:
-- no match, stat, energy or ranking effect. The halısaha pays a fixed coin income a day.
-- Prices, unlock levels and income come from DEFAULT_CONFIG.lifestyle through the `shop` Edge
-- Function; these rows only make the ids valid inventory items. They have no catalog price, so
-- the Dükkân never lists them. Source is always 'coin': the chain layer never releases them
-- (Kaan 2026-11-08: the metaverse gets its own gem/achievement series instead).

insert into public.items (id, kind) values
  ('bisiklet', 'lifestyle'), ('ev_daire', 'lifestyle'), ('araba', 'lifestyle'), ('arsa', 'lifestyle'),
  ('halisaha', 'lifestyle'), ('ev_villa', 'lifestyle'), ('spor_araba', 'lifestyle')
on conflict (id) do nothing;

-- The lifestyle items a player bought, oldest first. Ids only: what others may see.
create function public.yasam_ids(p_player uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(inv.item_id order by inv.acquired_at), '[]'::jsonb)
    from inventory inv join items it on it.id = inv.item_id
   where inv.player_id = p_player and it.kind = 'lifestyle';
$$;

-- Whole days since the halısaha last paid (or was bought), Istanbul time. 0 without a halısaha.
create function public.halisaha_days(p_player uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((
    select mahalle_today() - greatest(
             (inv.acquired_at at time zone 'Europe/Istanbul')::date,
             (select max(l.ref_id)::date from ledger l where l.player_id = p_player and l.reason = 'halisaha'))
      from inventory inv
     where inv.player_id = p_player and inv.item_id = 'halisaha'), 0);
$$;

-- ---------------------------------------------------------------------------
-- Writes (service role only)
-- ---------------------------------------------------------------------------

-- Buys one lifestyle item at its config price. Once per item.
-- Errors: not_for_sale, not_found, locked, owned, needs (p_requires not owned), no_coin.
create function public.buy_lifestyle(
  p_player uuid, p_item text, p_price integer, p_min_level integer, p_requires text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_level integer;
  v_balance bigint;
begin
  if p_price <= 0 or not exists (select 1 from items where id = p_item and kind = 'lifestyle') then
    raise exception 'not_for_sale';
  end if;
  select level into v_level from players where id = p_player for update;
  if not found then raise exception 'not_found'; end if;
  if exists (select 1 from inventory where player_id = p_player and item_id = p_item) then raise exception 'owned'; end if;
  if v_level < p_min_level then raise exception 'locked'; end if;
  if p_requires is not null and not exists (select 1 from inventory where player_id = p_player and item_id = p_requires) then
    raise exception 'needs';
  end if;

  begin
    v_balance := grant_currency(p_player, 'coin', -p_price, 'lifestyle', p_item, 'lifestyle:' || p_player::text || ':' || p_item);
  exception when check_violation then
    raise exception 'no_coin';
  end;
  insert into inventory (player_id, item_id, source) values (p_player, p_item, 'coin');
  return jsonb_build_object('price', p_price, 'balance', v_balance);
end $$;

-- Pays the halısaha income for the whole days since it last paid, up to p_max_days days.
-- Days past the cap are lost, so it pays to come back. Once a day at most.
-- Returns {coin, days, balance}. Errors: not_owned.
create function public.claim_halisaha(p_player uuid, p_per_day integer, p_max_days integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_today date := mahalle_today();
  v_days integer;
  v_coin integer;
  v_balance bigint;
begin
  perform 1 from players where id = p_player for update;
  if not exists (select 1 from inventory where player_id = p_player and item_id = 'halisaha') then raise exception 'not_owned'; end if;
  v_days := halisaha_days(p_player);
  if v_days <= 0 then
    return jsonb_build_object('coin', 0, 'days', 0, 'balance', (select coin from wallets where player_id = p_player));
  end if;
  v_coin := least(v_days, p_max_days) * p_per_day;
  v_balance := grant_currency(p_player, 'coin', v_coin, 'halisaha', v_today::text,
                              'halisaha:' || p_player::text || ':' || v_today::text);
  return jsonb_build_object('coin', v_coin, 'days', v_days, 'balance', v_balance);
end $$;

revoke execute on function public.yasam_ids(uuid), public.halisaha_days(uuid),
  public.buy_lifestyle(uuid, text, integer, integer, text), public.claim_halisaha(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.yasam_ids(uuid), public.halisaha_days(uuid),
  public.buy_lifestyle(uuid, text, integer, integer, text), public.claim_halisaha(uuid, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- Reads: the showcase on the profile and the mahalle card, the halısaha in the shop read
-- ---------------------------------------------------------------------------

-- Other players' profiles now carry the lifestyle ids (status is meant to be seen). Still no
-- coin, gems, ledger or the rest of the inventory.
create or replace function public.oyuncu_profil(p_from uuid, p_id uuid, p_kod text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  mates boolean;
  rival boolean;
  result jsonb;
begin
  perform oyuncu_sorgu_say(p_from, 'profil', 120, interval '1 hour');
  select id into target from players where (p_id is not null and id = p_id) or (p_kod is not null and kod = upper(p_kod)) limit 1;
  if target is null then return null; end if;
  if target <> p_from then
    if exists (select 1 from blocks where (blocker_id = p_from and blocked_id = target) or (blocker_id = target and blocked_id = p_from)) then
      return null;
    end if;
    mates := exists (select 1 from mahalle_uye a join mahalle_uye b on a.mahalle_id = b.mahalle_id where a.player_id = p_from and b.player_id = target);
    rival := exists (select 1 from rakip_hafta r where (r.player_id = p_from and r.rival_id = target) or (r.player_id = target and r.rival_id = p_from));
    -- By code or by id from a list the caller can reach: the same visibility rule as search.
    if not mates and not rival and oyuncu_gizli(target) then return null; end if;
  end if;

  select jsonb_build_object(
    'id', p.id, 'kod', p.kod, 'nick', p.nick, 'level', p.level, 'character', p.character, 'me', p.id = p_from,
    'mate', coalesce(mates, false) and p.id <> p_from,
    'stats', jsonb_build_object('sut', s.shooting, 'pas', s.passing, 'hiz', s.pace, 'fizik', s.stamina),
    'totals', jsonb_build_object(
      'matches', (select count(*) from matches m where m.player_id = p.id and m.status = 'finished' and not m.flagged),
      'goals', (select coalesce(sum(m.goals), 0) from matches m where m.player_id = p.id and m.status = 'finished' and not m.flagged),
      'assists', (select coalesce(sum(m.assists), 0) from matches m where m.player_id = p.id and m.status = 'finished' and not m.flagged)),
    'ratings', (select coalesce(jsonb_agg(r.rating order by r.at), '[]'::jsonb) from (
        select m.rating, m.finished_at as at from matches m
         where m.player_id = p.id and m.status = 'finished' and not m.flagged and m.rating is not null
         order by m.finished_at desc limit 5) r),
    'club', (select c.club_name from contracts c where c.player_id = p.id and c.active),
    'mahalle', (select jsonb_build_object('id', mh.id, 'name', mh.name, 'emblem', mh.emblem, 'color', mh.color)
                  from mahalle_uye u join mahalle mh on mh.id = u.mahalle_id where u.player_id = p.id),
    'trophies', (select coalesce(jsonb_agg(b.key order by b.unlocked_at), '[]'::jsonb) from (
        select key, unlocked_at from basarimlar where player_id = p.id order by unlocked_at desc limit 3) b),
    'trophyCount', (select count(*) from basarimlar where player_id = p.id),
    'life', public.yasam_ids(p.id)
  ) into result
  from players p join player_stats s on s.player_id = p.id
  where p.id = target;
  return result;
end $$;

-- Each mahalle member now carries their lifestyle ids for the member card.
create or replace function public.mahalle_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'name', m.name, 'emblem', m.emblem, 'color', m.color, 'code', m.code,
    'isOpen', m.is_open, 'captainId', m.captain_id,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'playerId', u.player_id, 'nick', p.nick, 'level', p.level, 'joinedAt', u.joined_at,
        'life', public.yasam_ids(u.player_id)
      ) order by u.joined_at), '[]'::jsonb)
      from mahalle_uye u join players p on p.id = u.player_id
      where u.mahalle_id = m.id
    )
  )
  from mahalle m join mahalle_uye me on me.mahalle_id = m.id
  where me.player_id = auth.uid();
$$;

-- The shop read now also says how many days of halısaha income are waiting (uncapped; the
-- app caps it with the config, like the server does when it pays).
create or replace function public.dukkan_bugun() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'refills', (select count(*) from shop_log where player_id = auth.uid() and day = mahalle_today() and kind = 'refill'),
    'adEnergy', (select count(*) from shop_log where player_id = auth.uid() and day = mahalle_today() and kind = 'ad_energy'),
    'adDouble', (select count(*) from shop_log where player_id = auth.uid() and day = mahalle_today() and kind = 'ad_double'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', item_id, 'equipped', equipped, 'usesLeft', uses_left) order by acquired_at)
                         from inventory where player_id = auth.uid()), '[]'::jsonb),
    'catalog', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'priceGem', price_gem, 'priceCoin', price_coin) order by id)
                           from items where price_gem is not null or price_coin is not null), '[]'::jsonb),
    'halisahaDays', public.halisaha_days(auth.uid())
  );
$$;
