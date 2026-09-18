import Link from "next/link";
import { TrendChart } from "@/components/trend-chart";
import { formatPace } from "@/lib/cardio";
import { dateInTimeZone } from "@/lib/date";
import { progressRanges, rangeStart, round, trendPercent, weeklyTotals, type ProgressRange } from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";

type StrengthSession = { started_at: string; strength_exercise_logs: Array<{ strength_sets: Array<{ weight_kg: number | null; reps: number | null; completed: boolean }> }> };
type CardioSession = { kind: string; performed_at: string; duration_seconds: number; distance_km: number | null; average_pace_seconds: number | null; rpe: number | null; average_heart_rate: number | null };
type Health = { measured_on: string; weight_kg: number | null; resting_heart_rate: number | null; vo2_max: number | null };
type Measurement = { measured_on: string; waist_cm: number | null };
type Planned = { kind: string; status: string };

function chartLabel(date: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
}

function Change({ values }: { values: number[] }) {
  const change = trendPercent(values);
  return <p className="mt-2 text-xs text-[var(--muted)]">{change === null ? "Aún sin tendencia suficiente" : `Cambio en el periodo: ${change > 0 ? "+" : ""}${round(change)}%`}</p>;
}

export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: rawRange } = await searchParams;
  const range: ProgressRange = progressRanges.some((item) => item.value === rawRange) ? rawRange as ProgressRange : "4w";
  const today = dateInTimeZone(new Date());
  const start = rangeStart(today, range);
  const supabase = await createClient();

  let strengthQuery = supabase.from("strength_sessions").select("started_at,strength_exercise_logs(strength_sets(weight_kg,reps,completed))").eq("status", "completed").order("started_at");
  let cardioQuery = supabase.from("cardio_sessions").select("kind,performed_at,duration_seconds,distance_km,average_pace_seconds,rpe,average_heart_rate").order("performed_at");
  let healthQuery = supabase.from("health_metrics").select("measured_on,weight_kg,resting_heart_rate,vo2_max").order("measured_on");
  let measurementQuery = supabase.from("body_measurements").select("measured_on,waist_cm").order("measured_on");
  let plannedQuery = supabase.from("planned_sessions").select("kind,status").lte("scheduled_date", today);
  if (start) {
    strengthQuery = strengthQuery.gte("started_at", `${start}T00:00:00Z`);
    cardioQuery = cardioQuery.gte("performed_at", `${start}T00:00:00Z`);
    healthQuery = healthQuery.gte("measured_on", start);
    measurementQuery = measurementQuery.gte("measured_on", start);
    plannedQuery = plannedQuery.gte("scheduled_date", start);
  }
  const [strengthResult, cardioResult, healthResult, measurementResult, plannedResult] = await Promise.all([
    strengthQuery, cardioQuery, healthQuery, measurementQuery, plannedQuery,
  ]);
  const strength = (strengthResult.data ?? []) as unknown as StrengthSession[];
  const cardio = (cardioResult.data ?? []) as CardioSession[];
  const health = (healthResult.data ?? []) as Health[];
  const measurements = (measurementResult.data ?? []) as Measurement[];
  const planned = (plannedResult.data ?? []) as Planned[];

  const strengthVolumes = strength.map((session) => ({
    date: session.started_at,
    value: session.strength_exercise_logs.flatMap((log) => log.strength_sets)
      .filter((set) => set.completed)
      .reduce((sum, set) => sum + (set.weight_kg ?? 0) * (set.reps ?? 0), 0),
  }));
  const weeklyVolume = weeklyTotals(strengthVolumes);
  const running = cardio.filter((session) => session.kind === "running");
  const runningKm = running.reduce((sum, session) => sum + (session.distance_km ?? 0), 0);
  const runningSeconds = running.reduce((sum, session) => sum + session.duration_seconds, 0);
  const weightedPace = runningKm > 0 ? Math.round(runningSeconds / runningKm) : null;
  const weeklyRunning = weeklyTotals(running.map((session) => ({ date: session.performed_at, value: session.distance_km ?? 0 })));
  const weightEntries = health.flatMap((entry) => entry.weight_kg === null ? [] : [{ date: entry.measured_on, value: entry.weight_kg }]);
  const waistEntries = measurements.flatMap((entry) => entry.waist_cm === null ? [] : [{ date: entry.measured_on, value: entry.waist_cm }]);

  const adherenceGroups = [
    { label: "Fuerza", kinds: ["strength"] },
    { label: "Cardio", kinds: ["running", "cycling_outdoor", "stationary_bike", "treadmill", "stair_machine", "walking", "other"] },
    { label: "Movilidad", kinds: ["mobility"] },
  ].map((group) => {
    const relevant = planned.filter((session) => group.kinds.includes(session.kind) && session.status !== "cancelled");
    return { ...group, planned: relevant.length, completed: relevant.filter((session) => session.status === "completed").length };
  });

  return (
    <main>
      <div className="mb-6"><p className="eyebrow mb-2">Tendencias</p><h1 className="text-4xl font-semibold tracking-[-0.045em]">Progreso</h1></div>
      <nav aria-label="Periodo" className="mb-8 flex gap-2 overflow-x-auto pb-1">{progressRanges.map((item) => <Link className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold ${range === item.value ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]" : "border-[var(--line)]"}`} href={`/progreso?range=${item.value}`} key={item.value}>{item.label}</Link>)}</nav>

      <section><div className="mb-4 flex items-end justify-between"><p className="eyebrow">Fuerza</p><Link className="text-sm font-medium" href="/progreso/fuerza">Por ejercicio →</Link></div><div className="grid gap-4 lg:grid-cols-[1fr_2fr]"><div className="grid grid-cols-2 gap-3 lg:grid-cols-1"><div className="card p-5"><p className="text-xs text-[var(--muted)]">Sesiones</p><p className="mt-2 text-3xl font-semibold">{strength.length}</p></div><div className="card p-5"><p className="text-xs text-[var(--muted)]">Volumen total</p><p className="mt-2 text-3xl font-semibold">{Math.round(strengthVolumes.reduce((sum, entry) => sum + entry.value, 0)).toLocaleString("es-ES")}</p><p className="text-xs text-[var(--muted)]">kg</p></div></div><div className="card p-6"><p className="text-sm font-semibold">Volumen semanal</p><TrendChart label="Volumen semanal de fuerza" points={weeklyVolume.map((entry) => ({ label: chartLabel(entry.date), value: round(entry.value) }))} unit="kg" /></div></div></section>

      <section className="mt-10"><p className="eyebrow mb-4">Cardio</p><div className="grid grid-cols-3 gap-3"><div className="card p-4"><p className="text-xs text-[var(--muted)]">Sesiones</p><p className="mt-2 text-2xl font-semibold">{cardio.length}</p></div><div className="card p-4"><p className="text-xs text-[var(--muted)]">Running</p><p className="mt-2 text-2xl font-semibold">{round(runningKm)}</p><p className="text-xs text-[var(--muted)]">km</p></div><div className="card p-4"><p className="text-xs text-[var(--muted)]">Ritmo medio</p><p className="mt-2 text-lg font-semibold">{formatPace(weightedPace).replace(" /km", "")}</p><p className="text-xs text-[var(--muted)]">/km</p></div></div><div className="card mt-4 p-6"><p className="text-sm font-semibold">Kilómetros por semana</p><TrendChart label="Kilómetros de running por semana" points={weeklyRunning.map((entry) => ({ label: chartLabel(entry.date), value: round(entry.value) }))} unit="km" /><p className="mt-2 text-xs text-[var(--muted)]">Una sesión aislada no se interpreta automáticamente como mejora.</p></div></section>

      <section className="mt-10"><p className="eyebrow mb-4">Composición y salud</p><div className="grid gap-4 lg:grid-cols-2"><div className="card p-6"><p className="text-sm font-semibold">Peso</p><p className="mt-2 text-3xl font-semibold">{weightEntries.at(-1)?.value ?? "—"} <span className="text-sm text-[var(--muted)]">kg</span></p><Change values={weightEntries.map((entry) => entry.value)} /><TrendChart label="Tendencia de peso" points={weightEntries.map((entry) => ({ label: chartLabel(entry.date), value: entry.value }))} unit="kg" /></div><div className="card p-6"><p className="text-sm font-semibold">Cintura</p><p className="mt-2 text-3xl font-semibold">{waistEntries.at(-1)?.value ?? "—"} <span className="text-sm text-[var(--muted)]">cm</span></p><Change values={waistEntries.map((entry) => entry.value)} /><TrendChart label="Tendencia de cintura" points={waistEntries.map((entry) => ({ label: chartLabel(entry.date), value: entry.value }))} unit="cm" /></div></div><div className="mt-3 grid grid-cols-2 gap-3"><div className="card p-4"><p className="text-xs text-[var(--muted)]">FC reposo</p><p className="mt-2 text-xl font-semibold">{health.findLast((entry) => entry.resting_heart_rate !== null)?.resting_heart_rate ?? "—"}</p></div><div className="card p-4"><p className="text-xs text-[var(--muted)]">VO₂max estimado</p><p className="mt-2 text-xl font-semibold">{health.findLast((entry) => entry.vo2_max !== null)?.vo2_max ?? "—"}</p></div></div></section>

      <section className="mt-10"><p className="eyebrow mb-4">Adherencia</p><div className="grid grid-cols-3 gap-3">{adherenceGroups.map((group) => <div className="card p-4" key={group.label}><p className="text-xs text-[var(--muted)]">{group.label}</p><p className="mt-2 text-2xl font-semibold">{group.completed} <span className="text-sm text-[var(--muted)]">/ {group.planned}</span></p></div>)}</div><p className="mx-1 mt-3 text-xs text-[var(--muted)]">Solo se contabilizan como realizadas las sesiones con estado completado.</p></section>
    </main>
  );
}
