#!/usr/bin/env bash
# Runs a command and, if it fails, repeats the last lines of its output as a
# GitHub Actions error annotation. Annotations show on the run summary and are
# readable through the API even when the full log is not.
# Usage: supabase/scripts/ci-run.sh "<step title>" <command> [args...]
set -uo pipefail
title="$1"; shift
log="$(mktemp)"
"$@" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
if [ "$status" -ne 0 ]; then
  summary="$(tail -n 8 "$log" | tr '\n' ' ' | sed 's/%/%25/g')"
  echo "::error title=${title}::${summary}"
fi
exit "$status"
