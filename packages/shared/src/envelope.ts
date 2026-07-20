import { z } from "zod";

/**
 * Uniform response envelope for every HTTP boundary in the system
 * (ingestor -> metrics -> gateway -> web). Keeping this consistent means
 * any client can handle success/error the same way regardless of which
 * service answered.
 */
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export function ok<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

export function err(code: string, message: string): ApiResponse<never> {
  return { ok: false, error: { code, message } };
}

export function apiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data: dataSchema }),
    z.object({ ok: z.literal(false), error: ApiErrorSchema }),
  ]);
}
