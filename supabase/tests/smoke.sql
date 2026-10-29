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

-- Shop: starting and level gems, refills, items, rewarded ads, privacy.
insert into auth.users values ('00000000-0000-0000-0000-000000000201');
set role service_role;
do $$ declare p uuid := '00000000-0000-0000-0000-000000000201'; w record; r jsonb; begin
  update players set level = 11 where id = p;
  r := claim_gems(p, 300, 30, array[5, 10, 15], 10);
  if r <> '{"coin": 300, "gem": 50, "levels": [5, 10]}'::jsonb then raise exception 'claim_gems paid %', r; end if;
  r := claim_gems(p, 300, 30, array[5, 10, 15], 10);
  if r <> '{"coin": 0, "gem": 0, "levels": []}'::jsonb then raise exception 'claim_gems paid twice: %', r; end if;
  raise notice 'start and level gems: ok';

  select * into w from wallets where player_id = p;
  perform refill_energy(p, 20, 2, w.version, 5::smallint);
  begin perform refill_energy(p, 20, 2, w.version, 5::smallint); raise exception 'should have failed';
  exception when serialization_failure then null; end;
  perform refill_energy(p, 20, 2, w.version + 1, 5::smallint);
  begin perform refill_energy(p, 20, 2, w.version + 2, 5::smallint); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'limit' then raise; end if; end;
  if (select gem from wallets where player_id = p) <> 10 then raise exception 'refill cost wrong'; end if;
  begin perform refill_energy(p, 20, 5, w.version + 2, 5::smallint); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'no_gem' then raise; end if; end;
  raise notice 'energy refill: ok';

  begin perform buy_item(p, 'forma_sonbahar'); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'no_gem' then raise; end if; end;
  perform grant_currency(p, 'gem', 200, 'test', 'x', 'test:shop');
  r := buy_item(p, 'forma_sonbahar');
  if r->>'balance' <> '90' or (select source from inventory where player_id = p) <> 'gem' then raise exception 'buy_item wrong: %', r; end if;
  begin perform buy_item(p, 'forma_sonbahar'); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'owned' then raise; end if; end;
  begin perform buy_item(p, 'yok'); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'not_for_sale' then raise; end if; end;
  perform equip_item(p, 'forma_sonbahar', true);
  if not (select equipped from inventory where player_id = p) then raise exception 'not equipped'; end if;
  raise notice 'items: ok';

  select * into w from wallets where player_id = p;
  if apply_ad_reward('tx1', p, 'u', 'ad_energy', null, 3, w.version, 4::smallint, now(), 0) <> 'ok' then raise exception 'ad energy'; end if;
  if apply_ad_reward('tx1', p, 'u', 'ad_energy', null, 3, w.version + 1, 5::smallint, now(), 0) <> 'duplicate' then raise exception 'ad retry paid'; end if;
  if apply_ad_reward('tx2', p, 'u', 'ad_double', 'm1', 2, null, null, null, 70) <> 'ok' then raise exception 'ad double'; end if;
  if apply_ad_reward('tx3', p, 'u', 'ad_double', 'm1', 2, null, null, null, 70) <> 'duplicate' then raise exception 'match doubled twice'; end if;
  if apply_ad_reward('tx4', p, 'u', 'ad_double', 'm2', 2, null, null, null, 0) <> 'capped' then raise exception 'capped double'; end if;
  if apply_ad_reward('tx5', p, 'u', 'ad_double', 'm3', 2, null, null, null, 30) <> 'ok' then raise exception 'second double'; end if;
  if apply_ad_reward('tx6', p, 'u', 'ad_double', 'm4', 2, null, null, null, 30) <> 'limit' then raise exception 'ad limit'; end if;
  if match_coin_today(p) <> 100 then raise exception 'ad double not under the daily cap'; end if;
  if (select energy from wallets where player_id = p) <> 4 then raise exception 'ad energy not applied'; end if;
  raise notice 'rewarded ads: ok';
end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000201';
do $$ declare r jsonb := dukkan_bugun(); begin
  if (r->>'refills')::int <> 2 or (r->>'adEnergy')::int <> 1 or (r->>'adDouble')::int <> 2 or jsonb_array_length(r->'items') <> 1 or r->'catalog'->0->>'priceGem' <> '120' then
    raise exception 'dukkan_bugun wrong: %', r;
  end if;
  if (select count(*) from shop_log) <> 0 then raise exception 'RLS leak: shop_log readable'; end if;
  if (select count(*) from inventory) <> 1 then raise exception 'inventory not visible to its owner'; end if;
  begin perform buy_item('00000000-0000-0000-0000-000000000201', 'forma_sonbahar'); raise exception 'should have failed';
  exception when insufficient_privilege then null; end;
  raise notice 'shop rls: ok';
end $$;
reset role;

-- Career features: morale, choice, injury, massage, achievements, weekly duel.
reset role;
insert into auth.users values ('00000000-0000-0000-0000-000000000301'), ('00000000-0000-0000-0000-000000000302');
set role service_role;
do $$
declare
  p constant uuid := '00000000-0000-0000-0000-000000000301';
  m1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  m2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
begin
  if not kariyer_mac_sonrasi(p, m1, 5, 1, 'ankle') then raise exception 'first match not counted'; end if;
  if kariyer_mac_sonrasi(p, m1, 5, 1, 'ankle') then raise exception 'match counted twice'; end if;
  if (select morale from kariyer_durum where player_id = p) <> 65 then raise exception 'morale wrong'; end if;
  -- A running injury is neither replaced nor extended.
  perform kariyer_mac_sonrasi(p, m2, -4, 2, 'knee');
  if (select injury_kind from kariyer_durum where player_id = p) <> 'ankle' or (select morale from kariyer_durum where player_id = p) <> 61 then
    raise exception 'injury replaced or morale wrong';
  end if;
  if (select injury_until from kariyer_durum where player_id = p) > now() + interval '1 day 1 minute' then raise exception 'injury extended'; end if;
  raise notice 'morale and injury: ok';

  perform kariyer_secim(p, '2026-10-28', 'hang', 5, 2);
  begin perform kariyer_secim(p, '2026-10-28', 'rest', 10, 0); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'already_chosen' then raise; end if; end;
  if (select respect from players where id = p) <> 2 or (select choice from kariyer_durum where player_id = p) <> 'hang' then raise exception 'choice not stored'; end if;
  -- The next finished match uses the choice up; the day stays taken.
  perform kariyer_mac_sonrasi(p, '00000000-0000-0000-0000-0000000000a3', 0, 0, null);
  if (select choice from kariyer_durum where player_id = p) is not null or (select choice_day from kariyer_durum where player_id = p) <> '2026-10-28' then
    raise exception 'choice not used up';
  end if;
  raise notice 'pre-match choice: ok';

  -- Massage: needs coin, ends the injury, only once.
  begin perform kariyer_masaj(p, 200); raise exception 'should have failed';
  exception when check_violation then null; end;
  perform grant_currency(p, 'coin', 500, 'test', 'x', 'massage-test');
  perform kariyer_masaj(p, 200);
  if (select coin from wallets where player_id = p) <> 300 or (select injury_until from kariyer_durum where player_id = p) is not null then raise exception 'massage not applied'; end if;
  begin perform kariyer_masaj(p, 200); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'not_injured' then raise; end if; end;
  raise notice 'massage: ok';

  -- Achievements pay once.
  if basarim_ac(p, '[{"key":"first_goal","coin":50},{"key":"ten_matches","coin":100}]') <> '["first_goal", "ten_matches"]'::jsonb then raise exception 'unlock wrong'; end if;
  if basarim_ac(p, '[{"key":"first_goal","coin":50}]') <> '[]'::jsonb then raise exception 'unlocked twice'; end if;
  if (select coin from wallets where player_id = p) <> 450 then raise exception 'achievement paid wrong'; end if;
  if (basarim_ozet(p)->>'level')::int <> 1 or (basarim_ozet(p)->>'matches')::int <> 0 then raise exception 'summary wrong: %', basarim_ozet(p); end if;
  raise notice 'achievements: ok';

  -- Weekly duel: opened once, settled once, a win pays.
  if rakip_ac(p, '2026-10-26', '00000000-0000-0000-0000-000000000302')->>'rivalId' <> '00000000-0000-0000-0000-000000000302' then raise exception 'duel not opened'; end if;
  if rakip_ac(p, '2026-10-26', null)->>'rivalId' <> '00000000-0000-0000-0000-000000000302' then raise exception 'duel rival replaced'; end if;
  if not rakip_kapat(p, '2026-10-26', 'win', 300, 3) then raise exception 'duel not settled'; end if;
  if rakip_kapat(p, '2026-10-26', 'win', 300, 3) then raise exception 'duel settled twice'; end if;
  if (select coin from wallets where player_id = p) <> 750 or (select respect from players where id = p) <> 5 then raise exception 'duel paid wrong'; end if;
  if (basarim_ozet(p)->>'duelWins')::int <> 1 then raise exception 'duel win not counted'; end if;
  raise notice 'weekly duel: ok';
end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000301';
do $$ begin
  if (select count(*) from kariyer_durum) <> 0 or (select count(*) from basarimlar) <> 0 or (select count(*) from rakip_hafta) <> 0 then
    raise exception 'RLS leak: career feature tables readable';
  end if;
  begin perform kariyer_masaj('00000000-0000-0000-0000-000000000301', 0); raise exception 'should have failed';
  exception when insufficient_privilege then null; end;
  begin perform basarim_ac('00000000-0000-0000-0000-000000000301', '[{"key":"x","coin":999999}]'); raise exception 'should have failed';
  exception when insufficient_privilege then null; end;
  raise notice 'career feature rls: ok';
end $$;
reset role;

-- Account deletion: every per-player row goes, the captaincy moves on, store events stay without a name.
insert into auth.users values ('00000000-0000-0000-0000-000000000401'), ('00000000-0000-0000-0000-000000000402');
set role service_role;
do $$
declare
  p uuid := '00000000-0000-0000-0000-000000000401';
  q uuid := '00000000-0000-0000-0000-000000000402';
  m uuid;
begin
  select id into m from create_mahalle(p, 'Silinecek', 'shield', 'lime', false);
  perform join_mahalle(q, (select code from mahalle where id = m), null);
  perform grant_currency(p, 'coin', 100, 'test', 'x', 'delete-test');
  insert into ad_events (transaction_id, player_id) values ('delete-test-ad', p);
  perform basarim_ac(p, '[{"key":"first_goal","coin":50}]');
  perform report_player(q, p, 'spam');

  if not delete_account(p) then raise exception 'account not deleted'; end if;
  if delete_account(p) then raise exception 'deleted twice'; end if;
  if exists (select 1 from players where id = p) or exists (select 1 from wallets where player_id = p)
    or exists (select 1 from ledger where player_id = p) or exists (select 1 from basarimlar where player_id = p)
    or exists (select 1 from mahalle_uye where player_id = p) or exists (select 1 from reports where target_id = p) then
    raise exception 'player rows left behind';
  end if;
  if (select captain_id from mahalle where id = m) <> q then raise exception 'captain not handed over on delete'; end if;
  if (select player_id from ad_events where transaction_id = 'delete-test-ad') is not null then raise exception 'ad event still names the player'; end if;
  if not exists (select 1 from players where id = q) then raise exception 'other player touched'; end if;

  -- The last member deleting closes the mahalle.
  perform delete_account(q);
  if exists (select 1 from mahalle where id = m) then raise exception 'empty mahalle left open'; end if;
  raise notice 'account delete: ok';
end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000302';
do $$ begin
  begin perform delete_account('00000000-0000-0000-0000-000000000301'); raise exception 'should have failed';
  exception when insufficient_privilege then null; end;
  raise notice 'account delete rls: ok';
end $$;
reset role;

-- First jobs: the reward needs a finished match, a training and a mahalle, and pays once.
insert into auth.users values ('00000000-0000-0000-0000-000000000950');
set role service_role;
do $$ declare p uuid := '00000000-0000-0000-0000-000000000950'; coin0 bigint; begin
  if claim_jobs(p, 150) <> 0 then raise exception 'jobs paid with nothing done'; end if;
  insert into matches (player_id, seed, chances, opponent_goalkeeping, expires_at, status)
    values (p, 1, 5, 50, now() + interval '1 hour', 'finished');
  insert into training_log (player_id, day, kind, stat, ap, xp) values (p, current_date, 'free', 'shooting', 1, 1);
  if claim_jobs(p, 150) <> 0 then raise exception 'jobs paid without a mahalle'; end if;
  perform create_mahalle(p, 'Gorev', 'shield', 'lime', false);
  select coin into coin0 from wallets where player_id = p;
  if claim_jobs(p, 150) <> 150 then raise exception 'jobs not paid'; end if;
  if claim_jobs(p, 150) <> 0 then raise exception 'jobs paid twice'; end if;
  if (select coin from wallets where player_id = p) <> coin0 + 150 then raise exception 'jobs wallet wrong'; end if;
  raise notice 'first jobs: ok';
end $$;
reset role;

-- Mini game drills: a session spends the drill at start, finishes once, keeps the record.
insert into auth.users values ('00000000-0000-0000-0000-000000000960');
set role service_role;
do $$ declare p uuid := '00000000-0000-0000-0000-000000000960'; w record; s1 bigint; s2 bigint; s3 bigint; r jsonb; begin
  select * into w from wallets where player_id = p;
  s1 := start_drill(p, 'shooting', 'free', 1, 11, 0::smallint, w.version, w.energy, w.energy_updated_at);
  begin perform start_drill(p, 'passing', 'free', 1, 12, 0::smallint, w.version, w.energy, w.energy_updated_at); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'limit' then raise; end if; end;
  begin perform start_drill(p, 'passing', 'energy', null, 12, 0::smallint, w.version + 5, 4::smallint, now()); raise exception 'should have failed';
  exception when serialization_failure then null; end;
  s2 := start_drill(p, 'passing', 'energy', null, 12, 0::smallint, w.version, (w.energy - 1)::smallint, now());
  if (select energy from wallets where player_id = p) <> w.energy - 1 then raise exception 'drill energy not spent'; end if;

  r := finish_drill(p, s1, 6, 3::smallint, 'perfect', 40::smallint, 0::smallint, 40::smallint, 2::smallint, 2::smallint, 30, 1, null, null, 0::smallint);
  if r <> '{"best": 6, "previous": null, "trust": 0}'::jsonb then raise exception 'first record wrong: %', r; end if;
  begin perform finish_drill(p, s1, 6, 3::smallint, 'perfect', 40::smallint, 2::smallint, 40::smallint, 4::smallint, 2::smallint, 30, 1, null, null, 0::smallint); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'finished' then raise; end if; end;
  begin perform finish_drill('00000000-0000-0000-0000-000000000950', s2, 1, 0::smallint, 'miss', 40::smallint, 0::smallint, 40::smallint, 0::smallint, 0::smallint, 8, 1, null, null, 0::smallint); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'no_session' then raise; end if; end;
  begin perform finish_drill(p, s2, 30, 2::smallint, 'good', 41::smallint, 0::smallint, 41::smallint, 1::smallint, 1::smallint, 20, 1, null, null, 0::smallint); raise exception 'should have failed';
  exception when serialization_failure then null; end;
  perform finish_drill(p, s2, 30, 2::smallint, 'good', 40::smallint, 0::smallint, 40::smallint, 1::smallint, 1::smallint, 20, 1, null, null, 0::smallint);
  if (select ap_shooting from player_stats where player_id = p) <> 2 or (select ap_passing from player_stats where player_id = p) <> 1
     or (select xp from players where id = p) <> 50 then raise exception 'drill result not applied'; end if;

  select * into w from wallets where player_id = p;
  s3 := start_drill(p, 'shooting', 'energy', null, 13, 1::smallint, w.version, (w.energy - 1)::smallint, now());
  r := finish_drill(p, s3, 4, 2::smallint, 'good', 40::smallint, 2::smallint, 41::smallint, 0::smallint, 1::smallint, 20, 1, null, null, 0::smallint);
  if r <> '{"best": 6, "previous": 6, "trust": 0}'::jsonb or (select best from drill_records where player_id = p and stat = 'shooting') <> 6 then raise exception 'record lowered: %', r; end if;
  if (select score from training_log where id = s3) <> 4 or (select stars from training_log where id = s3) <> 2 or (select finished_at from training_log where id = s3) is null then
    raise exception 'drill session not closed';
  end if;
  raise notice 'drills: ok';

  -- Boots: level gate, coin, one pair per tier until it wears out, worn by finish_drill.
  begin perform buy_boots(p, 'krampon_mahalle', 500, 25::smallint, 3); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'locked' then raise; end if; end;
  update players set level = 3 where id = p;
  begin perform buy_boots(p, 'krampon_mahalle', 500, 25::smallint, 3); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'no_coin' then raise; end if; end;
  begin perform buy_boots(p, 'forma_sonbahar', 1, 25::smallint, 1); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'not_for_sale' then raise; end if; end;
  begin perform buy_item(p, 'krampon_mahalle'); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'not_for_sale' then raise; end if; end;
  perform grant_currency(p, 'coin', 1100, 'test', 'x', 'test:boots');
  r := buy_boots(p, 'krampon_mahalle', 500, 2::smallint, 3);
  if r->>'balance' <> '600' or r->>'usesLeft' <> '2' then raise exception 'buy_boots wrong: %', r; end if;
  if (select source from inventory where player_id = p and item_id = 'krampon_mahalle') <> 'coin' then raise exception 'boots source not coin'; end if;
  begin perform buy_boots(p, 'krampon_mahalle', 500, 2::smallint, 3); raise exception 'should have failed';
  exception when raise_exception then if sqlerrm <> 'owned' then raise; end if; end;

  select * into w from wallets where player_id = p;
  s1 := start_drill(p, 'pace', 'energy', null, 14, 0::smallint, w.version, (w.energy - 1)::smallint, now());
  begin perform finish_drill(p, s1, 24, 3::smallint, 'perfect', 40::smallint, 0::smallint, 41::smallint, 0::smallint, 3::smallint, 30, 3, 'krampon_mahalle', 5::smallint, 1::smallint); raise exception 'should have failed';
  exception when serialization_failure then null; end;
  perform finish_drill(p, s1, 24, 3::smallint, 'perfect', 40::smallint, 0::smallint, 41::smallint, 0::smallint, 3::smallint, 30, 3, 'krampon_mahalle', 2::smallint, 1::smallint);
  if (select uses_left from inventory where player_id = p and item_id = 'krampon_mahalle') <> 1 or (select boot_ap from training_log where id = s1) <> 1 then
    raise exception 'boots not worn';
  end if;
  update inventory set uses_left = 0 where player_id = p and item_id = 'krampon_mahalle';
  r := buy_boots(p, 'krampon_mahalle', 500, 25::smallint, 3);
  if r->>'balance' <> '100' or (select uses_left from inventory where player_id = p and item_id = 'krampon_mahalle') <> 25 then raise exception 'boots rebuy wrong: %', r; end if;
  if (select count(*) from ledger where player_id = p and reason = 'boots') <> 2 then raise exception 'boots ledger wrong'; end if;
  raise notice 'boots: ok';
end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000960';
do $$ declare r jsonb := antrenman_bugun(); d jsonb := dukkan_bugun(); begin
  if (r->>'free')::int <> 1 or (r->>'energy')::int <> 3 or r->'stars' <> '{"shooting": 3, "passing": 2, "pace": 3}'::jsonb
     or r->'records' <> '{"shooting": 6, "passing": 30, "pace": 24}'::jsonb or r->'boots' <> '{"id": "krampon_mahalle", "usesLeft": 25}'::jsonb then
    raise exception 'antrenman_bugun wrong: %', r;
  end if;
  if d->'items'->0->>'usesLeft' <> '25' then raise exception 'dukkan_bugun boots wrong: %', d; end if;
  if (select count(*) from drill_records) <> 0 or (select count(*) from training_log) <> 0 then raise exception 'RLS leak: drill tables readable'; end if;
  begin perform start_drill('00000000-0000-0000-0000-000000000960', 'pace', 'free', 3, 1, 0::smallint, 0, 0::smallint, now()); raise exception 'should have failed';
  exception when insufficient_privilege then null; end;
  begin perform buy_boots('00000000-0000-0000-0000-000000000960', 'krampon_pro', 0, 150::smallint, 1); raise exception 'should have failed';
  exception when insufficient_privilege then null; end;
  raise notice 'drill rls: ok';
end $$;
reset role;

-- Drill of the day at a club: the first 3 stars of the day add 1 coach trust, never past the cap.
insert into auth.users values ('00000000-0000-0000-0000-000000000962');
set role service_role;
do $$ declare p uuid := '00000000-0000-0000-0000-000000000962'; s1 bigint; s2 bigint; s3 bigint; r jsonb; begin
  update players set coach_trust = 68 where id = p;
  s1 := start_drill(p, 'passing', 'free', 3, 21, 0::smallint, 0, 0::smallint, now());
  s2 := start_drill(p, 'passing', 'free', 3, 22, 0::smallint, 0, 0::smallint, now());
  s3 := start_drill(p, 'shooting', 'free', 3, 23, 0::smallint, 0, 0::smallint, now());
  r := finish_drill(p, s1, 56, 3::smallint, 'perfect', 40::smallint, 0::smallint, 40::smallint, 2::smallint, 2::smallint, 30, 1, null, null, 0::smallint, 69::smallint);
  if r->>'trust' <> '1' or (select coach_trust from players where id = p) <> 69 then raise exception 'drill trust not added: %', r; end if;
  update players set coach_trust = 50 where id = p;
  r := finish_drill(p, s2, 56, 3::smallint, 'perfect', 40::smallint, 2::smallint, 41::smallint, 0::smallint, 2::smallint, 30, 1, null, null, 0::smallint, 69::smallint);
  if r->>'trust' <> '0' or (select coach_trust from players where id = p) <> 50 then raise exception 'drill trust twice a day: %', r; end if;
  update players set coach_trust = 69 where id = p;
  r := finish_drill(p, s3, 6, 3::smallint, 'perfect', 40::smallint, 0::smallint, 40::smallint, 2::smallint, 2::smallint, 30, 1, null, null, 0::smallint, 69::smallint);
  if r->>'trust' <> '0' or (select coach_trust from players where id = p) <> 69 then raise exception 'drill trust past the cap: %', r; end if;
  raise notice 'drill trust: ok';
end $$;
reset role;

-- Omuz oku moves no stat but keeps stars and the record; three days in a row add a free drill.
set role service_role;
do $$ declare p uuid := '00000000-0000-0000-0000-000000000962'; w record; s1 bigint; r jsonb; before jsonb; begin
  select to_jsonb(ps) into before from player_stats ps where player_id = p;
  select * into w from wallets where player_id = p;
  s1 := start_drill(p, 'defense', 'energy', null, 31, 0::smallint, w.version, (w.energy - 1)::smallint, now());
  r := finish_drill(p, s1, 9, 3::smallint, 'perfect', null, null, null, null, 0::smallint, 30, 1, null, null, 0::smallint);
  if r <> '{"best": 9, "previous": null, "trust": 0}'::jsonb or (select to_jsonb(ps) from player_stats ps where player_id = p) <> before
     or (select stars from training_log where id = s1) <> 3 then
    raise exception 'defense drill wrong: %', r;
  end if;
  if talim_serisi(p, mahalle_today()) then raise exception 'streak without three days'; end if;
  insert into training_log (player_id, day, kind, stat, ap, xp) select p, mahalle_today() - d, 'free', 'pace', 0, 0 from generate_series(1, 3) d;
  if not talim_serisi(p, mahalle_today()) then raise exception 'three days in a row not a streak'; end if;
  delete from training_log where player_id = p and day = mahalle_today() - 2;
  if talim_serisi(p, mahalle_today()) then raise exception 'streak with a gap'; end if;
  raise notice 'defense drill and streak: ok';
end $$;
reset role;

-- Phone events: one answer a day, effects applied once, a cost above the balance refused.
insert into auth.users values ('00000000-0000-0000-0000-000000000961');
set role service_role;
do $$ declare p uuid := '00000000-0000-0000-0000-000000000961'; coin0 bigint; begin
  perform grant_currency(p, 'coin', 100, 'test', null, 'phone-test-start');
  select coin into coin0 from wallets where player_id = p;
  perform telefon_cevapla(p, '2026-11-01', 'bakkal', 0::smallint, 6, 1, 0, -50);
  if (select coin from wallets where player_id = p) <> coin0 - 50 then raise exception 'phone coin wrong'; end if;
  if (select morale from kariyer_durum where player_id = p) <> 66 or (select respect from players where id = p) <> 1 then
    raise exception 'phone effects wrong';
  end if;
  begin perform telefon_cevapla(p, '2026-11-01', 'bakkal', 0::smallint, 6, 1, 0, -50); raise exception 'answered twice';
  exception when raise_exception then if sqlerrm <> 'already_answered' then raise; end if; end;
  begin perform telefon_cevapla(p, '2026-11-02', 'kapora', 0::smallint, -4, 0, 0, -(coin0 + 1000)::integer); raise exception 'cost above balance taken';
  exception when check_violation then null; end;
  if exists (select 1 from telefon_cevap where player_id = p and day = '2026-11-02') then raise exception 'refused answer stored'; end if;
  raise notice 'phone events: ok';
end $$;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000961';
do $$ begin
  begin perform telefon_cevapla('00000000-0000-0000-0000-000000000961', '2026-11-03', 'bakkal', 0::smallint, 50, 50, 50, 5000); raise exception 'should have failed';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from telefon_cevap) then raise exception 'phone answers readable'; end if;
  raise notice 'phone rls: ok';
end $$;
reset role;
