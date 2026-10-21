/** The constraint name of a Postgres unique violation (23505), undefined for any other error. */
export function uniqueViolation(error: unknown): string | undefined {
  const cause = (error as { cause?: { code?: string; constraint_name?: string } } | null)?.cause;
  return cause?.code === '23505' ? cause.constraint_name : undefined;
}
