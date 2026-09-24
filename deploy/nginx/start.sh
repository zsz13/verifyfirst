#!/bin/sh
# Starts Nginx for $DOMAIN. Until Let's Encrypt has issued the certificate it serves only
# the ACME challenge; once the certificate exists it serves the app over HTTPS, and it
# reloads every 6 hours so renewed certificates are picked up without a restart.
set -eu

: "${DOMAIN:?DOMAIN must be set in .env}"
: "${BASIC_AUTH_USER:?BASIC_AUTH_USER must be set in .env}"
: "${BASIC_AUTH_PASSWORD:?BASIC_AUTH_PASSWORD must be set in .env}"
# DOMAIN is written into the Nginx config and the certificate path: a bare hostname only.
case "$DOMAIN" in *[!a-zA-Z0-9.-]* | .* | *.)
  echo "DOMAIN must be a bare hostname such as verify.example.com (no https://, port or path), got: $DOMAIN" >&2
  exit 1
  ;;
esac
# The password is the only gate in front of the model key; keep online guessing hopeless.
if [ "${#BASIC_AUTH_PASSWORD}" -lt 12 ]; then
  echo 'BASIC_AUTH_PASSWORD must be at least 12 characters. Generate one with: openssl rand -base64 18' >&2
  exit 1
fi
case "$BASIC_AUTH_USER" in *:*)
  echo 'BASIC_AUTH_USER must not contain ":".' >&2
  exit 1
  ;;
esac

# Only a SHA-512 crypt hash reaches the file; the worker user needs read access to it.
printf '%s:%s\n' "$BASIC_AUTH_USER" "$(printf '%s' "$BASIC_AUTH_PASSWORD" | mkpasswd -m sha512 -P 0)" \
  >/etc/nginx/htpasswd
chown root:nginx /etc/nginx/htpasswd
chmod 640 /etc/nginx/htpasswd

certificate="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
render() {
  if [ -s "$certificate" ]; then mode=https; else mode=http; fi
  # shellcheck disable=SC2016 # envsubst takes the literal variable name to substitute.
  envsubst '${DOMAIN}' <"/etc/nginx/verifyfirst/$mode.conf.template" >/etc/nginx/conf.d/default.conf
}

render
[ "$mode" = https ] || echo "No certificate for $DOMAIN yet: serving the ACME challenge only until Certbot issues it."
(
  while :; do
    if [ "$mode" = https ]; then sleep 21600; else sleep 30; fi
    previous=$mode
    render
    if [ "$mode" = https ] || [ "$mode" != "$previous" ]; then nginx -s reload || true; fi
  done
) &
exec nginx -g 'daemon off;'
