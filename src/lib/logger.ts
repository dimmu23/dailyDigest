type LogLevel = "info" | "warn" | "error";
type LogFields = Record<string, unknown>;

const SENSITIVE_KEY = /authorization|cookie|password|secret|token|api[_-]?key/i;

function redactText(value: string): string {
  return value
    .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, "$1[REDACTED]@")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_GOOGLE_API_KEY]");
}

function sanitize(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactText(value);
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([field, item]) => [
        field,
        sanitize(item, field)
      ])
    );
  }
  return String(value);
}

export function errorDetails(error: unknown): LogFields {
  if (!(error instanceof Error)) {
    return { errorType: typeof error, errorMessage: sanitize(error) };
  }

  const coded = error as Error & {
    code?: unknown;
    clientVersion?: unknown;
    cause?: unknown;
  };
  const details: LogFields = {
    errorName: error.name,
    errorMessage: redactText(error.message)
  };
  if (typeof coded.code === "string" || typeof coded.code === "number") {
    details.errorCode = coded.code;
  }
  if (typeof coded.clientVersion === "string") {
    details.prismaClientVersion = coded.clientVersion;
  }
  if (error.stack) {
    details.stack = redactText(error.stack);
  }
  if (coded.cause instanceof Error) {
    details.cause = {
      name: coded.cause.name,
      message: redactText(coded.cause.message)
    };
  }
  return details;
}

function write(level: LogLevel, event: string, fields: LogFields = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(sanitize(fields) as LogFields)
  };
  const output = JSON.stringify(entry);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.info(output);
}

export const logInfo = (event: string, fields?: LogFields) => write("info", event, fields);
export const logWarn = (event: string, fields?: LogFields) => write("warn", event, fields);
export const logError = (event: string, fields: LogFields, error?: unknown) =>
  write("error", event, {
    ...fields,
    ...(error === undefined ? {} : errorDetails(error))
  });
