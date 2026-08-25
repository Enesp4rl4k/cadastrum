import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export interface ApiResponseSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiResponseError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function apiSuccess<T>(
  c: Context,
  data: T,
  status: ContentfulStatusCode = 200,
  meta?: Record<string, unknown>,
  headers?: Record<string, string>,
): Response {
  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      c.header(k, v);
    }
  }
  return c.json<ApiResponseSuccess<T>>(
    {
      success: true,
      data,
      ...(meta ? { meta } : {}),
    },
    status,
  );
}

export function apiError(
  c: Context,
  message: string,
  code = "BAD_REQUEST",
  status: ContentfulStatusCode = 400,
  details?: unknown,
): Response {
  return c.json<ApiResponseError>(
    {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    status,
  );
}
