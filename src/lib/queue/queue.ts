import { Queue, type Job } from "bullmq";
import {
  PROCESS_RELEASE_JOB,
  RELEASE_PROCESSING_QUEUE,
  type ReleaseProcessingJob
} from "@/lib/queue/constants";
import { getRedisConnection } from "@/lib/queue/connection";

let releaseProcessingQueue: Queue<ReleaseProcessingJob> | undefined;
const UNFINISHED_JOB_STATES = new Set([
  "active",
  "delayed",
  "paused",
  "prioritized",
  "waiting",
  "waiting-children"
]);

export type EnqueueReleaseProcessingResult = {
  job: Job<ReleaseProcessingJob>;
  enqueued: boolean;
  existingState?: string;
};

export function getReleaseProcessingQueue() {
  releaseProcessingQueue ??= new Queue<ReleaseProcessingJob>(
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
