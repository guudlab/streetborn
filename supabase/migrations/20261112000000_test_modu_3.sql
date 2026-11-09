-- Test mode, part 3: close today's mahalle day for the caller's own mahalle only.
-- mahalle_to_settle gets an optional mahalle: with it, that mahalle's open day is offered
-- even when the day has not ended. Without it the function is exactly as before.

drop function public.mahalle_to_settle(integer, integer);
create function public.mahalle_to_settle(p_min_age_hours integer, p_min_matches integer, p_mahalle uuid default null) returns table (
  mahalle_id uuid, day date, player_id uuid, xp bigint, is_real boolean,
  played boolean, goals smallint, assists smallint, opponent_goals smallint, rating smallint
)
language sql stable security definer set search_path = public as $$
  select g.mahalle_id, g.day, u.player_id, p.xp,
         (u.joined_at <= (g.day::timestamp at time zone 'Europe/Istanbul') - make_interval(hours => p_min_age_hours)
            and (select count(*) from matches m where m.player_id = u.player_id and m.status = 'finished') >= p_min_matches),
         k.player_id is not null, k.goals, k.assists, k.opponent_goals, k.rating
    from mahalle_gun g
    join mahalle_uye u on u.mahalle_id = g.mahalle_id
    join players p on p.id = u.player_id
    left join mahalle_katki k on k.mahalle_id = g.mahalle_id and k.day = g.day and k.player_id = u.player_id
   where g.status = 'open'
     and (case when p_mahalle is null then g.day < mahalle_today() else g.mahalle_id = p_mahalle end)
     and exists (select 1 from mahalle_katki k2 where k2.mahalle_id = g.mahalle_id and k2.day = g.day);
$$;
revoke execute on function public.mahalle_to_settle(integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.mahalle_to_settle(integer, integer, uuid) to service_role;

-- The caller's mahalle, or null.
create function public.dev_mahalle_of(p_player uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform dev_check(p_player);
  return (select mahalle_id from mahalle_uye where player_id = p_player limit 1);
end $$;

-- After a forced close: moves the mahalle's closed rows of today (day, contributions, cheers
-- and the members' mahalle matches) to the nearest earlier day that is free everywhere, so
-- the mahalle can play a new "today". Returns the days moved, or 0 when nothing was closed.
create function public.dev_mahalle_reopen(p_player uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_mahalle uuid;
  v_today date := mahalle_today();
  k integer := 1;
begin
  perform dev_check(p_player);
  select mahalle_id into v_mahalle from mahalle_uye where player_id = p_player limit 1;
  if v_mahalle is null then raise exception 'no_mahalle'; end if;
  if not exists (select 1 from mahalle_gun where mahalle_id = v_mahalle and day = v_today and status = 'closed') then
    return 0;
  end if;
  while k < 400 and (
    exists (select 1 from mahalle_gun where mahalle_id = v_mahalle and day = v_today - k)
    or exists (select 1 from mahalle_katki where mahalle_id = v_mahalle and day = v_today - k)
    or exists (select 1 from mahalle_tezahurat where mahalle_id = v_mahalle and day = v_today - k)
    or exists (select 1 from matches m join mahalle_uye u on u.player_id = m.player_id
                where u.mahalle_id = v_mahalle and m.kind = 'mahalle' and m.status <> 'expired' and m.day = v_today - k)
  ) loop
    k := k + 1;
  end loop;
  update mahalle_katki set day = day - k where mahalle_id = v_mahalle and day = v_today;
  update mahalle_tezahurat set day = day - k where mahalle_id = v_mahalle and day = v_today;
  update matches set day = day - k
   where kind = 'mahalle' and day = v_today and status <> 'expired'
     and player_id in (select player_id from mahalle_uye where mahalle_id = v_mahalle);
  update mahalle_gun set day = day - k where mahalle_id = v_mahalle and day = v_today;
  return k;
end $$;

revoke all on function public.dev_mahalle_of(uuid), public.dev_mahalle_reopen(uuid) from public, anon, authenticated;
grant execute on function public.dev_mahalle_of(uuid), public.dev_mahalle_reopen(uuid) to service_role;
