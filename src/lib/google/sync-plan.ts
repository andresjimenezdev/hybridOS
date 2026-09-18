import { groupPlanRows, parsePlanRows, resolveExerciseReference, type PlanRow } from "./contracts";
import { readSheet } from "./sheets";
import { isoWeekStart } from "@/lib/date";
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

async function ensureWeeklyPlan(supabase: Supabase, userId: string, date: string, suppliedWeek: string) {
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(suppliedWeek) ? suppliedWeek : isoWeekStart(date);
  const { data, error } = await supabase.from("weekly_plans")
    .upsert({ user_id: userId, week_start: weekStart }, { onConflict: "user_id,week_start" }).select("id").single();
  if (error || !data) throw new Error("Could not prepare weekly plan.");
  return data.id as string;
}

async function upsertImportedSession(supabase: Supabase, userId: string, rows: PlanRow[], exercises: Exercise[]) {
  const head = rows[0]!;
  const kind = sessionTypeMap[head.sessionType];
  if (!kind) return { state: "review" as const, message: `Tipo no soportado: ${head.sessionType}` };
  const sourceUpdatedAt = newestUpdate(rows);
  const { data: existing } = await supabase.from("planned_sessions")
    .select("id,status,source_updated_at,workout_template_id,strength_sessions(status)")
    .eq("user_id", userId).eq("source", "google_ai_plan").eq("session_key", head.sessionKey).maybeSingle();
  if (existing?.status === "completed") return { state: "unchanged" as const };
  if (sourceUpdatedAt && existing?.source_updated_at && sourceUpdatedAt <= existing.source_updated_at) return { state: "unchanged" as const };
  const active = Array.isArray(existing?.strength_sessions)
    ? existing.strength_sessions.some((session: { status: string }) => session.status === "in_progress")
    : false;
  if (active && existing) {
    await supabase.from("planned_sessions").update({
      import_status: "update_available", pending_plan_update: rows, source_updated_at: sourceUpdatedAt,
      review_message: "Hay una actualización disponible para este entrenamiento.",
    }).eq("id", existing.id).eq("user_id", userId);
    return { state: "update_available" as const };
  }

  const requestedStatus = ["cancelled", "skipped"].includes(head.status) ? head.status : "planned";
  let templateId: string | null = null;
  let reviewMessage: string | null = null;
  if (kind === "strength") {
    const exerciseRows = rows.filter((row) => row.exerciseName || row.exerciseKey).sort((a, b) => (a.exerciseOrder ?? 999) - (b.exerciseOrder ?? 999));
    const resolved = exerciseRows.map((row) => ({ row, exercise: resolveExerciseReference(row, exercises) }));
    const unresolved = resolved.filter((item) => !item.exercise);
    if (unresolved.length) {
      reviewMessage = `Revisar ejercicios: ${unresolved.map((item) => item.row.exerciseKey || item.row.exerciseName).join(", ")}`;
    } else {
      for (const item of resolved) {
        if (item.row.exerciseKey && !item.exercise!.external_key) {
          await supabase.from("exercises").update({ external_key: item.row.exerciseKey, external_source: "google_ai_plan" })
            .eq("id", item.exercise!.id).eq("user_id", userId);
          item.exercise!.external_key = item.row.exerciseKey;
        }
      }
      const templateKey = `ai_plan_${head.sessionKey}`;
      const { data: storedTemplate } = await supabase.from("workout_templates").select("id")
        .eq("user_id", userId).eq("external_key", templateKey).maybeSingle();
      if (storedTemplate) {
        templateId = storedTemplate.id;
        await supabase.from("workout_templates").update({ name: head.sessionName, is_active: true, estimated_duration_minutes: head.durationTargetSeconds ? Math.ceil(head.durationTargetSeconds / 60) : null })
          .eq("id", templateId).eq("user_id", userId);
      } else {
        const { data: created, error } = await supabase.from("workout_templates").insert({
          user_id: userId, name: head.sessionName, external_key: templateKey, external_source: "google_ai_plan",
          estimated_duration_minutes: head.durationTargetSeconds ? Math.ceil(head.durationTargetSeconds / 60) : null,
        }).select("id").single();
        if (error || !created) throw new Error("Could not create imported template.");
        templateId = created.id;
      }
      await supabase.from("workout_template_exercises").delete().eq("workout_template_id", templateId).eq("user_id", userId);
      const templateExercises = resolved.map((item, index) => ({
        user_id: userId, workout_template_id: templateId!, exercise_id: item.exercise!.id,
        position: item.row.exerciseOrder ?? index + 1, target_sets: item.row.setsTarget ?? 1,
        target_reps_min: item.row.repsTarget.min ?? 1, target_reps_max: item.row.repsTarget.max ?? item.row.repsTarget.min ?? 1,
        target_rir: item.row.rirTarget.max, target_rir_min: item.row.rirTarget.min,
        target_rir_max: item.row.rirTarget.max, rest_seconds: item.row.restSeconds, notes: item.row.notes || null,
      }));
      if (templateExercises.length) {
        const { error } = await supabase.from("workout_template_exercises").insert(templateExercises);
        if (error) throw new Error("Could not populate imported template.");
      }
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
  if (existing) {
    const { error } = await supabase.from("planned_sessions").update(values).eq("id", existing.id).eq("user_id", userId);
    if (error) throw new Error("Could not update imported session.");
  } else {
    const { error } = await supabase.from("planned_sessions").insert(values);
    if (error) throw new Error("Could not create imported session.");
  }
  return { state: reviewMessage ? "review" as const : "updated" as const, message: reviewMessage ?? undefined };
}

export async function syncPlanFromGoogle(supabase: Supabase, userId: string) {
  const raw = await readSheet("'AI_PLAN'!A1:V500");
  const parsed = parsePlanRows(raw);
  const grouped = groupPlanRows(parsed.rows);
  const { data: exerciseData, error } = await supabase.from("exercises").select("id,name,external_key").eq("user_id", userId);
  if (error) throw new Error("Could not load exercise library.");
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
