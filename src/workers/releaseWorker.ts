import { Worker, type Job } from "bullmq";
import { db } from "@/lib/db";
import {
  processReleaseById,
  type ReleaseProcessingProgress
} from "@/lib/ingestion/pipeline";
import { logError, logInfo } from "@/lib/logger";
import {
  RELEASE_PROCESSING_QUEUE,
  type ReleaseProcessingJob
} from "@/lib/queue/constants";
import { redisConnection } from "@/lib/queue/connection";

function baseJobFields(job: Job<ReleaseProcessingJob>, startedAt: number) {
  return {
    queue: RELEASE_PROCESSING_QUEUE,
    jobName: job.name,
    jobId: job.id,
    releaseId: job.data.releaseId,
    attempt: job.attemptsMade + 1,
    maxAttempts: job.opts.attempts,
    elapsedMs: Math.round(performance.now() - startedAt)
  };
}

function logJobStage(
  job: Job<ReleaseProcessingJob>,
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

const worker = new Worker<ReleaseProcessingJob>(
  RELEASE_PROCESSING_QUEUE,
  async (job: Job<ReleaseProcessingJob>) => {
    const startedAt = performance.now();
    const { releaseId } = job.data;

    logInfo("release_worker_job_started", {
      ...baseJobFields(job, startedAt),
      message: "Worker picked up release processing job."
    });

    try {
      await processReleaseById(releaseId, {
        onProgress: (progress) => logJobStage(job, startedAt, progress)
      });
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
  logError(
    "release_worker_retry_or_exhausted",
    {
      queue: RELEASE_PROCESSING_QUEUE,
      jobId: job?.id,
      releaseId: job?.data.releaseId,
      attemptsMade: job?.attemptsMade,
      maxAttempts: job?.opts.attempts,
      willRetry: job ? job.attemptsMade < (job.opts.attempts ?? 1) : undefined,
      message: "BullMQ marked the job failed for this attempt."
    },
    error
  );
});

worker.on("error", (error) => {
  logError("release_worker_runtime_error", { queue: RELEASE_PROCESSING_QUEUE }, error);
});

async function shutdown(signal: NodeJS.Signals) {
  logInfo("release_worker_shutdown_started", { queue: RELEASE_PROCESSING_QUEUE, signal });
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
