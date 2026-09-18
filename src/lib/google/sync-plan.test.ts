import { describe, expect, it } from "vitest";

import { resolveExerciseReference } from "./contracts";

const exercises = [
  { id: "1", name: "Press banca", external_key: "bench_press" },
  { id: "2", name: "Remo sentado", external_key: null },
  { id: "3", name: "Remo sentádo", external_key: null },
];

describe("exercise resolution", () => {
  it("prefers the stable external key", () => {
    expect(resolveExerciseReference({ exerciseKey: "bench_press", exerciseName: "Otro nombre" }, exercises)?.id).toBe("1");
  });
  it("allows a unique normalized name fallback", () => {
    expect(resolveExerciseReference({ exerciseKey: "", exerciseName: "PRESS BANCA" }, exercises)?.id).toBe("1");
  });
  it("requires review for ambiguous or unknown names", () => {
    expect(resolveExerciseReference({ exerciseKey: "", exerciseName: "remo sentado" }, exercises)).toBeNull();
    expect(resolveExerciseReference({ exerciseKey: "", exerciseName: "Ejercicio nuevo" }, exercises)).toBeNull();
  });
});
