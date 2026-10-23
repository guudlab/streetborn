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

-- Report and block.
set role service_role;
select report_player('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000102','abuse');
select block_player('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000104');
select block_player('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000104');
do $$ begin
  if (select nick from reports) <> 'P2' then raise exception 'report should keep the nick'; end if;
  begin perform report_player('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000103','spam'); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'self' then raise; end if; end;
  for i in 1..4 loop perform report_player('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000102','spam'); end loop;
  begin perform report_player('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000102','spam'); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'too_many' then raise; end if; end;
  raise notice 'report limit: ok';
end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000103';
do $$ begin
  if jsonb_array_length(engellenenler()) <> 1 then raise exception 'blocked list wrong'; end if;
  if (select count(*) from reports) <> 0 or (select count(*) from blocks) <> 0 then raise exception 'RLS leak: reports or blocks readable'; end if;
  raise notice 'block rls: ok';
end $$;
reset role;

-- Club career: offers, trial, contract, salary, league match, missed days, season end.
set role service_role;
select create_offers('00000000-0000-0000-0000-000000000105',
  '[{"kind":"direct","tier":0,"clubKey":"kartaltepe","clubName":"Kartaltepe SK","salaryWeekly":700},
    {"kind":"trial","tier":0,"clubKey":"bogazici","clubName":"Boğaziçi Gençlik FK","salaryWeekly":770}]') as offers_made;
select id as trial_offer from offers where kind = 'trial' \gset
select id as direct_offer from offers where kind = 'direct' \gset
do $$ begin
  if create_offers('00000000-0000-0000-0000-000000000105', '[{"kind":"direct","tier":0,"clubKey":"x","clubName":"X","salaryWeekly":1}]') <> 0 then
    raise exception 'offers duplicated while live ones exist';
  end if;
  begin perform accept_offer('00000000-0000-0000-0000-000000000105', (select id from offers where kind = 'trial'), '[]', 20, 50::smallint); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'needs_trial' then raise; end if; end;
  raise notice 'offers: ok';
end $$;
select begin_fixture_match('00000000-0000-0000-0000-000000000105',0,4::smallint,now(),2::smallint,7,3::smallint,40::smallint,40::smallint,70::smallint,80::smallint,now()+interval '20 min','trial',null,null,:'trial_offer') as tm \gset
select * from finish_match(:'tm','00000000-0000-0000-0000-000000000105',2::smallint,1::smallint,1::smallint,0::smallint,1::smallint,0::smallint,75::smallint,90000,'[]'::jsonb,'{}',50,60,1,'{"trialPassed":true}');
do $$ begin
  if (select status from offers where kind = 'trial') <> 'trial_passed' then raise exception 'trial result not stored'; end if;
  if match_coin_today('00000000-0000-0000-0000-000000000105') <> 0 then raise exception 'trial match counted in the cap'; end if;
  raise notice 'trial match: ok';
end $$;
select accept_offer('00000000-0000-0000-0000-000000000105', :'direct_offer', '[{"key":"kartaltepe","name":"Kartaltepe SK","goalkeeping":70,"attack":80}]', 20, 50::smallint) as season \gset
do $$ begin
  if not (select active from contracts where player_id = '00000000-0000-0000-0000-000000000105') then raise exception 'contract missing'; end if;
  if (select status from offers where kind = 'trial') <> 'closed' then raise exception 'other offers not closed'; end if;
  if (select gem from wallets where player_id = '00000000-0000-0000-0000-000000000105') <> 20 then raise exception 'first contract gem missing'; end if;
  begin perform accept_offer('00000000-0000-0000-0000-000000000105', (select id from offers where kind = 'trial'), '[]', 20, 50::smallint); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'not_found' then raise; end if; end;
  if not claim_salary('00000000-0000-0000-0000-000000000105', current_date, 100) then raise exception 'salary not paid'; end if;
  if claim_salary('00000000-0000-0000-0000-000000000105', current_date, 100) then raise exception 'salary paid twice'; end if;
  raise notice 'contract and salary: ok';
end $$;
select begin_fixture_match('00000000-0000-0000-0000-000000000105',1,3::smallint,now(),2::smallint,8,3::smallint,40::smallint,40::smallint,70::smallint,80::smallint,now()+interval '20 min','league',:'season',0::smallint,null) as lm \gset
select * from finish_match(:'lm','00000000-0000-0000-0000-000000000105',2::smallint,1::smallint,1::smallint,0::smallint,2::smallint,1::smallint,80::smallint,90000,'[]'::jsonb,'{}',150,110,2,'{"trustDelta":4}');
do $$ declare s uuid := (select season_id from contracts where player_id = '00000000-0000-0000-0000-000000000105'); begin
  if (select us from league_days where season_id = s and round = 0) <> 2 then raise exception 'league result not stored'; end if;
  if (select coach_trust from players where id = '00000000-0000-0000-0000-000000000105') <> 54 then raise exception 'trust not applied'; end if;
  begin perform begin_fixture_match('00000000-0000-0000-0000-000000000105',2,2::smallint,now(),2::smallint,9,3::smallint,40::smallint,40::smallint,70::smallint,80::smallint,now()+interval '20 min','league',s,0::smallint,null); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'already_played' then raise; end if; end;
  if mark_missed_rounds('00000000-0000-0000-0000-000000000105', s, '[{"round":0,"us":0,"them":5},{"round":1,"us":1,"them":1},{"round":2,"us":0,"them":2}]', -6) <> 2 then
    raise exception 'missed rounds should skip the played one';
  end if;
  if mark_missed_rounds('00000000-0000-0000-0000-000000000105', s, '[{"round":1,"us":1,"them":1}]', -6) <> 0 then raise exception 'missed round counted twice'; end if;
  if (select coach_trust from players where id = '00000000-0000-0000-0000-000000000105') <> 42 then raise exception 'missed trust wrong'; end if;
  raise notice 'league match: ok';
  if not end_season('00000000-0000-0000-0000-000000000105', s, 1::smallint, 600,
       '[{"kind":"renew","tier":0,"clubKey":"kartaltepe","clubName":"Kartaltepe SK","salaryWeekly":720}]') then
    raise exception 'season should end';
  end if;
  if end_season('00000000-0000-0000-0000-000000000105', s, 1::smallint, 600, '[]') then raise exception 'season ended twice'; end if;
  if (select active from contracts where player_id = '00000000-0000-0000-0000-000000000105') then raise exception 'contract still active'; end if;
  if not exists (select 1 from ledger where idempotency_key = 'season:' || s::text and delta = 600) then raise exception 'season prize missing'; end if;
  raise notice 'season end: ok';
end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000105';
do $$ declare k jsonb := kariyer(); begin
  if jsonb_array_length(k->'offers') <> 1 or k->'offers'->0->>'kind' <> 'renew' then raise exception 'kariyer offers wrong: %', k->'offers'; end if;
  if k->'season'->>'status' <> 'done' or jsonb_array_length(k->'season'->'days') <> 3 then raise exception 'kariyer season wrong'; end if;
  if (select count(*) from contracts) <> 0 or (select count(*) from offers) <> 0 then raise exception 'RLS leak: career tables readable'; end if;
  raise notice 'career rls: ok';
end $$;
reset role;

-- Training: free drills limit, private session coin, stale-snapshot retry.
set role service_role;
do $$ declare p uuid := '00000000-0000-0000-0000-000000000106'; w record; begin
  select * into w from wallets where player_id = p;
  perform apply_training(p, 'free', 'shooting', 'perfect', 40::smallint, 0::smallint, 40::smallint, 2::smallint, 2::smallint, 30, 1, 0, 3, w.version, w.energy, w.energy_updated_at);
  perform apply_training(p, 'free', 'shooting', 'good', 40::smallint, 2::smallint, 41::smallint, 0::smallint, 1::smallint, 20, 1, 0, 3, w.version, w.energy, w.energy_updated_at);
  perform apply_training(p, 'free', 'passing', 'miss', 40::smallint, 0::smallint, 40::smallint, 0::smallint, 0::smallint, 8, 1, 0, 3, w.version, w.energy, w.energy_updated_at);
  begin perform apply_training(p, 'free', 'passing', 'miss', 40::smallint, 0::smallint, 40::smallint, 0::smallint, 0::smallint, 8, 1, 0, 3, w.version, w.energy, w.energy_updated_at); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'limit' then raise; end if; end;
  begin perform apply_training(p, 'free', 'shooting', 'good', 40::smallint, 0::smallint, 40::smallint, 1::smallint, 1::smallint, 20, 1, 0, null, w.version, w.energy, w.energy_updated_at); raise exception 'should have failed';
  exception when serialization_failure then null; end;
  if (select shooting from player_stats where player_id = p) <> 41 or (select xp from players where id = p) <> 58 then raise exception 'training not applied'; end if;
  begin perform apply_training(p, 'private', 'pace', null, 40::smallint, 0::smallint, 40::smallint, 2::smallint, 2::smallint, 15, 1, 100, 5, w.version, w.energy, w.energy_updated_at); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'no_coin' then raise; end if; end;
  perform grant_currency(p, 'coin', 150, 'test', 'x', 'test:train');
  perform apply_training(p, 'private', 'pace', null, 40::smallint, 0::smallint, 40::smallint, 2::smallint, 2::smallint, 15, 1, 100, 5, w.version, w.energy, w.energy_updated_at);
  if (select coin from wallets where player_id = p) <> 50 then raise exception 'private session cost wrong'; end if;
  raise notice 'training: ok';
end $$;
reset role;
