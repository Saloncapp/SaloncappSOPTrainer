export function httpError(message: string, status: number): Error {
  const err = new Error(message);
  (err as Error & { status: number }).status = status;
  return err;
}

export function errorStatus(err: unknown): number {
  return (err as { status?: number })?.status || 500;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Server error";
}
