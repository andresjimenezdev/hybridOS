import Link from "next/link";
import { addTemplateExercise, createTemplate, planTemplateToday, removeTemplateExercise, startStrengthSession } from "./actions";
import { SectionHeading } from "@/components/section-heading";
import { createClient } from "@/lib/supabase/server";

type Exercise = { id: string; name: string };
type TemplateExercise = { id: string; position: number; target_sets: number; target_reps_min: number; target_reps_max: number; target_rir: number | null; exercises: { name: string } | null };
type Template = { id: string; name: string; estimated_duration_minutes: number | null; workout_template_exercises: TemplateExercise[] };

export default async function TrainPage() {
  const supabase = await createClient();
  const [{ data: templatesData }, { data: exercisesData }, { data: active }] = await Promise.all([
    supabase.from("workout_templates").select("id,name,estimated_duration_minutes,workout_template_exercises(id,position,target_sets,target_reps_min,target_reps_max,target_rir,exercises(name))").eq("is_active", true).order("created_at"),
    supabase.from("exercises").select("id,name").eq("is_active", true).order("name"),
    supabase.from("strength_sessions").select("id,name").eq("status", "in_progress").maybeSingle(),
  ]);
  const templates = (templatesData ?? []) as unknown as Template[];
  const exercises = (exercisesData ?? []) as Exercise[];

  return (
    <main>
      <SectionHeading eyebrow="Biblioteca" title="Entrenar" action={<Link className="text-sm font-medium" href="/planificacion">Planificar</Link>} />
      {active ? <Link className="card mb-6 flex items-center justify-between p-5" href={`/entrenar/fuerza/${active.id}`}><div><p className="eyebrow text-[var(--success)]">Sesión activa</p><p className="mt-2 font-semibold">{active.name}</p></div><span>Continuar →</span></Link> : null}

      <section className="space-y-4">
        {templates.map((template) => {
          const items = [...template.workout_template_exercises].sort((a, b) => a.position - b.position);
          return <article className="card p-5" key={template.id}>
            <div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold">{template.name}</h2><p className="mt-1 text-sm text-[var(--muted)]">{items.length} ejercicios · ~{template.estimated_duration_minutes ?? 60} min</p></div></div>
            {items.length ? <ol className="mt-5 space-y-2 border-t border-[var(--line)] pt-4">{items.map((item) => <li className="flex items-center justify-between gap-3 text-sm" key={item.id}><span>{item.position}. {item.exercises?.name}</span><div className="flex items-center gap-3"><span className="shrink-0 text-[var(--muted)]">{item.target_sets} × {item.target_reps_min}–{item.target_reps_max}</span><form action={removeTemplateExercise}><input name="id" type="hidden" value={item.id} /><button aria-label={`Quitar ${item.exercises?.name}`} className="min-h-8 min-w-8 text-[var(--muted)]" type="submit">×</button></form></div></li>)}</ol> : <p className="mt-4 text-sm text-[var(--warning)]">Añade ejercicios antes de iniciar.</p>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <form action={planTemplateToday}><input name="template_id" type="hidden" value={template.id} /><input name="template_name" type="hidden" value={template.name} /><button className="secondary-button w-full" type="submit">Planificar hoy</button></form>
              <form action={startStrengthSession}><input name="template_id" type="hidden" value={template.id} /><button className="primary-button w-full" disabled={!items.length || Boolean(active)} type="submit">Empezar</button></form>
            </div>
            <details className="mt-4 border-t border-[var(--line)] pt-4"><summary className="min-h-11 text-sm font-medium">Añadir ejercicio</summary><form action={addTemplateExercise} className="grid gap-3 pt-3 sm:grid-cols-2"><input name="template_id" type="hidden" value={template.id} /><select className="field sm:col-span-2" name="exercise_id" required><option value="">Selecciona ejercicio</option>{exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select><input className="field" name="sets" min="1" max="20" placeholder="Series" type="number" defaultValue="3" /><div className="grid grid-cols-2 gap-2"><input className="field" name="reps_min" min="1" placeholder="Reps mín." type="number" defaultValue="6" /><input className="field" name="reps_max" min="1" placeholder="Reps máx." type="number" defaultValue="8" /></div><input className="field" name="rir" min="0" max="10" step="0.5" placeholder="RIR" type="number" defaultValue="3" /><input className="field" name="rest" min="0" max="1800" placeholder="Descanso (s)" type="number" defaultValue="120" /><button className="primary-button sm:col-span-2" type="submit">Añadir</button></form></details>
          </article>;
        })}
      </section>

      <details className="card mt-6 p-5"><summary className="min-h-11 font-semibold">Nueva plantilla</summary><form action={createTemplate} className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem]"><input className="field" name="name" placeholder="Nombre" required /><input className="field" name="duration" min="1" max="360" type="number" defaultValue="60" /><button className="primary-button sm:col-span-2" type="submit">Crear plantilla</button></form></details>
      <section className="mt-10"><p className="eyebrow mb-4">Otros entrenamientos</p><div className="grid grid-cols-2 gap-3"><Link className="card p-5" href="/entrenar/cardio"><p className="font-semibold">Cardio</p><p className="mt-1 text-xs text-[var(--muted)]">Running y otros</p></Link><div className="card p-5 opacity-60"><p className="font-semibold">Movilidad</p><p className="mt-1 text-xs text-[var(--muted)]">Próximamente</p></div></div></section>
      <Link className="mt-5 inline-flex min-h-11 items-center text-sm font-medium" href="/entrenar/ejercicios">Gestionar ejercicios →</Link>
    </main>
  );
}
