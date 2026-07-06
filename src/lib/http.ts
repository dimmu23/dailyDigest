import { NextResponse } from "next/server";
import { ZodError } from "zod";

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

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return apiError("invalid_request", "Request validation failed.", 400, error.flatten());
  }
  console.error(error);
  return apiError("internal_error", "The request could not be completed.", 500);
}

export function hasBearerSecret(request: Request, secrets: Array<string | undefined>): boolean {
  const expected = secrets.filter(Boolean);
  if (expected.length === 0) return process.env.NODE_ENV === "development";
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  return expected.includes(authorization.slice(7));
}

