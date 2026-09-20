"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runOutboundSync } from "@/lib/google/export-bridge";
import { legacyExerciseAliases, parseLegacyStrengthRows } from "@/lib/google/legacy-strength";
import { normalizeExternalKey } from "@/lib/google/contracts";
import { readSheet } from "@/lib/google/sheets";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/date";

export async function retryGoogleSync() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const result = await runOutboundSync(supabase, user.id, "manual_retry", null);
  if (result.ok) {
    await supabase.from("sync_log").update({
      status: "success", completed_at: new Date().toISOString(), last_synced_at: new Date().toISOString(),
      error_message: null, sync_error: null,
    }).eq("user_id", user.id).eq("direction", "outbound").in("status", ["pending", "failed"]);
  }
  revalidatePath("/ajustes");
}

export async function reconcileLegacyStrength() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const rows = await readSheet("'Fuerza'!A1:N500");
  const sessions = parseLegacyStrengthRows(rows);
  const { data: exerciseData, error: exerciseError } = await supabase.from("exercises").select("id,name,external_key").eq("user_id", user.id);
  if (exerciseError) throw new Error("No se pudo leer la biblioteca de ejercicios.");
  const exercises = exerciseData ?? [];

  for (const imported of sessions) {
    const { data: plans } = await supabase.from("planned_sessions").select("id,title,status,workout_template_id")
      .eq("user_id", user.id).eq("scheduled_date", imported.date).eq("kind", "strength");
    const suffix = `_${imported.code.toLowerCase()}`;
    const plan = (plans ?? []).find((item) => normalizeExternalKey(item.title).endsWith(suffix)) ?? plans?.[0] ?? null;
    const externalId = `${imported.date}:full_body_${imported.code.toLowerCase()}`;
    let { data: strengthSession } = await supabase.from("strength_sessions").select("id")
      .eq("user_id", user.id).eq("external_source", "legacy_google_sheet").eq("external_id", externalId).maybeSingle();
    if (!strengthSession && plan) {
      const result = await supabase.from("strength_sessions").select("id").eq("user_id", user.id).eq("planned_session_id", plan.id).maybeSingle();
      strengthSession = result.data;
    }
    if (!strengthSession) {
      const result = await supabase.from("strength_sessions").select("id,name").eq("user_id", user.id)
        .gte("started_at", `${imported.date}T00:00:00Z`).lt("started_at", `${addDays(imported.date, 1)}T00:00:00Z`);
      strengthSession = result.data?.find((item) => normalizeExternalKey(item.name).endsWith(suffix)) ?? result.data?.[0] ?? null;
    }
    const completedAt = `${imported.date}T13:00:00Z`;
    if (!strengthSession) {
      const result = await supabase.from("strength_sessions").insert({
        user_id: user.id, planned_session_id: plan?.id ?? null, workout_template_id: plan?.workout_template_id ?? null,
        name: plan?.title ?? imported.name, status: "completed", started_at: `${imported.date}T12:00:00Z`,
        completed_at: completedAt, duration_minutes: 60, external_source: "legacy_google_sheet", external_id: externalId,
      }).select("id").single();
      if (result.error || !result.data) throw new Error(`No se pudo importar ${imported.name}.`);
      strengthSession = result.data;
    } else {
      const { error } = await supabase.from("strength_sessions").update({
        planned_session_id: plan?.id ?? null, workout_template_id: plan?.workout_template_id ?? null,
        name: plan?.title ?? imported.name, status: "completed", completed_at: completedAt,
        external_source: "legacy_google_sheet", external_id: externalId,
      }).eq("id", strengthSession.id).eq("user_id", user.id);
      if (error) throw new Error(`No se pudo actualizar ${imported.name}.`);
    }
    if (plan) {
      const { error } = await supabase.from("planned_sessions").update({ status: "completed", completed_at: completedAt })
        .eq("id", plan.id).eq("user_id", user.id);
      if (error) throw new Error(`No se pudo completar la planificación de ${imported.name}.`);
    }

    let position = 0;
    for (const importedExercise of imported.exercises) {
      if (!importedExercise.values.length) continue;
      position += 1;
      const normalized = normalizeExternalKey(importedExercise.name);
      const externalKey = legacyExerciseAliases[normalized];
      let exercise = exercises.find((item) => externalKey ? item.external_key === externalKey : normalizeExternalKey(item.name) === normalized);
      if (!exercise) {
        const result = await supabase.from("exercises").insert({
          user_id: user.id, name: importedExercise.name, muscle_group: "Sin clasificar", movement_pattern: "Sin clasificar",
          equipment: "Sin clasificar", external_key: normalized, external_source: "legacy_google_sheet",
        }).select("id,name,external_key").single();
        if (result.error || !result.data) throw new Error(`No se pudo crear ${importedExercise.name}.`);
        exercise = result.data;
        exercises.push(exercise);
      }
      let { data: log } = await supabase.from("strength_exercise_logs").select("id")
        .eq("user_id", user.id).eq("strength_session_id", strengthSession.id).eq("exercise_id", exercise.id).maybeSingle();
      const logValues = {
        feeling: importedExercise.feeling, has_pain: importedExercise.hasPain, notes: importedExercise.notes, completed: true,
        target_sets: importedExercise.targetSets ?? importedExercise.values.length,
        target_reps_min: importedExercise.targetKind === "reps" ? importedExercise.targetMin : null,
        target_reps_max: importedExercise.targetKind === "reps" ? importedExercise.targetMax : null,
        target_duration_min_seconds: importedExercise.targetKind === "duration" ? importedExercise.targetMin : null,
        target_duration_max_seconds: importedExercise.targetKind === "duration" ? importedExercise.targetMax : null,
        target_rir: importedExercise.rir,
      };
      if (!log) {
        const result = await supabase.from("strength_exercise_logs").insert({
          user_id: user.id, strength_session_id: strengthSession.id, exercise_id: exercise.id, position,
          external_source: "legacy_google_sheet", external_id: `${externalId}:${normalized}`, ...logValues,
        }).select("id").single();
        if (result.error || !result.data) throw new Error(`No se pudo importar ${importedExercise.name}.`);
        log = result.data;
      } else {
        await supabase.from("strength_exercise_logs").update(logValues).eq("id", log.id).eq("user_id", user.id);
      }
      const sets = importedExercise.values.map((value, index) => ({
        user_id: user.id, exercise_log_id: log.id, set_number: index + 1,
        weight_kg: importedExercise.weightKg,
        reps: importedExercise.targetKind === "duration" ? null : value,
        duration_seconds: importedExercise.targetKind === "duration" ? value : null,
        rir: importedExercise.rir, completed: true,
      }));
      const { error: setsError } = await supabase.from("strength_sets").upsert(sets, { onConflict: "exercise_log_id,set_number" });
      if (setsError) throw new Error(`No se pudieron importar las series de ${importedExercise.name}.`);
    }
  }
  await runOutboundSync(supabase, user.id, "legacy_strength_reconciliation", null);
  revalidatePath("/hoy");
  revalidatePath("/entrenar");
  revalidatePath("/progreso", "layout");
  revalidatePath("/planificacion");
  redirect(`/ajustes?reconciled=${sessions.length}`);
}
