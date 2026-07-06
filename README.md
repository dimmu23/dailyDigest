# PIB UPSC Brief

An RSS-first, official-source-only dashboard that turns Press Information Bureau
releases into source-grounded UPSC notes.

The repository contains:

- a responsive Next.js dashboard and daily digest;
- PostgreSQL/Prisma models for releases, ministries, tags, bookmarks, and sync logs;
- manual and scheduled sync endpoints;
- PIB RSS, release-page, attachment, and PDF ingestion;
- Gemini structured-output classification with strict source-grounding rules;
- focused parser, validation, and API utility tests.

Read the full product and engineering specification in
[`docs/PRODUCT-AND-ARCHITECTURE.md`](docs/PRODUCT-AND-ARCHITECTURE.md).

## Local setup

Requirements: Node.js 20+, npm, and PostgreSQL 15+ (Supabase Postgres works).

```bash
npm install
cp .env.example .env.local
npx prisma migrate dev --name init
npm run dev
```

Then open `http://localhost:3000`. Trigger the first ingestion with the
**Refresh from PIB** button or:

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Authorization: Bearer $SYNC_SECRET"
```

## Required configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL pooled/runtime connection |
| `DIRECT_URL` | Optional direct connection for migrations |
| `GEMINI_API_KEY` | AI enrichment; when absent, releases remain fetched but unenriched |
| `GEMINI_MODEL` | Defaults to stable `gemini-2.5-flash` |
| `SYNC_SECRET` | Protects manual/cron sync |
| `APP_URL` | Canonical deployed URL |

Optional ingestion limits are documented in `.env.example`.

## Commands

```bash
npm run dev          # development server
npm run lint         # Next/ESLint checks
npm run typecheck    # TypeScript
npm test             # Vitest suite
npm run db:studio    # Prisma Studio
```

## Deployment notes

`vercel.json` calls `/api/cron/sync` every 30 minutes. Set `CRON_SECRET` in the
deployment environment; Vercel sends it as a bearer token. For other platforms,
schedule a POST to `/api/sync` with `SYNC_SECRET`.

The default source list only uses `pib.gov.in` and `static.pib.gov.in`. Keep the
rate limits conservative and review PIB markup changes when parser-error rates
increase.
