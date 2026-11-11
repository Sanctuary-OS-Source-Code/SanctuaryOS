/**
 * Sanitizes untrusted user/profile strings before interpolating them inside
 * PostgREST `.or(...)` filter expressions, stripping syntax-altering delimiters
 * (`,`, `(`, `)`, `%`, `*`, `"`, `\`) so attackers cannot inject arbitrary clauses.
 */
export function escapePostgrestFilterValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  return String(raw)
    .replace(/[,()%*"\\\r\n\0]/g, "")
    .trim();
}
