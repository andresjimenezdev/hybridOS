import { describe, expect, it } from "vitest";
import { parseAppleHealthPayload } from "./apple-health";

describe("Apple Health payload", () => {
  it("accepts a partial daily snapshot", () => {
    expect(parseAppleHealthPayload({ date: "2026-09-19", steps: 8421, active_calories: 534, vo2_max: 48.2 })).toEqual({
      date: "2026-09-19", steps: 8421, active_calories: 534, vo2_max: 48.2,
    });
  });

  it("does not confuse zero with a missing value", () => {
    expect(parseAppleHealthPayload({ date: "2026-09-19", steps: 0 }).steps).toBe(0);
  });

  it("uses a trusted server date when Shortcuts sends an unusable date", () => {
    expect(parseAppleHealthPayload({ date: "FechaISO", steps: 10 }, "2026-09-19").date).toBe("2026-09-19");
    expect(parseAppleHealthPayload({ steps: 10 }, "2026-09-19").date).toBe("2026-09-19");
  });

  it("rejects invalid dates, ranges and empty snapshots", () => {
    expect(() => parseAppleHealthPayload({ date: "19/09/2026", steps: 100 })).toThrow();
    expect(() => parseAppleHealthPayload({ date: "2026-09-19", steps: -1 })).toThrow();
    expect(() => parseAppleHealthPayload({ date: "2026-09-19" })).toThrow();
  });
});
