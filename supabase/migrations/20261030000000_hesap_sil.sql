-- Account deletion from inside the app (App Store guideline 5.1.1(v), KVKK article 7).
-- The account-delete Edge Function calls delete_account() and then removes the auth user.
-- Deleting the players row cascades through every per-player table (wallet, ledger,
-- inventory, matches, career, mahalle membership, cheers, reports, blocks). Rows that
-- only point at the player for someone else's sake (iap_events and ad_events for store
-- refunds and fraud checks, the rival in another player's weekly duel) keep the row and
-- set player_id to null, so nothing left behind names the person.

create function public.delete_account(p_player uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  -- Hand the captaincy on (or close an empty mahalle) the same way leaving does,
  -- instead of the cascade leaving a mahalle without a captain.
  perform leave_mahalle(p_player);
  delete from players where id = p_player;
  return found;
end $$;

revoke all on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;
