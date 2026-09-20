import { AI_DATA_HEADERS, AI_HEALTH_HEADERS, AI_WEEKLY_HEADERS, stableResultId } from "./contracts";
import { mergeDailySnapshots, nonBlockingSync, sheetValue, weeklyAdherence } from "./bridge-metrics";
import { replaceSheetTables, type SheetValue } from "./sheets";
import { isoWeekStart } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";

export type BridgeSupabase = Awaited<ReturnType<typeof createClient>>;
type StrengthSession = {
  id: string; name: string; started_at: string; completed_at: string | null; planned_sessions: { session_key: string | null } | null;
  strength_exercise_logs: Array<{ feeling: number | null; has_pain: boolean; notes: string | null; exercises: { name: string; external_key: string | null } | null; strength_sets: Array<{ id: string; set_number: number; weight_kg: number | null; reps: number | null; duration_seconds: number | null; rir: number | null; completed: boolean }> }>;
};
type Cardio = { id: string; kind: string; performed_at: string; duration_seconds: number; distance_km: number | null; average_pace_seconds: number | null; average_heart_rate: number | null; max_heart_rate: number | null; rpe: number | null; talk_test: string | null; feeling: number | null; notes: string | null; planned_sessions: { session_key: string | null; title: string } | null };
type Health = { measured_on: string; updated_at: string; weight_kg: number | null; body_fat_percent: number | null; bmi: number | null; lean_body_mass_kg: number | null; resting_heart_rate: number | null; vo2_max: number | null; steps: number | null; active_calories: number | null; resting_calories: number | null; total_calories: number | null; sleep_minutes: number | null };
type Measurement = { measured_on: string; waist_cm: number | null; chest_cm: number | null; arm_cm: number | null; thigh_cm: number | null; hip_cm: number | null };
type Planned = { scheduled_date: string; kind: string; status: string; strength_sessions: Array<{ status: string }>; cardio_sessions: Array<{ id: string }> };

function value(input: SheetValue | undefined): SheetValue {
  return sheetValue(input);
}

function average(values: number[]) {
  return values.length ? Math.round((values.reduce((sum, item) => sum + item, 0) / values.length) * 100) / 100 : null;
}

export async function exportBridgeTables(supabase: BridgeSupabase, userId: string) {
  const [strengthResult, cardioResult, healthResult, measurementResult, plannedResult] = await Promise.all([
    supabase.from("strength_sessions").select("id,name,started_at,completed_at,planned_sessions(session_key),strength_exercise_logs(feeling,has_pain,notes,exercises(name,external_key),strength_sets(id,set_number,weight_kg,reps,duration_seconds,rir,completed))").eq("user_id", userId).eq("status", "completed").order("started_at"),
    supabase.from("cardio_sessions").select("id,kind,performed_at,duration_seconds,distance_km,average_pace_seconds,average_heart_rate,max_heart_rate,rpe,talk_test,feeling,notes,planned_sessions(session_key,title)").eq("user_id", userId).order("performed_at"),
    supabase.from("health_metrics").select("measured_on,updated_at,weight_kg,body_fat_percent,bmi,lean_body_mass_kg,resting_heart_rate,vo2_max,steps,active_calories,resting_calories,total_calories,sleep_minutes").eq("user_id", userId).order("measured_on").order("updated_at"),
    supabase.from("body_measurements").select("measured_on,waist_cm,chest_cm,arm_cm,thigh_cm,hip_cm").eq("user_id", userId).order("measured_on"),
    supabase.from("planned_sessions").select("scheduled_date,kind,status,strength_sessions(status),cardio_sessions(id)").eq("user_id", userId).order("scheduled_date"),
  ]);
  const failure = [strengthResult.error, cardioResult.error, healthResult.error, measurementResult.error, plannedResult.error].find(Boolean);
  if (failure) throw new Error("Could not build Google Sheets projections.");
  const strength = (strengthResult.data ?? []) as unknown as StrengthSession[];
  const cardio = (cardioResult.data ?? []) as unknown as Cardio[];
  const health = (healthResult.data ?? []) as Health[];
  const measurements = (measurementResult.data ?? []) as Measurement[];
  const planned = (plannedResult.data ?? []) as Planned[];

  const dataRows: SheetValue[][] = [AI_DATA_HEADERS.slice() as unknown as SheetValue[]];
  for (const session of strength) {
    for (const log of session.strength_exercise_logs) {
      for (const set of log.strength_sets.filter((item) => item.completed).sort((a, b) => a.set_number - b.set_number)) {
        dataRows.push([
          stableResultId("strength", set.id), session.started_at.slice(0, 10), value(session.completed_at), "strength",
          value(session.planned_sessions?.session_key), session.name, value(log.exercises?.name), value(log.exercises?.external_key),
          set.set_number, value(set.weight_kg), value(set.reps), value(set.rir), value(log.feeling), log.has_pain,
          value(log.notes), "", value(set.duration_seconds), "", "", "", "", "",
        ]);
      }
    }
  }
  for (const session of cardio) {
    dataRows.push([
      stableResultId("cardio", session.id), session.performed_at.slice(0, 10), session.performed_at, session.kind,
      value(session.planned_sessions?.session_key), session.planned_sessions?.title ?? session.kind,
      "", "", "", "", "", "", value(session.feeling), "", value(session.notes), value(session.distance_km),
      session.duration_seconds, value(session.average_pace_seconds), value(session.average_heart_rate),
      value(session.max_heart_rate), value(session.rpe), value(session.talk_test),
    ]);
  }

  const healthByDate = mergeDailySnapshots(health);
  const measurementsByDate = new Map(measurements.map((entry) => [entry.measured_on, entry]));
  const healthDates = [...new Set([...healthByDate.keys(), ...measurementsByDate.keys()])].sort();
  const healthRows: SheetValue[][] = [AI_HEALTH_HEADERS.slice() as unknown as SheetValue[]];
  for (const date of healthDates) {
    const metrics = healthByDate.get(date);
    const body = measurementsByDate.get(date);
    healthRows.push([
      date, value(metrics?.weight_kg), value(metrics?.body_fat_percent), value(metrics?.resting_heart_rate),
      value(metrics?.vo2_max), value(metrics?.steps), value(metrics?.bmi), value(metrics?.lean_body_mass_kg),
      value(metrics?.active_calories), value(metrics?.resting_calories), value(metrics?.total_calories),
      value(metrics?.sleep_minutes), value(body?.waist_cm), value(body?.chest_cm), value(body?.arm_cm),
      value(body?.thigh_cm), value(body?.hip_cm),
    ]);
  }

  const weeks = new Map<string, { planned: Planned[]; cardio: Cardio[]; health: Health[]; body: Measurement[] }>();
  const ensureWeek = (date: string) => {
    const week = isoWeekStart(date.slice(0, 10));
    if (!weeks.has(week)) weeks.set(week, { planned: [], cardio: [], health: [], body: [] });
    return weeks.get(week)!;
  };
  planned.forEach((entry) => ensureWeek(entry.scheduled_date).planned.push(entry));
  cardio.forEach((entry) => ensureWeek(entry.performed_at).cardio.push(entry));
  health.forEach((entry) => ensureWeek(entry.measured_on).health.push(entry));
  measurements.forEach((entry) => ensureWeek(entry.measured_on).body.push(entry));
  const weeklyRows: SheetValue[][] = [AI_WEEKLY_HEADERS.slice() as unknown as SheetValue[]];
  for (const [weekStart, week] of [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const adherence = weeklyAdherence(week.planned);
    const runs = week.cardio.filter((entry) => entry.kind === "running");
    const weights = week.health.flatMap((entry) => entry.weight_kg === null ? [] : [entry.weight_kg]);
    const resting = week.health.flatMap((entry) => entry.resting_heart_rate === null ? [] : [entry.resting_heart_rate]);
    const latestWaist = [...week.body].reverse().find((entry) => entry.waist_cm !== null)?.waist_cm ?? null;
    const latestVo2 = [...week.health].reverse().find((entry) => entry.vo2_max !== null)?.vo2_max ?? null;
    weeklyRows.push([
      weekStart,
      adherence.strengthPlanned,
      adherence.strengthCompleted,
      adherence.cardioPlanned,
      adherence.cardioCompleted,
      runs.length,
      Math.round(runs.reduce((sum, entry) => sum + (entry.distance_km ?? 0), 0) * 100) / 100,
      Math.round(runs.reduce((sum, entry) => sum + entry.duration_seconds, 0) / 60),
      value(average(weights)), value(latestWaist), value(average(resting)), value(latestVo2),
    ]);
  }

  await replaceSheetTables([
    { sheet: "AI_DATA", rows: dataRows },
    { sheet: "AI_HEALTH", rows: healthRows },
    { sheet: "AI_WEEKLY", rows: weeklyRows },
  ]);
  return { dataRows: dataRows.length - 1, healthRows: healthRows.length - 1, weeklyRows: weeklyRows.length - 1 };
}

export async function runOutboundSync(
  supabase: BridgeSupabase,
  userId: string,
  entityType: string,
  entityId: string | null,
  exporter: typeof exportBridgeTables = exportBridgeTables,
) {
  const { data: log } = await supabase.from("sync_log").insert({
    user_id: userId, direction: "outbound", entity_type: entityType, entity_id: entityId,
    status: "pending", attempted_at: new Date().toISOString(), attempts: 1,
  }).select("id").single();
  const outcome = await nonBlockingSync(() => exporter(supabase, userId));
  if (outcome.ok) {
    if (log) await supabase.from("sync_log").update({ status: "success", completed_at: new Date().toISOString(), last_synced_at: new Date().toISOString(), error_message: null, sync_error: null }).eq("id", log.id);
    return outcome;
  }
  const message = outcome.error.slice(0, 500);
  if (log) await supabase.from("sync_log").update({ status: "failed", completed_at: new Date().toISOString(), error_message: message, sync_error: message }).eq("id", log.id);
  return { ok: false as const, error: message };
}
