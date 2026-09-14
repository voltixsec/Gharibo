/**
 * API response envelope and pagination types.
 * @gharibo/shared — shared TypeScript types for the GHARIBO AI LAB monorepo.
 */

/** Standard API response envelope. code 0 = success; non-zero = error. */
export type ApiResponse<T> =
  | { code: 0; data: T; message: "ok" }
  | { code: number; data: null; message: string };

/** Paginated response wrapper for list endpoints. */
export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** HTTP error helper for route handlers. */
export class HttpError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Formats a successful API response. */
export function ok<T>(data: T): ApiResponse<T> {
  return { code: 0, data, message: "ok" };
}

/** Formats an error API response. */
export function err(code: number, message: string): ApiResponse<null> {
  return { code, data: null, message };
}

/** Wraps a handler in try/catch and returns a Next.js Response with the envelope. */
export function toApiResponse<T>(
  fn: () => T | Promise<T>,
): Promise<Response> {
  return Promise.resolve()
    .then(() => fn())
    .then((data) => Response.json(ok(data)))
    .catch((e: unknown) => {
      if (e instanceof HttpError) {
        return Response.json(err(e.code, e.message), { status: e.code >= 400 && e.code < 600 ? e.code : 500 });
      }
      const msg = e instanceof Error ? e.message : "Internal server error";
      return Response.json(err(500, msg), { status: 500 });
    });
}
