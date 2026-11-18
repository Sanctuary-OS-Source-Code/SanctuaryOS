export function dollarsToCents(val: string): number {
  const num = parseFloat(val);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

export function centsToDollarInput(cents?: number, fallbackCents = 0): string {
  const resolved = cents !== undefined ? Number(cents) : fallbackCents;
  return (resolved / 100).toFixed(2).replace(/\.00$/, "");
}
