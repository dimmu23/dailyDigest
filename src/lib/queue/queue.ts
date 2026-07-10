import { Queue } from "bullmq";
import {
  PROCESS_RELEASE_JOB,
  RELEASE_PROCESSING_QUEUE,
  type ReleaseProcessingJob
} from "@/lib/queue/constants";
import { redisConnection } from "@/lib/queue/connection";

export const releaseProcessingQueue = new Queue<ReleaseProcessingJob>(
  RELEASE_PROCESSING_QUEUE,
  {
    connection: redisConnection,
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

export function enqueueReleaseProcessing(releaseId: string) {
  return releaseProcessingQueue.add(PROCESS_RELEASE_JOB, { releaseId });
}
