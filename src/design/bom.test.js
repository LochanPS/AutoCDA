import { buildBOM, buildBomCsv } from "./bom";

const R1 = { ref: "R1", rawValue: 1000, unit: "Ω", display: "1 kΩ", description: "Series Resistor" };
const R2 = { ref: "R2", rawValue: 1000, unit: "Ω", display: "1 kΩ", description: "Shunt Resistor" };
const C1 = { ref: "C1", rawValue: 160e-9, unit: "F", display: "160 nF", description: "Filter Capacitor" };
const Q1 = { ref: "Q1", rawValue: null, unit: null, display: "NPN BJT", description: "Transistor (BC547)" };

describe("buildBOM", () => {
  test("prices resistor + capacitor and totals correctly", () => {
    const bom = buildBOM([R1, C1]);
    expect(bom.rows).toHaveLength(2);
    expect(bom.total).toBeCloseTo(0.01 + 0.02, 4);
    const r = bom.rows.find((x) => x.value === "1 kΩ");
    expect(r.mpn).toMatch(/^RC0603FR-07/);
    expect(r.qty).toBe(1);
  });

  test("groups identical parts and sums quantity", () => {
    const bom = buildBOM([R1, R2, C1]);
    expect(bom.rows).toHaveLength(2); // R1+R2 merged, C1 separate
    const res = bom.rows.find((x) => x.value === "1 kΩ");
    expect(res.qty).toBe(2);
    expect(res.ref).toBe("R1, R2");
    expect(res.lineTotal).toBeCloseTo(0.02, 4);
  });

  test("includes active parts (transistor) with a placeholder MPN", () => {
    const bom = buildBOM([Q1]);
    expect(bom.rows).toHaveLength(1);
    expect(bom.rows[0].mpn).toBe("BC547BTA");
  });

  test("resistor MPN uses an EIA decade code", () => {
    const bom = buildBOM([{ ref: "R1", rawValue: 160, unit: "Ω", display: "160 Ω" }]);
    expect(bom.rows[0].mpn).toBe("RC0603FR-071600L"); // 160 -> 1600
  });

  test("CSV has a header, one row per line, and a total row", () => {
    const csv = buildBomCsv(buildBOM([R1, R2, C1]));
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("Ref,Value,MPN,Qty,Unit Price (USD),Line Total (USD)");
    expect(lines[lines.length - 1]).toMatch(/,Total,/);
  });
});
