-- Report and block (store rule for apps with user-generated names). Same pattern as
-- the rest: no client writes, the Edge Function calls the service-role functions.

create table public.reports (
  id          bigint generated always as identity primary key,
  reporter_id uuid not null references public.players (id) on delete cascade,
  target_id   uuid not null references public.players (id) on delete cascade,
  reason      text not null check (reason in ('abuse', 'harassment', 'spam', 'other')),
  nick        text,
  created_at  timestamptz not null default now()
);
create index reports_target on public.reports (target_id, created_at desc);

create table public.blocks (
  blocker_id uuid not null references public.players (id) on delete cascade,
  blocked_id uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.reports enable row level security;
alter table public.blocks  enable row level security;
-- No policies on purpose: reads go through engellenenler().

-- Errors: self, not_found, too_many (5 reports a day per reporter).
-- The nick is copied so a later rename cannot hide the reported name from review.
create function public.report_player(p_from uuid, p_to uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_from = p_to then raise exception 'self'; end if;
  if not exists (select 1 from players where id = p_to) then raise exception 'not_found'; end if;
  if (select count(*) from reports where reporter_id = p_from and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too_many';
  end if;
  insert into reports (reporter_id, target_id, reason, nick)
  values (p_from, p_to, p_reason, (select nick from players where id = p_to));
end $$;

create function public.block_player(p_from uuid, p_to uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_from = p_to then raise exception 'self'; end if;
  if not exists (select 1 from players where id = p_to) then raise exception 'not_found'; end if;
  insert into blocks (blocker_id, blocked_id) values (p_from, p_to) on conflict do nothing;
end $$;

create function public.unblock_player(p_from uuid, p_to uuid) returns void
language sql security definer set search_path = public as $$
  delete from blocks where blocker_id = p_from and blocked_id = p_to;
$$;

-- Ids the caller blocked.
create function public.engellenenler() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(blocked_id), '[]'::jsonb) from blocks where blocker_id = auth.uid();
$$;

-- A cheer never crosses a block in either direction.
create or replace function public.give_cheer(
  p_from uuid, p_to uuid, p_phrase smallint, p_per_day integer, p_received_max integer,
  p_xp_giver integer, p_xp_receiver integer, p_level_giver integer, p_level_receiver integer, p_respect integer
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mahalle uuid;
  v_day date := mahalle_today();
begin
  if p_from = p_to then raise exception 'self'; end if;
  select mahalle_id into v_mahalle from mahalle_uye where player_id = p_from;
  if v_mahalle is null or not exists (select 1 from mahalle_uye where player_id = p_to and mahalle_id = v_mahalle) then
    raise exception 'not_member';
  end if;
  if exists (select 1 from blocks where (blocker_id = p_from and blocked_id = p_to) or (blocker_id = p_to and blocked_id = p_from)) then
    raise exception 'blocked';
  end if;
  if not exists (select 1 from mahalle_katki where mahalle_id = v_mahalle and day = v_day and player_id = p_to) then
    raise exception 'not_played';
  end if;
  if exists (select 1 from mahalle_tezahurat where day = v_day and from_player = p_from and to_player = p_to) then
    raise exception 'already_cheered';
  end if;
  if (select count(*) from mahalle_tezahurat where day = v_day and from_player = p_from) >= p_per_day
     or (select count(*) from mahalle_tezahurat where day = v_day and to_player = p_to) >= p_received_max then
    raise exception 'too_many';
  end if;

  insert into mahalle_tezahurat (mahalle_id, day, from_player, to_player, phrase)
  values (v_mahalle, v_day, p_from, p_to, p_phrase);
  update players set xp = xp + p_xp_giver, level = greatest(level, p_level_giver) where id = p_from;
  update players set xp = xp + p_xp_receiver, level = greatest(level, p_level_receiver), respect = respect + p_respect
   where id = p_to;
end $$;

revoke execute on function public.report_player, public.block_player, public.unblock_player, public.give_cheer
  from public, anon, authenticated;
grant execute on function public.report_player, public.block_player, public.unblock_player, public.give_cheer
  to service_role;
revoke all on function public.engellenenler() from public, anon;
grant execute on function public.engellenenler() to authenticated;
