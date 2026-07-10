import IORedis from "ioredis";
import { env } from "@/lib/env";

const globalForRedis = globalThis as unknown as { redis?: IORedis };

export const redisConnection =
  globalForRedis.redis ??
  new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redisConnection;
}
