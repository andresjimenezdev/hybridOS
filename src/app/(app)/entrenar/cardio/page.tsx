import Link from "next/link";
import { createCardioSession } from "./actions";
import { cardioKindLabels, cardioKinds, formatDuration, formatPace, runningTypeLabels, runningTypes, type CardioKind, type RunningType } from "@/lib/cardio";
import { dateInTimeZone } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";

type CardioSession = { id: string; kind: CardioKind; workout_type: RunningType | null; performed_at: string; duration_seconds: number; distance_km: number | null; average_pace_seconds: number | null; average_heart_rate: number | null; rpe: number | null };
type Planned = { id: string; kind: CardioKind; title: string; scheduled_date: string; target_duration_minutes: number | null; target_distance_km: number | null; target_pace_min_seconds: number | null; target_pace_max_seconds: number | null; target_rpe_min: number | null; target_rpe_max: number | null; target_talk_test: string | null; notes: string | null };

export default async function CardioPage({ searchParams }: { searchParams: Promise<{ planned?: string; guardado?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const [{ data: historyData }, plannedResult] = await Promise.all([
    supabase.from("cardio_sessions").select("id,kind,workout_type,performed_at,duration_seconds,distance_km,average_pace_seconds,average_heart_rate,rpe").order("performed_at", { ascending: false }).limit(30),
    query.planned ? supabase.from("planned_sessions").select("id,kind,title,scheduled_date,target_duration_minutes,target_distance_km,target_pace_min_seconds,target_pace_max_seconds,target_rpe_min,target_rpe_max,target_talk_test,notes").eq("id", query.planned).eq("status", "planned").maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const history = (historyData ?? []) as CardioSession[];
  const planned = plannedResult.data as Planned | null;
  const today = dateInTimeZone(new Date());
  const defaultKind = planned?.kind && cardioKinds.includes(planned.kind) ? planned.kind : "running";
  return (
    <main>
      <div className="mb-7 flex items-end justify-between"><div><p className="eyebrow mb-2">Entrenar</p><h1 className="text-4xl font-semibold tracking-[-0.045em]">Cardio</h1></div><Link className="text-sm" href="/planificacion">Planificar</Link></div>
      {query.guardado ? <p className="mb-5 rounded-2xl bg-[color:var(--success)]/10 px-4 py-3 text-sm text-[var(--success)]">Sesión guardada.</p> : null}
      {planned ? <section className="card mb-5 p-5"><p className="eyebrow">Planificado</p><h2 className="mt-2 text-xl font-semibold">{planned.title}</h2><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--muted)]">{planned.target_duration_minutes ? <span>{planned.target_duration_minutes} min</span> : null}{planned.target_distance_km ? <span>{planned.target_distance_km} km</span> : null}{planned.target_pace_min_seconds ? <span>{formatPace(planned.target_pace_min_seconds)}–{formatPace(planned.target_pace_max_seconds)}</span> : null}{planned.target_rpe_min !== null ? <span>RPE {planned.target_rpe_min}–{planned.target_rpe_max}</span> : null}{planned.target_talk_test ? <span>{planned.target_talk_test}</span> : null}</div>{planned.notes ? <p className="mt-3 text-sm">{planned.notes}</p> : null}</section> : null}

      <form action={createCardioSession} className="card grid gap-4 p-5 sm:grid-cols-2">
        {planned ? <input name="planned_id" type="hidden" value={planned.id} /> : null}
        <label className="text-sm font-medium">Tipo<select className="field mt-2" name="kind" defaultValue={defaultKind}>{cardioKinds.map((kind) => <option key={kind} value={kind}>{cardioKindLabels[kind]}</option>)}</select></label>
        <label className="text-sm font-medium">Fecha<input className="field mt-2" name="performed_on" type="date" defaultValue={planned?.scheduled_date ?? today} required /></label>
        <label className="text-sm font-medium">Tipo de running<select className="field mt-2" name="workout_type" defaultValue="easy">{runningTypes.map((type) => <option key={type} value={type}>{runningTypeLabels[type]}</option>)}</select></label>
        <div><p className="text-sm font-medium">Duración</p><div className="mt-2 grid grid-cols-2 gap-2"><input aria-label="Duración en minutos" className="field" name="duration_minutes" min="0" placeholder="min" type="number" defaultValue={planned?.target_duration_minutes ?? ""} required /><input aria-label="Segundos adicionales" className="field" name="duration_seconds" min="0" max="59" placeholder="seg" type="number" defaultValue="0" /></div></div>
        <label className="text-sm font-medium">Distancia km<input className="field mt-2" name="distance_km" min="0" step="0.01" type="number" defaultValue={planned?.target_distance_km ?? ""} /></label>
        <label className="text-sm font-medium">RPE 0–10<input className="field mt-2" name="rpe" min="0" max="10" step="0.5" type="number" /></label>
        <label className="text-sm font-medium">FC media<input className="field mt-2" name="average_heart_rate" min="1" type="number" /></label>
        <label className="text-sm font-medium">FC máxima<input className="field mt-2" name="max_heart_rate" min="1" type="number" /></label>
        <label className="text-sm font-medium">Talk test<input className="field mt-2" name="talk_test" placeholder="Conversacional…" /></label>
        <label className="text-sm font-medium">Sensaciones 1–10<input className="field mt-2" name="feeling" min="1" max="10" type="number" /></label>
        <label className="text-sm font-medium sm:col-span-2">Enlace Strava opcional<input className="field mt-2" name="strava_url" type="url" placeholder="https://www.strava.com/activities/…" /></label>
        <label className="text-sm font-medium sm:col-span-2">Notas<textarea className="field mt-2 min-h-24" name="notes" /></label>
        <button className="primary-button sm:col-span-2" type="submit">Guardar sesión</button>
      </form>
      <p className="mx-2 mt-3 text-xs leading-5 text-[var(--muted)]">Registra aquí sesiones deportivas intencionales. La actividad cotidiana no se contabiliza automáticamente como cardio.</p>

      <section className="mt-10"><p className="eyebrow mb-4">Histórico reciente</p>{history.length ? <div className="space-y-3">{history.map((session) => <article className="card flex items-center justify-between gap-4 p-5" key={session.id}><div><p className="font-semibold">{cardioKindLabels[session.kind]}{session.workout_type ? ` · ${runningTypeLabels[session.workout_type]}` : ""}</p><p className="mt-1 text-xs text-[var(--muted)]">{new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(new Date(session.performed_at))} · {formatDuration(session.duration_seconds)}</p></div><div className="text-right"><p className="font-semibold">{session.distance_km ? `${session.distance_km} km` : formatDuration(session.duration_seconds)}</p><p className="mt-1 text-xs text-[var(--muted)]">{session.kind === "running" ? formatPace(session.average_pace_seconds) : session.rpe !== null ? `RPE ${session.rpe}` : ""}</p></div></article>)}</div> : <div className="card p-6 text-sm text-[var(--muted)]">Aún no hay sesiones de cardio.</div>}</section>
    </main>
  );
}
