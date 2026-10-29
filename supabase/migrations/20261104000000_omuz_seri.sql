-- Omuz oku and the training streak (antrenman doc, step 2, decisions 2A and 4A).
-- Omuz oku ('defense') is a drill that trains no stat: finish_drill skips player_stats for it,
-- and 3 stars on it ready the player for today's mahalle match like the drill of the day.
-- The streak: training on each of the 3 previous days gives one more free drill today.
-- Usta badges need no table: they are computed from drill_records in packages/economy.

alter table public.training_log drop constraint training_log_stat_check,
  add constraint training_log_stat_check check (stat in ('shooting', 'passing', 'pace', 'stamina', 'defense'));
alter table public.drill_records drop constraint drill_records_stat_check,
  add constraint drill_records_stat_check check (stat in ('shooting', 'passing', 'pace', 'stamina', 'defense'));

create or replace function public.start_drill(
  p_player uuid, p_stat text, p_kind text, p_limit integer, p_seed bigint, p_tier smallint,
  p_expected_version integer, p_energy smallint, p_energy_updated_at timestamptz
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_day date := mahalle_today();
  v_seq integer;
  v_id bigint;
begin
  if p_stat not in ('shooting', 'passing', 'pace', 'stamina', 'defense') then raise exception 'bad_stat'; end if;
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

create or replace function public.finish_drill(
  p_player uuid, p_session bigint, p_score integer, p_stars smallint, p_grade text,
  p_expected_stat smallint, p_expected_ap smallint, p_stat_after smallint, p_ap_after smallint,
  p_ap smallint, p_xp integer, p_level integer,
  p_boot text, p_boot_uses smallint, p_boot_ap smallint,
  p_trust_cap smallint default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s training_log%rowtype;
  v_stat smallint;
  v_ap smallint;
  v_best integer;
  v_trust integer := 0;
begin
  select * into s from training_log where id = p_session and player_id = p_player for update;
  if not found or s.seed is null then raise exception 'no_session'; end if;
  if s.finished_at is not null then raise exception 'finished'; end if;

  -- Omuz oku has no stat; the other drills check the stat they were scored against.
  if s.stat <> 'defense' then
    execute format('select %I, %I from player_stats where player_id = $1 for update', s.stat, 'ap_' || s.stat)
       into v_stat, v_ap using p_player;
    if v_stat is distinct from p_expected_stat or v_ap is distinct from p_expected_ap then
      raise exception 'training_conflict' using errcode = '40001';
    end if;
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

  if s.stat <> 'defense' then
    execute format('update player_stats set %I = $1, %I = $2 where player_id = $3', s.stat, 'ap_' || s.stat)
      using p_stat_after, p_ap_after, p_player;
  end if;
  update players set xp = xp + p_xp, level = greatest(level, p_level) where id = p_player;
  update training_log
     set grade = p_grade, score = p_score, stars = p_stars, ap = p_ap, xp = p_xp,
         boot_ap = coalesce(p_boot_ap, 0), finished_at = now()
   where id = p_session;

  -- The first 3 stars of the day on this stat (the train function sends the cap only for the
  -- drill of the day at a club) add 1 coach trust, never past the cap: promotion needs matches.
  if p_trust_cap is not null and p_stars = 3 and not exists (
    select 1 from training_log where player_id = p_player and day = s.day and stat = s.stat and stars = 3 and id <> p_session
  ) then
    update players set coach_trust = coach_trust + 1 where id = p_player and coach_trust < p_trust_cap;
    if found then v_trust := 1; end if;
  end if;

  select best into v_best from drill_records where player_id = p_player and stat = s.stat;
  if v_best is null then
    insert into drill_records (player_id, stat, best) values (p_player, s.stat, p_score);
  elsif p_score > v_best then
    update drill_records set best = p_score, updated_at = now() where player_id = p_player and stat = s.stat;
  end if;
  return jsonb_build_object('best', greatest(coalesce(v_best, p_score), p_score), 'previous', v_best, 'trust', v_trust);
end $$;

-- True when the player trained on each of the three days before p_day.
create function public.talim_serisi(p_player uuid, p_day date) returns boolean
language sql stable security definer set search_path = public as $$
  select count(distinct day) = 3 from training_log where player_id = p_player and day between p_day - 3 and p_day - 1;
$$;

-- Today's training now also says whether the streak adds a free drill.
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
    'streak', talim_serisi(auth.uid(), mahalle_today()),
    'boots', (select jsonb_build_object('id', inv.item_id, 'usesLeft', inv.uses_left)
                from inventory inv join items it on it.id = inv.item_id
               where inv.player_id = auth.uid() and it.kind = 'boots' and inv.uses_left > 0
               order by inv.equipped desc, inv.uses_left asc
               limit 1)
  );
$$;

revoke execute on function public.talim_serisi from public, anon, authenticated;
grant execute on function public.talim_serisi to service_role;
