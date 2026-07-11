#!/usr/bin/env bash
set -euo pipefail

KCADM=/opt/keycloak/bin/kcadm.sh

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
  fi
done

echo "Keycloak provisioning complete."
