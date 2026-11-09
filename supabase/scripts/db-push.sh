#!/usr/bin/env bash
# Applies the migrations to the linked hosted project. Newer Supabase CLI versions target the
# local database unless told otherwise and reject --password without a remote flag, so try the
# linked-project flag names in turn. The password comes from SUPABASE_DB_PASSWORD in the environment.
set -uo pipefail
for flag in --linked --remote; do
  out="$(supabase db push "$flag" 2>&1)"; status=$?
  echo "$out"
  if [ "$status" -eq 0 ]; then exit 0; fi
  # Only fall through to the next name when this one is not a known flag.
  if ! grep -qiE 'unknown flag|unknown shorthand' <<<"$out"; then exit "$status"; fi
done
exit 1
