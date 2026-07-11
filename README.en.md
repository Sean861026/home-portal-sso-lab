# Home Portal SSO Lab

[繁體中文](README.md) | [English](README.en.md)

A hands-on OIDC/SSO lab. Keycloak acts as the Identity Provider, while the Node.js applications are relying parties.

## Getting started

Docker Desktop is required. The first run downloads the container images and builds the applications:

Copy the environment template and replace its defaults first:

```bash
cp .env.example .env
```

```bash
docker compose up --build
```

After Keycloak starts, open:

- Portal: http://localhost:3000
- Family Notes: http://localhost:3001
- Family Calendar: http://localhost:3002
- Keycloak Admin Console: http://localhost:8080/admin

## Demo accounts

| Username | Password | Roles | Expected access |
|---|---|---|---|
| `alice` | `alice123` | `family` | Dashboard access; Admin is denied |
| `owner` | `owner123` | `family`, `admin` | Dashboard and Admin access |
| `sean` | `sean123` | `family`, `admin` | Access to every lab feature |

The local Keycloak Admin Console credentials are `admin` / `admin`.

> These credentials are intentionally public for local experimentation. Never use them on an internet-facing deployment.

## What you can observe

1. After you select Login, the Portal generates `state`, `nonce`, and a PKCE verifier.
2. The browser is redirected to Keycloak; the Portal never handles the user's password.
3. Keycloak sends a one-time authorization code to `/callback`.
4. The Portal exchanges the code from its backend and verifies the ID Token signature, issuer, audience, and nonce.
5. `/admin` authorizes access using `realm_access.roles`; successful authentication does not imply authorization.
6. Logout clears the Portal session and invokes Keycloak RP-Initiated Logout.

## Test real SSO

Sign in to the Portal, then open Family Notes or Family Calendar from the Dashboard. Each application has its own OIDC client and session cookie, but Keycloak already has an authenticated session, so it does not ask for the password again.

Family Notes and Family Calendar store their data in separate Docker named volumes. Regular users can add content and delete their own entries; an `admin` can delete any entry.

## Add a service without deleting data

On every Compose start, `keycloak-provision` checks `keycloak/provision/clients/*.json` and creates only the missing OIDC clients. It does not delete or overwrite existing clients and does not modify the Notes, Calendar, or Keycloak volumes.

To add another service:

1. Copy a file from `keycloak/provision/clients/*.json` and change its client ID, redirect URI, and web origin.
2. Add the service to `docker-compose.yml`.
3. Run `docker compose up --build` without `-v`.

Realm import bootstraps a clean installation. Provisioning handles incremental client creation in an existing installation.

## Reset the environment

Realm import runs only when the Keycloak data directory is new. To re-import changes from `keycloak/home-realm.json`:

```bash
docker compose down -v
docker compose up --build
```

`-v` deletes this lab's Keycloak, Notes, and Calendar volumes and all data stored in them.

## Before exposing it to the internet

At minimum, replace every password and `SESSION_SECRET`, enable HTTPS, set cookies to `secure`, restrict redirect URIs, use a persistent session store, and enforce access controls at the tunnel or reverse-proxy layer. Never expose Keycloak development mode directly to the internet.

When `COOKIE_SECURE=true`, browsers send session cookies over HTTPS only. See [SECURITY.md](SECURITY.md) for the complete checklist.
