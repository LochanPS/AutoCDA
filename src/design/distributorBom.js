/**
 * distributorBom.js — C6: export the BOM in each distributor's own import format.
 *
 * A generic CSV makes the buyer re-map columns. Each distributor's BOM importer
 * wants a specific header order (MPN + quantity + a reference/designator column).
 * This emits the right file per distributor so "design → buy" is one hop: download
 * the matching CSV, drop it into that distributor's BOM tool.
 *
 * Pure module. Rows come from buildBOM: { ref (comma-joined designators), value,
 * mpn, qty }.
 */

function esc(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = (header, rows) => [header.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");

// Per-distributor column mapping. Each takes a BOM row → an ordered field array,
// matching that importer's expected header. Verified against each tool's template.
const FORMATS = {
  // Mouser BOM Tool: Mfr Part Number + Quantity (+ a description helps).
  mouser: {
    label: "Mouser",
    header: ["Manufacturer Part Number", "Quantity", "Description"],
    row: (r) => [r.mpn, r.qty, r.value],
    importer: "https://www.mouser.com/Bom/",
  },
  // DigiKey myLists import: Quantity, Part Number, Customer Reference.
  digikey: {
    label: "DigiKey",
    header: ["Quantity", "Manufacturer Part Number", "Customer Reference"],
    row: (r) => [r.qty, r.mpn, r.ref],
    importer: "https://www.digikey.com/en/mylists/import",
  },
  // LCSC BOM tool: Manufacturer Part Number, Quantity, Designator.
  lcsc: {
    label: "LCSC",
    header: ["Manufacturer Part Number", "Quantity", "Designator"],
    row: (r) => [r.mpn, r.qty, r.ref],
    importer: "https://www.lcsc.com/bom",
  },
  // Neutral / Octopart-style: MPN, Qty, Reference, Value.
  generic: {
    label: "Generic",
    header: ["Manufacturer Part Number", "Quantity", "Reference", "Value"],
    row: (r) => [r.mpn, r.qty, r.ref, r.value],
    importer: "",
  },
};

export const DISTRIBUTOR_FORMATS = Object.keys(FORMATS);

/** Is there a dedicated importer format for this distributor id? */
export function hasDistributorFormat(id) {
  return !!FORMATS[id];
}

/**
 * Build a distributor-specific BOM file.
 * @param {{rows:Array}} bom
 * @param {string} distributorId  one of DISTRIBUTOR_FORMATS (default "generic")
 * @returns {{id, label, filename, text, importer, lines:number}}
 */
export function buildDistributorBom(bom, distributorId = "generic") {
  const fmt = FORMATS[distributorId] || FORMATS.generic;
  const rows = (bom && bom.rows) || [];
  const body = rows.filter((r) => r.mpn).map((r) => fmt.row(r));
  return {
    id: FORMATS[distributorId] ? distributorId : "generic",
    label: fmt.label,
    filename: `autocda-bom-${FORMATS[distributorId] ? distributorId : "generic"}.csv`,
    text: csv(fmt.header, body),
    importer: fmt.importer,
    lines: body.length,
  };
}
