# Security policy

## Scope

This repository is an educational, local-development SSO lab. It is not a production-ready identity platform.

The usernames and passwords committed in the realm import are intentional demo credentials. Do not reuse them, and do not expose this configuration directly to the internet.

## Before any internet-facing deployment

- Replace every demo and administrator password.
- Set a long random `SESSION_SECRET` in `.env`.
- Serve every application and Keycloak over HTTPS.
- Set `COOKIE_SECURE=true`.
- Use a persistent session store instead of the in-memory Express store.
- Replace Keycloak's development H2 database with PostgreSQL.
- Restrict OIDC redirect URIs and web origins to exact HTTPS origins.
- Place services behind an authenticated tunnel or hardened reverse proxy.
- Back up and test restoration of all persistent data.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature instead of opening a public issue containing exploit details or secrets.
