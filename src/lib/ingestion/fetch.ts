import https from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { env } from "@/lib/env";
import { isOfficialPibUrl } from "@/lib/ingestion/urls";

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const BROWSER_COMPATIBLE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
let lastRequestAt = 0;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = Math.max(env.PIB_MAX_PDF_BYTES, 15_000_000);

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function politeDelay() {
  const elapsed = Date.now() - lastRequestAt;
  const remaining = env.PIB_REQUEST_DELAY_MS - elapsed;
  if (remaining > 0) await wait(remaining);
  lastRequestAt = Date.now();
}

function nodeHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

function responseHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(key, item);
    } else if (value !== undefined) {
      result.set(key, value);
    }
  }
  return result;
}

function nativeHttpsRequest(
  url: string,
  headers: Headers,
  redirects = 0
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: nodeHeaders(headers),
        timeout: env.PIB_REQUEST_TIMEOUT_MS
      },
      (incoming) => {
        const status = incoming.statusCode ?? 500;
        const location = incoming.headers.location;

        if (REDIRECT_STATUSES.has(status) && location) {
          incoming.resume();
          if (redirects >= MAX_REDIRECTS) {
            reject(new Error(`PIB exceeded ${MAX_REDIRECTS} redirects.`));
            return;
          }
          const nextUrl = new URL(location, url);
          nextUrl.protocol = "https:";
          if (!isOfficialPibUrl(nextUrl.toString())) {
            reject(new Error("PIB redirected to a non-allowlisted URL."));
            return;
          }
          nativeHttpsRequest(nextUrl.toString(), headers, redirects + 1).then(resolve, reject);
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;
        incoming.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_RESPONSE_BYTES) {
            incoming.destroy(
              new Error(`PIB response exceeds ${MAX_RESPONSE_BYTES} byte limit.`)
            );
            return;
          }
          chunks.push(chunk);
        });
        incoming.on("error", reject);
        incoming.on("end", () => {
          const response = new Response(Buffer.concat(chunks), {
            status,
            headers: responseHeaders(incoming.headers)
          });
          Object.defineProperty(response, "url", { value: url });
          resolve(response);
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error(`PIB request timed out after ${env.PIB_REQUEST_TIMEOUT_MS}ms.`));
    });
    request.on("error", reject);
  });
}

export async function fetchOfficialPib(
  url: string,
  init: RequestInit = {},
  retries = 2
): Promise<Response> {
  if (!isOfficialPibUrl(url)) {
    throw new Error(`Blocked non-PIB URL: ${url}`);
  }

  const productToken = env.PIB_USER_AGENT.trim().split(/\s+/)[0];
  const userAgent = env.PIB_USER_AGENT.startsWith("Mozilla/")
    ? env.PIB_USER_AGENT
    : `${BROWSER_COMPATIBLE_USER_AGENT} ${productToken}`;
  const headers = new Headers({
    accept:
      "text/html,application/xhtml+xml,application/xml,application/pdf;q=0.9,*/*;q=0.5",
    "accept-language": "en-IN,en;q=0.9",
    "user-agent": userAgent
  });
  if (init.headers) {
    const additions = new Headers(init.headers);
    additions.forEach((value, key) => headers.set(key, value));
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await politeDelay();
    try {
      const response = await nativeHttpsRequest(url, headers);

      if (!isOfficialPibUrl(response.url)) {
        throw new Error(`PIB request redirected to a non-allowlisted host: ${response.url}`);
      }
      if (response.ok) return response;
      if (!RETRYABLE.has(response.status) || attempt === retries) {
        throw new Error(`PIB returned HTTP ${response.status} for ${url}`);
      }
      await wait(400 * 2 ** attempt);
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
      await wait(400 * 2 ** attempt);
    }
  }
  throw lastError;
}
