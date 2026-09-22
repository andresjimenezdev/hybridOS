"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { averagePaceSeconds, cardioKinds, durationSeconds, runningTypes, type CardioKind, type RunningType } from "@/lib/cardio";
import { createClient } from "@/lib/supabase/server";
import { runOutboundSync } from "@/lib/google/export-bridge";

function value(formData: FormData, key: string, max = 2000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function optionalNumber(formData: FormData, key: string) {
  const raw = value(formData, key, 30);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createCardioSession(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawKind = value(formData, "kind", 40) as CardioKind;
  if (!cardioKinds.includes(rawKind)) throw new Error("Tipo de cardio no válido.");
  const minutes = optionalNumber(formData, "duration_minutes") ?? 0;
  const seconds = optionalNumber(formData, "duration_seconds") ?? 0;
  const totalSeconds = durationSeconds(minutes, seconds);
  if (!totalSeconds) throw new Error("La duración no es válida.");
  const distance = optionalNumber(formData, "distance_km");
  const averageHeartRate = optionalNumber(formData, "average_heart_rate");
  const maxHeartRate = optionalNumber(formData, "max_heart_rate");
  if (averageHeartRate && maxHeartRate && maxHeartRate < averageHeartRate) throw new Error("La FC máxima no puede ser menor que la media.");
  const rawWorkoutType = value(formData, "workout_type", 40) as RunningType;
  const workoutType = rawKind === "running" && runningTypes.includes(rawWorkoutType) ? rawWorkoutType : null;
  const stravaUrl = value(formData, "strava_url", 500);
  if (stravaUrl && !/^https?:\/\//i.test(stravaUrl)) throw new Error("El enlace de Strava no es válido.");
  const plannedId = value(formData, "planned_id", 36) || null;
  const performedOn = value(formData, "performed_on", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(performedOn)) throw new Error("La fecha no es válida.");

  const { data: savedSession, error } = await supabase.from("cardio_sessions").insert({
    user_id: user.id,
    planned_session_id: plannedId,
    kind: rawKind,
    workout_type: workoutType,
    performed_at: `${performedOn}T12:00:00`,
    duration_seconds: totalSeconds,
    distance_km: distance,
    average_pace_seconds: averagePaceSeconds(totalSeconds, distance),
    average_heart_rate: averageHeartRate,
    max_heart_rate: maxHeartRate,
    rpe: optionalNumber(formData, "rpe"),
    talk_test: value(formData, "talk_test", 120) || null,
    feeling: optionalNumber(formData, "feeling"),
    notes: value(formData, "notes") || null,
    strava_url: stravaUrl || null,
  }).select("id").single();
  if (error || !savedSession) {
    console.error("[cardio/create] insert failed", {
      userId: user.id,
      plannedId,
      kind: rawKind,
      code: error?.code,
      message: error?.message,
      constraint: error?.details,
    });
    throw new Error("No se pudo guardar la sesión de cardio.");
  }

  if (plannedId) {
    await supabase.from("planned_sessions").update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", plannedId).eq("user_id", user.id).eq("status", "planned");
  }
  revalidatePath("/hoy");
  revalidatePath("/entrenar/cardio");
  revalidatePath("/progreso");
  after(async () => { await runOutboundSync(supabase, user.id, "cardio_session", savedSession.id); });
  redirect("/entrenar/cardio?guardado=1");
}
