-- Training on the server (GDD v3.1 section 6): drills (3 free a day, then 1 energy)
-- and coin-paid private sessions give AP; AP turns into stat points up to a
-- level-based cap. The `train` Edge Function computes the result and calls
-- apply_training(), which enforces the daily limits under a row lock.

alter table public.player_stats
  add column ap_shooting smallint not null default 0 check (ap_shooting >= 0),
  add column ap_passing  smallint not null default 0 check (ap_passing >= 0),
  add column ap_pace     smallint not null default 0 check (ap_pace >= 0),
  add column ap_stamina  smallint not null default 0 check (ap_stamina >= 0);

create table public.training_log (
  id         bigint generated always as identity primary key,
  player_id  uuid not null references public.players (id) on delete cascade,
  day        date not null,
  kind       text not null check (kind in ('free', 'energy', 'private')),
  stat       text not null check (stat in ('shooting', 'passing', 'pace', 'stamina')),
  grade      text,
  ap         smallint not null,
  xp         smallint not null,
  coin       integer not null default 0,
  created_at timestamptz not null default now()
);
create index training_log_player_day on public.training_log (player_id, day);
alter table public.training_log enable row level security;
-- No policies on purpose: reads go through antrenman_bugun().

-- Applies one session. p_expected_* are the stat and AP the result was computed
-- from; another session in between makes the caller retry (40001). Errors:
-- limit (daily count reached), no_coin, no_energy via wallet_version_conflict.
create function public.apply_training(
  p_player uuid,
  p_kind text,
  p_stat text,
  p_grade text,
  p_expected_stat smallint,
  p_expected_ap smallint,
  p_stat_after smallint,
  p_ap_after smallint,
  p_ap smallint,
  p_xp integer,
  p_level integer,
  p_coin integer,
  p_limit integer,
  p_expected_version integer,
  p_energy smallint,
  p_energy_updated_at timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_day date := mahalle_today();
  v_stat smallint;
  v_ap smallint;
  v_seq integer;
begin
  if p_stat not in ('shooting', 'passing', 'pace', 'stamina') then raise exception 'bad_stat'; end if;
  execute format('select %I, %I from player_stats where player_id = $1 for update', p_stat, 'ap_' || p_stat)
     into v_stat, v_ap using p_player;
  if v_stat is distinct from p_expected_stat or v_ap is distinct from p_expected_ap then
    raise exception 'training_conflict' using errcode = '40001';
  end if;

  select count(*) into v_seq from training_log where player_id = p_player and day = v_day and kind = p_kind;
  if p_limit is not null and v_seq >= p_limit then raise exception 'limit'; end if;

  if p_kind = 'energy' then
    update wallets
       set energy = p_energy, energy_updated_at = p_energy_updated_at, version = version + 1
     where player_id = p_player and version = p_expected_version;
    if not found then raise exception 'wallet_version_conflict' using errcode = '40001'; end if;
  elsif p_kind = 'private' then
    begin
      perform grant_currency(p_player, 'coin', -p_coin, 'private_training', p_stat,
                             'train:' || p_player::text || ':' || v_day::text || ':' || (v_seq + 1)::text);
    exception when check_violation then
      raise exception 'no_coin';
    end;
  end if;

  execute format('update player_stats set %I = $1, %I = $2 where player_id = $3', p_stat, 'ap_' || p_stat)
    using p_stat_after, p_ap_after, p_player;
  update players set xp = xp + p_xp, level = greatest(level, p_level) where id = p_player;
  insert into training_log (player_id, day, kind, stat, grade, ap, xp, coin)
  values (p_player, v_day, p_kind, p_stat, p_grade, p_ap, p_xp, case when p_kind = 'private' then p_coin else 0 end);
end $$;

revoke execute on function public.apply_training from public, anon, authenticated;
grant execute on function public.apply_training to service_role;

-- Today's training counts for the caller.
create function public.antrenman_bugun() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'free', count(*) filter (where kind = 'free'),
    'energy', count(*) filter (where kind = 'energy'),
    'private', count(*) filter (where kind = 'private')
  )
  from training_log where player_id = auth.uid() and day = mahalle_today();
$$;
revoke all on function public.antrenman_bugun() from public, anon;
grant execute on function public.antrenman_bugun() to authenticated;
