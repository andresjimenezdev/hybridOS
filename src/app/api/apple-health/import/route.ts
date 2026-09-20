import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { parseAppleHealthPayload } from "@/lib/apple-health";
import { runOutboundSync } from "@/lib/google/export-bridge";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function todayInMadrid() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function authorized(request: Request) {
  const expected = process.env.APPLE_HEALTH_SYNC_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = process.env.HYBRIDOS_USER_ID;
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    console.error("[apple-health/import] HYBRIDOS_USER_ID is missing or invalid");
    return Response.json({ error: "Server configuration error" }, { status: 503 });
  }

  let payload;
  try {
    payload = parseAppleHealthPayload(await request.json(), todayInMadrid());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid payload" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: existing, error: readError } = await supabase.from("health_metrics")
    .select("weight_kg,body_fat_percent,bmi,lean_body_mass_kg,resting_heart_rate,vo2_max,steps,active_calories,resting_calories,total_calories,sleep_minutes")
    .eq("user_id", userId).eq("measured_on", payload.date).eq("source", "apple_health").maybeSingle();
  if (readError) {
    console.error("[apple-health/import] read failed", { message: readError.message });
    return Response.json({ error: "Could not read health metrics" }, { status: 500 });
  }

  const { date, ...metrics } = payload;
  const values = {
    ...(existing ?? {}), ...metrics, user_id: userId, measured_on: date, source: "apple_health",
    external_id: `apple_health:${date}`,
  };
  if (values.active_calories !== null && values.active_calories !== undefined && values.resting_calories !== null && values.resting_calories !== undefined) {
    values.total_calories = values.active_calories + values.resting_calories;
  }
  if (values.active_calories !== null && values.active_calories !== undefined && values.total_calories !== null && values.total_calories !== undefined && values.total_calories < values.active_calories) {
    values.total_calories = null;
  }
  const { data: saved, error: saveError } = await supabase.from("health_metrics")
    .upsert(values, { onConflict: "user_id,measured_on,source" }).select("id").single();
  if (saveError || !saved) {
    console.error("[apple-health/import] save failed", { message: saveError?.message });
    return Response.json({ error: "Could not save health metrics" }, { status: 500 });
  }
  await supabase.from("sync_log").insert({
    user_id: userId, direction: "inbound", entity_type: "apple_health", entity_id: saved.id,
    status: "success", attempted_at: new Date().toISOString(), completed_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(), attempts: 1,
  });
  after(async () => {
    const outcome = await runOutboundSync(supabase, userId, "health_metrics", saved.id);
    if (!outcome.ok) console.error("[apple-health/import] Google Sheets sync failed", { message: outcome.error });
  });
  return Response.json({ ok: true, date, updated: Object.keys(metrics) });
}
