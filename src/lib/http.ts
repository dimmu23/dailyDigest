import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { errorDetails, logError, logInfo, logWarn } from "@/lib/logger";

type RouteContext = {
  requestId: string;
  route: string;
  method: string;
  durationMs: number;
};

type RouteHandler<TArgs extends unknown[]> = (
  request: Request,
  ...args: TArgs
) => Response | Promise<Response>;

export class ApiRouteError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ApiRouteError";
  }
}

export function ok<T>(data: T, meta?: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(meta ? { data, meta } : { data }, init);
}

export function apiError(
  code: string,
  message: string,
  status = 500,
  details?: unknown
) {
  return NextResponse.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status }
  );
}

export function handleRouteError(error: unknown, context?: RouteContext) {
  if (error instanceof ZodError) {
    logWarn("api_request_validation_failed", {
      ...context,
      issues: error.issues.map(({ code, path, message }) => ({ code, path, message }))
    });
    return apiError("invalid_request", "Request validation failed.", 400, error.flatten());
  }
  if (error instanceof ApiRouteError) {
    const fields = {
      ...context,
      apiErrorCode: error.code,
      ...errorDetails(error.cause ?? error)
    };
    if (error.status >= 500) logError("api_request_failed", fields);
    else logWarn("api_request_rejected", fields);
    return apiError(error.code, error.message, error.status, error.details);
  }
  logError("api_request_failed", { ...context, ...errorDetails(error) });
  return apiError("internal_error", "The request could not be completed.", 500);
}

export function withApiLogging<TArgs extends unknown[]>(
  route: string,
  handler: RouteHandler<TArgs>
) {
  return async (request: Request, ...args: TArgs): Promise<Response> => {
    const startedAt = performance.now();
    const incomingRequestId = request.headers.get("x-request-id");
    const requestId =
      incomingRequestId && incomingRequestId.length <= 128
        ? incomingRequestId
        : randomUUID();
    const base = { requestId, route, method: request.method };
    logInfo("api_request_started", base);

    let response: Response;
    try {
      response = await handler(request, ...args);
    } catch (error) {
      response = handleRouteError(error, {
        ...base,
        durationMs: Math.round(performance.now() - startedAt)
      });
    }

    response.headers.set("x-request-id", requestId);
    const fields = {
      ...base,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt)
    };
    if (response.status >= 500) logError("api_request_completed", fields);
    else if (response.status >= 400) logWarn("api_request_completed", fields);
    else logInfo("api_request_completed", fields);
    return response;
  };
}

export function hasBearerSecret(request: Request, secrets: Array<string | undefined>): boolean {
  const expected = secrets.filter(Boolean);
  if (expected.length === 0) return process.env.NODE_ENV === "development";
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  return expected.includes(authorization.slice(7));
}
