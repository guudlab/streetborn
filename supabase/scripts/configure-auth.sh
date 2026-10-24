#!/usr/bin/env bash
# Sets the hosted project's auth settings that account linking needs: the web and
# app redirect URLs, manual identity linking, and Turkish emails whose sign-in
# email carries a code (the app types it in; a link would open the browser).
# Existing redirect URLs are kept. Google and Apple providers are set by hand in
# the dashboard, because they need secrets from those consoles.
# SITE_URL (the repository variable of the same name) moves the site, for example
# to Cloudflare; the Netlify addresses stay allowed until removed by hand.
# Usage: SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_ID=… [SITE_URL=…] supabase/scripts/configure-auth.sh
set -euo pipefail
api="https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_ID/config/auth"
auth=(-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H 'Content-Type: application/json')
site="${SITE_URL:-https://streetborn.netlify.app}"

current="$(curl -fsS "${auth[@]}" "$api")"
allow="$(jq -r --arg site "$site" '
  [(.uri_allow_list // "" | split(",") | map(select(length > 0))), [$site + "/**", "https://streetborn.netlify.app/**", "https://*--streetborn.netlify.app/**", "streetborn://**"]]
  | add | unique | join(",")' <<<"$current")"

# Each group is sent on its own, so one refused setting does not block the rest;
# the API's answer is printed for a refused one. Custom email templates need a
# custom SMTP server on hosted Supabase; until then the default emails are sent.
patch() {
  local name="$1" body="$2" out code
  out="$(mktemp)"
  code="$(curl -sS -o "$out" -w '%{http_code}' -X PATCH "${auth[@]}" -d "$body" "$api")"
  if [ "$code" = 200 ]; then echo "$name: updated"; else echo "::warning title=Configure auth ($name)::HTTP $code $(head -c 300 "$out")"; failed=1; fi
}
failed=0

patch "redirects and linking" "$(jq -n --arg site "$site" --arg allow "$allow" '{
  site_url: $site, uri_allow_list: $allow, security_manual_linking_enabled: true
}')"

patch "email templates" "$(jq -n '{
  mailer_subjects_magic_link: "StreetBorn giriş kodun",
  mailer_templates_magic_link_content: "<h2>StreetBorn</h2><p>Giriş kodun:</p><p style=\"font-size:28px;letter-spacing:6px\"><b>{{ .Token }}</b></p><p>Ya da <a href=\"{{ .ConfirmationURL }}\">buraya dokun</a>.</p><p>Bu kodu sen istemediysen e-postayı yok sayabilirsin.</p>",
  mailer_subjects_email_change: "StreetBorn hesabını onayla",
  mailer_templates_email_change_content: "<h2>StreetBorn</h2><p>Hesabını bu e-postaya bağlamak için dokun:</p><p><a href=\"{{ .ConfirmationURL }}\">Hesabımı bağla</a></p><p>Bunu sen istemediysen e-postayı yok sayabilirsin.</p>"
}')"

echo "redirects: $allow"
exit "$failed"
