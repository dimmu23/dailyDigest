import { ok, withApiLogging } from "@/lib/http";
import { dailyDigest } from "@/lib/releases";
import { z } from "zod";

const querySchema = z.object({
  date: z.iso.date().default(() => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata"
  }).format(new Date())),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

export const GET = withApiLogging("/api/digest", async (request) => {
  const url = new URL(request.url);
  const query = querySchema.parse(Object.fromEntries(url.searchParams));
  return ok(await dailyDigest(query.date, query.limit), { date: query.date });
});
