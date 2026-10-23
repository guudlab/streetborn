-- Mahalle: a friend group of 2-12 players. Same rule as the rest of the schema:
-- clients never write. Every change goes through an Edge Function (service role)
-- that calls the SQL functions below; clients only read through the read
-- functions at the end, which see just the caller's own mahalle.

alter table public.players add column character jsonb;

create table public.mahalle (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 18),
  emblem      text not null default 'shield' check (emblem in ('shield', 'circle', 'diamond')),
  color       text not null default 'lime' check (color in ('lime', 'blue', 'red', 'purple', 'teal', 'white')),
  -- Invite code: 6 characters without 0/O/1/I.
  code        text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  is_open     boolean not null default false,
  captain_id  uuid references public.players (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index mahalle_open on public.mahalle (created_at desc) where is_open;

-- A player belongs to one mahalle at a time, so the player is the primary key.
create table public.mahalle_uye (
  player_id   uuid primary key references public.players (id) on delete cascade,
  mahalle_id  uuid not null references public.mahalle (id) on delete cascade,
  joined_at   timestamptz not null default now()
);
create index mahalle_uye_mahalle on public.mahalle_uye (mahalle_id);

alter table public.mahalle     enable row level security;
alter table public.mahalle_uye enable row level security;
-- No policies on purpose: reads go through the functions below.

-- ---------------------------------------------------------------------------
-- Writes (service role only; called by the `mahalle` and `profile-set` functions)
-- ---------------------------------------------------------------------------

create function public.mahalle_new_code() returns text
language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  -- A random UUID is 16 random bytes; this avoids depending on pgcrypto's schema.
  bytes bytea := uuid_send(gen_random_uuid());
  out text := '';
begin
  for i in 0..5 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return out;
end $$;

-- Errors use message codes the Edge Function maps to HTTP statuses:
-- already_member, not_found, full, not_open.
create function public.create_mahalle(
  p_player uuid, p_name text, p_emblem text, p_color text, p_open boolean
) returns table (id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_id uuid;
begin
  if exists (select 1 from mahalle_uye where player_id = p_player) then
    raise exception 'already_member';
  end if;
  loop
    v_code := mahalle_new_code();
    exit when not exists (select 1 from mahalle where mahalle.code = v_code);
  end loop;
  insert into mahalle (name, emblem, color, code, is_open, captain_id)
    values (p_name, p_emblem, p_color, v_code, p_open, p_player)
    returning mahalle.id into v_id;
  insert into mahalle_uye (player_id, mahalle_id) values (p_player, v_id);
  return query select v_id, v_code;
end $$;

-- Joins by invite code, or by id when the mahalle is open.
create function public.join_mahalle(p_player uuid, p_code text, p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_mahalle mahalle;
  v_members integer;
begin
  select * into v_mahalle from mahalle
    where (p_code is not null and mahalle.code = upper(p_code))
       or (p_code is null and mahalle.id = p_id)
    for update;
  if not found then raise exception 'not_found'; end if;
  if p_code is null and not v_mahalle.is_open then raise exception 'not_open'; end if;

  if exists (select 1 from mahalle_uye where player_id = p_player and mahalle_id = v_mahalle.id) then
    return v_mahalle.id;
  end if;
  if exists (select 1 from mahalle_uye where player_id = p_player) then
    raise exception 'already_member';
  end if;
  select count(*) into v_members from mahalle_uye where mahalle_id = v_mahalle.id;
  if v_members >= 12 then raise exception 'full'; end if;
  insert into mahalle_uye (player_id, mahalle_id) values (p_player, v_mahalle.id);
  return v_mahalle.id;
end $$;

-- Leaves the mahalle. The captain's role passes to the longest-standing member;
-- the last member leaving removes the mahalle.
create function public.leave_mahalle(p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mahalle_id uuid;
  v_next uuid;
begin
  select mahalle_id into v_mahalle_id from mahalle_uye where player_id = p_player;
  if not found then return; end if;
  perform 1 from mahalle where id = v_mahalle_id for update;
  delete from mahalle_uye where player_id = p_player;
  select player_id into v_next from mahalle_uye where mahalle_id = v_mahalle_id order by joined_at limit 1;
  if v_next is null then
    delete from mahalle where id = v_mahalle_id;
  else
    update mahalle set captain_id = v_next where id = v_mahalle_id and captain_id is not distinct from p_player;
  end if;
end $$;

create function public.set_profile(p_player uuid, p_nick text, p_character jsonb) returns void
language sql security definer set search_path = public as $$
  update players set nick = p_nick, character = p_character where id = p_player;
$$;

revoke all on function public.mahalle_new_code() from public, anon, authenticated;
revoke all on function public.create_mahalle(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.join_mahalle(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.leave_mahalle(uuid) from public, anon, authenticated;
revoke all on function public.set_profile(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_mahalle(uuid, text, text, text, boolean) to service_role;
grant execute on function public.join_mahalle(uuid, text, uuid) to service_role;
grant execute on function public.leave_mahalle(uuid) to service_role;
grant execute on function public.set_profile(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Reads (signed-in players)
-- ---------------------------------------------------------------------------

-- The caller's own mahalle with its members, or null.
create function public.mahalle_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'name', m.name, 'emblem', m.emblem, 'color', m.color, 'code', m.code,
    'isOpen', m.is_open, 'captainId', m.captain_id,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'playerId', u.player_id, 'nick', p.nick, 'level', p.level, 'joinedAt', u.joined_at
      ) order by u.joined_at), '[]'::jsonb)
      from mahalle_uye u join players p on p.id = u.player_id
      where u.mahalle_id = m.id
    )
  )
  from mahalle m join mahalle_uye me on me.mahalle_id = m.id
  where me.player_id = auth.uid();
$$;

-- What the invite screen shows before joining. Needs the exact code.
create function public.mahalle_preview(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'name', m.name, 'emblem', m.emblem, 'color', m.color,
    'memberCount', (select count(*) from mahalle_uye u where u.mahalle_id = m.id),
    'captainNick', (select p.nick from players p where p.id = m.captain_id)
  )
  from mahalle m
  where auth.uid() is not null and m.code = upper(p_code);
$$;

-- Open mahalles that still have room, newest first. Activity ordering comes with mahalle matches.
create function public.open_mahalleler(p_limit integer default 20) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row order by (row->>'createdAt') desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', m.id, 'name', m.name, 'emblem', m.emblem, 'color', m.color,
      'memberCount', count(u.player_id), 'createdAt', m.created_at
    ) as row
    from mahalle m join mahalle_uye u on u.mahalle_id = m.id
    where m.is_open and auth.uid() is not null
    group by m.id
    having count(u.player_id) < 12
    order by m.created_at desc
    limit least(greatest(p_limit, 1), 50)
  ) t;
$$;

revoke all on function public.mahalle_overview() from public, anon;
revoke all on function public.mahalle_preview(text) from public, anon;
revoke all on function public.open_mahalleler(integer) from public, anon;
grant execute on function public.mahalle_overview() to authenticated;
grant execute on function public.mahalle_preview(text) to authenticated;
grant execute on function public.open_mahalleler(integer) to authenticated;
