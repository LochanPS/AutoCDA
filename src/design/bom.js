/**
 * bom.js — map snapped E-series components to real orderable parts with prices.
 *
 * Phase 4.1 uses a bundled STATIC catalog: typical 0603 resistor/capacitor unit
 * prices plus vendor-style placeholder MPNs. The public interface is
 * buildBOM(components); a live Digikey/Mouser lookup can replace the internals
 * later without changing callers (make buildBOM async and swap the catalog).
 *
 * Pure module, no side effects.
 */

// Typical unit prices (USD, small-quantity) for common 0603 parts. Placeholder
// figures for the bundled catalog; a live API would return real distributor pricing.
const UNIT_PRICE = {
  resistor: 0.01,
  capacitor: 0.02,
  led: 0.08,
  diode: 0.05,
  transistor: 0.06,
  opamp: 0.35,
  other: 0.05,
};

function kindOf(c) {
  if (c.unit === "Ω") return "resistor";
  if (c.unit === "F") return "capacitor";
  const ref = (c.ref || "").toLowerCase();
  const desc = (c.description || "").toLowerCase();
  if (desc.includes("led")) return "led";
  if (desc.includes("zener") || desc.includes("diode") || ref.startsWith("d")) return "diode";
  if (desc.includes("transistor") || desc.includes("bjt") || ref.startsWith("q")) return "transistor";
  if (desc.includes("op-amp") || desc.includes("opamp") || ref.startsWith("u")) return "opamp";
  return "other";
}

// EIA-style 3-significant-figure + decade code (e.g. 1000 -> "1001", 160 -> "1600",
// 0.5 -> "5R0"... sub-1 decades use an R marker). Used to build placeholder MPNs.
function eiaCode(value) {
  if (!(value > 0) || !isFinite(value)) return "0000";
  const mult = Math.floor(Math.log10(value)) - 2;
  const sig = Math.round(value / Math.pow(10, mult));
  return mult < 0 ? `${sig}R${Math.abs(mult)}` : `${sig}${mult}`;
}

// Vendor-style placeholder MPNs. Clearly a stand-in for a real catalog lookup.
function mpnFor(kind, c) {
  switch (kind) {
    case "resistor":
      return `RC0603FR-07${eiaCode(c.rawValue)}L`;
    case "capacitor":
      return `CC0603KRX7R9BB${eiaCode(c.rawValue * 1e12)}`;
    case "led":
      return "LTST-C190KGKT";
    case "diode":
      return (c.description || "").toLowerCase().includes("zener") ? "BZX84C5V1" : "1N4148W";
    case "transistor":
      return "BC547BTA";
    case "opamp":
      return "TL072CDT";
    default:
      return "GENERIC-0603";
  }
}

function isOrderable(c) {
  // Skip pure-label rows that carry no value and no recognisable device ref.
  if (c.rawValue != null || c.unit === "Ω" || c.unit === "F") return true;
  return /^(q|u|d|e)\d/i.test(c.ref || "");
}

/**
 * Build a bill of materials from a component list. Identical parts (same kind and
 * value) are grouped into one line with a combined ref list and quantity.
 * @param {Array<{ref, rawValue, unit, display, description}>} components
 * @returns {{ rows: Array<{ref, value, mpn, unitPrice, qty, lineTotal}>, total: number }}
 */
export function buildBOM(components) {
  const groups = new Map();
  for (const c of components || []) {
    if (!isOrderable(c)) continue;
    const kind = kindOf(c);
    const key = `${kind}|${c.rawValue ?? c.display}`;
    if (!groups.has(key)) {
      groups.set(key, {
        kind,
        value: c.display || String(c.rawValue),
        refs: [],
        unitPrice: UNIT_PRICE[kind] ?? UNIT_PRICE.other,
        mpn: mpnFor(kind, c),
      });
    }
    groups.get(key).refs.push(c.ref);
  }

  const rows = [];
  let total = 0;
  for (const g of groups.values()) {
    const qty = g.refs.length;
    const lineTotal = +(g.unitPrice * qty).toFixed(4);
    total += lineTotal;
    rows.push({ ref: g.refs.join(", "), value: g.value, mpn: g.mpn, unitPrice: g.unitPrice, qty, lineTotal });
  }
  return { rows, total: +total.toFixed(4) };
}

/** Serialise a BOM to CSV text (with a trailing total row). */
export function buildBomCsv(bom) {
  const esc = (v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Ref", "Value", "MPN", "Qty", "Unit Price (USD)", "Line Total (USD)"];
  const lines = [header.join(",")];
  for (const r of bom.rows) {
    lines.push([r.ref, r.value, r.mpn, r.qty, r.unitPrice.toFixed(4), r.lineTotal.toFixed(4)].map(esc).join(","));
  }
  lines.push(["", "", "", "", "Total", bom.total.toFixed(4)].map(esc).join(","));
  return lines.join("\n");
}
