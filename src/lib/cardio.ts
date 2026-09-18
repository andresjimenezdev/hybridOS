export const cardioKinds = [
  "running", "cycling_outdoor", "stationary_bike", "treadmill", "stair_machine", "walking", "other",
] as const;

export type CardioKind = (typeof cardioKinds)[number];

export const cardioKindLabels: Record<CardioKind, string> = {
  running: "Running",
  cycling_outdoor: "Ciclismo exterior",
  stationary_bike: "Bicicleta estática",
  treadmill: "Cinta",
  stair_machine: "Stair machine",
  walking: "Caminata deportiva",
  other: "Otro cardio",
};

export const runningTypes = ["easy", "long_run", "tempo", "intervals", "recovery", "other"] as const;
export type RunningType = (typeof runningTypes)[number];
export const runningTypeLabels: Record<RunningType, string> = {
  easy: "Easy", long_run: "Long run", tempo: "Tempo", intervals: "Intervals", recovery: "Recovery", other: "Other",
};

export function durationSeconds(minutes: number, seconds = 0) {
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes < 0 || seconds < 0 || seconds >= 60) return null;
  const total = Math.round(minutes * 60 + seconds);
  return total > 0 ? total : null;
}

export function averagePaceSeconds(totalSeconds: number, distanceKm: number | null) {
  if (!distanceKm || distanceKm <= 0 || totalSeconds <= 0) return null;
  return Math.round(totalSeconds / distanceKm);
}

export function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatPace(secondsPerKm: number | null) {
  if (!secondsPerKm) return "—";
  return `${Math.floor(secondsPerKm / 60)}:${String(secondsPerKm % 60).padStart(2, "0")} /km`;
}
