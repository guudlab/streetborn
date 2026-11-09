-- Other players' profiles and player search. Same pattern as the rest: no client writes and
-- no new RLS policy on players (that would open level, xp and every other column). The
-- `oyuncu` Edge Function calls these service-role functions, and they return only the fields
-- listed in oyuncu_profil. Nothing economic (coin, gems, inventory, ledger) is ever returned.

-- Player code: 6 characters from the mahalle-code alphabet, shown on the profile and searchable.
create function public.oyuncu_new_kod() returns text
language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.players where kod = candidate);
  end loop;
  return candidate;
end $$;

alter table public.players add column kod text;
update public.players set kod = public.oyuncu_new_kod() where kod is null;
alter table public.players
  alter column kod set default public.oyuncu_new_kod(),
  alter column kod set not null,
  add constraint players_kod_unique unique (kod),
  add constraint players_kod_format check (kod ~ '^[A-HJ-NP-Z2-9]{6}$');
-- Players can leave the search; their profile still opens from their mahalle and duel.
alter table public.players add column aranabilir boolean not null default true;

-- Lookup log for the rate limits. Rows older than two days are pruned on insert.
create table public.oyuncu_sorgu (
  id         bigint generated always as identity primary key,
  player_id  uuid not null references public.players (id) on delete cascade,
  kind       text not null check (kind in ('ara', 'profil')),
  created_at timestamptz not null default now()
);
create index oyuncu_sorgu_player on public.oyuncu_sorgu (player_id, kind, created_at desc);
alter table public.oyuncu_sorgu enable row level security;
-- No policies on purpose.

-- Lower case without Turkish accents, so "ÇAĞLAR" finds "caglar".
create function public.nick_key(p text) returns text
language sql immutable as $$
  select translate(lower(replace(replace(coalesce(p, ''), 'İ', 'i'), 'I', 'i')), 'çğıöşüâîû', 'cgiosuaiu');
$$;
create index players_nick_key on public.players (public.nick_key(nick) text_pattern_ops);

-- Hidden from search once three different players reported them in 30 days (a review follows).
create function public.oyuncu_gizli(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from players where id = p_player and aranabilir)
      or (select count(distinct reporter_id) from reports where target_id = p_player and created_at > now() - interval '30 days') >= 3;
$$;

-- Counts one lookup and refuses past the limit. Errors: too_many.
create function public.oyuncu_sorgu_say(p_from uuid, p_kind text, p_limit integer, p_window interval) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from oyuncu_sorgu where created_at < now() - interval '2 days';
  if (select count(*) from oyuncu_sorgu where player_id = p_from and kind = p_kind and created_at > now() - p_window) >= p_limit then
    raise exception 'too_many';
  end if;
  insert into oyuncu_sorgu (player_id, kind) values (p_from, p_kind);
end $$;

-- A profile by id or by code. Returns null when the player cannot be seen: unknown, blocked in
-- either direction, or private and not a mahalle mate or duel rival. Errors: too_many.
create function public.oyuncu_profil(p_from uuid, p_id uuid, p_kod text) returns jsonb
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
    'trophyCount', (select count(*) from basarimlar where player_id = p.id)
  ) into result
  from players p join player_stats s on s.player_id = p.id
  where p.id = target;
  return result;
end $$;

-- Search by nick prefix (3+ characters) or exact player code. At most 20 hits, never the caller,
-- blocked players or players hidden from search. Errors: too_many (60 searches a day), short.
create function public.oyuncu_ara(p_from uuid, p_q text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  q text := nick_key(btrim(p_q));
  code text := upper(btrim(p_q));
begin
  if char_length(q) < 3 then raise exception 'short'; end if;
  perform oyuncu_sorgu_say(p_from, 'ara', 60, interval '1 day');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'kod', p.kod, 'nick', p.nick, 'level', p.level, 'character', p.character,
      'mahalle', (select mh.name from mahalle_uye u join mahalle mh on mh.id = u.mahalle_id where u.player_id = p.id)
    ) order by p.level desc, p.nick)
    from (
      select * from players p
       where p.id <> p_from and p.nick is not null
         and (p.kod = code or nick_key(p.nick) like replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
         and not oyuncu_gizli(p.id)
         and not exists (select 1 from blocks b where (b.blocker_id = p_from and b.blocked_id = p.id) or (b.blocker_id = p.id and b.blocked_id = p_from))
       order by p.level desc, p.nick limit 20
    ) p
  ), '[]'::jsonb);
end $$;

-- The player's own search switch. Returns the new value.
create function public.oyuncu_aranabilir(p_player uuid, p_value boolean) returns boolean
language sql security definer set search_path = public as $$
  update players set aranabilir = p_value where id = p_player returning aranabilir;
$$;

revoke all on function public.oyuncu_new_kod(), public.oyuncu_gizli(uuid), public.oyuncu_sorgu_say(uuid, text, integer, interval),
  public.oyuncu_profil(uuid, uuid, text), public.oyuncu_ara(uuid, text), public.oyuncu_aranabilir(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.oyuncu_new_kod(), public.oyuncu_gizli(uuid), public.oyuncu_sorgu_say(uuid, text, integer, interval),
  public.oyuncu_profil(uuid, uuid, text), public.oyuncu_ara(uuid, text), public.oyuncu_aranabilir(uuid, boolean)
  to service_role;
