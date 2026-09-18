import { describe, expect, it } from "vitest";
import { rangeStart, trendPercent, weeklyTotals } from "./progress";

describe("progress calculations", () => {
  it("builds inclusive range starts", () => {
    expect(rangeStart("2026-09-18", "4w")).toBe("2026-08-22");
    expect(rangeStart("2026-09-18", "all")).toBeNull();
  });
  it("aggregates values by ISO week", () => {
    expect(weeklyTotals([{ date: "2026-09-14", value: 2 }, { date: "2026-09-20", value: 3 }, { date: "2026-09-21", value: 4 }])).toEqual([
      { date: "2026-09-14", value: 5 }, { date: "2026-09-21", value: 4 },
    ]);
  });
  it("returns a directional percentage only with enough data", () => {
    expect(trendPercent([80, 84])).toBe(5);
    expect(trendPercent([80])).toBeNull();
  });
});
