#!/usr/bin/env bash
# Applies the migrations to the linked hosted project. Newer Supabase CLI versions target the
# local database unless told otherwise, reject --password without a remote flag and ask for
# confirmation, so pass the remote flag (--remote, formerly --linked) and --yes. The password comes from SUPABASE_DB_PASSWORD in the environment.
set -uo pipefail
for flag in --remote --linked; do
  # --yes: the CLI asks before touching a hosted project and CI has no terminal to answer.
  out="$(supabase db push "$flag" --yes 2>&1)"; status=$?
  echo "$out"
  if [ "$status" -eq 0 ]; then exit 0; fi
  # Only fall through to the next name when this one is not a known flag.
  if ! grep -qiE 'unknown flag|unknown shorthand' <<<"$out"; then exit "$status"; fi
done
exit 1
