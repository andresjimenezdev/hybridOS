import { addDays, isoWeekStart } from "./date";

export type ProgressRange = "4w" | "3m" | "6m" | "all";

export const progressRanges: Array<{ value: ProgressRange; label: string; days: number | null }> = [
  { value: "4w", label: "4 semanas", days: 28 },
  { value: "3m", label: "3 meses", days: 91 },
  { value: "6m", label: "6 meses", days: 182 },
  { value: "all", label: "Todo", days: null },
];

export function rangeStart(today: string, range: ProgressRange) {
  const selected = progressRanges.find((item) => item.value === range);
  const days = selected ? selected.days : 28;
  return days === null ? null : addDays(today, -(days - 1));
}

export function weeklyTotals(entries: Array<{ date: string; value: number }>) {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const week = isoWeekStart(entry.date.slice(0, 10));
    totals.set(week, (totals.get(week) ?? 0) + entry.value);
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}

export function trendPercent(values: number[]) {
  if (values.length < 2 || values[0] === 0) return null;
  return ((values.at(-1)! - values[0]) / Math.abs(values[0])) * 100;
}

export function round(value: number, decimals = 1) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}
