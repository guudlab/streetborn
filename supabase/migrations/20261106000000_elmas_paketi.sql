-- Gem packs bought for money in the App Store / Google Play, through RevenueCat.
-- The app sets the player id as RevenueCat's app user id. Gems are paid from two
-- sources that may come in either order: the `revenuecat-webhook` Edge Function
-- and the app's `iap` sync call (which reads the player's purchases from
-- RevenueCat's REST API). Both call grant_gem_purchase(); the store transaction id
-- pays each purchase once, through grant_currency(). The gem count comes from the
-- economy config on the server, never from the client or the webhook body.
-- A refund takes the gems back, as far as the balance allows.

create table public.gem_purchases (
  id              uuid primary key default gen_random_uuid(),
  -- Kept (as null) when the account is deleted: it is a payment record.
  player_id       uuid references public.players (id) on delete set null,
  provider        text not null default 'revenuecat' check (provider in ('revenuecat')),
  store           text not null,
  transaction_id  text not null unique,
  product_id      text not null,
  gem             integer not null check (gem > 0),
  sandbox         boolean not null,
  status          text not null default 'paid' check (status in ('paid', 'reversed')),
  created_at      timestamptz not null default now(),
  reversed_at     timestamptz,
  reversed_gem    integer
);
create index gem_purchases_player on public.gem_purchases (player_id, created_at desc);
alter table public.gem_purchases enable row level security;
revoke insert, update, delete, truncate on public.gem_purchases from anon, authenticated;
create policy gem_purchases_own on public.gem_purchases for select to authenticated using (player_id = auth.uid());

-- Every authenticated webhook, for support and audits; RevenueCat's event id makes retries visible.
create table public.payment_events (
  event_id    text primary key,
  provider    text not null,
  type        text not null,
  transaction_id text,
  outcome     text,
  payload     jsonb not null,
  received_at timestamptz not null default now()
);
alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon, authenticated;
-- No policies on purpose: service role only.

-- ---------------------------------------------------------------------------
-- Writes (service role only)
-- ---------------------------------------------------------------------------

-- Pays one store purchase once. Returns 'paid', 'duplicate' or 'no_player'
-- (the account was deleted; the store refund is RevenueCat's/the store's business).
create function public.grant_gem_purchase(
  p_player uuid, p_store text, p_tx text, p_product text, p_gem integer, p_sandbox boolean
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform 1 from players where id = p_player;
  if not found then return 'no_player'; end if;
  insert into gem_purchases (player_id, store, transaction_id, product_id, gem, sandbox)
  values (p_player, p_store, p_tx, p_product, p_gem, p_sandbox)
  on conflict (transaction_id) do nothing
  returning id into v_id;
  if v_id is null then return 'duplicate'; end if;
  perform grant_currency(p_player, 'gem', p_gem, 'gem_purchase', v_id::text, 'iap:' || p_tx);
  return 'paid';
end $$;

-- Takes the gems of a refunded purchase back, never below zero.
-- Returns the gems taken, or null when there is nothing (left) to reverse.
create function public.reverse_gem_purchase(p_tx text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r gem_purchases;
  v_take integer := 0;
begin
  select * into r from gem_purchases where transaction_id = p_tx for update;
  if not found or r.status <> 'paid' then return null; end if;
  if r.player_id is not null then
    select least(gem, r.gem) into v_take from wallets where player_id = r.player_id for update;
    v_take := coalesce(v_take, 0);
    perform grant_currency(r.player_id, 'gem', -v_take, 'gem_reversal', r.id::text, 'iap-reverse:' || p_tx);
  end if;
  update gem_purchases set status = 'reversed', reversed_at = now(), reversed_gem = v_take where id = r.id;
  return v_take;
end $$;

revoke execute on function public.grant_gem_purchase, public.reverse_gem_purchase from public, anon, authenticated;
grant execute on function public.grant_gem_purchase, public.reverse_gem_purchase to service_role;
