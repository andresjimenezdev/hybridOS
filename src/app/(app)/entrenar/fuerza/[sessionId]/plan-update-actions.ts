"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeExternalKey, type PlanRow } from "@/lib/google/contracts";
import { createClient } from "@/lib/supabase/server";

async function context(sessionId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: session } = await supabase.from("strength_sessions").select("id,planned_session_id")
    .eq("id", sessionId).eq("user_id", user.id).eq("status", "in_progress").maybeSingle();
  if (!session?.planned_session_id) throw new Error("No hay actualización de planificación.");
  return { supabase, user, plannedId: session.planned_session_id as string };
}

export async function rejectPlanUpdate(sessionId: string) {
  const { supabase, user, plannedId } = await context(sessionId);
  await supabase.from("planned_sessions").update({ import_status: "ready", pending_plan_update: null, review_message: null })
    .eq("id", plannedId).eq("user_id", user.id);
  revalidatePath(`/entrenar/fuerza/${sessionId}`);
}

export async function acceptPlanUpdate(sessionId: string) {
  const { supabase, user, plannedId } = await context(sessionId);
  const { data: plan } = await supabase.from("planned_sessions").select("pending_plan_update")
    .eq("id", plannedId).eq("user_id", user.id).single();
  const rows = Array.isArray(plan?.pending_plan_update) ? plan.pending_plan_update as PlanRow[] : [];
  if (!rows.length) throw new Error("No hay cambios pendientes.");
  const [{ data: exerciseData }, { data: logData }] = await Promise.all([
    supabase.from("exercises").select("id,name,external_key").eq("user_id", user.id),
    supabase.from("strength_exercise_logs").select("id,exercise_id,completed,strength_sets(id,set_number,completed)")
      .eq("strength_session_id", sessionId).eq("user_id", user.id),
  ]);
  const exercises = exerciseData ?? [];
  const logs = logData ?? [];
  const unresolved: string[] = [];
  for (const [index, row] of rows.filter((item) => item.exerciseName || item.exerciseKey).entries()) {
    const exercise = exercises.find((item) => row.exerciseKey && item.external_key === row.exerciseKey)
      ?? exercises.find((item) => normalizeExternalKey(item.name) === normalizeExternalKey(row.exerciseName));
    if (!exercise) { unresolved.push(row.exerciseKey || row.exerciseName); continue; }
    const targetSets = row.setsTarget ?? 1;
    const values = {
      target_sets: targetSets, target_reps_min: row.repsTarget.min ?? 1,
      target_reps_max: row.repsTarget.max ?? row.repsTarget.min ?? 1,
      target_rir: row.rirTarget.max, target_rir_min: row.rirTarget.min,
      target_rir_max: row.rirTarget.max, rest_seconds: row.restSeconds,
    };
    const existing = logs.find((item) => item.exercise_id === exercise.id);
    if (existing && !existing.completed) {
      await supabase.from("strength_exercise_logs").update(values).eq("id", existing.id).eq("user_id", user.id);
      const sets = Array.isArray(existing.strength_sets) ? existing.strength_sets : [];
      const maxSet = sets.reduce((max, set) => Math.max(max, set.set_number), 0);
      if (targetSets > maxSet) {
        await supabase.from("strength_sets").insert(Array.from({ length: targetSets - maxSet }, (_, offset) => ({
          user_id: user.id, exercise_log_id: existing.id, set_number: maxSet + offset + 1,
        })));
      }
      const removable = sets.filter((set) => set.set_number > targetSets && !set.completed).map((set) => set.id);
      if (removable.length) await supabase.from("strength_sets").delete().in("id", removable).eq("user_id", user.id);
    } else if (!existing) {
      const { data: created } = await supabase.from("strength_exercise_logs").insert({
        user_id: user.id, strength_session_id: sessionId, exercise_id: exercise.id,
        position: row.exerciseOrder ?? index + 1, ...values,
      }).select("id").single();
      if (created) await supabase.from("strength_sets").insert(Array.from({ length: targetSets }, (_, offset) => ({ user_id: user.id, exercise_log_id: created.id, set_number: offset + 1 })));
    }
  }
  await supabase.from("planned_sessions").update({
    import_status: unresolved.length ? "needs_review" : "ready",
    review_message: unresolved.length ? `Revisar ejercicios: ${unresolved.join(", ")}` : null,
    pending_plan_update: unresolved.length ? rows : null,
  }).eq("id", plannedId).eq("user_id", user.id);
  revalidatePath(`/entrenar/fuerza/${sessionId}`);
}
