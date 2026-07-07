import { describe, expect, it } from "vitest";
import { describeAiError } from "@/lib/ai/errors";

describe("describeAiError", () => {
  it("extracts actionable Cerebras quota diagnostics", () => {
    const error = Object.assign(
      new Error(
        JSON.stringify({
          error: {
            code: 429,
            status: "rate_limit_exceeded",
            message: "Rate limit exceeded."
          }
        })
      ),
      { name: "RateLimitError", status: 429, headers: { "retry-after": "55" } }
    );

    expect(describeAiError(error, "gpt-oss-120b")).toMatchObject({
      aiProvider: "cerebras",
      category: "quota_exhausted",
      httpStatus: 429,
      providerStatus: "rate_limit_exceeded",
      retryAfterSeconds: 55,
      retryable: true
    });
  });

  it("identifies temporary provider overloads", () => {
    const error = Object.assign(
      new Error(
        JSON.stringify({
          error: {
            code: 503,
            status: "UNAVAILABLE",
            message: "This model is currently experiencing high demand."
          }
        })
      ),
      { name: "ApiError", status: 503 }
    );

    expect(describeAiError(error, "gpt-oss-120b")).toMatchObject({
      category: "provider_unavailable",
      httpStatus: 503,
      retryable: true,
      rootCause: "Cerebras is temporarily unavailable or overloaded."
    });
  });
});
