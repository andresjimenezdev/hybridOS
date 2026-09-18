import { describe, expect, it } from "vitest";
import { addDays, dateInTimeZone, isoWeekStart } from "./date";

describe("date helpers", () => {
  it("uses the configured timezone", () => {
    expect(dateInTimeZone(new Date("2026-09-18T23:30:00Z"), "Europe/Madrid")).toBe("2026-09-19");
  });
  it("finds Monday and adds days without local timezone drift", () => {
    expect(isoWeekStart("2026-09-20")).toBe("2026-09-14");
    expect(addDays("2026-09-14", 6)).toBe("2026-09-20");
  });
});
