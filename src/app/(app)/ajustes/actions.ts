"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runOutboundSync } from "@/lib/google/export-bridge";
import { createClient } from "@/lib/supabase/server";

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
