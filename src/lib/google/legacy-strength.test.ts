import { describe, expect, it } from "vitest";
import { parseLegacyStrengthRows } from "./legacy-strength";

describe("legacy strength rows", () => {
  it("parses wide A/B workout rows without inventing missing sets", () => {
    const rows = [
      ["Fecha", "Tipo", "Sesión", "Ejercicio", "Series objetivo", "Reps objetivo", "Carga (kg)", "Reps S1", "Reps S2", "Reps S3", "RIR", "Sensaciones (1-10)", "Dolor/molestia", "Notas"],
      ["15/09/2026", "Sesión", "A", "FUERZA A"],
      ["15/09/2026", "Ejercicio", "A", "Press banca", 3, "6–8", 30, 8, 9, 8, 3, 8, "No", ""],
      ["17/09/2026", "Ejercicio", "B", "Prensa inclinada", "", "", "", "", "", "", "", "", "No", "Sin datos"],
    ];
    const sessions = parseLegacyStrengthRows(rows);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.exercises[0]).toMatchObject({ name: "Press banca", values: [8, 9, 8], weightKg: 30 });
    expect(sessions[1]?.exercises[0]).toMatchObject({ name: "Prensa inclinada", values: [] });
  });
});
