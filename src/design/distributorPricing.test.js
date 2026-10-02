import { cached, tablePriceSource, makeDigikeyPriceSource, enrichBOMWithPricing } from "./distributorPricing";
import { buildBOM, buildBOMPriced } from "./bom";

const COMPONENTS = [
  { ref: "R1", rawValue: 1000, unit: "Ω", display: "1 kΩ", description: "Series Resistor" },
  { ref: "R2", rawValue: 2200, unit: "Ω", display: "2.2 kΩ", description: "Lower Resistor" },
  { ref: "C1", rawValue: 1e-7, unit: "F", display: "100 nF", description: "Filter Capacitor" },
];

describe("distributorPricing", () => {
  test("tablePriceSource returns a quote or null", async () => {
    const src = tablePriceSource({ "ABC-123": 0.042 });
    expect(await src("ABC-123")).toMatchObject({ unitPrice: 0.042, currency: "USD", source: "table" });
    expect(await src("NOPE")).toBeNull();
  });

  test("cached calls the underlying source once per key", async () => {
    let calls = 0;
    const src = cached(async (mpn) => { calls++; return { unitPrice: 0.1, currency: "USD", stock: null, source: "x" }; });
    await src("M1"); await src("M1"); await src("M2");
    expect(calls).toBe(2);
  });

  test("cached swallows source errors and returns null", async () => {
    const src = cached(async () => { throw new Error("network"); });
    expect(await src("M1")).toBeNull();
  });

  test("enrichBOMWithPricing overrides matched rows and keeps static on miss", async () => {
    const bom = buildBOM(COMPONENTS);
    const resistorMpn = bom.rows.find((r) => r.ref.includes("R1")).mpn;
    const src = tablePriceSource({ [resistorMpn]: 0.5 }, "test");
    const priced = await enrichBOMWithPricing(bom, src);
    const rRow = priced.rows.find((r) => r.ref.includes("R1"));
    const cRow = priced.rows.find((r) => r.ref.includes("C1"));
    expect(rRow.priced).toBe(true);
    expect(rRow.unitPrice).toBe(0.5);
    expect(rRow.lineTotal).toBeCloseTo(0.5 * rRow.qty, 6);
    expect(cRow.priced).toBe(false); // no quote -> static price retained
    expect(priced.livePriced).toBe(true);
    expect(priced.total).toBeCloseTo(priced.rows.reduce((s, r) => s + r.lineTotal, 0), 6);
  });

  test("makeDigikeyPriceSource is inert without a proxy URL, parses with one", async () => {
    expect(await makeDigikeyPriceSource({})("MPN")).toBeNull();
    const fetchImpl = async (url) => ({ ok: true, json: async () => ({ unitPrice: 0.12, currency: "USD", stock: 500 }) });
    const src = makeDigikeyPriceSource({ baseUrl: "/api/pricing", fetchImpl });
    expect(await src("MPN")).toMatchObject({ unitPrice: 0.12, stock: 500, source: "digikey" });
  });

  test("buildBOMPriced with no source equals the static BOM", async () => {
    const priced = await buildBOMPriced(COMPONENTS);
    expect(priced.total).toBe(buildBOM(COMPONENTS).total);
  });

  test("buildBOMPriced applies a live source", async () => {
    const bom = buildBOM(COMPONENTS);
    const anyMpn = bom.rows[0].mpn;
    const priced = await buildBOMPriced(COMPONENTS, { source: tablePriceSource({ [anyMpn]: 1.0 }) });
    expect(priced.rows[0].unitPrice).toBe(1.0);
    expect(priced.livePriced).toBe(true);
  });
});
