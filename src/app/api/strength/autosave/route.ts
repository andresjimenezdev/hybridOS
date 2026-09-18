import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function finite(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= min && numberValue <= max ? numberValue : undefined;
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await request.json();
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const payload = body as Record<string, unknown>;
  const id = typeof payload.id === "string" ? payload.id : "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  if (payload.entity === "set") {
    const weight = finite(payload.weight_kg, 0, 1000);
    const reps = finite(payload.reps, 0, 500);
    const durationSeconds = finite(payload.duration_seconds, 1, 3600);
    const rir = finite(payload.rir, 0, 10);
    if (weight === undefined || reps === undefined || durationSeconds === undefined || rir === undefined || typeof payload.completed !== "boolean") {
      return NextResponse.json({ error: "Invalid set values" }, { status: 400 });
    }
    const { error } = await supabase.from("strength_sets").update({
      weight_kg: weight, reps, duration_seconds: durationSeconds, rir, completed: payload.completed,
    }).eq("id", id).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: "Save failed" }, { status: 500 });
    return NextResponse.json({ saved: true });
  }

  if (payload.entity === "exercise") {
    const feeling = finite(payload.feeling, 1, 10);
    if (feeling === undefined || typeof payload.has_pain !== "boolean" || typeof payload.completed !== "boolean") {
      return NextResponse.json({ error: "Invalid exercise values" }, { status: 400 });
    }
    const notes = typeof payload.notes === "string" ? payload.notes.trim().slice(0, 2000) || null : null;
    const { error } = await supabase.from("strength_exercise_logs").update({
      feeling, has_pain: payload.has_pain, notes, completed: payload.completed,
    }).eq("id", id).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: "Save failed" }, { status: 500 });
    return NextResponse.json({ saved: true });
  }

  return NextResponse.json({ error: "Unknown entity" }, { status: 400 });
}
