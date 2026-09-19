import Link from "next/link";
import { SectionHeading } from "@/components/section-heading";
import { createClient } from "@/lib/supabase/server";

type Session = { id: string; name: string; started_at: string; duration_minutes: number | null };
type Exercise = { id: string; name: string; muscle_group: string };

export default async function StrengthProgressPage() {
  const supabase = await createClient();
  const [{ data: sessionsData }, { data: exercisesData }] = await Promise.all([
    supabase.from("strength_sessions").select("id,name,started_at,duration_minutes").eq("status", "completed").order("started_at", { ascending: false }).limit(20),
    supabase.from("exercises").select("id,name,muscle_group").order("name"),
  ]);
  const sessions = (sessionsData ?? []) as Session[];
  const exercises = (exercisesData ?? []) as Exercise[];
  return (
    <main><SectionHeading eyebrow="Progreso" title="Fuerza" action={<Link className="text-sm" href="/progreso">Volver</Link>} />
      <section><p className="eyebrow mb-4">Por ejercicio</p><div className="card divide-y divide-[var(--line)]">{exercises.map((exercise) => <Link className="flex min-h-16 items-center justify-between px-5" href={`/progreso/fuerza/${exercise.id}`} key={exercise.id}><div><p className="font-medium">{exercise.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{exercise.muscle_group}</p></div><span aria-hidden="true">→</span></Link>)}</div></section>
      <section className="mt-9"><p className="eyebrow mb-4">Sesiones recientes</p>{sessions.length ? <div className="space-y-3">{sessions.map((session) => <Link className="card flex min-h-20 items-center justify-between p-5" href={`/entrenar/fuerza/${session.id}/resumen`} key={session.id}><div><p className="font-semibold">{session.name}</p><p className="mt-1 text-xs text-[var(--muted)]">{new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(new Date(session.started_at))}</p></div><div className="flex items-center gap-3"><span className="text-sm text-[var(--muted)]">{session.duration_minutes ?? "—"} min</span><span aria-hidden="true">→</span></div></Link>)}</div> : <div className="card p-6 text-sm text-[var(--muted)]">Aún no hay sesiones terminadas.</div>}</section>
    </main>
  );
}
