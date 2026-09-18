import { describe, expect, it } from "vitest";
import { AI_PLAN_HEADERS, groupPlanRows, normalizeExternalKey, parseCanonicalRange, parseExerciseTarget, parsePlanRows, planUpdateDecision, stableResultId } from "./contracts";

describe("Google bridge contracts", () => {
  it("normalizes stable external keys", () => {
    expect(normalizeExternalKey("Press Bánca / Barra")).toBe("press_banca_barra");
  });
  it("parses canonical target ranges", () => {
    expect(parseCanonicalRange("6–8")).toEqual({ min: 6, max: 8 });
    expect(parseCanonicalRange(3)).toEqual({ min: 3, max: 3 });
    expect(parseCanonicalRange("2-3")).toEqual({ min: 2, max: 3 });
  });
  it("keeps duration targets distinct from repetitions", () => {
    expect(parseExerciseTarget("30-45 s")).toEqual({ kind: "duration", min: 30, max: 45 });
    expect(parseExerciseTarget("10")).toEqual({ kind: "reps", min: 10, max: 10 });
  });
  it("builds stable result identifiers", () => {
    expect(stableResultId("strength", "abc", "set", 2)).toBe("strength:abc:set:2");
  });
  it("keeps completed plans immutable and identical imports idempotent", () => {
    expect(planUpdateDecision({ status: "completed", active: false, importStatus: "ready", existingUpdatedAt: null, incomingUpdatedAt: null })).toBe("immutable");
    expect(planUpdateDecision({ status: "planned", active: false, importStatus: "ready", existingUpdatedAt: "2026-09-14T10:00:00.000Z", incomingUpdatedAt: "2026-09-14T10:00:00.000Z" })).toBe("unchanged");
    expect(planUpdateDecision({ status: "in_progress", active: true, importStatus: "ready", existingUpdatedAt: null, incomingUpdatedAt: null })).toBe("conflict");
  });
  it("parses and groups AI_PLAN rows without UUIDs", () => {
    const row = (values: Record<string, string>) => AI_PLAN_HEADERS.map((header) => values[header] ?? "");
    const source = [AI_PLAN_HEADERS.slice(), row({ date: "2026-09-22", session_key: "week38_a", session_type: "strength", session_name: "Full Body A", exercise_key: "bench_press", reps_target: "6-8" }), row({ date: "2026-09-22", session_key: "week38_a", session_type: "strength", session_name: "Full Body A", exercise_key: "row", reps_target: "8" })];
    const result = parsePlanRows(source);
    expect(result.errors).toEqual([]);
    expect(groupPlanRows(result.rows).get("week38_a")).toHaveLength(2);
  });
  it("rejects a drifted AI_PLAN contract", () => {
    expect(parsePlanRows([["date", "session_key"]]).errors).toEqual(["AI_PLAN no respeta las cabeceras canónicas o su orden."]);
  });
});
