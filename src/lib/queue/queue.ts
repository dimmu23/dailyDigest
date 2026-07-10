import { Queue } from "bullmq";
import {
  PROCESS_RELEASE_JOB,
  RELEASE_PROCESSING_QUEUE,
  type ReleaseProcessingJob
} from "@/lib/queue/constants";
import { getRedisConnection } from "@/lib/queue/connection";

let releaseProcessingQueue: Queue<ReleaseProcessingJob> | undefined;

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

export function enqueueReleaseProcessing(releaseId: string) {
  return getReleaseProcessingQueue().add(PROCESS_RELEASE_JOB, { releaseId });
}
