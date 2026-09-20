import Link from "next/link";
import { startStrengthSession } from "@/app/(app)/entrenar/actions";
import { SectionHeading } from "@/components/section-heading";
import { PlanSync } from "@/components/plan-sync";
import { addDays, dateInTimeZone, isoWeekStart, longSpanishDate } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";

type PlannedSession = {
  id: string; title: string; kind: string; status: "planned" | "completed" | "cancelled";
  target_duration_minutes: number | null; workout_template_id: string | null;
  target_pace_min_seconds: number | null; target_pace_max_seconds: number | null;
  target_rpe_min: number | null; target_rpe_max: number | null; target_talk_test: string | null;
  workout_templates: { estimated_duration_minutes: number | null } | null;
  strength_sessions?: Array<{ id: string; status: string }>;
  planned_session_exercises?: Array<{ id: string }>;
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
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const parsed = new Date(`${date}T12:00:00Z`);
    return {
      date,
      day: new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(parsed).slice(0, 2),
      number: parsed.getUTCDate(),
    };
  });
  const [{ data: todayData }, { data: weekData }, { data: activeSession }] = await Promise.all([
    supabase.from("planned_sessions")
      .select("id,title,kind,status,target_duration_minutes,target_pace_min_seconds,target_pace_max_seconds,target_rpe_min,target_rpe_max,target_talk_test,workout_template_id,import_status,review_message,workout_templates(estimated_duration_minutes),planned_session_exercises(id),strength_sessions(id,status)")
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
      <div aria-label="Semana actual" className="card mb-5 grid grid-cols-7 gap-1 p-2">
        {weekDays.map((item) => <div className={`flex min-h-16 flex-col items-center justify-center rounded-2xl text-center ${item.date === today ? "bg-[var(--accent)] text-white shadow-[0_8px_20px_rgba(255,103,18,0.24)]" : "text-[var(--muted)]"}`} key={item.date}><span className="text-[0.62rem] font-semibold uppercase">{item.day}</span><span className="mt-1 text-sm font-bold">{item.number}</span></div>)}
      </div>
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
          const completedStrengthSession = session.strength_sessions?.find((item) => item.status === "completed");
          return (
            <article className={`${index === 0 ? "hero-card" : "card"} p-6`} key={session.id}>
              <div className="flex items-start justify-between gap-4"><div><p className={`eyebrow ${index === 0 ? "!text-white/70" : ""}`}>{kindLabels[session.kind] ?? session.kind}</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em]">{session.title}</h2>{session.kind === "strength" && session.planned_session_exercises?.length ? <p className={`mt-2 text-sm ${index === 0 ? "text-white/75" : "text-[var(--muted)]"}`}>{session.planned_session_exercises.length} ejercicios{duration ? ` · ~${duration} min` : ""}</p> : duration ? <p className={`mt-2 text-sm ${index === 0 ? "text-white/75" : "text-[var(--muted)]"}`}>{duration} min</p> : null}{session.kind === "running" && session.target_pace_min_seconds && session.target_pace_max_seconds ? <p className={`mt-2 text-sm ${index === 0 ? "text-white/75" : "text-[var(--muted)]"}`}>{Math.floor(session.target_pace_min_seconds / 60)}:{String(session.target_pace_min_seconds % 60).padStart(2, "0")}–{Math.floor(session.target_pace_max_seconds / 60)}:{String(session.target_pace_max_seconds % 60).padStart(2, "0")} /km</p> : null}{session.kind === "running" && session.target_rpe_min !== null ? <p className={`mt-1 text-sm ${index === 0 ? "text-white/75" : "text-[var(--muted)]"}`}>RPE {session.target_rpe_min}–{session.target_rpe_max}{session.target_talk_test ? ` · ${session.target_talk_test}` : ""}</p> : null}</div><span className={`rounded-full px-3 py-1.5 text-[0.62rem] font-bold ${index === 0 ? "bg-white/16 text-white" : session.status === "completed" ? "bg-green-50 text-[var(--success)]" : "bg-black/5 text-[var(--muted)]"}`}>{session.status === "completed" ? "COMPLETADO" : "PLANIFICADO"}</span></div>
              {session.kind === "strength" && session.status === "planned" && session.workout_template_id && index === 0 && !activeSession ? (
                <form action={startStrengthSession} className="mt-6"><input name="template_id" type="hidden" value={session.workout_template_id} /><input name="planned_id" type="hidden" value={session.id} /><button className="min-h-14 w-full rounded-full bg-white px-6 text-sm font-bold text-[#1a1713] shadow-lg" type="submit">Empezar entrenamiento&nbsp; →</button></form>
              ) : null}
              {session.kind === "strength" && session.status === "completed" && completedStrengthSession ? <Link className={`${index === 0 ? "bg-white text-[#1a1713]" : "secondary-button"} mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-sm font-bold`} href={`/entrenar/fuerza/${completedStrengthSession.id}/resumen`}>Ver resumen del entrenamiento →</Link> : null}
              {session.import_status === "needs_review" ? <div className="mt-5 rounded-2xl bg-[color:var(--warning)]/10 p-4 text-sm text-[var(--warning)]"><p>{session.review_message ?? "Este entrenamiento necesita revisión."}</p><Link className="mt-2 inline-flex min-h-10 items-center font-semibold" href="/entrenar/ejercicios">Revisar ejercicios →</Link></div> : null}
              {session.import_status === "update_available" ? <p className="mt-5 rounded-2xl bg-[color:var(--warning)]/10 p-4 text-sm text-[var(--warning)]">Hay una actualización disponible para este entrenamiento. No se aplicará mientras esté activo.</p> : null}
              {session.kind !== "strength" && session.kind !== "mobility" && session.kind !== "rest" && session.status === "planned" ? (
                <Link className="primary-button mt-6 w-full" href={`/entrenar/cardio?planned=${session.id}`}>Registrar sesión</Link>
              ) : null}
            </article>
          );
        })}
      </div>

      <section className="mt-10"><div className="mb-4 flex items-center justify-between px-1"><p className="eyebrow">Esta semana</p><Link className="text-xs font-semibold" href={`/planificacion?week=${addDays(weekStart, 7)}`}>Ver próxima semana →</Link></div><div className="grid grid-cols-3 gap-3">{groups.map((group) => { const percent = group.planned ? Math.min(100, (group.completed / group.planned) * 100) : 0; return <div className="card p-4" key={group.label}><div className="mb-4 grid h-9 w-9 place-items-center rounded-full bg-orange-50 text-[var(--accent)]">●</div><p className="text-[0.7rem] text-[var(--muted)]">{group.label}</p><p className="mt-1 text-xl font-bold">{group.completed} <span className="text-sm font-medium text-[var(--muted)]">/ {group.planned}</span></p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${percent}%` }} /></div></div>; })}</div></section>
    </main>
  );
}
