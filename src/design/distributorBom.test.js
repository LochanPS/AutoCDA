/**
 * distributorBom.test.js — C6: per-distributor BOM export formats.
 */
import { buildDistributorBom, DISTRIBUTOR_FORMATS, hasDistributorFormat } from "./distributorBom";

const bom = {
  rows: [
    { ref: "R1, R2", value: "1 kΩ", mpn: "RC0603FR-071KL", qty: 2 },
    { ref: "C1", value: "159 nF", mpn: "CC0603KRX7R9BB154", qty: 1 },
    { ref: "U1", value: "Op-amp", mpn: "TL072CDT", qty: 1 },
  ],
};

describe("buildDistributorBom", () => {
  test("Mouser format: MPN, Quantity, Description", () => {
    const f = buildDistributorBom(bom, "mouser");
    const lines = f.text.split("\n");
    expect(lines[0]).toBe("Manufacturer Part Number,Quantity,Description");
    expect(lines[1]).toBe("RC0603FR-071KL,2,1 kΩ");
    expect(f.filename).toBe("autocda-bom-mouser.csv");
    expect(f.importer).toMatch(/mouser\.com\/Bom/);
    expect(f.lines).toBe(3);
  });

  test("DigiKey format: Quantity, MPN, Customer Reference", () => {
    const f = buildDistributorBom(bom, "digikey");
    const lines = f.text.split("\n");
    expect(lines[0]).toBe("Quantity,Manufacturer Part Number,Customer Reference");
    expect(lines[1]).toBe("2,RC0603FR-071KL,\"R1, R2\""); // comma-containing ref is quoted
  });

  test("LCSC format: MPN, Quantity, Designator", () => {
    const f = buildDistributorBom(bom, "lcsc");
    expect(f.text.split("\n")[0]).toBe("Manufacturer Part Number,Quantity,Designator");
    expect(f.text).toContain("TL072CDT,1,U1");
  });

  test("unknown id falls back to the generic format", () => {
    const f = buildDistributorBom(bom, "nope");
    expect(f.id).toBe("generic");
    expect(f.text.split("\n")[0]).toBe("Manufacturer Part Number,Quantity,Reference,Value");
  });

  test("rows without an MPN are skipped", () => {
    const f = buildDistributorBom({ rows: [{ ref: "X1", value: "?", qty: 1 }] }, "mouser");
    expect(f.lines).toBe(0);
  });

  test("format registry + predicate", () => {
    expect(DISTRIBUTOR_FORMATS).toEqual(expect.arrayContaining(["mouser", "digikey", "lcsc", "generic"]));
    expect(hasDistributorFormat("mouser")).toBe(true);
    expect(hasDistributorFormat("nope")).toBe(false);
  });
});
