import { randomUUID } from "node:crypto";
import {
  Prisma,
  ReleaseState,
  SyncStatus,
  type DiscoverySource,
  type SyncTrigger
} from "@prisma/client";
import pLimit from "p-limit";
import { classifyRelease, canClassify } from "@/lib/ai/classify";
import { PROMPT_VERSION } from "@/lib/ai/prompt";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  dedupeCandidates,
  discoverFromAllReleases,
  discoverFromRss
} from "@/lib/ingestion/discovery";
import { fetchAndParseRelease } from "@/lib/ingestion/detail";
import { extractPdfText } from "@/lib/ingestion/pdf";
import type {
  DiscoveryCandidate,
  ItemError,
  ParsedRelease,
  SyncStats
} from "@/lib/ingestion/types";
import { contentHash, normalizeWhitespace, slugify } from "@/lib/text";

const LOCK_NAME = "global-pib-sync";
const LOCK_LEASE_MINUTES = 25;
const MAX_LOGGED_ERRORS = 50;

export class SyncInProgressError extends Error {
  constructor() {
    super("Another PIB sync is already running.");
  }
}

async function acquireLock(owner: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ owner: string }>>(Prisma.sql`
    INSERT INTO sync_locks (name, owner, locked_until, updated_at)
    VALUES (
      ${LOCK_NAME},
      ${owner},
      NOW() + (${LOCK_LEASE_MINUTES} * INTERVAL '1 minute'),
      NOW()
    )
    ON CONFLICT (name) DO UPDATE
    SET owner = EXCLUDED.owner,
        locked_until = EXCLUDED.locked_until,
        updated_at = NOW()
    WHERE sync_locks.locked_until < NOW()
    RETURNING owner
  `);
  return rows.some((row) => row.owner === owner);
}

async function releaseLock(owner: string) {
  await db.syncLock.deleteMany({ where: { name: LOCK_NAME, owner } });
}

function addError(stats: SyncStats, error: ItemError) {
  stats.failed += 1;
  if (stats.errors.length < MAX_LOGGED_ERRORS) stats.errors.push(error);
}

async function discover(stats: SyncStats): Promise<{
  items: DiscoveryCandidate[];
  source: DiscoverySource;
}> {
  try {
    const rss = dedupeCandidates(await discoverFromRss());
    if (rss.length > 0) return { items: rss, source: "RSS" };
    stats.errors.push({
      stage: "discovery",
      code: "EMPTY_RSS",
      message: "PIB RSS returned no release items; All Releases fallback was used."
    });
  } catch (error) {
    stats.errors.push({
      stage: "discovery",
      code: "RSS_FAILED",
      message: error instanceof Error ? error.message : "RSS discovery failed."
    });
  }

  try {
    const fallback = dedupeCandidates(await discoverFromAllReleases());
    return { items: fallback, source: "ALL_RELEASES" };
  } catch (error) {
    stats.errors.push({
      stage: "discovery",
      code: "ALL_RELEASES_FAILED",
      message: error instanceof Error ? error.message : "All Releases discovery failed."
    });
    return { items: [], source: "ALL_RELEASES" };
  }
}

async function getPdfText(parsed: ParsedRelease, stats: SyncStats): Promise<string | null> {
  const parts: string[] = [];
  for (const [index, url] of parsed.pdfUrls.slice(0, 3).entries()) {
    try {
      const text = await extractPdfText(url);
      parts.push(`[Official PIB PDF ${index + 1}]\n${text}`);
    } catch (error) {
      if (stats.errors.length < MAX_LOGGED_ERRORS) {
        stats.errors.push({
          sourceUrl: parsed.sourceUrl,
          stage: "pdf",
          code: "PDF_PARSE_FAILED",
          message: `${url}: ${error instanceof Error ? error.message : "PDF parse failed."}`
        });
      }
    }
  }
  return parts.length ? parts.join("\n\n") : null;
}

async function upsertSource(
  parsed: ParsedRelease,
  pdfText: string | null,
  discoverySource: DiscoverySource
) {
  const ministryName = parsed.ministry ? normalizeWhitespace(parsed.ministry).slice(0, 160) : null;
  const ministry = ministryName
    ? await db.ministry.upsert({
        where: { name: ministryName },
        update: {},
        create: { name: ministryName, slug: slugify(ministryName) || `ministry-${randomUUID()}` }
      })
    : null;

  const hash = contentHash(`${parsed.rawText}\n${pdfText || ""}`);
  const existing = await db.release.findFirst({
    where: {
      OR: [
        ...(parsed.prid ? [{ prid: parsed.prid }] : []),
        { sourceUrl: parsed.sourceUrl }
      ]
    }
  });

  const data = {
    prid: parsed.prid,
    sourceId: parsed.sourceId,
    title: parsed.title,
    ministryId: ministry?.id ?? null,
    category: parsed.category,
    publishedDate: parsed.publishedDate,
    sourceUrl: parsed.sourceUrl,
    primaryPdfUrl: parsed.pdfUrls[0] ?? null,
    pdfUrls: parsed.pdfUrls,
    rawText: parsed.rawText,
    pdfText,
    sourceContentHash: hash,
    ingestionError: null,
    discoverySource,
    state: ReleaseState.FETCHED
  };

  if (existing) {
    const unchanged =
      existing.sourceContentHash === hash &&
      existing.aiPromptVersion === PROMPT_VERSION &&
      existing.state === ReleaseState.ENRICHED;
    const release = await db.release.update({
      where: { id: existing.id },
      data: {
        ...data,
        state: unchanged ? ReleaseState.ENRICHED : ReleaseState.FETCHED
      }
    });
    return { release, created: false, unchanged };
  }

  const release = await db.release.create({ data });
  return { release, created: true, unchanged: false };
}

async function enrichRelease(
  release: Awaited<ReturnType<typeof upsertSource>>["release"],
  parsed: ParsedRelease,
  pdfText: string | null
) {
  const analysis = await classifyRelease({
    title: parsed.title,
    ministry: parsed.ministry,
    category: parsed.category,
    publishedDate: parsed.publishedDate,
    sourceUrl: parsed.sourceUrl,
    articleText: parsed.rawText,
    pdfText
  });

  const tags = await Promise.all(
    analysis.tags.map((tagName) =>
      db.tag.upsert({
        where: { name: tagName },
        update: {},
        create: { name: tagName, slug: slugify(tagName) }
      })
    )
  );

  await db.$transaction([
    db.releaseTag.deleteMany({ where: { releaseId: release.id } }),
    db.releaseTag.createMany({
      data: tags.map((tag) => ({ releaseId: release.id, tagId: tag.id })),
      skipDuplicates: true
    }),
    db.release.update({
      where: { id: release.id },
      data: {
        summary: analysis.summary,
        upscRelevanceScore: analysis.relevance_score,
        isUpscRelevant: analysis.is_upsc_relevant,
        gsPaperMapping: analysis.gs_papers,
        prelimsRelevance: analysis.prelims_relevance,
        mainsRelevance: analysis.mains_relevance,
        essayRelevance: analysis.essay_relevance,
        optionalRelevance: analysis.optional_relevance,
        whyImportant: analysis.why_important,
        lowConfidenceFields: analysis.low_confidence_fields,
        aiModel: env.GEMINI_MODEL,
        aiPromptVersion: PROMPT_VERSION,
        aiEnrichedAt: new Date(),
        state: ReleaseState.ENRICHED,
        ingestionError: null
      }
    })
  ]);
}

async function recordFailedCandidate(candidate: DiscoveryCandidate, message: string) {
  const existing = await db.release.findFirst({
    where: {
      OR: [
        ...(candidate.prid ? [{ prid: candidate.prid }] : []),
        { sourceUrl: candidate.sourceUrl }
      ]
    }
  });
  if (existing) {
    await db.release.update({
      where: { id: existing.id },
      data: { ingestionError: message, state: existing.state === "ENRICHED" ? "ENRICHED" : "FAILED" }
    });
    return;
  }
  await db.release.create({
    data: {
      prid: candidate.prid,
      sourceId: candidate.sourceId,
      title: candidate.title || "Not available from source.",
      publishedDate: candidate.publishedDate || new Date(),
      sourceUrl: candidate.sourceUrl,
      rawText: "",
      discoverySource: candidate.discoverySource,
      state: "FAILED",
      ingestionError: message
    }
  });
}

async function processCandidate(candidate: DiscoveryCandidate, stats: SyncStats) {
  try {
    const parsed = await fetchAndParseRelease(candidate);
    const pdfText = await getPdfText(parsed, stats);
    const persisted = await upsertSource(parsed, pdfText, candidate.discoverySource);
    if (persisted.created) stats.created += 1;
    else stats.updated += 1;

    if (persisted.unchanged) {
      stats.skipped += 1;
      return;
    }
    if (!canClassify()) {
      stats.skipped += 1;
      return;
    }

    try {
      await enrichRelease(persisted.release, parsed, pdfText);
      stats.enriched += 1;
    } catch (error) {
      await db.release.update({
        where: { id: persisted.release.id },
        data: {
          state: "FETCHED",
          ingestionError: `AI enrichment failed: ${
            error instanceof Error ? error.message : "Unknown AI error"
          }`
        }
      });
      addError(stats, {
        sourceUrl: candidate.sourceUrl,
        stage: "ai",
        code: "AI_ENRICHMENT_FAILED",
        message: error instanceof Error ? error.message : "AI enrichment failed."
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Release ingestion failed.";
    try {
      await recordFailedCandidate(candidate, message);
    } catch (databaseError) {
      if (stats.errors.length < MAX_LOGGED_ERRORS) {
        stats.errors.push({
          sourceUrl: candidate.sourceUrl,
          stage: "database",
          code: "FAILED_RECORD_WRITE",
          message:
            databaseError instanceof Error ? databaseError.message : "Could not save failed item."
        });
      }
    }
    addError(stats, {
      sourceUrl: candidate.sourceUrl,
      stage: "detail",
      code: "ITEM_FAILED",
      message
    });
  }
}

export async function runPibSync(trigger: SyncTrigger = "MANUAL") {
  const owner = randomUUID();
  if (!(await acquireLock(owner))) throw new SyncInProgressError();

  const stats: SyncStats = {
    discovered: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    enriched: 0,
    failed: 0,
    errors: []
  };
  let logId: string | undefined;
  let source = "RSS";

  try {
    const log = await db.syncLog.create({ data: { trigger, source, status: "RUNNING" } });
    logId = log.id;

    const discovery = await discover(stats);
    source = discovery.source;
    const items = discovery.items.slice(0, env.PIB_MAX_ITEMS_PER_SYNC);
    stats.discovered = items.length;

    if (items.length === 0) {
      stats.errors.push({
        stage: "discovery",
        code: "EMPTY_RESPONSE",
        message: "No releases were found in RSS or All Releases. Existing data was preserved."
      });
    } else {
      const limit = pLimit(env.PIB_FETCH_CONCURRENCY);
      await Promise.all(items.map((candidate) => limit(() => processCandidate(candidate, stats))));
    }

    const hasOperationalErrors = stats.errors.some(
      (error) => error.code !== "EMPTY_RSS"
    );
    const status: SyncStatus =
      stats.discovered === 0 || stats.failed > 0 || hasOperationalErrors
        ? "PARTIAL"
        : "SUCCESS";
    await db.syncLog.update({
      where: { id: log.id },
      data: {
        source,
        status,
        discovered: stats.discovered,
        created: stats.created,
        updated: stats.updated,
        skipped: stats.skipped,
        enriched: stats.enriched,
        failed: stats.failed,
        errors: stats.errors as unknown as Prisma.InputJsonValue,
        completedAt: new Date()
      }
    });
    return { syncId: log.id, status, source, ...stats };
  } catch (error) {
    if (logId) {
      await db.syncLog.update({
        where: { id: logId },
        data: {
          status: "FAILED",
          failed: stats.failed,
          errors: [
            ...stats.errors,
            {
              stage: "discovery",
              code: "SYNC_FAILED",
              message: error instanceof Error ? error.message : "Sync failed."
            }
          ] as unknown as Prisma.InputJsonValue,
          completedAt: new Date()
        }
      });
    }
    throw error;
  } finally {
    await releaseLock(owner).catch((error) => console.error("Failed to release sync lock", error));
  }
}
