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

-- Mahalle: create, join, capacity, leave, privacy.
reset role;
insert into auth.users select ('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid from generate_series(1, 13) g;
insert into players (id, nick) select ('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid, 'P' || g from generate_series(1, 13) g
  on conflict do nothing;
set role service_role;
select id as mid, code as mcode from create_mahalle('00000000-0000-0000-0000-000000000101', 'Çınaraltı', 'shield', 'lime', true) \gset
do $$ begin
  begin perform create_mahalle('00000000-0000-0000-0000-000000000101', 'Baska', 'shield', 'lime', false); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'already_member' then raise; end if; end;
end $$;
select join_mahalle(('00000000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid, lower(:'mcode'), null) from generate_series(2, 12) g;
do $$ begin
  begin perform join_mahalle('00000000-0000-0000-0000-000000000113', null, (select id from mahalle)); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'full' then raise; end if; end;
  begin perform join_mahalle('00000000-0000-0000-0000-000000000113', 'AAAAAA', null); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'not_found' then raise; end if; end;
  if (select count(*) from mahalle_uye) <> 12 then raise exception 'mahalle should hold 12'; end if;
  raise notice 'mahalle capacity: ok';
end $$;
select leave_mahalle('00000000-0000-0000-0000-000000000101');
do $$ begin
  if (select captain_id from mahalle) <> '00000000-0000-0000-0000-000000000102' then raise exception 'captain not handed over'; end if;
  raise notice 'mahalle captain handover: ok';
end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000105';
do $$ begin
  if jsonb_array_length(mahalle_overview()->'members') <> 11 then raise exception 'overview should list 11 members'; end if;
  if (select count(*) from mahalle) <> 0 then raise exception 'RLS leak: mahalle readable directly'; end if;
  begin insert into mahalle_uye values ('00000000-0000-0000-0000-000000000105', gen_random_uuid()); raise exception 'should have failed';
  exception when insufficient_privilege then null; end;
  raise notice 'mahalle rls: ok';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000113';
do $$ begin
  if mahalle_overview() is not null then raise exception 'outsider sees a mahalle'; end if;
  begin perform join_mahalle('00000000-0000-0000-0000-000000000113', 'AAAAAA', null); raise exception 'should have failed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Mahalle match: one a day, contribution, settlement, bonuses paid once, cheers, privacy.
reset role;
set role service_role;
select begin_mahalle_match('00000000-0000-0000-0000-000000000102',0,4::smallint,now(),2::smallint,1,3::smallint,40::smallint,40::smallint,40::smallint,40::smallint,now()+interval '20 min','{"name":"Test Mahallesi","goalkeeping":40,"attack":40}') as mm \gset
select begin_mahalle_match('00000000-0000-0000-0000-000000000103',0,4::smallint,now(),2::smallint,2,3::smallint,40::smallint,40::smallint,40::smallint,40::smallint,now()+interval '20 min','{"name":"Test Mahallesi","goalkeeping":40,"attack":40}') as mm2 \gset
do $$ begin
  begin perform begin_mahalle_match('00000000-0000-0000-0000-000000000102',1,3::smallint,now(),2::smallint,3,3::smallint,40::smallint,40::smallint,40::smallint,40::smallint,now()+interval '20 min','{}'); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'already_played' then raise; end if; end;
  begin perform begin_mahalle_match('00000000-0000-0000-0000-000000000113',0,4::smallint,now(),2::smallint,3,3::smallint,40::smallint,40::smallint,40::smallint,40::smallint,now()+interval '20 min','{}'); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'not_member' then raise; end if; end;
  raise notice 'mahalle match once a day: ok';
end $$;
select * from finish_match(:'mm','00000000-0000-0000-0000-000000000102',2::smallint,1::smallint,1::smallint,1::smallint,2::smallint,1::smallint,80::smallint,90000,'[]'::jsonb,'{}',100,50,2);
select * from finish_match(:'mm2','00000000-0000-0000-0000-000000000103',2::smallint,1::smallint,0::smallint,0::smallint,0::smallint,1::smallint,50::smallint,90000,'[]'::jsonb,'{}',20,40,1);
do $$ begin
  if (select count(*) from mahalle_katki) <> 2 then raise exception 'contributions missing'; end if;
  -- Mahalle matches stay out of the daily cap sum (reason mahalle_match, not match).
  if match_coin_today('00000000-0000-0000-0000-000000000102') <> 0 then raise exception 'mahalle match counted in the cap'; end if;
  raise notice 'mahalle contribution: ok';
end $$;
-- Nothing to settle while the day is still running.
do $$ begin
  if (select count(*) from mahalle_to_settle(24, 3)) <> 0 then raise exception 'open day offered for settlement'; end if;
end $$;
-- Cheers: only for teammates who played today.
select give_cheer('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000102',1::smallint,3,3,5,10,1,1,1);
do $$ begin
  begin perform give_cheer('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000102',1::smallint,3,3,5,10,1,1,1); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'already_cheered' then raise; end if; end;
  begin perform give_cheer('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000104',1::smallint,3,3,5,10,1,1,1); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'not_played' then raise; end if; end;
  if (select respect from players where id = '00000000-0000-0000-0000-000000000102') <> 1 then raise exception 'cheer respect missing'; end if;
  raise notice 'mahalle cheers: ok';
end $$;
-- Move the day into the past, as if midnight passed, then settle.
update mahalle_gun set day = day - 1;
update mahalle_katki set day = day - 1;
select count(*) as to_settle from mahalle_to_settle(24, 3) \gset
do $$ declare m uuid := (select id from mahalle); begin
  if (select count(*) from mahalle_to_settle(24, 3)) <> 11 then raise exception 'settlement rows should cover all 11 members'; end if;
  if not settle_mahalle_day(m, (select day from mahalle_gun), 3::smallint, 1::smallint, 'W',
       '{"motm":"x"}', '[{"player":"00000000-0000-0000-0000-000000000102","coin":60,"xp":40,"level":2,"respect":9},{"player":"00000000-0000-0000-0000-000000000103","coin":60,"xp":25,"level":1,"respect":-2}]') then
    raise exception 'first settlement should apply';
  end if;
  if settle_mahalle_day(m, (select day from mahalle_gun), 9::smallint, 9::smallint, 'L', '{}', '[{"player":"00000000-0000-0000-0000-000000000102","coin":999,"xp":0,"level":1,"respect":0}]') then
    raise exception 'closed day settled twice';
  end if;
  if (select coin from wallets where player_id = '00000000-0000-0000-0000-000000000102') <> 160 then raise exception 'mahalle bonus paid wrong (100 match + 60 bonus)'; end if;
  if (select respect from players where id = '00000000-0000-0000-0000-000000000103') <> 0 then raise exception 'respect must not go below 0'; end if;
  if (select count(*) from mahalle_to_settle(24, 3)) <> 0 then raise exception 'closed day offered again'; end if;
  raise notice 'mahalle settlement: ok';
end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000102';
do $$ begin
  if (select count(*) from mahalle_katki) <> 0 or (select count(*) from mahalle_gun) <> 0 then raise exception 'RLS leak: mahalle match tables readable'; end if;
  if mahalle_bugun()->'last'->>'result' <> 'W' then raise exception 'mahalle_bugun should show the settled day'; end if;
  begin perform settle_mahalle_day(gen_random_uuid(), current_date, 0::smallint, 0::smallint, 'D', '{}', '[]'); raise exception 'should have failed';
  exception when insufficient_privilege then null; end;
  raise notice 'mahalle match rls: ok';
end $$;
reset role;
