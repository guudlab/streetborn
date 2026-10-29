-- Talimler maça bağlanıyor (antrenman doc, step 2). The coach's drill of the day is picked
-- in packages/economy (dailyDrill); 3 stars on it ready the player for today's mahalle match
-- (match-start reads training_log, no new table) and, at a club, add 1 coach trust once a day.
-- finish_drill only gains p_trust_cap; its default keeps the old train function working
-- between this migration and the function deploy. Returns {best, previous, trust}.
drop function public.finish_drill(uuid, bigint, integer, smallint, text, smallint, smallint, smallint, smallint, smallint, integer, integer, text, smallint, smallint);

create function public.finish_drill(
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


revoke execute on function public.finish_drill from public, anon, authenticated;
grant execute on function public.finish_drill to service_role;
