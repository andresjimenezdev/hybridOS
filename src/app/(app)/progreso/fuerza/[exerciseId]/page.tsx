import Link from "next/link";
import { notFound } from "next/navigation";
import { TrendChart } from "@/components/trend-chart";
import { createClient } from "@/lib/supabase/server";

type Log = { id: string; created_at: string; strength_sets: Array<{ set_number: number; weight_kg: number | null; reps: number | null; completed: boolean }>; strength_sessions: { started_at: string; status: string } | null };

export default async function ExerciseProgressPage({ params }: { params: Promise<{ exerciseId: string }> }) {
  const { exerciseId } = await params;
  const supabase = await createClient();
  const [{ data: exercise }, { data: logsData }] = await Promise.all([
    supabase.from("exercises").select("id,name,muscle_group").eq("id", exerciseId).maybeSingle(),
    supabase.from("strength_exercise_logs").select("id,created_at,strength_sets(set_number,weight_kg,reps,completed),strength_sessions!inner(started_at,status)").eq("exercise_id", exerciseId).eq("strength_sessions.status", "completed").order("created_at", { ascending: true }),
  ]);
  if (!exercise) notFound();
  const logs = (logsData ?? []) as unknown as Log[];
  const entries = logs.map((log) => {
    const sets = [...log.strength_sets].filter((set) => set.completed).sort((a, b) => a.set_number - b.set_number);
    const weight = sets.reduce<number | null>((highest, set) => set.weight_kg !== null && (highest === null || set.weight_kg > highest) ? set.weight_kg : highest, null);
    const volume = sets.reduce((sum, set) => sum + (set.weight_kg ?? 0) * (set.reps ?? 0), 0);
    const date = log.strength_sessions?.started_at ?? log.created_at;
    return { id: log.id, date, weight, volume, reps: sets.map((set) => set.reps).filter((reps): reps is number => reps !== null) };
  });
  const points = entries.flatMap((entry) => entry.weight === null ? [] : [{ label: new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(entry.date)), value: entry.weight }]);
  return (
    <main className="mx-auto max-w-2xl"><Link className="text-sm text-[var(--muted)]" href="/progreso/fuerza">← Fuerza</Link><p className="eyebrow mt-8">{exercise.muscle_group}</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.045em]">{exercise.name}</h1>
      <section className="card mt-7 p-6"><div className="flex items-end justify-between"><div><p className="eyebrow">Carga</p><p className="mt-2 text-3xl font-semibold">{points.at(-1)?.value ?? "—"} <span className="text-base text-[var(--muted)]">kg</span></p></div><span className="text-xs text-[var(--muted)]">Todo</span></div><TrendChart points={points} /></section>
      <section className="mt-8"><p className="eyebrow mb-4">Histórico</p><div className="space-y-3">{[...entries].reverse().map((entry) => <article className="card p-5" key={entry.id}><div className="flex justify-between"><p className="text-sm font-semibold uppercase">{new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(new Date(entry.date))}</p><span className="text-xs text-[var(--muted)]">{Math.round(entry.volume)} kg vol.</span></div><p className="mt-3 text-xl font-semibold">{entry.weight ?? "—"} kg</p><p className="mt-1 text-sm text-[var(--muted)]">{entry.reps.join(" / ") || "Sin series completadas"}</p></article>)}</div></section>
    </main>
  );
}
