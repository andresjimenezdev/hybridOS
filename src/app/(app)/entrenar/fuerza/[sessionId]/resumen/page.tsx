import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { SectionHeading } from "@/components/section-heading";
import { createClient } from "@/lib/supabase/server";

type CompletedSet = {
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  completed: boolean;
};

type ExerciseLog = {
  feeling: number | null;
  has_pain: boolean;
  exercises: { name: string } | null;
  strength_sets: CompletedSet[];
};

export default async function StrengthSummaryPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("strength_sessions")
    .select("id,name,status,started_at,completed_at,duration_minutes,strength_exercise_logs(feeling,has_pain,exercises(name),strength_sets(weight_kg,reps,duration_seconds,completed))")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) notFound();
  if (session.status === "in_progress") redirect(`/entrenar/fuerza/${sessionId}`);
  if (session.status !== "completed") redirect("/progreso/fuerza");

  const logs = (session.strength_exercise_logs ?? []) as unknown as ExerciseLog[];
  const completedSets = logs.flatMap((log) => log.strength_sets).filter((set) => set.completed);
  const totalReps = completedSets.reduce((total, set) => total + (set.reps ?? 0), 0);
  const volume = completedSets.reduce((total, set) => total + (set.weight_kg ?? 0) * (set.reps ?? 0), 0);
  const feelings = logs.flatMap((log) => log.feeling === null ? [] : [log.feeling]);
  const averageFeeling = feelings.length ? feelings.reduce((total, value) => total + value, 0) / feelings.length : null;
  const painCount = logs.filter((log) => log.has_pain).length;

  return (
    <main className="mx-auto max-w-2xl">
      <SectionHeading eyebrow="Entrenamiento completado" title={session.name} />
      <section className="card p-6 sm:p-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Duración" value={`${session.duration_minutes ?? 0} min`} />
          <Metric label="Series" value={String(completedSets.length)} />
          <Metric label="Repeticiones" value={String(totalReps)} />
          <Metric label="Volumen" value={`${Math.round(volume).toLocaleString("es-ES")} kg`} />
        </div>
        <div className="mt-7 border-t border-[var(--line)] pt-6">
          <p className="eyebrow">Cómo ha ido</p>
          <p className="mt-2 text-lg font-semibold">{averageFeeling === null ? "Sin valoración" : `${averageFeeling.toFixed(1)} / 10`}</p>
          <p className={`mt-1 text-sm ${painCount ? "text-[var(--warning)]" : "text-[var(--muted)]"}`}>{painCount ? `Molestia registrada en ${painCount} ${painCount === 1 ? "ejercicio" : "ejercicios"}.` : "Sin molestias registradas."}</p>
        </div>
      </section>

      <section className="mt-5 card divide-y divide-[var(--line)]">
        {logs.map((log, index) => {
          const sets = log.strength_sets.filter((set) => set.completed);
          return <div className="flex items-center justify-between gap-4 p-5" key={`${log.exercises?.name ?? "ejercicio"}-${index}`}><div><p className="font-medium">{log.exercises?.name ?? "Ejercicio"}</p><p className="mt-1 text-xs text-[var(--muted)]">{sets.map((set) => set.duration_seconds !== null ? `${set.duration_seconds} s` : `${set.weight_kg ?? "—"} kg × ${set.reps ?? "—"}`).join(" · ") || "Sin series completadas"}</p></div>{log.feeling ? <span className="text-sm text-[var(--muted)]">{log.feeling}/10</span> : null}</div>;
        })}
      </section>

      <div className="mt-6 grid grid-cols-2 gap-3"><Link className="secondary-button" href="/progreso/fuerza">Ver histórico</Link><Link className="primary-button" href="/hoy">Volver a Hoy</Link></div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-black/[0.035] p-4 dark:bg-white/[0.05]"><p className="eyebrow">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p></div>;
}
