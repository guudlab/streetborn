-- Gem packs bought for money on the web through Dodo Payments (Merchant of Record).
-- `dodo-checkout` writes a pending row and opens Dodo's hosted checkout with the
-- row id in the payment metadata. `dodo-webhook` checks Dodo's signature and calls
-- complete_gem_purchase(), which pays the gems from the row (never from the
-- webhook body) through grant_currency() with the payment id as idempotency key.
-- Refunds and lost disputes take the gems back, as far as the balance allows.
-- The app on iOS/Android does not sell through Dodo (store rules); it gets
-- RevenueCat later and can share this table through `provider`.

create table public.gem_purchases (
  id                  uuid primary key default gen_random_uuid(),
  -- Kept (as null) when the account is deleted: it is a payment record.
  player_id           uuid references public.players (id) on delete set null,
  provider            text not null default 'dodo' check (provider in ('dodo')),
  pack                text not null,
  gem                 integer not null check (gem > 0),
  product_id          text not null,
  test_mode           boolean not null,
  checkout_session_id text unique,
  payment_id          text unique,
  status              text not null default 'pending' check (status in ('pending', 'paid', 'reversed')),
  created_at          timestamptz not null default now(),
  paid_at             timestamptz,
  reversed_at         timestamptz,
  reversed_gem        integer
);
create index gem_purchases_player on public.gem_purchases (player_id, created_at desc);
alter table public.gem_purchases enable row level security;
revoke insert, update, delete, truncate on public.gem_purchases from anon, authenticated;
-- The app polls its own purchase after Dodo sends the player back.
create policy gem_purchases_own on public.gem_purchases for select to authenticated using (player_id = auth.uid());

-- Every verified webhook, for support and audits. webhook-id makes Dodo's retries visible.
create table public.payment_events (
  webhook_id  text primary key,
  provider    text not null,
  type        text not null,
  payment_id  text,
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

-- Pays a pending purchase once. Returns 'paid', 'duplicate' (already paid or
-- reversed), 'unknown' (no such row) or 'mismatch' (the payment is for another
-- product or checkout than the row).
create function public.complete_gem_purchase(
  p_purchase uuid, p_payment text, p_session text, p_products text[]
) returns text
language plpgsql security definer set search_path = public as $$
declare
  r gem_purchases;
begin
  select * into r from gem_purchases where id = p_purchase for update;
  if not found then return 'unknown'; end if;
  if r.status <> 'pending' then return 'duplicate'; end if;
  if not (r.product_id = any (p_products)) or (p_session is not null and r.checkout_session_id is distinct from p_session) then
    return 'mismatch';
  end if;

  update gem_purchases set status = 'paid', payment_id = p_payment, paid_at = now() where id = p_purchase;
  -- A deleted account still gets its payment marked; there is no wallet to pay.
  if r.player_id is not null then
    perform grant_currency(r.player_id, 'gem', r.gem, 'gem_purchase', r.id::text, 'dodo:' || p_payment);
  end if;
  return 'paid';
end $$;

-- Takes the gems of a refunded or charged-back payment back, never below zero.
-- Returns the gems taken, or null when there is nothing (left) to reverse.
create function public.reverse_gem_purchase(p_payment text) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r gem_purchases;
  v_take integer := 0;
begin
  select * into r from gem_purchases where payment_id = p_payment for update;
  if not found or r.status <> 'paid' then return null; end if;
  if r.player_id is not null then
    select least(gem, r.gem) into v_take from wallets where player_id = r.player_id for update;
    v_take := coalesce(v_take, 0);
    perform grant_currency(r.player_id, 'gem', -v_take, 'gem_reversal', r.id::text, 'dodo-reverse:' || p_payment);
  end if;
  update gem_purchases set status = 'reversed', reversed_at = now(), reversed_gem = v_take where id = r.id;
  return v_take;
end $$;

revoke execute on function public.complete_gem_purchase, public.reverse_gem_purchase from public, anon, authenticated;
grant execute on function public.complete_gem_purchase, public.reverse_gem_purchase to service_role;
