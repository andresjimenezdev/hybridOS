export type AppleHealthPayload = {
  date: string;
  steps?: number;
  active_calories?: number;
  total_calories?: number;
  sleep_minutes?: number;
  resting_heart_rate?: number;
  vo2_max?: number;
  weight_kg?: number;
  body_fat_percent?: number;
};

const ranges = {
  steps: [0, 200_000],
  active_calories: [0, 50_000],
  total_calories: [0, 100_000],
  sleep_minutes: [0, 1_440],
  resting_heart_rate: [20, 250],
  vo2_max: [1, 100],
  weight_kg: [20, 500],
  body_fat_percent: [0, 100],
} as const;

type Metric = keyof typeof ranges;
const integerMetrics = new Set<Metric>(["steps", "active_calories", "total_calories", "sleep_minutes", "resting_heart_rate"]);

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseAppleHealthPayload(input: unknown, fallbackDate?: string): AppleHealthPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid JSON payload");
  const record = input as Record<string, unknown>;
  const date = validDate(record.date) ? record.date : fallbackDate;
  if (!validDate(date)) throw new Error("date must use YYYY-MM-DD");
  const payload: AppleHealthPayload = { date };
  for (const [metric, [minimum, maximum]] of Object.entries(ranges) as Array<[Metric, readonly [number, number]]>) {
    const raw = record[metric];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value) || value < minimum || value > maximum || (integerMetrics.has(metric) && !Number.isInteger(value))) {
      throw new Error(`${metric} is outside its valid range`);
    }
    payload[metric] = value;
  }
  if (Object.keys(payload).length === 1) throw new Error("At least one health metric is required");
  if (payload.active_calories !== undefined && payload.total_calories !== undefined && payload.total_calories < payload.active_calories) {
    throw new Error("total_calories cannot be lower than active_calories");
  }
  return payload;
}
