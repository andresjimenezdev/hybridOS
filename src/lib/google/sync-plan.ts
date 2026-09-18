import { groupPlanRows, normalizeExternalKey, parsePlanRows, planUpdateDecision, resolveExerciseReference, type PlanRow } from "./contracts";
import { readSheet } from "./sheets";
import { addDays, isoWeekStart } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Exercise = { id: string; name: string; external_key: string | null };

const sessionTypeMap: Record<string, string> = {
  strength: "strength", running: "running", cycling: "cycling_outdoor", cycling_outdoor: "cycling_outdoor",
  cardio: "other", mobility: "mobility", rest: "rest",
};

function newestUpdate(rows: PlanRow[]) {
  return rows.map((row) => row.updatedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function databaseError(prefix: string, error: { message?: string } | null) {
  return new Error(`${prefix}${error?.message ? `: ${error.message}` : "."}`);
}

async function ensureWeeklyPlan(supabase: Supabase, userId: string, date: string, suppliedWeek: string) {
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(suppliedWeek) ? suppliedWeek : isoWeekStart(date);
  const { data, error } = await supabase.from("weekly_plans")
    .upsert({ user_id: userId, week_start: weekStart }, { onConflict: "user_id,week_start" }).select("id").single();
  if (error || !data) throw databaseError("Could not prepare weekly plan", error);
  return data.id as string;
}

async function findOrCreateTemplate(supabase: Supabase, userId: string, row: PlanRow) {
  const templateKey = `template_${normalizeExternalKey(row.sessionName)}`;
  const { data: byName, error: nameError } = await supabase.from("workout_templates").select("id,external_key")
    .eq("user_id", userId).eq("name", row.sessionName).maybeSingle();
  if (nameError) throw databaseError("Could not resolve workout template", nameError);
  if (byName) {
    const { error } = await supabase.from("workout_templates").update({
      external_key: byName.external_key ?? templateKey,
      external_source: "google_ai_plan", is_active: true,
      estimated_duration_minutes: row.durationTargetSeconds ? Math.ceil(row.durationTargetSeconds / 60) : 65,
    }).eq("id", byName.id).eq("user_id", userId);
    if (error) throw databaseError("Could not update workout template", error);
    return byName.id as string;
  }
  const { data, error } = await supabase.from("workout_templates").insert({
    user_id: userId, name: row.sessionName, external_key: templateKey, external_source: "google_ai_plan",
    estimated_duration_minutes: row.durationTargetSeconds ? Math.ceil(row.durationTargetSeconds / 60) : 65,
  }).select("id").single();
  if (error || !data) throw databaseError("Could not create workout template", error);
  return data.id as string;
}

function prescribedExerciseValues(row: PlanRow, index: number) {
  return {
    exercise_id: "",
    position: row.exerciseOrder ?? index + 1,
    target_sets: row.setsTarget ?? 1,
    target_reps_min: row.repsTarget.min,
    target_reps_max: row.repsTarget.max,
    target_duration_min_seconds: row.durationTarget.min,
    target_duration_max_seconds: row.durationTarget.max,
    target_rir_min: row.rirTarget.min,
    target_rir_max: row.rirTarget.max,
    rest_seconds: row.restSeconds,
    notes: row.notes || null,
  };
}

async function replaceStrengthPrescription(
  supabase: Supabase, userId: string, plannedId: string, templateId: string,
  resolved: Array<{ row: PlanRow; exercise: Exercise }>,
) {
  const templateRows = resolved.map(({ row, exercise }, index) => ({
    ...prescribedExerciseValues(row, index), target_rir: row.rirTarget.max,
    user_id: userId, workout_template_id: templateId, exercise_id: exercise.id,
  }));
  const plannedRows = resolved.map(({ row, exercise }, index) => ({
    ...prescribedExerciseValues(row, index), user_id: userId, planned_session_id: plannedId, exercise_id: exercise.id,
  }));
  const [{ error: templateDelete }, { error: plannedDelete }] = await Promise.all([
    supabase.from("workout_template_exercises").delete().eq("workout_template_id", templateId).eq("user_id", userId),
    supabase.from("planned_session_exercises").delete().eq("planned_session_id", plannedId).eq("user_id", userId),
  ]);
  if (templateDelete || plannedDelete) throw databaseError("Could not replace strength prescription", templateDelete ?? plannedDelete);
  const [{ error: templateInsert }, { error: plannedInsert }] = await Promise.all([
    supabase.from("workout_template_exercises").insert(templateRows),
    supabase.from("planned_session_exercises").insert(plannedRows),
  ]);
  if (templateInsert || plannedInsert) throw databaseError("Could not save strength prescription", templateInsert ?? plannedInsert);
}

async function reconcileLegacyResult(supabase: Supabase, userId: string, plannedId: string, row: PlanRow, kind: string) {
  const from = `${row.date}T00:00:00Z`;
  const until = `${addDays(row.date, 1)}T00:00:00Z`;
  if (kind === "strength") {
    const { data, error } = await supabase.from("strength_sessions").select("id").eq("user_id", userId)
      .is("planned_session_id", null).eq("status", "completed").eq("name", row.sessionName)
      .gte("started_at", from).lt("started_at", until).limit(2);
    if (error) throw databaseError("Could not reconcile strength history", error);
    if (data?.length === 1) {
      const { error: linkError } = await supabase.from("strength_sessions").update({ planned_session_id: plannedId })
        .eq("id", data[0]!.id).eq("user_id", userId);
      if (linkError) throw databaseError("Could not link strength history", linkError);
      await supabase.from("planned_sessions").update({ status: "completed", completed_at: from })
        .eq("id", plannedId).eq("user_id", userId);
    }
  } else if (["running", "cycling_outdoor", "stationary_bike", "treadmill", "stair_machine", "walking", "other"].includes(kind)) {
    const { data, error } = await supabase.from("cardio_sessions").select("id,performed_at").eq("user_id", userId)
      .is("planned_session_id", null).eq("kind", kind).gte("performed_at", from).lt("performed_at", until).limit(2);
    if (error) throw databaseError("Could not reconcile cardio history", error);
    if (data?.length === 1) {
      const { error: linkError } = await supabase.from("cardio_sessions").update({ planned_session_id: plannedId })
        .eq("id", data[0]!.id).eq("user_id", userId);
      if (linkError) throw databaseError("Could not link cardio history", linkError);
      await supabase.from("planned_sessions").update({ status: "completed", completed_at: data[0]!.performed_at })
        .eq("id", plannedId).eq("user_id", userId);
    }
  }
}

async function upsertImportedSession(supabase: Supabase, userId: string, rows: PlanRow[], exercises: Exercise[]) {
  const head = rows[0]!;
  const kind = sessionTypeMap[head.sessionType];
  if (!kind) return { state: "review" as const, message: `Tipo no soportado: ${head.sessionType}` };
  const sourceUpdatedAt = newestUpdate(rows);
  const { data: existing, error: existingError } = await supabase.from("planned_sessions")
    .select("id,status,source_updated_at,import_status,workout_template_id,strength_sessions(status)")
    .eq("user_id", userId).eq("source", "google_ai_plan").eq("session_key", head.sessionKey).maybeSingle();
  if (existingError) throw databaseError("Could not read imported session", existingError);
  const active = Array.isArray(existing?.strength_sessions)
    ? existing.strength_sessions.some((session: { status: string }) => session.status === "in_progress")
    : false;
  const decision = planUpdateDecision({
    status: existing?.status ?? null, active, importStatus: existing?.import_status ?? null,
    existingUpdatedAt: existing?.source_updated_at ?? null, incomingUpdatedAt: sourceUpdatedAt,
  });
  if (decision === "immutable" || decision === "unchanged") return { state: "unchanged" as const };
  if (decision === "conflict" && existing) {
    const { error } = await supabase.from("planned_sessions").update({
      import_status: "update_available", pending_plan_update: rows, source_updated_at: sourceUpdatedAt,
      review_message: "Hay una actualización disponible para este entrenamiento.",
    }).eq("id", existing.id).eq("user_id", userId);
    if (error) throw databaseError("Could not stage plan update", error);
    return { state: "update_available" as const };
  }

  const requestedStatus = ["cancelled", "skipped"].includes(head.status) ? head.status : "planned";
  let templateId: string | null = null;
  let reviewMessage: string | null = null;
  let resolved: Array<{ row: PlanRow; exercise: Exercise }> = [];
  if (kind === "strength") {
    const exerciseRows = rows.filter((row) => row.exerciseName || row.exerciseKey)
      .sort((a, b) => (a.exerciseOrder ?? 999) - (b.exerciseOrder ?? 999));
    const candidates = exerciseRows.map((row) => ({ row, exercise: resolveExerciseReference(row, exercises) }));
    const unresolved = candidates.filter((item) => !item.exercise);
    if (unresolved.length) {
      reviewMessage = `Revisar ejercicios: ${unresolved.map((item) => item.row.exerciseKey || item.row.exerciseName).join(", ")}`;
    } else {
      resolved = candidates as Array<{ row: PlanRow; exercise: Exercise }>;
      for (const item of resolved) {
        if (item.row.exerciseKey && !item.exercise.external_key) {
          const { error } = await supabase.from("exercises").update({ external_key: item.row.exerciseKey, external_source: "google_ai_plan" })
            .eq("id", item.exercise.id).eq("user_id", userId);
          if (error) throw databaseError("Could not assign exercise_key", error);
          item.exercise.external_key = item.row.exerciseKey;
        }
      }
      templateId = await findOrCreateTemplate(supabase, userId, head);
    }
  }

  const weeklyPlanId = await ensureWeeklyPlan(supabase, userId, head.date, head.weekStart);
  const values = {
    user_id: userId, weekly_plan_id: weeklyPlanId, workout_template_id: templateId, kind,
    title: head.sessionName, scheduled_date: head.date, status: requestedStatus,
    target_duration_minutes: head.durationTargetSeconds ? Math.ceil(head.durationTargetSeconds / 60) : null,
    target_distance_km: head.distanceTargetKm, target_pace_min_seconds: head.paceMinSecondsKm,
    target_pace_max_seconds: head.paceMaxSecondsKm, target_rpe_min: head.rpeTarget.min,
    target_rpe_max: head.rpeTarget.max, target_talk_test: head.talkTestTarget || null,
    notes: head.notes || null, external_plan_id: head.planId || null, session_key: head.sessionKey,
    source: "google_ai_plan", source_updated_at: sourceUpdatedAt,
    import_status: reviewMessage ? "needs_review" : "ready", review_message: reviewMessage,
    pending_plan_update: null,
  };
  let plannedId: string;
  if (existing) {
    const { data, error } = await supabase.from("planned_sessions").update(values).eq("id", existing.id).eq("user_id", userId).select("id").single();
    if (error || !data) throw databaseError("Could not update imported session", error);
    plannedId = data.id;
  } else {
    const { data, error } = await supabase.from("planned_sessions").insert(values).select("id").single();
    if (error || !data) throw databaseError("Could not create imported session", error);
    plannedId = data.id;
  }
  if (kind === "strength" && templateId && resolved.length) {
    await replaceStrengthPrescription(supabase, userId, plannedId, templateId, resolved);
  }
  if (requestedStatus === "planned") await reconcileLegacyResult(supabase, userId, plannedId, head, kind);
  return { state: reviewMessage ? "review" as const : "updated" as const, message: reviewMessage ?? undefined };
}

export async function syncPlanFromGoogle(supabase: Supabase, userId: string) {
  const raw = await readSheet("'AI_PLAN'!A1:V500");
  const parsed = parsePlanRows(raw);
  if (parsed.errors.length && parsed.rows.length === 0) return { updated: 0, unchanged: 0, needsReview: 0, updatesAvailable: 0, errors: parsed.errors };
  const { error: bootstrapError } = await supabase.rpc("bootstrap_strength_defaults");
  if (bootstrapError) throw databaseError("Could not prepare exercise library", bootstrapError);
  const grouped = groupPlanRows(parsed.rows);
  const { data: exerciseData, error } = await supabase.from("exercises").select("id,name,external_key").eq("user_id", userId);
  if (error) throw databaseError("Could not load exercise library", error);
  const exercises = (exerciseData ?? []) as Exercise[];
  const summary = { updated: 0, unchanged: 0, needsReview: 0, updatesAvailable: 0, errors: [...parsed.errors] };
  for (const rows of grouped.values()) {
    try {
      const result = await upsertImportedSession(supabase, userId, rows, exercises);
      if (result.state === "updated") summary.updated += 1;
      if (result.state === "unchanged") summary.unchanged += 1;
      if (result.state === "review") summary.needsReview += 1;
      if (result.state === "update_available") summary.updatesAvailable += 1;
    } catch (syncError) {
      summary.errors.push(syncError instanceof Error ? syncError.message : "Unknown plan import error.");
    }
  }
  return summary;
}
