import { runCorners, withTemp, passivePerturb, supplyKeyFor } from "./corners";

describe("corner helpers", () => {
  test("supplyKeyFor picks the rail target in priority order", () => {
    expect(supplyKeyFor({ Vin: 12 })).toBe("Vin");
    expect(supplyKeyFor({ Vsupply: 5 })).toBe("Vsupply");
    expect(supplyKeyFor({ VCC: 12, Vin: 9 })).toBe("Vin"); // Vin has priority
    expect(supplyKeyFor({ Av: 10 })).toBeNull();
  });

  test("withTemp inserts a .temp directive before .end", () => {
    const deck = "V1 in 0 DC 5\nR1 in out 1k\n.end";
    expect(withTemp(deck, 70)).toBe("V1 in 0 DC 5\nR1 in out 1k\n.temp 70\n.end");
    expect(withTemp(deck, null)).toBe(deck); // nominal → untouched
  });

  test("passivePerturb scales only Ω/F parts", () => {
    const comps = [
      { ref: "R1", rawValue: 1000, unit: "Ω" },
      { ref: "C1", rawValue: 1e-7, unit: "F" },
      { ref: "D1", rawValue: 5, unit: "V" },
    ];
    const out = passivePerturb({ R1: 1000, C1: 1e-7, D1: 5 }, comps, 1.05);
    expect(out.R1).toBeCloseTo(1050, 6);
    expect(out.C1).toBeCloseTo(1.05e-7, 12);
    expect(out.D1).toBe(5); // diode breakdown untouched
  });
});

describe("runCorners — voltage divider over an analytic grader", () => {
  // A stub runSpice that reads the divider deck and returns Vout analytically, so
  // the sweep is exercised end-to-end without the wasm engine. Deck shape:
  //   V1 in 0 DC <Vin> / R1 in out <R1> / R2 out 0 <R2> / .dc V1 ...
  const stubRunSpice = async (deck) => {
    const vin = Number(/V1 in 0 DC ([0-9.eE+-]+)/.exec(deck)[1]);
    const r1 = Number(/R1 in out ([0-9.eE+-]+)/.exec(deck)[1]);
    const r2 = Number(/R2 out 0 ([0-9.eE+-]+)/.exec(deck)[1]);
    const vout = vin * (r2 / (r1 + r2));
    return { dataType: "real", sweep: [vin], nodes: { out: [vout] } };
  };

  const spec = { type: "voltage_divider", targets: { Vin: 10, Vout: 5 }, constraints: { tolerance: 0.05 } };
  // Ideal 1:1 divider → R1 = R2.
  const components = [
    { ref: "R1", rawValue: 1000, unit: "Ω" },
    { ref: "R2", rawValue: 1000, unit: "Ω" },
  ];

  test("nominal is exact; supply corners move the output, process is ratiometric-flat", async () => {
    const res = await runCorners(spec, components, { runSpice: stubRunSpice, supplyRel: 0.1, processTol: 0.05 });
    expect(res.supported).toBe(true);
    expect(res.target).toBe(5);

    const by = Object.fromEntries(res.corners.map((c) => [c.label, c]));
    expect(by["nominal"].measured).toBeCloseTo(5, 6);

    // Supply ±10% scales Vout directly (divider ratio fixed at 0.5).
    expect(by["Vin −10%"].measured).toBeCloseTo(4.5, 6);
    expect(by["Vin +10%"].measured).toBeCloseTo(5.5, 6);

    // Process: both resistors scale together → ratio unchanged → output flat.
    expect(by["process −5%"].measured).toBeCloseTo(5, 6);
    expect(by["process +5%"].measured).toBeCloseTo(5, 6);

    // Overall fails tolerance because the supply corners blow past ±5%.
    expect(res.pass).toBe(false);
    expect(res.worst.axis).toBe("supply");
    expect(res.spread.min).toBeCloseTo(4.5, 6);
    expect(res.spread.max).toBeCloseTo(5.5, 6);
  });

  test("tighter supply corner can pass", async () => {
    const res = await runCorners(spec, components, { runSpice: stubRunSpice, supplyRel: 0.02, processTol: 0.01 });
    expect(res.pass).toBe(true); // ±2% supply → ±2% output, within 5%
  });

  test("unsupported type returns { supported: false }", async () => {
    const res = await runCorners({ type: "nope", targets: {} }, [], { runSpice: stubRunSpice });
    expect(res.supported).toBe(false);
  });
});
