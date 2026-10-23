#!/usr/bin/env bash
# Applies the migrations to an empty Postgres and runs the smoke test.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
psql_run() { psql -v ON_ERROR_STOP=1 -q "$@"; }

psql_run -c 'drop database if exists streetborn_test' -c 'create database streetborn_test'
psql_run -d streetborn_test -f tests/supabase_stub.sql
for f in migrations/*.sql; do psql_run -d streetborn_test -f "$f"; done
out=$(psql_run -d streetborn_test -f tests/smoke.sql 2>&1)
echo "$out"
for expected in 'negative balance refused: ok' 'ledger update refused: ok' 'client write refused: ok' 'client grant refused: ok' 'rls isolation: ok' 'match finish idempotent: ok' 'mahalle capacity: ok' 'mahalle captain handover: ok' 'mahalle rls: ok' 'mahalle match once a day: ok' 'mahalle contribution: ok' 'mahalle cheers: ok' 'mahalle settlement: ok' 'mahalle match rls: ok' 'report limit: ok' 'block rls: ok' 'offers: ok' 'trial match: ok' 'contract and salary: ok' 'league match: ok' 'season end: ok' 'career rls: ok' 'training: ok'; do
  grep -q "$expected" <<<"$out" || { echo "missing: $expected"; exit 1; }
done
echo 'supabase smoke test passed'
