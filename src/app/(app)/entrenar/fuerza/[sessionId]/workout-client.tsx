"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { finishStrengthSession } from "@/app/(app)/entrenar/actions";

export type WorkoutSet = { id: string; set_number: number; weight_kg: number | null; reps: number | null; rir: number | null; completed: boolean };
export type PreviousPerformance = { date: string; weight: number | null; reps: number[] } | null;
export type WorkoutExercise = {
  id: string; exercise_id: string; name: string; position: number; target_sets: number | null;
  target_reps_min: number | null; target_reps_max: number | null; target_rir: number | null;
  target_rir_min: number | null; target_rir_max: number | null;
  rest_seconds: number | null; feeling: number | null; has_pain: boolean; notes: string | null;
  completed: boolean; sets: WorkoutSet[]; previous: PreviousPerformance;
};

type SavePayload = Record<string, string | number | boolean | null>;

export function WorkoutClient({ sessionId, sessionName, initialExercises }: { sessionId: string; sessionName: string; initialExercises: WorkoutExercise[] }) {
  const storageKey = `hybridos:strength:${sessionId}`;
  const [exercises, setExercises] = useState(initialExercises);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, initialExercises.findIndex((item) => !item.completed)));
  const [saveState, setSaveState] = useState<"saved" | "saving" | "offline">("saved");
  const [restRemaining, setRestRemaining] = useState(0);
  const restIsActive = restRemaining > 0;
  const [finishing, startTransition] = useTransition();
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
          exercise.sets.forEach((set) => queue.current.set(`set:${set.id}`, { entity: "set", id: set.id, weight_kg: set.weight_kg, reps: set.reps, rir: set.rir, completed: set.completed }));
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
  const progress = useMemo(() => Math.round((exercises.filter((item) => item.completed).length / Math.max(1, exercises.length)) * 100), [exercises]);
  if (!current) return <p>No hay ejercicios en esta sesión.</p>;

  function updateSet(setId: string, changes: Partial<WorkoutSet>) {
    const existing = current.sets.find((set) => set.id === setId);
    if (!existing) return;
    const updated = { ...existing, ...changes };
    setExercises((items) => items.map((exercise, index) => index !== activeIndex ? exercise : {
      ...exercise,
      sets: exercise.sets.map((set) => set.id === setId ? updated : set),
    }));
    scheduleSave(`set:${setId}`, { entity: "set", id: updated.id, weight_kg: updated.weight_kg, reps: updated.reps, rir: updated.rir, completed: updated.completed });
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
    updateExercise({ completed: true });
    const saved = await flush();
    if (!saved) return;
    startTransition(() => { void finishStrengthSession(sessionId); });
  }

  return (
    <main className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between"><div><p className="eyebrow">{sessionName}</p><p className="mt-2 text-xs text-[var(--muted)]">Ejercicio {activeIndex + 1} de {exercises.length}</p></div><span className={`text-xs ${saveState === "offline" ? "text-[var(--warning)]" : "text-[var(--muted)]"}`}>{saveState === "saved" ? "Guardado" : saveState === "saving" ? "Guardando…" : "Sin conexión · guardado local"}</span></div>
      <div className="mb-8 h-1 overflow-hidden rounded-full bg-[var(--line)]"><div className="h-full rounded-full bg-[var(--foreground)] transition-all" style={{ width: `${progress}%` }} /></div>
      {restRemaining > 0 ? <aside aria-live="polite" className="card mb-5 flex items-center justify-between p-4"><div><p className="eyebrow">Descanso</p><p className="mt-1 text-2xl font-semibold tabular-nums">{Math.floor(restRemaining / 60)}:{String(restRemaining % 60).padStart(2, "0")}</p></div><div className="flex gap-2"><button className="secondary-button min-h-11 px-4" onClick={() => setRestRemaining((remaining) => remaining + 30)} type="button">+30 s</button><button className="min-h-11 px-3 text-sm text-[var(--muted)]" onClick={() => setRestRemaining(0)} type="button">Omitir</button></div></aside> : current.rest_seconds ? <button className="mb-5 min-h-11 text-sm font-medium text-[var(--muted)]" onClick={() => startRest()} type="button">Iniciar descanso · {current.rest_seconds} s</button> : null}
      <section className="card overflow-hidden">
        <div className="p-6 sm:p-8"><h1 className="text-3xl font-semibold tracking-[-0.045em]">{current.name}</h1><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-black/[0.035] p-4 dark:bg-white/[0.05]"><p className="eyebrow">Hoy · objetivo</p><p className="mt-2 text-lg font-semibold">{current.target_sets} × {current.target_reps_min}–{current.target_reps_max}</p><p className="mt-1 text-sm text-[var(--muted)]">RIR {current.target_rir_min !== null ? `${current.target_rir_min}–${current.target_rir_max}` : current.target_rir ?? "—"}</p></div><div className="rounded-2xl border border-[var(--line)] bg-black/[0.035] p-4 dark:bg-white/[0.05]"><p className="eyebrow">Última vez</p>{current.previous ? <><p className="mt-2 text-lg font-semibold">{current.previous.weight ?? "—"} kg</p><p className="mt-1 text-sm font-medium text-[var(--muted)]">{current.previous.reps.join(" · ") || "Sin reps"}</p></> : <p className="mt-2 text-sm text-[var(--muted)]">Sin registro</p>}</div></div></div>
        <div className="border-t border-[var(--line)] p-4 sm:p-6"><div className="mb-2 grid grid-cols-[2rem_1fr_1fr_1fr_2.5rem] gap-2 px-1 text-center text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--muted)]"><span>#</span><span>kg</span><span>reps</span><span>RIR</span><span>✓</span></div>{current.sets.map((set) => <div className="grid grid-cols-[2rem_1fr_1fr_1fr_2.5rem] items-center gap-2 py-2" key={set.id}><span className="text-center text-sm text-[var(--muted)]">{set.set_number}</span><div className="flex items-center rounded-xl border border-[var(--line)]"><button aria-label="Restar 2,5 kg" className="min-h-12 min-w-9 text-lg" onClick={() => updateSet(set.id, { weight_kg: Math.max(0, (set.weight_kg ?? 0) - 2.5) })} type="button">−</button><input aria-label={`Peso serie ${set.set_number}`} className="min-w-0 flex-1 bg-transparent text-center text-lg font-semibold outline-none" inputMode="decimal" onChange={(event) => updateSet(set.id, { weight_kg: event.target.value === "" ? null : Number(event.target.value) })} type="number" value={set.weight_kg ?? ""} /><button aria-label="Sumar 2,5 kg" className="min-h-12 min-w-9 text-lg" onClick={() => updateSet(set.id, { weight_kg: (set.weight_kg ?? 0) + 2.5 })} type="button">+</button></div><input aria-label={`Repeticiones serie ${set.set_number}`} className="field min-w-0 px-1 text-center text-lg font-semibold" inputMode="numeric" min="0" onChange={(event) => updateSet(set.id, { reps: event.target.value === "" ? null : Number(event.target.value) })} type="number" value={set.reps ?? ""} /><input aria-label={`RIR serie ${set.set_number}`} className="field min-w-0 px-1 text-center text-lg font-semibold" inputMode="decimal" max="10" min="0" step="0.5" onChange={(event) => updateSet(set.id, { rir: event.target.value === "" ? null : Number(event.target.value) })} type="number" value={set.rir ?? ""} /><button aria-label={`Completar serie ${set.set_number}`} className={`min-h-12 rounded-xl border text-lg ${set.completed ? "border-[var(--success)] bg-[var(--success)] text-white" : "border-[var(--line)]"}`} onClick={() => updateSet(set.id, { completed: !set.completed })} type="button">✓</button></div>)}</div>
        <div className="space-y-5 border-t border-[var(--line)] p-6"><label className="block text-sm font-medium">Sensaciones <span className="text-[var(--muted)]">1–10</span><input className="field mt-2" inputMode="numeric" max="10" min="1" onChange={(event) => updateExercise({ feeling: event.target.value === "" ? null : Number(event.target.value) })} type="number" value={current.feeling ?? ""} /></label><div><p className="text-sm font-medium">Molestia</p><div className="mt-2 grid grid-cols-2 gap-2"><button className={`secondary-button ${!current.has_pain ? "border-[var(--foreground)]" : ""}`} onClick={() => updateExercise({ has_pain: false })} type="button">No</button><button className={`secondary-button ${current.has_pain ? "border-[var(--danger)] text-[var(--danger)]" : ""}`} onClick={() => updateExercise({ has_pain: true })} type="button">Sí</button></div></div><label className="block text-sm font-medium">Notas<textarea className="field mt-2 min-h-24 resize-y" onChange={(event) => updateExercise({ notes: event.target.value })} value={current.notes ?? ""} /></label></div>
      </section>
      <div className="mt-5 flex gap-3">{activeIndex > 0 ? <button className="secondary-button flex-1" onClick={() => setActiveIndex(activeIndex - 1)} type="button">Anterior</button> : null}{activeIndex < exercises.length - 1 ? <button className="primary-button flex-1" onClick={goNext} type="button">Siguiente</button> : <button className="primary-button flex-1" disabled={finishing || saveState === "offline"} onClick={() => void finish()} type="button">{finishing ? "Terminando…" : "Terminar entrenamiento"}</button>}</div>
    </main>
  );
}
