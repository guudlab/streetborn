-- Phone events: once a day someone from the player's life sends a message with two
-- answers (packages/economy telefon.ts). The `oyuncu` Edge Function picks the day's event
-- from a seed and computes the answer's effects; this function only stores the answer and
-- applies them atomically. One answer a day; coin moves through grant_currency() with a
-- per-day idempotency key, and a cost above the balance fails on the wallet's CHECK.

create table public.telefon_cevap (
  player_id  uuid not null references public.players (id) on delete cascade,
  day        date not null,
  event_key  text not null,
  answer     smallint not null check (answer in (0, 1)),
  created_at timestamptz not null default now(),
  primary key (player_id, day)
);

alter table public.telefon_cevap enable row level security;
-- No policies on purpose.

-- Errors: already_answered; a coin cost above the balance fails with code 23514.
create function public.telefon_cevapla(
  p_player uuid, p_day date, p_key text, p_answer smallint,
  p_morale integer, p_respect integer, p_trust integer, p_coin integer
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into telefon_cevap (player_id, day, event_key, answer) values (p_player, p_day, p_key, p_answer)
    on conflict do nothing;
  if not found then raise exception 'already_answered'; end if;
  if p_coin <> 0 then
    perform grant_currency(p_player, 'coin', p_coin, 'telefon', p_key, 'telefon:' || p_player::text || ':' || p_day::text);
  end if;
  if p_morale <> 0 then
    insert into kariyer_durum (player_id) values (p_player) on conflict do nothing;
    update kariyer_durum set morale = greatest(0, least(100, morale + p_morale)), updated_at = now() where player_id = p_player;
  end if;
  if p_respect <> 0 or p_trust <> 0 then
    update players
       set respect = greatest(0, respect + p_respect),
           coach_trust = greatest(0, least(100, coach_trust + p_trust))
     where id = p_player;
  end if;
end $$;

revoke execute on function public.telefon_cevapla from public, anon, authenticated;
grant execute on function public.telefon_cevapla to service_role;
