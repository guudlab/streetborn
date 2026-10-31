#!/usr/bin/env bash
# Sets the hosted project's auth settings that account linking needs: the web and
# app redirect URLs, manual identity linking, and Turkish emails whose sign-in
# email carries a code (the app types it in; a link would open the browser).
# Existing redirect URLs are kept. Google and Apple providers are set by hand in
# the dashboard, because they need secrets from those consoles.
# SITE_URL (the repository variable of the same name) moves the site, for example
# to Cloudflare; the Netlify addresses stay allowed until removed by hand.
# Hosted Supabase sends its own emails only with the default templates (a link, no
# code). With SMTP_HOST, SMTP_USER and SMTP_PASS set (repository variable, secrets)
# the project sends through that server instead, and the code templates below apply.
# SMTP_PORT defaults to 587, SMTP_FROM (the sender address) to SMTP_USER.
# Usage: SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_ID=… [SITE_URL=…] [SMTP_HOST=… SMTP_USER=… SMTP_PASS=…] supabase/scripts/configure-auth.sh
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
# The SMTP password goes only into the request body, never into the log.
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

if [ -n "${SMTP_HOST:-}" ] && [ -n "${SMTP_USER:-}" ] && [ -n "${SMTP_PASS:-}" ]; then
  patch "smtp" "$(jq -n --arg host "$SMTP_HOST" --arg port "${SMTP_PORT:-587}" --arg user "$SMTP_USER" \
    --arg pass "$SMTP_PASS" --arg from "${SMTP_FROM:-$SMTP_USER}" '{
    smtp_host: $host, smtp_port: $port, smtp_user: $user, smtp_pass: $pass,
    smtp_admin_email: $from, smtp_sender_name: "StreetBorn"
  }')"
else
  echo "smtp: not set (SMTP_HOST, SMTP_USER, SMTP_PASS); Supabase sends its default link emails"
fi

patch "email templates" "$(jq -n '{
  mailer_subjects_magic_link: "StreetBorn giriş kodun",
  mailer_templates_magic_link_content: "<h2>StreetBorn</h2><p>Giriş kodun:</p><p style=\"font-size:28px;letter-spacing:6px\"><b>{{ .Token }}</b></p><p>Ya da <a href=\"{{ .ConfirmationURL }}\">buraya dokun</a>.</p><p>Bu kodu sen istemediysen e-postayı yok sayabilirsin.</p>",
  mailer_subjects_email_change: "StreetBorn hesabını onayla",
  mailer_templates_email_change_content: "<h2>StreetBorn</h2><p>Hesabını bu e-postaya bağlamak için dokun:</p><p><a href=\"{{ .ConfirmationURL }}\">Hesabımı bağla</a></p><p>Bunu sen istemediysen e-postayı yok sayabilirsin.</p>"
}')"

echo "redirects: $allow"
exit "$failed"
