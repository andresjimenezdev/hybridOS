"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { runOutboundSync } from "@/lib/google/export-bridge";
import { createClient } from "@/lib/supabase/server";
import { dateInTimeZone, isoWeekStart } from "@/lib/date";

function text(formData: FormData, key: string, max = 500) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function number(formData: FormData, key: string, fallback: number) {
  const parsed = Number(formData.get(key));
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function createExercise(formData: FormData) {
  const { supabase, user } = await authenticatedClient();
  const name = text(formData, "name", 120);
  const muscleGroup = text(formData, "muscle_group", 80);
  const movementPattern = text(formData, "movement_pattern", 80);
  const equipment = text(formData, "equipment", 80);
  if (!name || !muscleGroup || !movementPattern || !equipment) throw new Error("Faltan datos del ejercicio.");
  const { error } = await supabase.from("exercises").insert({
    user_id: user.id, name, muscle_group: muscleGroup, movement_pattern: movementPattern,
    equipment, instructions: text(formData, "instructions", 2000) || null,
  });
  if (error) throw new Error("No se pudo guardar el ejercicio.");
  revalidatePath("/entrenar/ejercicios");
}

export async function toggleExercise(formData: FormData) {
  const { supabase, user } = await authenticatedClient();
  const id = text(formData, "id", 36);
  const isActive = formData.get("is_active") === "true";
  await supabase.from("exercises").update({ is_active: !isActive }).eq("id", id).eq("user_id", user.id);
  revalidatePath("/entrenar/ejercicios");
}

export async function updateExercise(formData: FormData) {
  const { supabase, user } = await authenticatedClient();
  const id = text(formData, "id", 36);
  const values = {
    name: text(formData, "name", 120),
    muscle_group: text(formData, "muscle_group", 80),
    movement_pattern: text(formData, "movement_pattern", 80),
    equipment: text(formData, "equipment", 80),
    instructions: text(formData, "instructions", 2000) || null,
  };
  if (!id || !values.name || !values.muscle_group || !values.movement_pattern || !values.equipment) {
    throw new Error("Faltan datos del ejercicio.");
  }
  const { error } = await supabase.from("exercises").update(values).eq("id", id).eq("user_id", user.id);
  if (error) throw new Error("No se pudo actualizar el ejercicio.");
  revalidatePath("/entrenar/ejercicios");
  revalidatePath("/entrenar");
}

export async function createTemplate(formData: FormData) {
  const { supabase, user } = await authenticatedClient();
  const name = text(formData, "name", 100);
  const duration = Math.min(360, Math.max(1, number(formData, "duration", 60)));
  if (!name) throw new Error("La plantilla necesita un nombre.");
  const { error } = await supabase.from("workout_templates").insert({
    user_id: user.id, name, estimated_duration_minutes: duration,
  });
  if (error) throw new Error("No se pudo crear la plantilla.");
  revalidatePath("/entrenar");
}

export async function addTemplateExercise(formData: FormData) {
  const { supabase, user } = await authenticatedClient();
  const templateId = text(formData, "template_id", 36);
  const exerciseId = text(formData, "exercise_id", 36);
  const targetSets = Math.min(20, Math.max(1, number(formData, "sets", 3)));
  const repsMin = Math.min(100, Math.max(1, number(formData, "reps_min", 6)));
  const repsMax = Math.min(100, Math.max(repsMin, number(formData, "reps_max", 8)));
  const { count } = await supabase.from("workout_template_exercises")
    .select("id", { count: "exact", head: true }).eq("workout_template_id", templateId).eq("user_id", user.id);
  const { error } = await supabase.from("workout_template_exercises").insert({
    user_id: user.id, workout_template_id: templateId, exercise_id: exerciseId,
    position: (count ?? 0) + 1, target_sets: targetSets, target_reps_min: repsMin,
    target_reps_max: repsMax, target_rir: Math.min(10, Math.max(0, number(formData, "rir", 3))),
    rest_seconds: Math.min(1800, Math.max(0, number(formData, "rest", 120))),
  });
  if (error) throw new Error("No se pudo añadir el ejercicio a la plantilla.");
  revalidatePath("/entrenar");
}

export async function removeTemplateExercise(formData: FormData) {
  const { supabase, user } = await authenticatedClient();
  const id = text(formData, "id", 36);
  const { error } = await supabase.from("workout_template_exercises").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error("No se pudo quitar el ejercicio de la plantilla.");
  revalidatePath("/entrenar");
}

export async function planTemplateToday(formData: FormData) {
  const { supabase, user } = await authenticatedClient();
  const templateId = text(formData, "template_id", 36);
  const title = text(formData, "template_name", 120);
  const today = dateInTimeZone(new Date());
  const weekStart = isoWeekStart(today);
  const { data: plan, error: planError } = await supabase.from("weekly_plans")
    .upsert({ user_id: user.id, week_start: weekStart }, { onConflict: "user_id,week_start" })
    .select("id").single();
  if (planError || !plan) throw new Error("No se pudo preparar la semana.");
  const { error } = await supabase.from("planned_sessions").insert({
    user_id: user.id, weekly_plan_id: plan.id, workout_template_id: templateId,
    kind: "strength", title, scheduled_date: today, status: "planned",
  });
  if (error) throw new Error("No se pudo planificar la sesión.");
  revalidatePath("/hoy");
  redirect("/hoy");
}

export async function startStrengthSession(formData: FormData) {
  const { supabase } = await authenticatedClient();
  const templateId = text(formData, "template_id", 36);
  const plannedId = text(formData, "planned_id", 36) || null;
  const { data, error } = await supabase.rpc("start_strength_session", { template_id: templateId, planned_id: plannedId });
  if (error || !data) throw new Error("No se pudo iniciar el entrenamiento.");
  redirect(`/entrenar/fuerza/${data}`);
}

export async function finishStrengthSession(sessionId: string) {
  const { supabase, user } = await authenticatedClient();
  const { error } = await supabase.rpc("finish_strength_session", { session_id: sessionId });
  if (error) throw new Error("No se pudo terminar el entrenamiento.");
  revalidatePath("/hoy");
  revalidatePath("/progreso", "layout");
  revalidatePath("/entrenar");
  after(async () => { await runOutboundSync(supabase, user.id, "strength_session", sessionId); });
  redirect(`/entrenar/fuerza/${sessionId}/resumen`);
}
