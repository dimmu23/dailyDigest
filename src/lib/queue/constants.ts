export const RELEASE_PROCESSING_QUEUE = "release-processing";
export const PROCESS_RELEASE_JOB = "process-release";
export const RUN_PIB_SYNC_JOB = "run-pib-sync";

export type ReleaseProcessingJob = {
  releaseId: string;
  syncLogId?: string;
};

export type PibSyncJob = {
  trigger: "CRON" | "MANUAL" | "RETRY";
};

export type QueueJob = ReleaseProcessingJob | PibSyncJob;
