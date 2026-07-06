import { db } from "@/lib/db";
import { handleRouteError, ok } from "@/lib/http";

export async function GET() {
  try {
    const [latest, latestSuccessful] = await Promise.all([
      db.syncLog.findFirst({ orderBy: { startedAt: "desc" } }),
      db.syncLog.findFirst({
        where: { status: "SUCCESS" },
        orderBy: { completedAt: "desc" }
      })
    ]);
    return ok({ latest, latestSuccessful });
  } catch (error) {
    return handleRouteError(error);
  }
}

