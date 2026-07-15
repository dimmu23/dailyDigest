import { env } from "@/lib/env";
import { apiError, hasBearerSecret, ok, withApiLogging } from "@/lib/http";
import { enqueuePibSync } from "@/lib/queue/queue";

export const maxDuration = 300;

export const GET = withApiLogging("/api/cron/sync", async (request) => {
  if (!hasBearerSecret(request, [env.CRON_SECRET])) {
    return apiError("unauthorized", "A valid cron bearer token is required.", 401);
  }

  const result = await enqueuePibSync("CRON");
  return ok({
    queued: result.enqueued,
    jobId: result.job.id,
    jobName: result.job.name,
    existingState: result.existingState
  });
});
