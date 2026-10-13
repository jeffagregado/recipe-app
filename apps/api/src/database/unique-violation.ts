/** A unique violation on the named constraint, wherever the driver error sits in the cause chain. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const seen = new Set<Error>();
  for (let cause = error; cause instanceof Error && !seen.has(cause); cause = cause.cause) {
    seen.add(cause);
    if ('code' in cause && cause.code === '23505' && 'constraint' in cause && cause.constraint === constraint) return true;
  }
  return false;
}
