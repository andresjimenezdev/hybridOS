"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runOutboundSync } from "@/lib/google/export-bridge";

function text(formData: FormData, key: string, max = 2000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function optionalNumber(formData: FormData, key: string, min: number, max: number) {
  const raw = text(formData, key, 30);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`Valor no válido: ${key}`);
  return parsed;
}

async function userContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function saveHealthMetrics(formData: FormData) {
  const { supabase, user } = await userContext();
  const measuredOn = text(formData, "measured_on", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(measuredOn)) throw new Error("Fecha no válida.");
  const activeCalories = optionalNumber(formData, "active_calories", 0, 20000);
  const totalCalories = optionalNumber(formData, "total_calories", 0, 30000);
  if (activeCalories !== null && totalCalories !== null && totalCalories < activeCalories) throw new Error("Las calorías totales no pueden ser menores que las activas.");
  const sleepHours = optionalNumber(formData, "sleep_hours", 0, 24);
  const values = {
    user_id: user.id,
    measured_on: measuredOn,
    source: "manual",
    weight_kg: optionalNumber(formData, "weight_kg", 20, 500),
    body_fat_percent: optionalNumber(formData, "body_fat_percent", 0, 100),
    resting_heart_rate: optionalNumber(formData, "resting_heart_rate", 20, 250),
    vo2_max: optionalNumber(formData, "vo2_max", 1, 100),
    steps: optionalNumber(formData, "steps", 0, 200000),
    active_calories: activeCalories,
    total_calories: totalCalories,
    sleep_minutes: sleepHours === null ? null : Math.round(sleepHours * 60),
    notes: text(formData, "notes") || null,
  };
  const hasMetric = Object.entries(values).some(([key, value]) => !["user_id", "measured_on", "source", "notes"].includes(key) && value !== null);
  if (!hasMetric && !values.notes) throw new Error("Añade al menos una métrica.");
  const { data: saved, error } = await supabase.from("health_metrics").upsert(values, { onConflict: "user_id,measured_on,source" }).select("id").single();
  if (error || !saved) throw new Error("No se pudieron guardar las métricas.");
  revalidatePath("/salud");
  revalidatePath("/progreso");
  after(async () => { await runOutboundSync(supabase, user.id, "health_metrics", saved.id); });
}

export async function saveBodyMeasurements(formData: FormData) {
  const { supabase, user } = await userContext();
  const measuredOn = text(formData, "measured_on", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(measuredOn)) throw new Error("Fecha no válida.");
  const values = {
    user_id: user.id,
    measured_on: measuredOn,
    source: "manual",
    waist_cm: optionalNumber(formData, "waist_cm", 1, 300),
    chest_cm: optionalNumber(formData, "chest_cm", 1, 300),
    arm_cm: optionalNumber(formData, "arm_cm", 1, 150),
    thigh_cm: optionalNumber(formData, "thigh_cm", 1, 200),
    hip_cm: optionalNumber(formData, "hip_cm", 1, 300),
    notes: text(formData, "notes") || null,
  };
  const hasMeasurement = Object.entries(values).some(([key, value]) => !["user_id", "measured_on", "source", "notes"].includes(key) && value !== null);
  if (!hasMeasurement) throw new Error("Añade al menos una medida.");
  const { data: saved, error } = await supabase.from("body_measurements").upsert(values, { onConflict: "user_id,measured_on,source" }).select("id").single();
  if (error || !saved) throw new Error("No se pudieron guardar las medidas.");
  revalidatePath("/salud");
  revalidatePath("/progreso");
  after(async () => { await runOutboundSync(supabase, user.id, "body_measurements", saved.id); });
}
