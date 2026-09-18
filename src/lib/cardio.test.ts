import { describe, expect, it } from "vitest";
import { averagePaceSeconds, durationSeconds, formatDuration, formatPace } from "./cardio";

describe("cardio calculations", () => {
  it("normalizes duration and rejects invalid seconds", () => {
    expect(durationSeconds(35, 12)).toBe(2112);
    expect(durationSeconds(10, 60)).toBeNull();
    expect(durationSeconds(0, 0)).toBeNull();
  });
  it("calculates and formats pace deterministically", () => {
    expect(averagePaceSeconds(2100, 5)).toBe(420);
    expect(formatPace(420)).toBe("7:00 /km");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});
