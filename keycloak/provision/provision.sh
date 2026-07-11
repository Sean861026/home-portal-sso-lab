#!/usr/bin/env bash
set -euo pipefail

KCADM=/opt/keycloak/bin/kcadm.sh
PUBLIC_HOST="${PUBLIC_HOST:-localhost}"

if [[ ! "$PUBLIC_HOST" =~ ^[a-zA-Z0-9.-]+$ ]]; then
  echo "PUBLIC_HOST contains invalid characters: ${PUBLIC_HOST}" >&2
  exit 1
fi

echo "Waiting for Keycloak..."
until "$KCADM" config credentials \
  --server http://keycloak:8080 \
  --realm master \
  --user "${KEYCLOAK_ADMIN}" \
  --password "${KEYCLOAK_ADMIN_PASSWORD}" >/dev/null 2>&1; do
  sleep 2
done

for file in /config/clients/*.json; do
  client_id="$(basename "$file" .json)"
  existing_id="$("$KCADM" get clients -r home -q "clientId=${client_id}" | sed -n 's/.*"id" : "\([^"]*\)".*/\1/p' | head -n 1)"

  if [[ -n "$existing_id" ]]; then
    echo "OIDC client ${client_id} already exists; keeping it."
  else
    "$KCADM" create clients -r home -f "$file" >/dev/null
    echo "Created OIDC client ${client_id}."
    existing_id="$("$KCADM" get clients -r home -q "clientId=${client_id}" | sed -n 's/.*"id" : "\([^"]*\)".*/\1/p' | head -n 1)"
  fi

  case "$client_id" in
    home-portal) port=3000 ;;
    family-notes) port=3001 ;;
    family-calendar) port=3002 ;;
    *) echo "No port mapping for ${client_id}; skipping URI update."; continue ;;
  esac

  "$KCADM" update "clients/${existing_id}" -r home \
    -s "redirectUris=[\"http://localhost:${port}/callback\",\"http://${PUBLIC_HOST}:${port}/callback\"]" \
    -s "webOrigins=[\"http://localhost:${port}\",\"http://${PUBLIC_HOST}:${port}\"]" \
    -s "attributes={\"pkce.code.challenge.method\":\"S256\",\"post.logout.redirect.uris\":\"http://localhost:${port}/*##http://${PUBLIC_HOST}:${port}/*\"}" >/dev/null
  echo "Configured ${client_id} for localhost and ${PUBLIC_HOST}."
done

echo "Keycloak provisioning complete."
