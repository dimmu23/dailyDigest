import { randomUUID } from "node:crypto";
import {
  Prisma,
  ReleaseState,
  SyncStatus,
  type DiscoverySource,
  type SyncTrigger
} from "@prisma/client";
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
import { logError, logInfo, logWarn } from "@/lib/logger";
import { enqueueReleaseProcessing } from "@/lib/queue/queue";
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

export type ReleaseProcessingStage =
  | "db_load"
  | "mark_processing"
  | "fetch_detail"
  | "extract_pdf"
  | "save_source"
  | "ai_enrich"
  | "mark_failed"
  | "complete";

export type ReleaseProcessingProgress = {
  stage: ReleaseProcessingStage;
  releaseId: string;
  state?: ReleaseState;
  title?: string;
  sourceUrl?: string;
  pdfCount?: number;
  pdfTextLength?: number;
  unchanged?: boolean;
  message?: string;
};

type ReleaseProcessingOptions = {
  onProgress?: (progress: ReleaseProcessingProgress) => void;
};

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

function newestFirst(items: DiscoveryCandidate[]) {
  return [...items].sort((left, right) => {
    const leftTime = left.publishedDate?.getTime() ?? 0;
    const rightTime = right.publishedDate?.getTime() ?? 0;
    return rightTime - leftTime;
  });
}

export async function discoverReleases(stats: SyncStats): Promise<{
  items: DiscoveryCandidate[];
  source: DiscoverySource;
}> {
  try {
    const rss = newestFirst(dedupeCandidates(await discoverFromRss()));
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
    const fallback = newestFirst(dedupeCandidates(await discoverFromAllReleases()));
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

export async function getPdfText(parsed: ParsedRelease, stats: SyncStats): Promise<string | null> {
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

export async function upsertSource(
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
    const hadEnrichment = Boolean(existing.aiEnrichedAt);
    const release = await db.release.update({
      where: { id: existing.id },
      data: {
        ...data,
        state: unchanged ? ReleaseState.ENRICHED : ReleaseState.FETCHED
      }
    });
    return { release, created: false, unchanged, hadEnrichment };
  }

  const release = await db.release.create({ data });
  return { release, created: true, unchanged: false, hadEnrichment: false };
}

export async function enrichRelease(
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
        aiModel: env.CEREBRAS_MODEL,
        aiPromptVersion: PROMPT_VERSION,
        aiEnrichedAt: new Date(),
        state: ReleaseState.ENRICHED,
        ingestionError: null
      }
    })
  ]);
}

async function upsertDiscoveredCandidate(candidate: DiscoveryCandidate) {
  const existing = await db.release.findFirst({
    where: {
      OR: [
        ...(candidate.prid ? [{ prid: candidate.prid }] : []),
        { sourceUrl: candidate.sourceUrl }
      ]
    }
  });
  if (existing) {
    return {
      release: existing,
      created: false,
      shouldEnqueue: existing.state !== ReleaseState.ENRICHED
    };
  }

  const ministryName = candidate.ministry
    ? normalizeWhitespace(candidate.ministry).slice(0, 160)
    : null;
  const ministry = ministryName
    ? await db.ministry.upsert({
        where: { name: ministryName },
        update: {},
        create: { name: ministryName, slug: slugify(ministryName) || `ministry-${randomUUID()}` }
      })
    : null;

  const release = await db.release.create({
    data: {
      prid: candidate.prid,
      sourceId: candidate.sourceId,
      title: candidate.title || "Not available from source.",
      ministryId: ministry?.id ?? null,
      publishedDate: candidate.publishedDate || new Date(),
      sourceUrl: candidate.sourceUrl,
      rawText: "",
      discoverySource: candidate.discoverySource,
      state: ReleaseState.DISCOVERED,
      ingestionError: null
    }
  });

  return { release, created: true, shouldEnqueue: true };
}

export async function processReleaseById(
  releaseId: string,
  options: ReleaseProcessingOptions = {}
) {
  options.onProgress?.({ stage: "db_load", releaseId });
  const release = await db.release.findUnique({
    where: { id: releaseId },
    include: { ministry: true }
  });
  if (!release) throw new Error(`Release not found: ${releaseId}`);
  options.onProgress?.({
    stage: "db_load",
    releaseId,
    state: release.state,
    title: release.title,
    sourceUrl: release.sourceUrl
  });

  await db.release.update({
    where: { id: release.id },
    data: { state: ReleaseState.PROCESSING, ingestionError: null }
  });
  options.onProgress?.({
    stage: "mark_processing",
    releaseId,
    state: ReleaseState.PROCESSING,
    title: release.title,
    sourceUrl: release.sourceUrl
  });

  const stats: SyncStats = {
    discovered: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    enriched: 0,
    failed: 0,
    errors: []
  };

  try {
    const candidate: DiscoveryCandidate = {
      sourceUrl: release.sourceUrl,
      sourceId: release.sourceId,
      prid: release.prid,
      title: release.title,
      ministry: release.ministry?.name,
      publishedDate: release.publishedDate,
      discoverySource: release.discoverySource
    };
    options.onProgress?.({
      stage: "fetch_detail",
      releaseId,
      title: release.title,
      sourceUrl: release.sourceUrl
    });
    const parsed = await fetchAndParseRelease(candidate);
    options.onProgress?.({
      stage: "extract_pdf",
      releaseId,
      title: parsed.title,
      sourceUrl: parsed.sourceUrl,
      pdfCount: parsed.pdfUrls.length
    });
    const pdfText = await getPdfText(parsed, stats);
    options.onProgress?.({
      stage: "save_source",
      releaseId,
      title: parsed.title,
      sourceUrl: parsed.sourceUrl,
      pdfCount: parsed.pdfUrls.length,
      pdfTextLength: pdfText?.length ?? 0
    });
    const persisted = await upsertSource(parsed, pdfText, release.discoverySource);

    if (persisted.unchanged) {
      options.onProgress?.({
        stage: "complete",
        releaseId,
        state: ReleaseState.ENRICHED,
        title: parsed.title,
        sourceUrl: parsed.sourceUrl,
        unchanged: true
      });
      return;
    }
    if (!canClassify()) {
      throw new Error("AI enrichment is not configured. Set CEREBRAS_API_KEY.");
    }

    options.onProgress?.({
      stage: "ai_enrich",
      releaseId,
      title: parsed.title,
      sourceUrl: parsed.sourceUrl
    });
    await enrichRelease(persisted.release, parsed, pdfText);
    options.onProgress?.({
      stage: "complete",
      releaseId,
      state: ReleaseState.ENRICHED,
      title: parsed.title,
      sourceUrl: parsed.sourceUrl
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Release processing failed.";
    options.onProgress?.({
      stage: "mark_failed",
      releaseId,
      state: ReleaseState.FAILED,
      title: release.title,
      sourceUrl: release.sourceUrl,
      message
    });
    await db.release.update({
      where: { id: release.id },
      data: { state: ReleaseState.FAILED, ingestionError: message }
    });
    throw error;
  }
}

export async function runPibSync(trigger: SyncTrigger = "MANUAL") {
  const owner = randomUUID();
  logInfo("pib_sync_started", {
    owner,
    trigger,
    maxItems: env.PIB_MAX_ITEMS_PER_SYNC,
    fetchConcurrency: env.PIB_FETCH_CONCURRENCY
  });
  if (!(await acquireLock(owner))) {
    logWarn("pib_sync_lock_rejected", { owner, trigger });
    throw new SyncInProgressError();
  }

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

    const discovery = await discoverReleases(stats);
    source = discovery.source;
    const items = discovery.items.slice(0, env.PIB_MAX_ITEMS_PER_SYNC);
    stats.discovered = items.length;
    logInfo("pib_sync_discovery_completed", {
      owner,
      syncId: log.id,
      trigger,
      source,
      discovered: stats.discovered,
      discoveryErrors: stats.errors.length
    });

    if (items.length === 0) {
      stats.errors.push({
        stage: "discovery",
        code: "EMPTY_RESPONSE",
        message: "No releases were found in RSS or All Releases. Existing data was preserved."
      });
    } else {
      for (const candidate of items) {
        try {
          const persisted = await upsertDiscoveredCandidate(candidate);
          if (persisted.created) stats.created += 1;

          if (persisted.shouldEnqueue) {
            const enqueueResult = await enqueueReleaseProcessing(persisted.release.id, log.id);
            if (!persisted.created && enqueueResult.enqueued) stats.updated += 1;
            else if (!enqueueResult.enqueued) stats.skipped += 1;
          } else {
            stats.skipped += 1;
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not save discovered release.";
          logError(
            "pib_sync_discovered_item_failed",
            { sourceUrl: candidate.sourceUrl, discoverySource: candidate.discoverySource },
            error
          );
          addError(stats, {
            sourceUrl: candidate.sourceUrl,
            stage: "database",
            code: "DISCOVERED_RECORD_WRITE",
            message
          });
        }
      }
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
    logInfo("pib_sync_completed", {
      owner,
      syncId: log.id,
      trigger,
      status,
      source,
      discovered: stats.discovered,
      created: stats.created,
      updated: stats.updated,
      skipped: stats.skipped,
      enriched: stats.enriched,
      failed: stats.failed,
      errorCount: stats.errors.length
    });
    return { syncId: log.id, status, source, ...stats };
  } catch (error) {
    logError("pib_sync_failed", { owner, syncId: logId, trigger, source }, error);
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
    await releaseLock(owner).catch((error) =>
      logError("pib_sync_lock_release_failed", { owner, syncId: logId, trigger }, error)
    );
  }
}
