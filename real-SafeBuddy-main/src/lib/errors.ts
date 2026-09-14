/**
 * Read a message off an unknown thrown value.
 *
 * `catch` gives `unknown`, and Supabase rejects with plain objects that have a
 * `message` but are not `Error` instances. This covers both without needing
 * `any` at every call site.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;

  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error as { message: unknown };
    if (typeof message === "string" && message) return message;
  }

  return fallback;
}
