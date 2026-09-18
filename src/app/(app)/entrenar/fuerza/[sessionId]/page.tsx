import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkoutClient, type PreviousPerformance, type WorkoutExercise, type WorkoutSet } from "./workout-client";
import { acceptPlanUpdate, rejectPlanUpdate } from "./plan-update-actions";

type CurrentLog = { id: string; exercise_id: string; position: number; target_sets: number | null; target_reps_min: number | null; target_reps_max: number | null; target_rir: number | null; target_rir_min: number | null; target_rir_max: number | null; rest_seconds: number | null; feeling: number | null; has_pain: boolean; notes: string | null; completed: boolean; exercises: { name: string } | null; strength_sets: WorkoutSet[] };
type HistoricLog = { exercise_id: string; created_at: string; strength_sets: Array<{ weight_kg: number | null; reps: number | null; set_number: number }>; strength_sessions: { status: string } | null };

export default async function StrengthSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const { data: session } = await supabase.from("strength_sessions").select("id,name,status,planned_sessions(import_status,review_message)").eq("id", sessionId).maybeSingle();
  if (!session) notFound();
  if (session.status !== "in_progress") redirect("/progreso/fuerza");
  const { data: logsData } = await supabase.from("strength_exercise_logs").select("id,exercise_id,position,target_sets,target_reps_min,target_reps_max,target_rir,target_rir_min,target_rir_max,rest_seconds,feeling,has_pain,notes,completed,exercises(name),strength_sets(id,set_number,weight_kg,reps,rir,completed)").eq("strength_session_id", sessionId).order("position");
  const logs = (logsData ?? []) as unknown as CurrentLog[];
  const exerciseIds = logs.map((log) => log.exercise_id);
  const { data: historyData } = exerciseIds.length ? await supabase.from("strength_exercise_logs").select("exercise_id,created_at,strength_sets(weight_kg,reps,set_number),strength_sessions!inner(status)").in("exercise_id", exerciseIds).neq("strength_session_id", sessionId).eq("strength_sessions.status", "completed").order("created_at", { ascending: false }) : { data: [] };
  const history = (historyData ?? []) as unknown as HistoricLog[];
  const previousByExercise = new Map<string, PreviousPerformance>();
  for (const log of history) {
    if (previousByExercise.has(log.exercise_id)) continue;
    const sets = [...log.strength_sets].sort((a, b) => a.set_number - b.set_number);
    previousByExercise.set(log.exercise_id, { date: log.created_at, weight: sets.find((set) => set.weight_kg !== null)?.weight_kg ?? null, reps: sets.flatMap((set) => set.reps === null ? [] : [set.reps]) });
  }
  const exercises: WorkoutExercise[] = logs.map((log) => ({ ...log, name: log.exercises?.name ?? "Ejercicio", sets: [...log.strength_sets].sort((a, b) => a.set_number - b.set_number), previous: previousByExercise.get(log.exercise_id) ?? null }));
  const plan = Array.isArray(session.planned_sessions) ? session.planned_sessions[0] : session.planned_sessions;
  return <>{plan?.import_status === "update_available" ? <aside className="card mx-auto mb-5 max-w-2xl border-[color:var(--warning)] p-5"><p className="font-semibold">Actualización disponible</p><p className="mt-2 text-sm text-[var(--muted)]">{plan.review_message ?? "La planificación cambió mientras entrenabas."}</p><div className="mt-4 flex gap-3"><form action={acceptPlanUpdate.bind(null, sessionId)}><button className="primary-button" type="submit">Aceptar cambios</button></form><form action={rejectPlanUpdate.bind(null, sessionId)}><button className="secondary-button" type="submit">Mantener sesión</button></form></div></aside> : null}<WorkoutClient initialExercises={exercises} sessionId={session.id} sessionName={session.name} /></>;
}
