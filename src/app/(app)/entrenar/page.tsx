import Link from "next/link";
import { addTemplateExercise, createTemplate, planTemplateToday, removeTemplateExercise, startStrengthSession } from "./actions";
import { SectionHeading } from "@/components/section-heading";
import { cardioKindLabels, formatPace } from "@/lib/cardio";
import { addDays, dateInTimeZone, isoWeekStart, longSpanishDate } from "@/lib/date";
import { normalizeExternalKey } from "@/lib/google/contracts";
import { createClient } from "@/lib/supabase/server";

type Exercise = { id: string; name: string };
type TemplateExercise = { id: string; position: number; target_sets: number; target_reps_min: number; target_reps_max: number; target_rir: number | null; exercises: { name: string } | null };
type Template = { id: string; name: string; estimated_duration_minutes: number | null; workout_template_exercises: TemplateExercise[] };
type CompletedSession = { id: string; name: string; planned_session_id: string | null; workout_template_id: string | null; completed_at: string | null };
type PlannedExercise = { id: string; position: number; target_sets: number; target_reps_min: number | null; target_reps_max: number | null; exercises: { name: string } | null };
type PlannedSession = {
  id: string; title: string; kind: string; scheduled_date: string; status: string; workout_template_id: string | null;
  target_duration_minutes: number | null; target_distance_km: number | null; target_pace_min_seconds: number | null;
  target_pace_max_seconds: number | null; target_rpe_min: number | null; target_rpe_max: number | null; target_talk_test: string | null; notes: string | null;
  planned_session_exercises: PlannedExercise[]; workout_templates: { workout_template_exercises: PlannedExercise[] } | null;
};

const kindLabels: Record<string, string> = { strength: "Fuerza", mobility: "Movilidad", ...cardioKindLabels };
const statusLabels: Record<string, string> = { planned: "Planificado", in_progress: "En curso", completed: "Terminado", skipped: "Omitido" };

function targetSummary(session: PlannedSession) {
  const values: string[] = [];
  if (session.target_duration_minutes) values.push(`${session.target_duration_minutes} min`);
  if (session.target_distance_km) values.push(`${session.target_distance_km} km`);
  if (session.target_pace_min_seconds) values.push(`${formatPace(session.target_pace_min_seconds)}–${formatPace(session.target_pace_max_seconds)}`);
  return values.join(" · ") || (session.kind === "strength" ? "Sesión de fuerza" : "Objetivo libre");
}

export default async function TrainPage() {
  const supabase = await createClient();
  const today = dateInTimeZone(new Date());
  const weekStart = isoWeekStart(today);
  const weekEnd = addDays(weekStart, 7);
  const [{ data: templatesData }, { data: exercisesData }, { data: active }, { data: completedData }, { data: plannedData }] = await Promise.all([
    supabase.from("workout_templates").select("id,name,estimated_duration_minutes,workout_template_exercises(id,position,target_sets,target_reps_min,target_reps_max,target_rir,exercises(name))").eq("is_active", true).order("created_at"),
    supabase.from("exercises").select("id,name").eq("is_active", true).order("name"),
    supabase.from("strength_sessions").select("id,name,planned_session_id").eq("status", "in_progress").maybeSingle(),
    supabase.from("strength_sessions").select("id,name,planned_session_id,workout_template_id,completed_at").eq("status", "completed").order("completed_at", { ascending: false }).limit(30),
    supabase.from("planned_sessions").select("id,title,kind,scheduled_date,status,workout_template_id,target_duration_minutes,target_distance_km,target_pace_min_seconds,target_pace_max_seconds,target_rpe_min,target_rpe_max,target_talk_test,notes,planned_session_exercises(id,position,target_sets,target_reps_min,target_reps_max,exercises(name)),workout_templates(workout_template_exercises(id,position,target_sets,target_reps_min,target_reps_max,exercises(name)))")
      .gte("scheduled_date", weekStart).lt("scheduled_date", weekEnd).neq("kind", "rest").neq("status", "cancelled").order("scheduled_date").order("created_at"),
  ]);
  const templates = (templatesData ?? []) as unknown as Template[];
  const exercises = (exercisesData ?? []) as Exercise[];
  const plannedSessions = (plannedData ?? []) as unknown as PlannedSession[];
  const completedThisWeek = new Map<string, CompletedSession>();
  const completedByPlan = new Map<string, CompletedSession>();
  for (const session of (completedData ?? []) as CompletedSession[]) {
    if (!session.completed_at) continue;
    const completedDate = dateInTimeZone(new Date(session.completed_at));
    if (completedDate < weekStart || completedDate >= weekEnd) continue;
    if (session.workout_template_id && !completedThisWeek.has(session.workout_template_id)) completedThisWeek.set(session.workout_template_id, session);
    const nameKey = normalizeExternalKey(session.name);
    if (!completedThisWeek.has(nameKey)) completedThisWeek.set(nameKey, session);
    if (session.planned_session_id) completedByPlan.set(session.planned_session_id, session);
  }

  return <main>
    <SectionHeading eyebrow="Tu semana" title="Entrenar" action={<Link className="text-sm font-medium" href="/planificacion">Planificar</Link>} />
    {active && !active.planned_session_id ? <Link className="card mb-6 flex items-center justify-between p-5" href={`/entrenar/fuerza/${active.id}`}><div><p className="eyebrow text-[var(--success)]">Sesión activa</p><p className="mt-2 font-semibold">{active.name}</p></div><span>Continuar →</span></Link> : null}

    <section>
      <div className="mb-4 flex items-end justify-between"><div><p className="eyebrow">Esta semana</p><p className="mt-1 text-sm text-[var(--muted)]">{plannedSessions.length} sesiones</p></div><Link className="text-sm text-[var(--muted)]" href={`/planificacion?week=${weekStart}`}>Editar</Link></div>
      {plannedSessions.length ? <div className="space-y-3">{plannedSessions.map((session) => {
        const strengthResult = completedByPlan.get(session.id) ?? (session.status === "completed" ? completedThisWeek.get(session.workout_template_id ?? "") ?? completedThisWeek.get(normalizeExternalKey(session.title)) : undefined);
        const activeResult = active?.planned_session_id === session.id ? active : null;
        const status = activeResult ? "in_progress" : session.status;
        const snapshot = session.planned_session_exercises.length ? session.planned_session_exercises : session.workout_templates?.workout_template_exercises ?? [];
        return <details className={`card group overflow-hidden ${status === "completed" ? "border border-[color:var(--success)]/20" : session.scheduled_date === today ? "border border-[var(--accent)]" : ""}`} key={session.id} open={status === "in_progress"}>
          <summary className="flex min-h-24 cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden"><div className="min-w-0"><div className="flex items-center gap-2"><p className="eyebrow">{longSpanishDate(session.scheduled_date)}</p>{session.scheduled_date === today ? <span className="text-[0.6rem] font-bold uppercase text-[var(--accent)]">Hoy</span> : null}</div><h2 className="mt-2 truncate text-lg font-semibold">{session.title}</h2><p className="mt-1 text-xs text-[var(--muted)]">{kindLabels[session.kind] ?? session.kind} · {targetSummary(session)}</p></div><div className="flex shrink-0 items-center gap-3"><span className={`text-[0.65rem] font-bold uppercase ${status === "completed" ? "text-[var(--success)]" : status === "in_progress" ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>{statusLabels[status] ?? status}</span><span aria-hidden="true" className="text-lg text-[var(--muted)] transition-transform group-open:rotate-180">⌄</span></div></summary>
          <div className="border-t border-[var(--line)] px-5 pb-5 pt-4">
            {session.kind === "strength" ? snapshot.length ? <ol className="space-y-2">{snapshot.toSorted((a, b) => a.position - b.position).map((item) => <li className="flex items-center justify-between gap-3 text-sm" key={item.id}><span>{item.position}. {item.exercises?.name ?? "Ejercicio"}</span><span className="shrink-0 text-xs text-[var(--muted)]">{item.target_sets} × {item.target_reps_min ?? "—"}{item.target_reps_max && item.target_reps_max !== item.target_reps_min ? `–${item.target_reps_max}` : ""}</span></li>)}</ol> : <p className="text-sm text-[var(--muted)]">Sin ejercicios asociados.</p> : <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="eyebrow">Objetivo</p><p className="mt-1 font-medium">{targetSummary(session)}</p></div>{session.target_rpe_min !== null ? <div><p className="eyebrow">RPE</p><p className="mt-1 font-medium">{session.target_rpe_min}{session.target_rpe_max !== session.target_rpe_min ? `–${session.target_rpe_max}` : ""}</p></div> : null}{session.target_talk_test ? <div className="col-span-2"><p className="eyebrow">Talk test</p><p className="mt-1 font-medium">{session.target_talk_test}</p></div> : null}</div>}
            {session.notes ? <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{session.notes}</p> : null}
            {activeResult ? <Link className="primary-button mt-5 w-full" href={`/entrenar/fuerza/${activeResult.id}`}>Continuar entrenamiento</Link> : strengthResult ? <Link className="secondary-button mt-5 w-full border-[color:var(--success)] text-[var(--success)]" href={`/entrenar/fuerza/${strengthResult.id}/resumen`}>Ver resumen</Link> : status === "planned" && session.kind === "strength" && session.workout_template_id ? <form action={startStrengthSession} className="mt-5"><input name="template_id" type="hidden" value={session.workout_template_id} /><input name="planned_id" type="hidden" value={session.id} /><button className="primary-button w-full" disabled={Boolean(active)} type="submit">Empezar entrenamiento</button></form> : status === "planned" && session.kind !== "mobility" ? <Link className="primary-button mt-5 w-full" href={`/entrenar/cardio?planned=${session.id}`}>Registrar sesión</Link> : null}
          </div>
        </details>;
      })}</div> : <div className="card p-6"><p className="font-medium">No hay entrenamientos planificados.</p><Link className="mt-3 inline-flex text-sm text-[var(--accent)]" href="/planificacion">Añadir sesión →</Link></div>}
    </section>

    <details className="mt-8">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden"><div><p className="eyebrow">Biblioteca</p><p className="mt-1 text-lg font-semibold">Plantillas de fuerza</p></div><span className="text-sm text-[var(--muted)]">{templates.length} · desplegar</span></summary>
      <section className="mt-4 space-y-4">{templates.map((template) => {
        const items = [...template.workout_template_exercises].sort((a, b) => a.position - b.position);
        const completed = completedThisWeek.get(template.id) ?? completedThisWeek.get(normalizeExternalKey(template.name));
        return <article className="card p-5" key={template.id}>
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{template.name}</h2><p className="mt-1 text-sm text-[var(--muted)]">{items.length} ejercicios · ~{template.estimated_duration_minutes ?? 60} min</p></div>{completed ? <span className="rounded-full bg-[color:var(--success)]/10 px-3 py-1.5 text-[0.65rem] font-bold text-[var(--success)]">TERMINADO</span> : null}</div>
          {items.length ? <ol className="mt-5 space-y-2 border-t border-[var(--line)] pt-4">{items.map((item) => <li className="flex items-center justify-between gap-3 text-sm" key={item.id}><span>{item.position}. {item.exercises?.name}</span><div className="flex items-center gap-3"><span className="shrink-0 text-[var(--muted)]">{item.target_sets} × {item.target_reps_min}–{item.target_reps_max}</span><form action={removeTemplateExercise}><input name="id" type="hidden" value={item.id} /><button aria-label={`Quitar ${item.exercises?.name}`} className="min-h-8 min-w-8 text-[var(--muted)]" type="submit">×</button></form></div></li>)}</ol> : <p className="mt-4 text-sm text-[var(--warning)]">Añade ejercicios antes de iniciar.</p>}
          {completed ? <Link className="secondary-button mt-5 w-full border-[color:var(--success)] text-[var(--success)]" href={`/entrenar/fuerza/${completed.id}/resumen`}>Ver resumen del entrenamiento →</Link> : <div className="mt-5 grid grid-cols-2 gap-3"><form action={planTemplateToday}><input name="template_id" type="hidden" value={template.id} /><input name="template_name" type="hidden" value={template.name} /><button className="secondary-button w-full" type="submit">Planificar hoy</button></form><form action={startStrengthSession}><input name="template_id" type="hidden" value={template.id} /><button className="primary-button w-full" disabled={!items.length || Boolean(active)} type="submit">Empezar</button></form></div>}
          <details className="mt-4 border-t border-[var(--line)] pt-4"><summary className="min-h-11 text-sm font-medium">Añadir ejercicio</summary><form action={addTemplateExercise} className="grid gap-3 pt-3 sm:grid-cols-2"><input name="template_id" type="hidden" value={template.id} /><select className="field sm:col-span-2" name="exercise_id" required><option value="">Selecciona ejercicio</option>{exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select><input className="field" name="sets" min="1" max="20" placeholder="Series" type="number" defaultValue="3" /><div className="grid grid-cols-2 gap-2"><input className="field" name="reps_min" min="1" placeholder="Reps mín." type="number" defaultValue="6" /><input className="field" name="reps_max" min="1" placeholder="Reps máx." type="number" defaultValue="8" /></div><input className="field" name="rir" min="0" max="10" step="0.5" placeholder="RIR" type="number" defaultValue="3" /><input className="field" name="rest" min="0" max="1800" placeholder="Descanso (s)" type="number" defaultValue="120" /><button className="primary-button sm:col-span-2" type="submit">Añadir</button></form></details>
        </article>;
      })}</section>
      <details className="card mt-6 p-5"><summary className="min-h-11 font-semibold">Nueva plantilla</summary><form action={createTemplate} className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem]"><input className="field" name="name" placeholder="Nombre" required /><input className="field" name="duration" min="1" max="360" type="number" defaultValue="60" /><button className="primary-button sm:col-span-2" type="submit">Crear plantilla</button></form></details>
      <Link className="mt-5 inline-flex min-h-11 items-center text-sm font-medium" href="/entrenar/ejercicios">Gestionar ejercicios →</Link>
    </details>
    <Link className="secondary-button mt-8 w-full" href="/entrenar/cardio">Registrar cardio no planificado</Link>
  </main>;
}
