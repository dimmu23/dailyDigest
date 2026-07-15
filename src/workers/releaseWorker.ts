import { createServer } from "node:http";
import { Worker, type Job } from "bullmq";
import { db } from "@/lib/db";
import {
  runPibSync,
  processReleaseById,
  type ReleaseProcessingProgress
} from "@/lib/ingestion/pipeline";
import { logError, logInfo } from "@/lib/logger";
import {
  PROCESS_RELEASE_JOB,
  RELEASE_PROCESSING_QUEUE,
  RUN_PIB_SYNC_JOB,
  type QueueJob,
  type ReleaseProcessingJob
} from "@/lib/queue/constants";
import { getRedisConnection } from "@/lib/queue/connection";

const redisConnection = getRedisConnection();
const port = Number(process.env.PORT || 3001);

function isReleaseProcessingJob(job: Job<QueueJob>): job is Job<ReleaseProcessingJob> {
  return job.name === PROCESS_RELEASE_JOB && "releaseId" in job.data;
}

function baseJobFields(job: Job<QueueJob>, startedAt: number) {
  return {
    queue: RELEASE_PROCESSING_QUEUE,
    jobName: job.name,
    jobId: job.id,
    releaseId: "releaseId" in job.data ? job.data.releaseId : undefined,
    syncLogId: "syncLogId" in job.data ? job.data.syncLogId : undefined,
    syncTrigger: "trigger" in job.data ? job.data.trigger : undefined,
    attempt: job.attemptsMade + 1,
    maxAttempts: job.opts.attempts,
    elapsedMs: Math.round(performance.now() - startedAt)
  };
}

function logJobStage(
  job: Job<QueueJob>,
  startedAt: number,
  progress: ReleaseProcessingProgress
) {
  logInfo("release_worker_stage", {
    ...baseJobFields(job, startedAt),
    stage: progress.stage,
    state: progress.state,
    title: progress.title,
    sourceUrl: progress.sourceUrl,
    pdfCount: progress.pdfCount,
    pdfTextLength: progress.pdfTextLength,
    unchanged: progress.unchanged,
    message: progress.message
  });
}

const worker = new Worker<QueueJob>(
  RELEASE_PROCESSING_QUEUE,
  async (job: Job<QueueJob>) => {
    const startedAt = performance.now();

    logInfo("release_worker_job_started", {
      ...baseJobFields(job, startedAt),
      message: "Worker picked up queue job."
    });

    try {
      if (job.name === RUN_PIB_SYNC_JOB && "trigger" in job.data) {
        const result = await runPibSync(job.data.trigger);
        logInfo("release_worker_sync_job_completed", {
          ...baseJobFields(job, startedAt),
          durationMs: Math.round(performance.now() - startedAt),
          syncId: result.syncId,
          status: result.status,
          discovered: result.discovered,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          failed: result.failed,
          message: "PIB sync job finished successfully."
        });
        return;
      }

      if (!isReleaseProcessingJob(job)) {
        throw new Error(`Unsupported queue job: ${job.name}`);
      }

      const { releaseId } = job.data;
      await processReleaseById(releaseId, {
        onProgress: (progress) => logJobStage(job, startedAt, progress)
      });
      if (job.data.syncLogId) {
        await db.syncLog.update({
          where: { id: job.data.syncLogId },
          data: { enriched: { increment: 1 } }
        });
      }
      logInfo("release_worker_job_completed", {
        ...baseJobFields(job, startedAt),
        durationMs: Math.round(performance.now() - startedAt),
        message: "Release processing job finished successfully."
      });
    } catch (error) {
      logError(
        "release_worker_job_failed",
        {
          ...baseJobFields(job, startedAt),
          durationMs: Math.round(performance.now() - startedAt),
          willRetry: job.attemptsMade + 1 < (job.opts.attempts ?? 1),
          message: "Release processing job failed."
        },
        error
      );
      throw error;
    }
  },
  {
    connection: redisConnection
  }
);

worker.on("failed", (job, error) => {
  const attemptsMade = job?.attemptsMade ?? 0;
  const maxAttempts = job?.opts.attempts ?? 1;
  const exhausted = attemptsMade >= maxAttempts;
  const failedReleaseId = job && "releaseId" in job.data ? job.data.releaseId : undefined;
  const failedSyncLogId = job && "syncLogId" in job.data ? job.data.syncLogId : undefined;
  if (job && failedSyncLogId && exhausted) {
    void db.syncLog.update({
      where: { id: failedSyncLogId },
      data: { failed: { increment: 1 } }
    }).catch((updateError) => {
      logError(
        "release_worker_sync_log_failed_increment_error",
        {
          queue: RELEASE_PROCESSING_QUEUE,
          jobId: job.id,
          releaseId: failedReleaseId,
          syncLogId: failedSyncLogId
        },
        updateError
      );
    });
  }

  logError(
    "release_worker_retry_or_exhausted",
    {
      queue: RELEASE_PROCESSING_QUEUE,
      jobId: job?.id,
      releaseId: failedReleaseId,
      syncTrigger: job && "trigger" in job.data ? job.data.trigger : undefined,
      attemptsMade,
      maxAttempts,
      willRetry: job ? !exhausted : undefined,
      message: "BullMQ marked the job failed for this attempt."
    },
    error
  );
});

worker.on("error", (error) => {
  logError("release_worker_runtime_error", { queue: RELEASE_PROCESSING_QUEUE }, error);
});

const healthServer = createServer((request, response) => {
  if (request.url === "/health" || request.url === "/") {
    const body = JSON.stringify({
      ok: true,
      service: "release-worker",
      queue: RELEASE_PROCESSING_QUEUE,
      redisStatus: redisConnection.status
    });

    response.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store"
    });
    response.end(body);
    return;
  }

  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: false, error: "not_found" }));
});

healthServer.listen(port, () => {
  logInfo("release_worker_http_started", {
    queue: RELEASE_PROCESSING_QUEUE,
    port,
    message: "Worker health server is listening."
  });
});

async function shutdown(signal: NodeJS.Signals) {
  logInfo("release_worker_shutdown_started", { queue: RELEASE_PROCESSING_QUEUE, signal });
  await new Promise<void>((resolve, reject) => {
    healthServer.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  await worker.close();
  await db.$disconnect();
  await redisConnection.quit();
  logInfo("release_worker_shutdown_completed", { queue: RELEASE_PROCESSING_QUEUE, signal });
}

process.once("SIGINT", () => {
  void shutdown("SIGINT").then(() => process.exit(0));
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM").then(() => process.exit(0));
});

logInfo("release_worker_started", {
  queue: RELEASE_PROCESSING_QUEUE,
  redisStatus: redisConnection.status,
  message: "Worker is listening for release-processing jobs."
});
