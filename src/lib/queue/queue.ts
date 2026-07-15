import { Queue, type Job } from "bullmq";
import {
  PROCESS_RELEASE_JOB,
  RELEASE_PROCESSING_QUEUE,
  RUN_PIB_SYNC_JOB,
  type PibSyncJob,
  type QueueJob,
  type ReleaseProcessingJob
} from "@/lib/queue/constants";
import { getRedisConnection } from "@/lib/queue/connection";

let releaseProcessingQueue: Queue<QueueJob> | undefined;
const SYNC_JOB_ID = "global-pib-sync";
const UNFINISHED_JOB_STATES = new Set([
  "active",
  "delayed",
  "paused",
  "prioritized",
  "waiting",
  "waiting-children"
]);

export type EnqueueReleaseProcessingResult = {
  job: Job<QueueJob>;
  enqueued: boolean;
  existingState?: string;
};

export function getReleaseProcessingQueue() {
  releaseProcessingQueue ??= new Queue<QueueJob>(
    RELEASE_PROCESSING_QUEUE,
    {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000
        },
        removeOnComplete: {
          age: 24 * 60 * 60,
          count: 1000
        },
        removeOnFail: {
          age: 7 * 24 * 60 * 60
        }
      }
    }
  );

  return releaseProcessingQueue;
}

export async function enqueueReleaseProcessing(
  releaseId: string,
  syncLogId?: string
): Promise<EnqueueReleaseProcessingResult> {
  const queue = getReleaseProcessingQueue();
  const existingJob = await queue.getJob(releaseId);

  if (existingJob) {
    const existingState = await existingJob.getState();
    if (UNFINISHED_JOB_STATES.has(existingState)) {
      return { job: existingJob, enqueued: false, existingState };
    }
    await existingJob.remove();
  }

  const job = await queue.add(
    PROCESS_RELEASE_JOB,
    { releaseId, syncLogId },
    { jobId: releaseId }
  );
  return { job, enqueued: true };
}

export async function enqueuePibSync(
  trigger: PibSyncJob["trigger"]
): Promise<EnqueueReleaseProcessingResult> {
  const queue = getReleaseProcessingQueue();
  const existingJob = await queue.getJob(SYNC_JOB_ID);

  if (existingJob) {
    const existingState = await existingJob.getState();
    if (UNFINISHED_JOB_STATES.has(existingState)) {
      return { job: existingJob, enqueued: false, existingState };
    }
    await existingJob.remove();
  }

  const job = await queue.add(
    RUN_PIB_SYNC_JOB,
    { trigger },
    {
      jobId: SYNC_JOB_ID,
      attempts: 1,
      removeOnComplete: {
        age: 24 * 60 * 60,
        count: 100
      }
    }
  );
  return { job, enqueued: true };
}
