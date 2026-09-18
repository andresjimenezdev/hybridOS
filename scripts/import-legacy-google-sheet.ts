import { createClient } from "@supabase/supabase-js";
import { normalizeExternalKey, rowsToRecords } from "../src/lib/google/contracts";
import { readSheet } from "../src/lib/google/sheets";

type RecordRow = Record<string, unknown>;
const apply = process.argv.includes("--apply");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.HYBRIDOS_USER_ID;
if (!supabaseUrl || !serviceRole || !userId) throw new Error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and HYBRIDOS_USER_ID are required.");
const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

function normalizedRecord(record: RecordRow) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [normalizeExternalKey(key), value]));
}

function pick(record: RecordRow, ...keys: string[]) {
  const normalized = normalizedRecord(record);
  for (const key of keys) {
    const value = normalized[normalizeExternalKey(key)];
    if (value !== undefined && String(value).trim() !== "") return value;
  }
  return null;
}

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function numeric(value: unknown) {
  const raw = text(value).replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: unknown) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (match) return `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
}

function duration(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw) * 60);
  const parts = raw.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return null;
}

function runningType(value: unknown) {
  const normalized = normalizeExternalKey(text(value));
  const aliases: Record<string, string> = {
    easy: "easy", facil: "easy", rodaje_facil: "easy", long_run: "long_run", tirada_larga: "long_run",
    tempo: "tempo", intervals: "intervals", intervalos: "intervals", recovery: "recovery", recuperacion: "recovery",
  };
  return aliases[normalized] ?? "other";
}

async function importHealth(records: RecordRow[]) {
  const rows = records.flatMap((record) => {
    const date = dateValue(pick(record, "date", "fecha"));
    if (!date) return [];
    return [{
      user_id: userId, measured_on: date, source: "legacy_google_sheet",
      weight_kg: numeric(pick(record, "weight_kg", "peso", "peso_kg")),
      body_fat_percent: numeric(pick(record, "body_fat_percent", "grasa", "porcentaje_grasa")),
      resting_heart_rate: numeric(pick(record, "resting_hr", "fc_reposo")),
      vo2_max: numeric(pick(record, "vo2max", "vo2_max")), steps: numeric(pick(record, "steps", "pasos")),
      active_calories: numeric(pick(record, "active_calories", "calorias_activas")),
      total_calories: numeric(pick(record, "total_calories", "calorias_totales")),
      sleep_minutes: numeric(pick(record, "sleep_minutes", "sueno_minutos")),
      notes: text(pick(record, "notes", "notas")) || null,
    }];
  });
  if (apply && rows.length) {
    const { error } = await supabase.from("health_metrics").upsert(rows, { onConflict: "user_id,measured_on,source" });
    if (error) throw error;
  }
  return rows.length;
}

async function importMeasurements(records: RecordRow[]) {
  const rows = records.flatMap((record) => {
    const date = dateValue(pick(record, "date", "fecha"));
    if (!date) return [];
    return [{ user_id: userId, measured_on: date, source: "legacy_google_sheet",
      waist_cm: numeric(pick(record, "waist_cm", "cintura")), chest_cm: numeric(pick(record, "chest_cm", "pecho")),
      arm_cm: numeric(pick(record, "arm_cm", "brazo")), thigh_cm: numeric(pick(record, "thigh_cm", "muslo")),
      hip_cm: numeric(pick(record, "hip_cm", "hips_cm", "cadera")), notes: text(pick(record, "notes", "notas")) || null }];
  });
  if (apply && rows.length) {
    const { error } = await supabase.from("body_measurements").upsert(rows, { onConflict: "user_id,measured_on,source" });
    if (error) throw error;
  }
  return rows.length;
}

async function importRunning(records: RecordRow[]) {
  const rows = records.flatMap((record, index) => {
    const date = dateValue(pick(record, "date", "fecha"));
    const durationSeconds = duration(pick(record, "duration", "duracion", "tiempo"));
    if (!date || !durationSeconds) return [];
    const distanceKm = numeric(pick(record, "distance_km", "distancia", "km"));
    const externalId = text(pick(record, "id", "activity_id", "strava_id")) || `${date}-${index + 2}`;
    return [{ user_id: userId, kind: "running", workout_type: runningType(pick(record, "workout_type", "tipo")),
      performed_at: `${date}T12:00:00Z`, duration_seconds: durationSeconds, distance_km: distanceKm,
      average_pace_seconds: distanceKm ? Math.round(durationSeconds / distanceKm) : null,
      average_heart_rate: numeric(pick(record, "avg_hr", "fc_media")), max_heart_rate: numeric(pick(record, "max_hr", "fc_max")),
      rpe: numeric(pick(record, "rpe")), talk_test: text(pick(record, "talk_test")) || null,
      feeling: numeric(pick(record, "feeling", "sensaciones")), notes: text(pick(record, "notes", "notas")) || null,
      strava_url: text(pick(record, "strava_url", "strava")) || null, external_source: "legacy_google_sheet", external_id: externalId }];
  });
  if (apply && rows.length) {
    const { error } = await supabase.from("cardio_sessions").upsert(rows, { onConflict: "user_id,external_source,external_id" });
    if (error) throw error;
  }
  return rows.length;
}

async function importStrength(records: RecordRow[]) {
  const groups = new Map<string, RecordRow[]>();
  records.forEach((record, index) => {
    const date = dateValue(pick(record, "date", "fecha"));
    if (!date) return;
    const sessionName = text(pick(record, "session_name", "sesion", "entrenamiento")) || "Fuerza";
    const sessionKey = text(pick(record, "session_id", "id_sesion")) || `${date}-${normalizeExternalKey(sessionName)}`;
    groups.set(sessionKey, [...(groups.get(sessionKey) ?? []), { ...record, __date: date, __name: sessionName, __row: index + 2 }]);
  });
  if (!apply) return groups.size;
  for (const [sessionKey, rows] of groups) {
    const date = text(rows[0]!.__date);
    const name = text(rows[0]!.__name);
    let { data: session } = await supabase.from("strength_sessions").select("id").eq("user_id", userId)
      .eq("external_source", "legacy_google_sheet").eq("external_id", sessionKey).maybeSingle();
    if (!session) {
      const result = await supabase.from("strength_sessions").insert({ user_id: userId, name, status: "completed", started_at: `${date}T12:00:00Z`, completed_at: `${date}T13:00:00Z`, external_source: "legacy_google_sheet", external_id: sessionKey }).select("id").single();
      if (result.error || !result.data) throw result.error ?? new Error("Could not create strength session");
      session = result.data;
    }
    const exerciseGroups = new Map<string, RecordRow[]>();
    rows.forEach((row) => {
      const exerciseName = text(pick(row, "exercise_name", "ejercicio"));
      if (exerciseName) exerciseGroups.set(exerciseName, [...(exerciseGroups.get(exerciseName) ?? []), row]);
    });
    let position = 0;
    for (const [exerciseName, setRows] of exerciseGroups) {
      position += 1;
      const exerciseKey = normalizeExternalKey(exerciseName);
      let { data: exercise } = await supabase.from("exercises").select("id").eq("user_id", userId).eq("external_key", exerciseKey).maybeSingle();
      if (!exercise) {
        const result = await supabase.from("exercises").insert({ user_id: userId, name: exerciseName, muscle_group: "Sin clasificar", movement_pattern: "Sin clasificar", equipment: "Sin clasificar", external_key: exerciseKey, external_source: "legacy_google_sheet" }).select("id").single();
        if (result.error || !result.data) throw result.error ?? new Error("Could not create legacy exercise");
        exercise = result.data;
      }
      const logExternalId = `${sessionKey}:${exerciseKey}`;
      let { data: log } = await supabase.from("strength_exercise_logs").select("id").eq("user_id", userId).eq("external_source", "legacy_google_sheet").eq("external_id", logExternalId).maybeSingle();
      if (!log) {
        const first = setRows[0]!;
        const result = await supabase.from("strength_exercise_logs").insert({ user_id: userId, strength_session_id: session.id, exercise_id: exercise.id, position, feeling: numeric(pick(first, "feeling", "sensaciones")), has_pain: ["si", "sí", "true", "1"].includes(text(pick(first, "pain", "molestia")).toLowerCase()), notes: text(pick(first, "notes", "notas")) || null, completed: true, external_source: "legacy_google_sheet", external_id: logExternalId }).select("id").single();
        if (result.error || !result.data) throw result.error ?? new Error("Could not create legacy exercise log");
        log = result.data;
      }
      const sets = setRows.map((row, index) => ({ user_id: userId, exercise_log_id: log.id, set_number: numeric(pick(row, "set_number", "serie")) ?? index + 1, weight_kg: numeric(pick(row, "weight_kg", "peso", "carga")), reps: numeric(pick(row, "reps", "repeticiones")), rir: numeric(pick(row, "rir")), completed: true }));
      const { error } = await supabase.from("strength_sets").upsert(sets, { onConflict: "exercise_log_id,set_number" });
      if (error) throw error;
    }
  }
  return groups.size;
}

const [strengthRows, runningRows, healthRows, measurementRows] = await Promise.all([
  readSheet("'Fuerza'!A1:ZZ5000"), readSheet("'Running'!A1:ZZ5000"),
  readSheet("'Salud'!A1:ZZ5000"), readSheet("'Medidas'!A1:ZZ5000"),
]);
const summary = {
  mode: apply ? "apply" : "dry-run",
  strengthSessions: await importStrength(rowsToRecords(strengthRows)),
  runningSessions: await importRunning(rowsToRecords(runningRows)),
  healthRows: await importHealth(rowsToRecords(healthRows)),
  measurementRows: await importMeasurements(rowsToRecords(measurementRows)),
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
