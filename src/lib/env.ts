import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal(""));

const schema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  SYNC_SECRET: z.string().min(16).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  APP_URL: optionalUrl,
  PIB_RSS_URL: z
    .string()
    .url()
    .default("https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1"),
  PIB_ALL_RELEASES_URL: z
    .string()
    .url()
    .default("https://www.pib.gov.in/AllRelease.aspx?MenuId=24&lang=1&reg=1"),
  PIB_FETCH_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(2),
  PIB_REQUEST_DELAY_MS: z.coerce.number().int().min(0).max(5000).default(500),
  PIB_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  PIB_MAX_ITEMS_PER_SYNC: z.coerce.number().int().min(1).max(200).default(40),
  PIB_MAX_PDF_BYTES: z.coerce.number().int().min(100000).max(25000000).default(12000000),
  PIB_USER_AGENT: z
    .string()
    .min(12)
    .default(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 " +
        "PIB-UPSC-Brief/0.1"
    )
});

export const env = schema.parse(process.env);
