import Link from "next/link";
import { createExercise, toggleExercise, updateExercise } from "../actions";
import { SectionHeading } from "@/components/section-heading";
import { createClient } from "@/lib/supabase/server";

type Exercise = { id: string; name: string; muscle_group: string; movement_pattern: string; equipment: string; instructions: string | null; is_active: boolean };

export default async function ExercisesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("exercises").select("id,name,muscle_group,movement_pattern,equipment,instructions,is_active").order("is_active", { ascending: false }).order("name");
  const exercises = (data ?? []) as Exercise[];
  return (
    <main>
      <SectionHeading eyebrow="Fuerza" title="Ejercicios" action={<Link className="text-sm" href="/entrenar">Volver</Link>} />
      <details className="card mb-6 p-5" open={exercises.length === 0}><summary className="min-h-11 font-semibold">Nuevo ejercicio</summary><form action={createExercise} className="mt-4 grid gap-3 sm:grid-cols-2"><input className="field sm:col-span-2" name="name" placeholder="Nombre" required /><input className="field" name="muscle_group" placeholder="Grupo muscular" required /><input className="field" name="movement_pattern" placeholder="Patrón de movimiento" required /><input className="field sm:col-span-2" name="equipment" placeholder="Equipamiento" required /><textarea className="field min-h-24 sm:col-span-2" name="instructions" placeholder="Instrucciones opcionales" /><button className="primary-button sm:col-span-2" type="submit">Guardar ejercicio</button></form></details>
      <div className="space-y-3">{exercises.map((exercise) => <article className={`card p-5 ${exercise.is_active ? "" : "opacity-60"}`} key={exercise.id}><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">{exercise.name}</h2><p className="mt-1 text-xs text-[var(--muted)]">{exercise.muscle_group} · {exercise.movement_pattern} · {exercise.equipment}</p></div><form action={toggleExercise}><input name="id" type="hidden" value={exercise.id} /><input name="is_active" type="hidden" value={String(exercise.is_active)} /><button className="text-xs font-medium" type="submit">{exercise.is_active ? "Desactivar" : "Activar"}</button></form></div><details className="mt-3 border-t border-[var(--line)] pt-3"><summary className="min-h-10 text-sm text-[var(--muted)]">Editar</summary><form action={updateExercise} className="grid gap-3 pt-3 sm:grid-cols-2"><input name="id" type="hidden" value={exercise.id} /><input className="field sm:col-span-2" name="name" defaultValue={exercise.name} required /><input className="field" name="muscle_group" defaultValue={exercise.muscle_group} required /><input className="field" name="movement_pattern" defaultValue={exercise.movement_pattern} required /><input className="field sm:col-span-2" name="equipment" defaultValue={exercise.equipment} required /><textarea className="field min-h-24 sm:col-span-2" name="instructions" defaultValue={exercise.instructions ?? ""} /><button className="primary-button sm:col-span-2" type="submit">Guardar cambios</button></form></details></article>)}</div>
    </main>
  );
}
