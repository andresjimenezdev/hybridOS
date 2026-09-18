export const AI_PLAN_HEADERS = [
  "plan_id", "week_start", "date", "session_key", "session_type", "session_name",
  "exercise_order", "exercise_name", "exercise_key", "sets_target", "reps_target",
  "rir_target", "rest_seconds", "duration_target_seconds", "distance_target_km",
  "pace_min_sec_km", "pace_max_sec_km", "rpe_target", "talk_test_target", "notes",
  "status", "updated_at",
] as const;

export const AI_DATA_HEADERS = [
  "date", "activity_type", "session_key", "session_name", "exercise_name", "exercise_key",
  "set_number", "weight_kg", "reps", "rir", "sensation", "pain", "notes", "distance_km",
  "duration_seconds", "pace_seconds_km", "avg_hr", "max_hr", "rpe",
] as const;

export const AI_HEALTH_HEADERS = [
  "date", "weight_kg", "body_fat_estimate_pct", "resting_hr", "vo2max_estimate", "steps",
  "active_calories", "total_calories", "sleep_minutes", "waist_cm", "chest_cm", "arm_cm",
  "thigh_cm", "hips_cm",
] as const;

export const AI_WEEKLY_HEADERS = [
  "week_start", "strength_planned", "strength_completed", "cardio_planned", "cardio_completed",
  "running_sessions", "running_km", "running_minutes", "average_weight_kg", "latest_waist_cm",
  "resting_hr_average", "vo2max_latest",
] as const;

export type CanonicalRange = { min: number | null; max: number | null };
export type ExerciseReference = { id: string; name: string; external_key: string | null };

export type PlanRow = {
  planId: string;
  weekStart: string;
  date: string;
  sessionKey: string;
  sessionType: string;
  sessionName: string;
  exerciseOrder: number | null;
  exerciseName: string;
  exerciseKey: string;
  setsTarget: number | null;
  repsTarget: CanonicalRange;
  rirTarget: CanonicalRange;
  restSeconds: number | null;
  durationTargetSeconds: number | null;
  distanceTargetKm: number | null;
  paceMinSecondsKm: number | null;
  paceMaxSecondsKm: number | null;
  rpeTarget: CanonicalRange;
  talkTestTarget: string;
  notes: string;
  status: string;
  updatedAt: string | null;
};

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function numberOrNull(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCanonicalRange(value: unknown): CanonicalRange {
  const raw = text(value).replace(/[–—]/g, "-");
  if (!raw) return { min: null, max: null };
  const [first, second] = raw.split("-").map((part) => numberOrNull(part));
  if (first === null) return { min: null, max: null };
  return { min: first, max: second ?? first };
}

export function normalizeExternalKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function resolveExerciseReference(row: { exerciseKey: string; exerciseName: string }, exercises: ExerciseReference[]) {
  if (row.exerciseKey) {
    const byKey = exercises.find((exercise) => exercise.external_key === row.exerciseKey);
    if (byKey) return byKey;
  }
  const normalizedName = normalizeExternalKey(row.exerciseName);
  const matches = exercises.filter((exercise) => normalizeExternalKey(exercise.name) === normalizedName);
  return matches.length === 1 ? matches[0] : null;
}

export function rowsToRecords(rows: unknown[][]) {
  const header = (rows[0] ?? []).map(text);
  return rows.slice(1).filter((row) => row.some((cell) => text(cell))).map((row) =>
    Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""])),
  );
}

export function parsePlanRows(rows: unknown[][]): { rows: PlanRow[]; errors: string[] } {
  const receivedHeaders = (rows[0] ?? []).map(text);
  const headerMatches = AI_PLAN_HEADERS.length === receivedHeaders.length
    && AI_PLAN_HEADERS.every((header, index) => header === receivedHeaders[index]);
  if (!headerMatches) {
    return { rows: [], errors: ["AI_PLAN no respeta las cabeceras canónicas o su orden."] };
  }
  const records = rowsToRecords(rows);
  const errors: string[] = [];
  const parsed = records.flatMap((record, index) => {
    const date = text(record.date);
    const sessionKey = text(record.session_key);
    const sessionType = text(record.session_type).toLowerCase();
    const sessionName = text(record.session_name);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !sessionKey || !sessionType || !sessionName) {
      errors.push(`Fila ${index + 2}: faltan date, session_key, session_type o session_name válidos.`);
      return [];
    }
    const updated = text(record.updated_at);
    return [{
      planId: text(record.plan_id), weekStart: text(record.week_start), date, sessionKey,
      sessionType, sessionName, exerciseOrder: numberOrNull(record.exercise_order),
      exerciseName: text(record.exercise_name), exerciseKey: normalizeExternalKey(text(record.exercise_key)),
      setsTarget: numberOrNull(record.sets_target), repsTarget: parseCanonicalRange(record.reps_target),
      rirTarget: parseCanonicalRange(record.rir_target), restSeconds: numberOrNull(record.rest_seconds),
      durationTargetSeconds: numberOrNull(record.duration_target_seconds),
      distanceTargetKm: numberOrNull(record.distance_target_km),
      paceMinSecondsKm: numberOrNull(record.pace_min_sec_km), paceMaxSecondsKm: numberOrNull(record.pace_max_sec_km),
      rpeTarget: parseCanonicalRange(record.rpe_target), talkTestTarget: text(record.talk_test_target),
      notes: text(record.notes), status: text(record.status).toLowerCase() || "planned",
      updatedAt: updated && !Number.isNaN(Date.parse(updated)) ? new Date(updated).toISOString() : null,
    } satisfies PlanRow];
  });
  return { rows: parsed, errors };
}

export function groupPlanRows(rows: PlanRow[]) {
  const sessions = new Map<string, PlanRow[]>();
  for (const row of rows) sessions.set(row.sessionKey, [...(sessions.get(row.sessionKey) ?? []), row]);
  return sessions;
}
