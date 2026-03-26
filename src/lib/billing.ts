export function calculateBilling(miles: number | null): number {
  if (!miles || miles <= 0) return 0;
  if (miles <= 10) return 35;
  return 35 + (miles - 10) * 2.25;
}

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
