#!/usr/bin/env bash
# Copies the shared TypeScript packages into supabase/functions/_shared/vendor and
# points the function imports at that copy. Run in CI right before
# `supabase functions deploy`, because the deploy bundle only includes files
# under supabase/functions. The rewritten files are never committed.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
functions="$root/supabase/functions"
dest="$functions/_shared/vendor"

rm -rf "$dest"
for pkg in economy engine; do
  mkdir -p "$dest/$pkg"
  find "$root/packages/$pkg/src" -maxdepth 1 -name '*.ts' ! -name '*.test.ts' -exec cp {} "$dest/$pkg/" \;
done

grep -rl --include='*.ts' 'packages/' "$functions" | grep -v '/_shared/vendor/' | while read -r file; do
  sed -i -E 's#(\.\./)+packages/([a-z]+)/src/#../_shared/vendor/\2/#g' "$file"
done
echo "vendored packages into $dest"
