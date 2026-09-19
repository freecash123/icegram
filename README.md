# ICEGRAM — Connect. Chat. Create.

ICEGRAM is a privacy-first communication platform foundation built as a full-stack React, tRPC, Express, Drizzle, and MySQL/TiDB web/PWA application.

## Phase 1 status

The current release includes Manus OAuth authentication, permanent Icegram identity generation, usernames and profiles, privacy controls, database-backed direct chats, delivery/read states, text and media messages, managed-storage uploads for images/files/voice, contacts, search, blocks and reports, notifications, groups, channels, stories, settings, theme switching, responsive layouts, PWA installation assets, multi-device session records, and a role-protected admin foundation.

The backend is real and database-backed. The app does not simulate authentication, messaging, media storage, or deployment. The development preview is served by the project runtime; production deployment requires the connected deployment provider and its environment configuration.

## Local development

```bash
pnpm install
pnpm dev
```

Run validation:

```bash
pnpm check
pnpm test
pnpm build
```

## Architecture

- `client/` — React UI, responsive messenger shell, theme system, PWA manifest, service worker, and original ICEGRAM icon.
- `server/` — tRPC procedures, authentication context, storage integration, rate-limited feature boundaries, and database helpers.
- `drizzle/` — schema and generated migrations for users, conversations, messages, contacts, stories, notifications, reports, blocks, and sessions.
- `shared/` — shared constants and types.

All application API calls use typed tRPC procedures under `/api/trpc`. Media bytes are uploaded to managed object storage; the database stores metadata and references rather than file blobs.

## Configuration

Runtime configuration is provided by the WebDev environment. Never commit `.env` files, OAuth secrets, database credentials, storage credentials, or API keys. See the environment-variable template supplied with the deployment configuration for the required names.

## External dependencies

Manus OAuth and managed database/storage are wired through the current project runtime. Voice/video calling, livestreaming, voice rooms, AI assistance, payments, telecom/virtual-number features, and native apps require their respective provider accounts and are intentionally represented as future integration boundaries rather than fake functionality.

## Roadmap

Phase 2 expands IceBox, advanced message organization, richer stories, Spaces, community moderation, events, collaborative notes, shared albums, QR destinations, Privacy Center, developer APIs, and provider-backed RTC/live infrastructure. The schema and router boundaries are designed to add these features without replacing the Phase 1 foundation.

## Security notes

Phone visibility defaults to private. Protected procedures enforce authentication, conversation membership, ownership, and admin role checks server-side. Do not describe the current message layer as end-to-end encrypted; that protocol has not been implemented or independently verified.
