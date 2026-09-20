import { normalizeExternalKey, parseExerciseTarget } from "./contracts";

export type LegacyStrengthExercise = {
  name: string;
  targetSets: number | null;
  targetKind: "reps" | "duration" | "empty";
  targetMin: number | null;
  targetMax: number | null;
  weightKg: number | null;
  values: number[];
  rir: number | null;
  feeling: number | null;
  hasPain: boolean;
  notes: string | null;
};

export type LegacyStrengthSession = { date: string; code: "A" | "B"; name: string; exercises: LegacyStrengthExercise[] };

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function number(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function date(value: unknown) {
  const raw = text(value);
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return match ? `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export function parseLegacyStrengthRows(rows: unknown[][]) {
  const header = (rows[0] ?? []).map((value) => normalizeExternalKey(text(value)));
  const column = (name: string) => header.indexOf(name);
  const cells = rows.slice(1);
  const sessions = new Map<string, LegacyStrengthSession>();

  for (const row of cells) {
    const performedOn = date(row[column("fecha")]);
    const code = text(row[column("sesion")]).toUpperCase();
    if (!performedOn || (code !== "A" && code !== "B")) continue;
    const key = `${performedOn}:${code}`;
    if (!sessions.has(key)) sessions.set(key, { date: performedOn, code, name: `Full Body ${code}`, exercises: [] });
    if (normalizeExternalKey(text(row[column("tipo")])) !== "ejercicio") continue;
    const name = text(row[column("ejercicio")]);
    if (!name) continue;
    const target = parseExerciseTarget(row[column("reps_objetivo")]);
    const values = ["reps_s1", "reps_s2", "reps_s3"].flatMap((field) => {
      const value = number(row[column(field)]);
      return value === null ? [] : [value];
    });
    sessions.get(key)!.exercises.push({
      name,
      targetSets: number(row[column("series_objetivo")]),
      targetKind: target.kind,
      targetMin: target.min,
      targetMax: target.max,
      weightKg: target.kind === "duration" ? null : number(row[column("carga_kg")]),
      values,
      rir: number(row[column("rir")]),
      feeling: number(row[column("sensaciones_1_10")]),
      hasPain: ["si", "sí", "true", "1"].includes(text(row[column("dolor_molestia")]).toLowerCase()),
      notes: text(row[column("notas")]) || null,
    });
  }
  return [...sessions.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const legacyExerciseAliases: Record<string, string> = {
  remo_sentado_en_cable: "seated_cable_row",
  extension_de_cuadriceps_unilateral: "leg_extension",
  curl_femoral_unilateral: "leg_curl",
};
