-- Smoke test for the ledger, match functions and RLS. Run by supabase/tests/run.sh.
insert into auth.users values ('00000000-0000-0000-0000-000000000001');
set role service_role;
select grant_currency('00000000-0000-0000-0000-000000000001','gem',100,'iap','x','iap:1');
select grant_currency('00000000-0000-0000-0000-000000000001','gem',100,'iap','x','iap:1') as same_again;
select begin_match('00000000-0000-0000-0000-000000000001',0,4::smallint,now(),2::smallint,12345,3::smallint,40::smallint,40::smallint,40::smallint,40::smallint,now()+interval '20 min') as m \gset
select * from finish_match(:'m','00000000-0000-0000-0000-000000000001',2::smallint,1::smallint,1::smallint,1::smallint,2::smallint,1::smallint,75::smallint,90000,'[]'::jsonb,'{}',70,300,3);
select * from finish_match(:'m','00000000-0000-0000-0000-000000000001',2::smallint,1::smallint,1::smallint,1::smallint,2::smallint,1::smallint,75::smallint,90000,'[]'::jsonb,'{}',999,300,3);
select match_coin_today('00000000-0000-0000-0000-000000000001');
select currency, delta, balance_after, reason from ledger order by id;
reset role;
do $$ begin
  -- The second finish_match must not pay again (coin 70, not 70 + 999).
  if (select coin from wallets) <> 70 then raise exception 'finish_match paid twice'; end if;
  if (select level from players) <> 3 or (select xp from players) <> 300 then raise exception 'xp/level not applied'; end if;
  raise notice 'match finish idempotent: ok';
  begin perform grant_currency('00000000-0000-0000-0000-000000000001','coin',-1000,'x','x','neg'); raise exception 'should have failed';
  exception when check_violation then raise notice 'negative balance refused: ok'; end;
  begin update ledger set delta = 0; raise exception 'should have failed';
  exception when raise_exception then raise notice 'ledger update refused: ok'; end;
end $$;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select coin, gem, energy from wallets;
do $$ begin
  begin update wallets set coin = 999999; raise exception 'should have failed';
  exception when insufficient_privilege then raise notice 'client write refused: ok'; end;
  begin perform grant_currency('00000000-0000-0000-0000-000000000001','coin',1,'x','x','c'); raise exception 'should have failed';
  exception when insufficient_privilege then raise notice 'client grant refused: ok'; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select count(*) as other_player_sees from wallets;
do $$ begin
  if (select count(*) from wallets) <> 0 then raise exception 'RLS leak: another player can see wallets'; end if;
  raise notice 'rls isolation: ok';
end $$;
