import { describe, expect, it } from "vitest";
import { AI_PLAN_HEADERS, groupPlanRows, normalizeExternalKey, parseCanonicalRange, parsePlanRows } from "./contracts";

describe("Google bridge contracts", () => {
  it("normalizes stable external keys", () => {
    expect(normalizeExternalKey("Press Bánca / Barra")).toBe("press_banca_barra");
  });
  it("parses canonical target ranges", () => {
    expect(parseCanonicalRange("6–8")).toEqual({ min: 6, max: 8 });
    expect(parseCanonicalRange(3)).toEqual({ min: 3, max: 3 });
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
