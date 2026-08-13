export function isErrnoException(error: unknown): error is NodeJS.ErrnoException & { code: string } {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}
