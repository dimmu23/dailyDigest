type UnknownRecord = Record<string, unknown>;

export type AiErrorDiagnostics = {
  aiProvider: "cerebras";
  aiModel: string;
  category:
    | "quota_exhausted"
    | "provider_unavailable"
    | "authentication_failed"
    | "invalid_request"
    | "invalid_response"
    | "configuration_error"
    | "unknown";
  rootCause: string;
  recommendedAction: string;
  retryable: boolean;
  httpStatus?: number;
  providerStatus?: string;
  retryAfterSeconds?: number;
  quotaMetric?: string;
  quotaId?: string;
  quotaLimit?: string;
  quotaModel?: string;
};

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseProviderError(error: unknown): UnknownRecord | undefined {
  if (!(error instanceof Error)) return undefined;
  try {
    const parsed = record(JSON.parse(error.message));
    return (record(parsed?.error) ?? parsed) as UnknownRecord | undefined;
  } catch {
    return undefined;
  }
}

function findDetail(details: unknown, suffix: string): UnknownRecord | undefined {
  if (!Array.isArray(details)) return undefined;
  return details
    .map(record)
    .find((detail) => string(detail?.["@type"])?.endsWith(suffix));
}

function retryDelaySeconds(details: unknown): number | undefined {
  const delay = string(findDetail(details, "RetryInfo")?.retryDelay);
  const match = delay?.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Math.ceil(Number(match[1])) : undefined;
}

function headerValue(headers: unknown, name: string): string | undefined {
  const lowerName = name.toLowerCase();
  if (headers && typeof headers === "object" && "get" in headers) {
    const value = (headers as { get(key: string): unknown }).get(name);
    return string(value) ?? undefined;
  }
  const headersRecord = record(headers);
  const foundKey = Object.keys(headersRecord ?? {}).find((key) => key.toLowerCase() === lowerName);
  return foundKey ? string(headersRecord?.[foundKey]) : undefined;
}

export function describeAiError(error: unknown, model: string): AiErrorDiagnostics {
  const errorRecord = record(error);
  const providerError = parseProviderError(error);
  const httpStatus = number(errorRecord?.status) ?? number(providerError?.code);
  const providerStatus = string(providerError?.status);
  const retryAfterHeader = headerValue(errorRecord?.headers, "retry-after");
  const providerMessage =
    string(providerError?.message) ?? (error instanceof Error ? error.message : String(error));
  const details = providerError?.details;
  const quotaFailure = findDetail(details, "QuotaFailure");
  const violation = Array.isArray(quotaFailure?.violations)
    ? record(quotaFailure.violations[0])
    : undefined;
  const quotaDimensions = record(violation?.quotaDimensions);
  const retryAfterHeaderSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;
  const retryAfterSeconds =
    retryDelaySeconds(details) ??
    (Number.isFinite(retryAfterHeaderSeconds) ? retryAfterHeaderSeconds : undefined);
  const common = {
    aiProvider: "cerebras" as const,
    aiModel: model,
    httpStatus,
    providerStatus,
    retryAfterSeconds,
    quotaMetric: string(violation?.quotaMetric),
    quotaId: string(violation?.quotaId),
    quotaLimit: string(violation?.quotaValue),
    quotaModel: string(quotaDimensions?.model)
  };

  if (httpStatus === 429 || providerStatus === "RESOURCE_EXHAUSTED") {
    const limit = common.quotaLimit ? ` (limit ${common.quotaLimit})` : "";
    const quotaModel = common.quotaModel ? ` for ${common.quotaModel}` : "";
    const retry = retryAfterSeconds
      ? `Retry after at least ${retryAfterSeconds} seconds.`
      : "Wait for the quota window to reset.";
    return {
      ...common,
      category: "quota_exhausted",
      rootCause: `Cerebras request quota or rate limit is exhausted${quotaModel}${limit}.`,
      recommendedAction: `${retry} If this persists, review Cerebras rate limits, billing, or project quota.`,
      retryable: true
    };
  }

  if (httpStatus === 503 || providerStatus === "UNAVAILABLE") {
    return {
      ...common,
      category: "provider_unavailable",
      rootCause: "Cerebras is temporarily unavailable or overloaded.",
      recommendedAction: "Retry with exponential backoff; no application data change is required.",
      retryable: true
    };
  }

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      ...common,
      category: "authentication_failed",
      rootCause: "Cerebras rejected the API credentials or project permissions.",
      recommendedAction: "Verify CEREBRAS_API_KEY and Cerebras project access.",
      retryable: false
    };
  }

  if (httpStatus === 400 || httpStatus === 422) {
    return {
      ...common,
      category: "invalid_request",
      rootCause: `Cerebras rejected the request: ${providerMessage}`,
      recommendedAction: "Check the selected model, request size, prompt, and response schema.",
      retryable: false
    };
  }

  if (providerMessage.includes("CEREBRAS_API_KEY is not configured")) {
    return {
      ...common,
      category: "configuration_error",
      rootCause: "CEREBRAS_API_KEY is missing from the runtime environment.",
      recommendedAction: "Add CEREBRAS_API_KEY to the deployment environment and redeploy.",
      retryable: false
    };
  }

  if (
    providerMessage.includes("invalid JSON") ||
    providerMessage.includes("structured output") ||
    error instanceof Error && error.name === "ZodError"
  ) {
    return {
      ...common,
      category: "invalid_response",
      rootCause: "Cerebras returned output that did not match the required UPSC analysis schema.",
      recommendedAction: "Inspect the model response and schema; retrying with a stricter prompt may help.",
      retryable: true
    };
  }

  return {
    ...common,
    category: "unknown",
    rootCause: providerMessage.slice(0, 500),
    recommendedAction: "Inspect errorName, errorMessage, and stack for the originating operation.",
    retryable: false
  };
}
