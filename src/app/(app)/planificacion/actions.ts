"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cardioKinds } from "@/lib/cardio";
import { isoWeekStart } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";

const sessionKinds = ["strength", ...cardioKinds, "mobility", "rest"] as const;
type SessionKind = (typeof sessionKinds)[number];

function text(formData: FormData, key: string, max = 2000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function optionalNumber(formData: FormData, key: string) {
  const raw = text(formData, key, 30);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

async function auth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function createPlannedSession(formData: FormData) {
  const { supabase, user } = await auth();
  const kind = text(formData, "kind", 40) as SessionKind;
  const date = text(formData, "scheduled_date", 10);
  const title = text(formData, "title", 120);
  if (!sessionKinds.includes(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) throw new Error("La planificación no es válida.");
  const templateId = text(formData, "workout_template_id", 36) || null;
  if (kind === "strength" && !templateId) throw new Error("Selecciona una plantilla de fuerza.");
  const weekStart = isoWeekStart(date);
  const { data: plan, error: planError } = await supabase.from("weekly_plans")
    .upsert({ user_id: user.id, week_start: weekStart }, { onConflict: "user_id,week_start" }).select("id").single();
  if (planError || !plan) throw new Error("No se pudo preparar la semana.");

  const paceMinMinutes = optionalNumber(formData, "pace_min_minutes");
  const paceMinSeconds = optionalNumber(formData, "pace_min_seconds");
  const paceMaxMinutes = optionalNumber(formData, "pace_max_minutes");
  const paceMaxSeconds = optionalNumber(formData, "pace_max_seconds");
  const minPace = paceMinMinutes === null ? null : Math.round(paceMinMinutes * 60 + (paceMinSeconds ?? 0));
  const maxPace = paceMaxMinutes === null ? null : Math.round(paceMaxMinutes * 60 + (paceMaxSeconds ?? 0));
  const { error } = await supabase.from("planned_sessions").insert({
    user_id: user.id,
    weekly_plan_id: plan.id,
    workout_template_id: kind === "strength" ? templateId : null,
    kind,
    title,
    scheduled_date: date,
    status: "planned",
    target_duration_minutes: optionalNumber(formData, "target_duration_minutes"),
    target_distance_km: optionalNumber(formData, "target_distance_km"),
    target_pace_min_seconds: minPace,
    target_pace_max_seconds: maxPace,
    target_rpe_min: optionalNumber(formData, "target_rpe_min"),
    target_rpe_max: optionalNumber(formData, "target_rpe_max"),
    target_talk_test: text(formData, "target_talk_test", 120) || null,
    notes: text(formData, "notes") || null,
  });
  if (error) throw new Error("No se pudo añadir la sesión.");
  revalidatePath("/planificacion");
  revalidatePath("/hoy");
}

export async function updatePlannedSession(formData: FormData) {
  const { supabase, user } = await auth();
  const id = text(formData, "id", 36);
  const date = text(formData, "scheduled_date", 10);
  const title = text(formData, "title", 120);
  if (!id || !title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Los cambios no son válidos.");
  const { error } = await supabase.from("planned_sessions").update({ scheduled_date: date, title })
    .eq("id", id).eq("user_id", user.id).eq("status", "planned");
  if (error) throw new Error("No se pudo actualizar la sesión.");
  revalidatePath("/planificacion");
  revalidatePath("/hoy");
}

export async function cancelPlannedSession(formData: FormData) {
  const { supabase, user } = await auth();
  const id = text(formData, "id", 36);
  const { error } = await supabase.from("planned_sessions").update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", user.id).eq("status", "planned");
  if (error) throw new Error("No se pudo cancelar la sesión.");
  revalidatePath("/planificacion");
  revalidatePath("/hoy");
}
