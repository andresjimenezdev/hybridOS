import { NextResponse } from "next/server";
import { syncPlanFromGoogle } from "@/lib/google/sync-plan";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const attemptedAt = new Date().toISOString();
  const { data: log } = await supabase.from("sync_log").insert({
    user_id: user.id, direction: "inbound", entity_type: "ai_plan", entity_id: null,
    status: "pending", attempted_at: attemptedAt, attempts: 1,
  }).select("id").single();
  try {
    const summary = await syncPlanFromGoogle(supabase, user.id);
    const status = summary.errors.length ? "failed" : "success";
    if (log) await supabase.from("sync_log").update({
      status, completed_at: new Date().toISOString(), last_synced_at: status === "success" ? new Date().toISOString() : null,
      error_message: summary.errors.join(" ").slice(0, 500) || null, sync_error: summary.errors.join(" ").slice(0, 500) || null,
    }).eq("id", log.id);
    return NextResponse.json(summary, { status: summary.errors.length ? 207 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Plan sync failed";
    if (log) await supabase.from("sync_log").update({ status: "failed", completed_at: new Date().toISOString(), error_message: message, sync_error: message }).eq("id", log.id);
    return NextResponse.json({ error: "Plan sync unavailable" }, { status: 503 });
  }
}
