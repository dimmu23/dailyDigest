import { db } from "@/lib/db";
import { ok, withApiLogging } from "@/lib/http";

export const GET = withApiLogging("/api/sync/status", async () => {
  const [latest, latestSuccessful] = await Promise.all([
    db.syncLog.findFirst({ orderBy: { startedAt: "desc" } }),
    db.syncLog.findFirst({
      where: { status: "SUCCESS" },
      orderBy: { completedAt: "desc" }
    })
  ]);
  return ok({ latest, latestSuccessful });
});
