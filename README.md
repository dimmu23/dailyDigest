# PIB UPSC Brief

An RSS-first, official-source-only dashboard that turns Press Information Bureau
releases into source-grounded UPSC notes.

The repository contains:

- a responsive Next.js dashboard and daily digest;
- PostgreSQL/Prisma models for releases, ministries, tags, bookmarks, and sync logs;
- manual and scheduled sync endpoints;
- Redis/BullMQ release-processing jobs with duplicate queue protection;
- PIB RSS, release-page, attachment, and PDF ingestion in a worker;
- Cerebras structured-output classification with strict source-grounding rules;
- focused parser, validation, and API utility tests.

Read the full product and engineering specification in
[`docs/PRODUCT-AND-ARCHITECTURE.md`](docs/PRODUCT-AND-ARCHITECTURE.md).

## Local setup

Requirements: Node.js 20+, npm, PostgreSQL 15+ (Supabase Postgres works), and
Redis 7+.

```bash
npm install
cp .env.example .env.local
npx prisma migrate dev --name init
npm run dev
```

Run the worker in a second terminal:

```bash
npm run worker
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
| `REDIS_URL` | BullMQ queue storage for release processing |
| `CEREBRAS_API_KEY` | AI enrichment; when absent, releases remain fetched but unenriched |
| `CEREBRAS_MODEL` | Defaults to `gpt-oss-120b` |
| `SYNC_SECRET` | Protects `/api/sync` |
| `CRON_SECRET` | Protects `/api/cron/sync` |
| `APP_URL` | Canonical deployed URL |

Optional ingestion limits are documented in `.env.example`.

## Commands

```bash
npm run dev          # development server
npm run worker       # BullMQ release worker plus /health server
npm run lint         # Next/ESLint checks
npm run typecheck    # TypeScript
npm test             # Vitest suite
npm run db:studio    # Prisma Studio
```

## Deployment notes

`/api/cron/sync` can be scheduled every 30 minutes. Set `CRON_SECRET` in the
deployment environment and call the route with `Authorization: Bearer <secret>`.
For other platforms, schedule a POST to `/api/sync` with `SYNC_SECRET`.

Deploy two runtimes from the same repo:

- Web/API app: build with `npm run build`, start with `npm start`.
- Worker service: start with `npm run worker`. If deployed as a web service,
  set the health check path to `/health`.

Sync endpoints discover releases and enqueue lightweight jobs
`{ releaseId, syncLogId }`. BullMQ uses `releaseId` as the job id, so the same
unfinished release is not queued repeatedly. Worker completion increments the
linked `sync_logs.enriched` counter; exhausted retries increment `failed`.

The default source list only uses `pib.gov.in` and `static.pib.gov.in`. Keep the
rate limits conservative and review PIB markup changes when parser-error rates
increase.
