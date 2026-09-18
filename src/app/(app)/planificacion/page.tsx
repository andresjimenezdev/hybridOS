import Link from "next/link";
import { cancelPlannedSession, createPlannedSession, updatePlannedSession } from "./actions";
import { cardioKindLabels, cardioKinds } from "@/lib/cardio";
import { addDays, dateInTimeZone, longSpanishDate } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";

type Template = { id: string; name: string };
type Planned = { id: string; title: string; kind: string; scheduled_date: string; status: string; target_duration_minutes: number | null; target_distance_km: number | null };

const kindLabels: Record<string, string> = { strength: "Fuerza", mobility: "Movilidad", rest: "Descanso", ...cardioKindLabels };

export default async function PlanningPage() {
  const supabase = await createClient();
  const today = dateInTimeZone(new Date());
  const [{ data: plannedData }, { data: templateData }] = await Promise.all([
    supabase.from("planned_sessions").select("id,title,kind,scheduled_date,status,target_duration_minutes,target_distance_km")
      .gte("scheduled_date", addDays(today, -7)).lte("scheduled_date", addDays(today, 42)).order("scheduled_date"),
    supabase.from("workout_templates").select("id,name").eq("is_active", true).order("name"),
  ]);
  const sessions = (plannedData ?? []) as Planned[];
  const templates = (templateData ?? []) as Template[];

  return (
    <main>
      <div className="mb-7 flex items-end justify-between"><div><p className="eyebrow mb-2">Semana a semana</p><h1 className="text-4xl font-semibold tracking-[-0.045em]">Planificación</h1></div><Link className="text-sm" href="/hoy">Hoy</Link></div>
      <details className="card p-5" open={sessions.length === 0}><summary className="min-h-11 font-semibold">Añadir sesión</summary><form action={createPlannedSession} className="mt-4 grid gap-3 sm:grid-cols-2"><input className="field sm:col-span-2" name="title" placeholder="Nombre de la sesión" required /><select className="field" name="kind" required><option value="strength">Fuerza</option>{cardioKinds.map((kind) => <option key={kind} value={kind}>{cardioKindLabels[kind]}</option>)}<option value="mobility">Movilidad</option><option value="rest">Descanso</option></select><input className="field" name="scheduled_date" type="date" defaultValue={today} required /><select className="field sm:col-span-2" name="workout_template_id"><option value="">Plantilla de fuerza (si corresponde)</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select><input className="field" name="target_duration_minutes" min="1" placeholder="Duración objetivo (min)" type="number" /><input className="field" name="target_distance_km" min="0" step="0.01" placeholder="Distancia objetivo (km)" type="number" /><div className="grid grid-cols-2 gap-2"><input className="field" name="pace_min_minutes" min="1" placeholder="Ritmo mín." type="number" /><input className="field" name="pace_min_seconds" min="0" max="59" placeholder="seg" type="number" /></div><div className="grid grid-cols-2 gap-2"><input className="field" name="pace_max_minutes" min="1" placeholder="Ritmo máx." type="number" /><input className="field" name="pace_max_seconds" min="0" max="59" placeholder="seg" type="number" /></div><div className="grid grid-cols-2 gap-2"><input className="field" name="target_rpe_min" min="0" max="10" step="0.5" placeholder="RPE mín." type="number" /><input className="field" name="target_rpe_max" min="0" max="10" step="0.5" placeholder="RPE máx." type="number" /></div><input className="field" name="target_talk_test" placeholder="Talk test objetivo" /><textarea className="field min-h-24 sm:col-span-2" name="notes" placeholder="Notas opcionales" /><button className="primary-button sm:col-span-2" type="submit">Añadir al plan</button></form></details>

      <section className="mt-8"><p className="eyebrow mb-4">Sesiones</p><div className="space-y-3">{sessions.map((session) => <article className={`card p-5 ${session.status === "cancelled" ? "opacity-50" : ""}`} key={session.id}><div className="flex justify-between gap-4"><div><p className="eyebrow">{kindLabels[session.kind] ?? session.kind}</p><h2 className="mt-2 text-lg font-semibold">{session.title}</h2><p className="mt-1 text-sm text-[var(--muted)]">{longSpanishDate(session.scheduled_date)}{session.target_duration_minutes ? ` · ${session.target_duration_minutes} min` : ""}{session.target_distance_km ? ` · ${session.target_distance_km} km` : ""}</p></div><span className="text-[0.65rem] font-semibold uppercase text-[var(--muted)]">{session.status}</span></div>{session.status === "planned" ? <details className="mt-4 border-t border-[var(--line)] pt-3"><summary className="min-h-10 text-sm text-[var(--muted)]">Mover o editar</summary><form action={updatePlannedSession} className="mt-3 grid gap-3 sm:grid-cols-[1fr_10rem_auto]"><input name="id" type="hidden" value={session.id} /><input className="field" name="title" defaultValue={session.title} required /><input className="field" name="scheduled_date" type="date" defaultValue={session.scheduled_date} required /><button className="secondary-button" type="submit">Guardar</button></form><form action={cancelPlannedSession} className="mt-3"><input name="id" type="hidden" value={session.id} /><button className="min-h-11 text-sm text-[var(--danger)]" type="submit">Cancelar sesión</button></form></details> : null}</article>)}</div></section>
    </main>
  );
}
