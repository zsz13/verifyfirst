#!/bin/sh
# Obtains the Let's Encrypt certificate for $DOMAIN on first start, then checks for renewal
# every 12 hours. Nginx serves the challenge files from the shared webroot and reloads
# itself to pick up a renewed certificate.
set -eu

: "${DOMAIN:?DOMAIN must be set in .env}"
# Optional account contact; Let's Encrypt no longer sends expiry emails.
if [ -n "${LETSENCRYPT_EMAIL:-}" ]; then
  set -- --email "$LETSENCRYPT_EMAIL"
else
  set -- --register-unsafely-without-email
fi
trap 'exit 0' TERM INT
webroot=/var/www/certbot

until [ -s "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; do
  if certbot certonly --webroot -w "$webroot" -d "$DOMAIN" --cert-name "$DOMAIN" \
    "$@" --agree-tos --no-eff-email --non-interactive; then
    break
  fi
  # Let's Encrypt allows 5 failed validations per hour; 15 minutes stays under that.
  echo "Certificate request failed. Check that $DOMAIN points at this server and port 80 is open. Retrying in 15 minutes."
  sleep 900 &
  wait $!
done

while :; do
  certbot renew --quiet || echo 'Certificate renewal failed; retrying in 12 hours.'
  sleep 43200 &
  wait $!
done
