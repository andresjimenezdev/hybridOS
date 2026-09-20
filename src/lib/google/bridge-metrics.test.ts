import { describe, expect, it } from "vitest";

import { mergeDailySnapshots, nonBlockingSync, sheetValue, weeklyAdherence, type PlannedForAdherence } from "./bridge-metrics";

const plan = (values: Partial<PlannedForAdherence>): PlannedForAdherence => ({
  kind: "strength", status: "planned", strength_sessions: [], cardio_sessions: [], ...values,
});

describe("Google bridge weekly semantics", () => {
  it("does not treat planned as completed", () => {
    expect(weeklyAdherence([plan({ kind: "strength" })])).toMatchObject({ strengthPlanned: 1, strengthCompleted: 0 });
  });
  it("counts running as cardio and excludes mobility", () => {
    expect(weeklyAdherence([plan({ kind: "running" }), plan({ kind: "mobility" })])).toMatchObject({ cardioPlanned: 1, cardioCompleted: 0 });
  });
  it("counts completion only from linked real sessions", () => {
    expect(weeklyAdherence([
      plan({ kind: "strength", strength_sessions: [{ status: "completed" }] }),
      plan({ kind: "running", cardio_sessions: [{ id: "run" }] }),
    ])).toMatchObject({ strengthCompleted: 1, cardioCompleted: 1 });
  });
  it("keeps null empty and preserves a real zero", () => {
    expect(sheetValue(null)).toBe("");
    expect(sheetValue(0)).toBe(0);
  });
  it("merges manual and Apple Health snapshots without erasing present values", () => {
    const merged = mergeDailySnapshots([
      { measured_on: "2026-09-20", weight_kg: 75, steps: null as number | null },
      { measured_on: "2026-09-20", weight_kg: null as number | null, steps: 8421 },
    ]).get("2026-09-20");
    expect(merged).toMatchObject({ weight_kg: 75, steps: 8421 });
  });
  it("turns Google failure into a retryable result", async () => {
    await expect(nonBlockingSync(async () => { throw new Error("Google unavailable"); }))
      .resolves.toEqual({ ok: false, error: "Google unavailable" });
  });
});
