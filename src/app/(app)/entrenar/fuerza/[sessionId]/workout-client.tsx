"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelStrengthSession, finishStrengthSession } from "@/app/(app)/entrenar/actions";

export type WorkoutSet = { id: string; set_number: number; weight_kg: number | null; reps: number | null; duration_seconds: number | null; rir: number | null; completed: boolean };
export type PreviousPerformance = { date: string; weight: number | null; reps: number[] } | null;
export type WorkoutExercise = {
  id: string; exercise_id: string; name: string; position: number; target_sets: number | null;
  target_reps_min: number | null; target_reps_max: number | null; target_rir: number | null;
  target_duration_min_seconds: number | null; target_duration_max_seconds: number | null;
  target_rir_min: number | null; target_rir_max: number | null;
  rest_seconds: number | null; feeling: number | null; has_pain: boolean; notes: string | null;
  completed: boolean; sets: WorkoutSet[]; previous: PreviousPerformance;
};

type SavePayload = Record<string, string | number | boolean | null>;

const repOptions = Array.from({ length: 51 }, (_, value) => value);
const rirOptions = Array.from({ length: 21 }, (_, index) => index / 2);

function exerciseIsDone(exercise: WorkoutExercise) {
  return exercise.completed || (exercise.sets.length > 0 && exercise.sets.every((set) => set.completed));
}

export function WorkoutClient({ sessionId, sessionName, initialExercises }: { sessionId: string; sessionName: string; initialExercises: WorkoutExercise[] }) {
  const router = useRouter();
  const storageKey = `hybridos:strength:${sessionId}`;
  const [exercises, setExercises] = useState(initialExercises);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, initialExercises.findIndex((item) => !item.completed)));
  const [saveState, setSaveState] = useState<"saved" | "saving" | "offline">("saved");
  const [finishError, setFinishError] = useState<string | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [restRemaining, setRestRemaining] = useState(0);
  const restIsActive = restRemaining > 0;
  const [finishing, startTransition] = useTransition();
  const [cancelling, startCancelling] = useTransition();
  const queue = useRef(new Map<string, SavePayload>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (!navigator.onLine) { setSaveState("offline"); return false; }
    const pending = [...queue.current.entries()];
    if (!pending.length) { setSaveState("saved"); return true; }
    setSaveState("saving");
    let allSaved = true;
    await Promise.all(pending.map(async ([key, payload]) => {
      try {
        const response = await fetch("/api/strength/autosave", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error("save failed");
        queue.current.delete(key);
      } catch { allSaved = false; }
    }));
    setSaveState(allSaved ? "saved" : "offline");
    if (allSaved) localStorage.removeItem(storageKey);
    return allSaved;
  }, [storageKey]);

  const scheduleSave = useCallback((key: string, payload: SavePayload) => {
    queue.current.set(key, payload);
    setSaveState(navigator.onLine ? "saving" : "offline");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 650);
  }, [flush]);

  useEffect(() => {
    const draft = localStorage.getItem(storageKey);
    if (draft) {
      try {
        const parsed = JSON.parse(draft) as WorkoutExercise[];
        parsed.forEach((exercise) => {
          queue.current.set(`exercise:${exercise.id}`, { entity: "exercise", id: exercise.id, feeling: exercise.feeling, has_pain: exercise.has_pain, notes: exercise.notes, completed: exercise.completed });
          exercise.sets.forEach((set) => queue.current.set(`set:${set.id}`, { entity: "set", id: set.id, weight_kg: set.weight_kg, reps: set.reps, duration_seconds: set.duration_seconds, rir: set.rir, completed: set.completed }));
        });
        const frame = requestAnimationFrame(() => {
          setExercises(parsed);
          setActiveIndex(Math.max(0, parsed.findIndex((item) => !item.completed)));
          void flush();
        });
        return () => cancelAnimationFrame(frame);
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
  }, [flush, storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(exercises));
  }, [exercises, storageKey]);

  useEffect(() => {
    const handleOnline = () => { void flush(); };
    window.addEventListener("online", handleOnline);
    return () => { window.removeEventListener("online", handleOnline); if (timer.current) clearTimeout(timer.current); };
  }, [flush]);

  useEffect(() => {
    if (!restIsActive) return;
    const interval = window.setInterval(() => {
      setRestRemaining((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [restIsActive]);

  const current = exercises[activeIndex];
  const completedExerciseCount = useMemo(() => exercises.filter(exerciseIsDone).length, [exercises]);
  const progress = Math.round((completedExerciseCount / Math.max(1, exercises.length)) * 100);
  if (!current) return <p>No hay ejercicios en esta sesión.</p>;

  function updateSet(setId: string, changes: Partial<WorkoutSet>) {
    const existing = current.sets.find((set) => set.id === setId);
    if (!existing) return;
    const updated = { ...existing, ...changes };
    setExercises((items) => items.map((exercise, index) => index !== activeIndex ? exercise : {
      ...exercise,
      sets: exercise.sets.map((set) => set.id === setId ? updated : set),
    }));
    scheduleSave(`set:${setId}`, { entity: "set", id: updated.id, weight_kg: updated.weight_kg, reps: updated.reps, duration_seconds: updated.duration_seconds, rir: updated.rir, completed: updated.completed });
    if (changes.completed === true && !existing.completed && current.rest_seconds) startRest(current.rest_seconds);
  }

  function startRest(seconds = current.rest_seconds ?? 0) {
    if (seconds <= 0) return;
    setRestRemaining(seconds);
  }

  function updateExercise(changes: Partial<WorkoutExercise>) {
    const updated = { ...current, ...changes };
    setExercises((items) => items.map((item, index) => index === activeIndex ? updated : item));
    scheduleSave(`exercise:${current.id}`, { entity: "exercise", id: current.id, feeling: updated.feeling, has_pain: updated.has_pain, notes: updated.notes, completed: updated.completed });
  }

  function goNext() {
    updateExercise({ completed: true });
    if (activeIndex < exercises.length - 1) setActiveIndex(activeIndex + 1);
  }

  async function finish() {
    setFinishError(null);
    updateExercise({ completed: true });
    const saved = await flush();
    if (!saved) {
      setFinishError("No se han podido guardar todos los cambios. Comprueba la conexión y vuelve a intentarlo.");
      return;
    }
    startTransition(async () => {
      try {
        await finishStrengthSession(sessionId);
        localStorage.removeItem(storageKey);
        setShowCompletion(true);
        await new Promise((resolve) => window.setTimeout(resolve, 1600));
        router.replace("/hoy");
        router.refresh();
      } catch {
        setFinishError("No se ha podido terminar el entrenamiento. Tus series siguen guardadas; vuelve a intentarlo.");
      }
    });
  }

  function cancel() {
    setCancelError(null);
    startCancelling(async () => {
      try {
        await cancelStrengthSession(sessionId);
        localStorage.removeItem(storageKey);
        router.replace("/hoy");
        router.refresh();
      } catch {
        setCancelError("No se ha podido cancelar el entrenamiento. La sesión sigue intacta; vuelve a intentarlo.");
        setShowCancelConfirm(false);
      }
    });
  }

  return (
    <main className="mx-auto max-w-2xl">
      {showCompletion ? <div className="completion-overlay" role="status"><div className="completion-mark" aria-hidden="true">✓</div><p className="mt-6 text-2xl font-semibold">Entrenamiento completado</p><p className="mt-2 text-sm text-white/65">Guardando tu progreso…</p></div> : null}
      {showCancelConfirm ? <div aria-labelledby="cancel-workout-title" aria-modal="true" className="fixed inset-0 z-[70] grid place-items-end bg-black/55 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:place-items-center" role="dialog"><div className="w-full max-w-md rounded-[2rem] bg-[var(--surface)] p-6 shadow-2xl"><p className="eyebrow">Sesión en curso</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]" id="cancel-workout-title">¿Cancelar entrenamiento?</h2><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Se descartarán las series de esta sesión. Si formaba parte de tu planificación, volverá a aparecer como pendiente.</p><div className="mt-6 grid gap-2"><button autoFocus className="primary-button" disabled={cancelling} onClick={() => setShowCancelConfirm(false)} type="button">Seguir entrenando</button><button className="secondary-button border-[color:var(--danger)]/30 text-[var(--danger)]" disabled={cancelling} onClick={cancel} type="button">{cancelling ? "Cancelando…" : "Sí, cancelar sesión"}</button></div></div></div> : null}
      <div className="mb-6 flex items-center justify-between"><div><p className="eyebrow">{sessionName}</p><p className="mt-2 text-xs text-[var(--muted)]">Ejercicio {activeIndex + 1} de {exercises.length}</p></div><span className={`text-xs ${saveState === "offline" ? "text-[var(--warning)]" : "text-[var(--muted)]"}`}>{saveState === "saved" ? "Guardado" : saveState === "saving" ? "Guardando…" : "Sin conexión · guardado local"}</span></div>
      <div className="mb-8 h-1 overflow-hidden rounded-full bg-[var(--line)]"><div className="h-full rounded-full bg-[var(--foreground)] transition-all" style={{ width: `${progress}%` }} /></div>
      <section aria-label="Resumen del entrenamiento" className="card mb-5 p-4">
        <div className="mb-3 flex items-center justify-between"><p className="eyebrow">Entrenamiento</p><p className="text-xs font-medium text-[var(--muted)]">{completedExerciseCount}/{exercises.length}</p></div>
        <ol className="space-y-1">
          {exercises.map((exercise, index) => {
            const done = exerciseIsDone(exercise);
            const active = index === activeIndex;
            return <li key={exercise.id}><button aria-current={active ? "step" : undefined} className={`flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors ${active ? "bg-[var(--foreground)] text-[var(--background)]" : done ? "text-[var(--success)]" : "text-[var(--muted)]"}`} onClick={() => setActiveIndex(index)} type="button"><span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[0.65rem] ${done ? "border-[var(--success)] bg-[var(--success)] text-white" : active ? "border-current" : "border-[var(--line)]"}`}>{done ? "✓" : index + 1}</span><span className={done && !active ? "line-through decoration-1 opacity-70" : ""}>{exercise.name}</span></button></li>;
          })}
        </ol>
      </section>
      {restRemaining > 0 ? <aside aria-live="polite" className="card mb-5 flex items-center justify-between p-4"><div><p className="eyebrow">Descanso</p><p className="mt-1 text-2xl font-semibold tabular-nums">{Math.floor(restRemaining / 60)}:{String(restRemaining % 60).padStart(2, "0")}</p></div><div className="flex gap-2"><button className="secondary-button min-h-11 px-4" onClick={() => setRestRemaining((remaining) => remaining + 30)} type="button">+30 s</button><button className="min-h-11 px-3 text-sm text-[var(--muted)]" onClick={() => setRestRemaining(0)} type="button">Omitir</button></div></aside> : current.rest_seconds ? <button className="mb-5 min-h-11 text-sm font-medium text-[var(--muted)]" onClick={() => startRest()} type="button">Iniciar descanso · {current.rest_seconds} s</button> : null}
      <section className="card overflow-hidden">
        <div className="p-6 sm:p-8"><h1 className="text-3xl font-semibold tracking-[-0.045em]">{current.name}</h1><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-black/[0.035] p-4 dark:bg-white/[0.05]"><p className="eyebrow">Hoy · objetivo</p><p className="mt-2 text-lg font-semibold">{current.target_sets} × {current.target_duration_min_seconds !== null ? `${current.target_duration_min_seconds}–${current.target_duration_max_seconds} s` : `${current.target_reps_min}–${current.target_reps_max}`}</p><p className="mt-1 text-sm text-[var(--muted)]">RIR {current.target_rir_min !== null ? `${current.target_rir_min}–${current.target_rir_max}` : current.target_rir ?? "—"}</p></div><div className="rounded-2xl border border-[var(--line)] bg-black/[0.035] p-4 dark:bg-white/[0.05]"><p className="eyebrow">Última vez</p>{current.previous ? <><p className="mt-2 text-lg font-semibold">{current.previous.weight ?? "—"} kg</p><p className="mt-1 text-sm font-medium text-[var(--muted)]">{current.previous.reps.join(" · ") || "Sin reps"}</p></> : <p className="mt-2 text-sm text-[var(--muted)]">Sin registro</p>}</div></div></div>
        <div className="border-t border-[var(--line)] px-3 py-4 sm:p-6">
          <div className="mb-2 grid grid-cols-[1.5rem_minmax(0,1.15fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_2.75rem] gap-1.5 px-0.5 text-center text-[0.6rem] font-semibold uppercase tracking-wider text-[var(--muted)] sm:gap-2 sm:text-[0.65rem]"><span>#</span><span>kg</span><span>{current.target_duration_min_seconds !== null ? "seg" : "reps"}</span><span>RIR</span><span>✓</span></div>
          {current.sets.map((set) => (
            <div className={`grid grid-cols-[1.5rem_minmax(0,1.15fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_2.75rem] items-center gap-1.5 rounded-xl py-1.5 transition-colors duration-300 sm:gap-2 ${set.completed ? "completed-set-row bg-[color:var(--success)]/10" : ""}`} key={set.id}>
              <span className="text-center text-sm text-[var(--muted)]">{set.set_number}</span>
              <input aria-label={`Peso en kilogramos, serie ${set.set_number}`} className="h-12 min-w-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2 text-center text-base font-semibold outline-none focus:border-[var(--accent)]" inputMode="decimal" min="0" onChange={(event) => updateSet(set.id, { weight_kg: event.target.value === "" ? null : Number(event.target.value) })} placeholder="0" step="0.5" type="number" value={set.weight_kg ?? ""} />
              {current.target_duration_min_seconds !== null ? (
                <input aria-label={`Segundos serie ${set.set_number}`} className="h-12 min-w-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-1 text-center text-base font-semibold outline-none focus:border-[var(--accent)]" inputMode="numeric" min="0" onChange={(event) => updateSet(set.id, { duration_seconds: event.target.value === "" ? null : Number(event.target.value) })} placeholder="0" type="number" value={set.duration_seconds ?? ""} />
              ) : (
                <select aria-label={`Repeticiones serie ${set.set_number}`} className="h-12 min-w-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-1 text-center text-base font-semibold outline-none focus:border-[var(--accent)]" onChange={(event) => updateSet(set.id, { reps: event.target.value === "" ? null : Number(event.target.value) })} value={set.reps ?? ""}>
                  <option value="">—</option>
                  {repOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              )}
              <select aria-label={`RIR serie ${set.set_number}`} className="h-12 min-w-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-0.5 text-center text-base font-semibold outline-none focus:border-[var(--accent)]" onChange={(event) => updateSet(set.id, { rir: event.target.value === "" ? null : Number(event.target.value) })} value={set.rir ?? ""}>
                <option value="">—</option>
                {rirOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              <button aria-label={`Completar serie ${set.set_number}`} className={`h-12 rounded-xl border text-lg transition-all duration-300 ${set.completed ? "completed-set-check border-[var(--success)] bg-[var(--success)] text-white" : "border-[var(--line)]"}`} onClick={() => updateSet(set.id, { completed: !set.completed })} type="button">✓</button>
            </div>
          ))}
        </div>
        <div className="space-y-5 border-t border-[var(--line)] p-6"><label className="block text-sm font-medium">Sensaciones <span className="text-[var(--muted)]">1–10</span><input className="field mt-2" inputMode="numeric" max="10" min="1" onChange={(event) => updateExercise({ feeling: event.target.value === "" ? null : Number(event.target.value) })} type="number" value={current.feeling ?? ""} /></label><div><p className="text-sm font-medium">Molestia</p><div className="mt-2 grid grid-cols-2 gap-2"><button className={`secondary-button ${!current.has_pain ? "border-[var(--foreground)]" : ""}`} onClick={() => updateExercise({ has_pain: false })} type="button">No</button><button className={`secondary-button ${current.has_pain ? "border-[var(--danger)] text-[var(--danger)]" : ""}`} onClick={() => updateExercise({ has_pain: true })} type="button">Sí</button></div></div><label className="block text-sm font-medium">Notas<textarea className="field mt-2 min-h-24 resize-y" onChange={(event) => updateExercise({ notes: event.target.value })} value={current.notes ?? ""} /></label></div>
      </section>
      {finishError ? <p className="mt-4 rounded-2xl bg-[color:var(--danger)]/10 p-4 text-sm text-[var(--danger)]" role="alert">{finishError}</p> : null}
      {cancelError ? <p className="mt-4 rounded-2xl bg-[color:var(--danger)]/10 p-4 text-sm text-[var(--danger)]" role="alert">{cancelError}</p> : null}
      <div className="mt-5 flex gap-3">{activeIndex > 0 ? <button className="secondary-button flex-1" onClick={() => setActiveIndex(activeIndex - 1)} type="button">Anterior</button> : null}{activeIndex < exercises.length - 1 ? <button className="primary-button flex-1" onClick={goNext} type="button">Siguiente</button> : <button className="primary-button flex-1" disabled={finishing || saveState === "offline"} onClick={() => void finish()} type="button">{finishing ? "Terminando…" : "Terminar entrenamiento"}</button>}</div>
      <button className="mt-5 min-h-12 w-full rounded-2xl text-sm font-medium text-[var(--danger)] transition-colors hover:bg-[color:var(--danger)]/5" disabled={finishing || cancelling} onClick={() => setShowCancelConfirm(true)} type="button">Cancelar entrenamiento</button>
    </main>
  );
}
