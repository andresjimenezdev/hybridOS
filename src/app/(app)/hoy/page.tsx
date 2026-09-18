import Link from "next/link";
import { startStrengthSession } from "@/app/(app)/entrenar/actions";
import { SectionHeading } from "@/components/section-heading";
import { PlanSync } from "@/components/plan-sync";
import { addDays, dateInTimeZone, isoWeekStart, longSpanishDate } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";

type PlannedSession = {
  id: string; title: string; kind: string; status: "planned" | "completed" | "cancelled";
  target_duration_minutes: number | null; workout_template_id: string | null;
  workout_templates: { estimated_duration_minutes: number | null } | null;
  import_status: string; review_message: string | null;
};

const kindLabels: Record<string, string> = {
  strength: "Fuerza", running: "Running", mobility: "Movilidad", cycling_outdoor: "Ciclismo",
  stationary_bike: "Bicicleta", treadmill: "Cinta", stair_machine: "Stair machine", walking: "Caminata", rest: "Descanso", other: "Cardio",
};

export default async function TodayPage() {
  const supabase = await createClient();
  const today = dateInTimeZone(new Date());
  const weekStart = isoWeekStart(today);
  const weekEnd = addDays(weekStart, 6);
  const [{ data: todayData }, { data: weekData }, { data: activeSession }] = await Promise.all([
    supabase.from("planned_sessions")
      .select("id,title,kind,status,target_duration_minutes,workout_template_id,import_status,review_message,workout_templates(estimated_duration_minutes)")
      .eq("scheduled_date", today).order("scheduled_time", { ascending: true }),
    supabase.from("planned_sessions").select("kind,status").gte("scheduled_date", weekStart).lte("scheduled_date", weekEnd),
    supabase.from("strength_sessions").select("id,name,started_at").eq("status", "in_progress").maybeSingle(),
  ]);
  const sessions = (todayData ?? []) as unknown as PlannedSession[];
  const weekly = (weekData ?? []) as Array<{ kind: string; status: string }>;
  const groups = [
    { label: "Fuerza", kinds: ["strength"] },
    { label: "Cardio", kinds: ["running", "cycling_outdoor", "stationary_bike", "treadmill", "stair_machine", "walking", "other"] },
    { label: "Movilidad", kinds: ["mobility"] },
  ].map((group) => ({
    ...group,
    planned: weekly.filter((session) => group.kinds.includes(session.kind) && session.status !== "cancelled").length,
    completed: weekly.filter((session) => group.kinds.includes(session.kind) && session.status === "completed").length,
  }));

  return (
    <main>
      <SectionHeading eyebrow={longSpanishDate(today)} title="Hoy" action={<PlanSync />} />
      {activeSession ? (
        <Link className="card mb-5 flex items-center justify-between border-[color:var(--success)] p-5" href={`/entrenar/fuerza/${activeSession.id}`}>
          <div><p className="eyebrow text-[var(--success)]">En curso</p><h2 className="mt-2 text-xl font-semibold">{activeSession.name}</h2><p className="mt-1 text-sm text-[var(--muted)]">Continúa donde lo dejaste</p></div>
          <span aria-hidden="true" className="text-2xl">→</span>
        </Link>
      ) : null}

      <div className="space-y-4">
        {sessions.length === 0 ? (
          <div className="card p-7"><p className="eyebrow">Sin sesiones</p><h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">El día está libre.</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Planifica una sesión de fuerza cuando quieras entrenar.</p><Link className="secondary-button mt-6" href="/entrenar">Ver entrenamientos</Link></div>
        ) : sessions.map((session, index) => {
          const duration = session.target_duration_minutes ?? session.workout_templates?.estimated_duration_minutes;
          return (
            <article className="card p-6" key={session.id}>
              <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">{kindLabels[session.kind] ?? session.kind}</p><h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em]">{session.title}</h2>{duration ? <p className="mt-2 text-sm text-[var(--muted)]">~{duration} min</p> : null}</div><span className={`text-xs font-semibold ${session.status === "completed" ? "text-[var(--success)]" : "text-[var(--muted)]"}`}>{session.status === "completed" ? "COMPLETADO" : "PLANIFICADO"}</span></div>
              {session.kind === "strength" && session.status === "planned" && session.workout_template_id && index === 0 && !activeSession ? (
                <form action={startStrengthSession} className="mt-6"><input name="template_id" type="hidden" value={session.workout_template_id} /><input name="planned_id" type="hidden" value={session.id} /><button className="primary-button w-full" type="submit">Empezar entrenamiento</button></form>
              ) : null}
              {session.import_status === "needs_review" ? <div className="mt-5 rounded-2xl bg-[color:var(--warning)]/10 p-4 text-sm text-[var(--warning)]"><p>{session.review_message ?? "Este entrenamiento necesita revisión."}</p><Link className="mt-2 inline-flex min-h-10 items-center font-semibold" href="/entrenar/ejercicios">Revisar ejercicios →</Link></div> : null}
              {session.import_status === "update_available" ? <p className="mt-5 rounded-2xl bg-[color:var(--warning)]/10 p-4 text-sm text-[var(--warning)]">Hay una actualización disponible para este entrenamiento. No se aplicará mientras esté activo.</p> : null}
              {session.kind !== "strength" && session.kind !== "mobility" && session.kind !== "rest" && session.status === "planned" ? (
                <Link className="primary-button mt-6 w-full" href={`/entrenar/cardio?planned=${session.id}`}>Registrar sesión</Link>
              ) : null}
            </article>
          );
        })}
      </div>

      <section className="mt-10"><p className="eyebrow mb-4">Esta semana</p><div className="grid grid-cols-3 gap-3">{groups.map((group) => <div className="card p-4" key={group.label}><p className="text-xs text-[var(--muted)]">{group.label}</p><p className="mt-2 text-xl font-semibold">{group.completed} <span className="text-sm text-[var(--muted)]">/ {group.planned}</span></p></div>)}</div></section>
    </main>
  );
}
