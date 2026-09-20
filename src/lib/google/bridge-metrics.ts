export const cardioKinds = new Set([
  "running", "cycling_outdoor", "stationary_bike", "treadmill", "stair_machine", "walking", "other",
]);

export type PlannedForAdherence = {
  kind: string;
  status: string;
  strength_sessions: Array<{ status: string }>;
  cardio_sessions: Array<{ id: string }>;
};

export function weeklyAdherence(planned: PlannedForAdherence[]) {
  const eligible = planned.filter((entry) => entry.status !== "cancelled" && entry.status !== "skipped");
  return {
    strengthPlanned: eligible.filter((entry) => entry.kind === "strength").length,
    strengthCompleted: eligible.filter((entry) => entry.kind === "strength" && entry.strength_sessions.some((session) => session.status === "completed")).length,
    cardioPlanned: eligible.filter((entry) => cardioKinds.has(entry.kind)).length,
    cardioCompleted: eligible.filter((entry) => cardioKinds.has(entry.kind) && entry.cardio_sessions.length > 0).length,
  };
}

export function sheetValue<T extends string | number | boolean>(input: T | null | undefined): T | "" {
  return input ?? "";
}

export function mergeDailySnapshots<T extends { measured_on: string }>(entries: T[]) {
  const merged = new Map<string, T>();
  for (const entry of entries) {
    const previous = merged.get(entry.measured_on);
    if (!previous) {
      merged.set(entry.measured_on, entry);
      continue;
    }
    const presentValues = Object.fromEntries(
      Object.entries(entry).filter(([, value]) => value !== null && value !== undefined),
    );
    merged.set(entry.measured_on, { ...previous, ...presentValues });
  }
  return merged;
}

export async function nonBlockingSync<T>(task: () => Promise<T>) {
  try {
    return { ok: true as const, result: await task() };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Unknown sync error" };
  }
}
