// EasyEDA JSON schema generator for circuit export
// User can import JSON into EasyEDA → export to Altium/KiCad/Gerber

export function generateEasyEDAJson(circuit) {
  if (!circuit) return null;

  const c = circuit.components;
  const get = (ref) => c.find(x => x.ref === ref)?.rawValue;
  const format = (val, unit) => {
    if (!val) return "0";
    if (unit === 'Ω') return val >= 1e6 ? `${(val/1e6).toFixed(2)}M` : val >= 1e3 ? `${(val/1e3).toFixed(2)}k` : val.toFixed(0);
    if (unit === 'F') return val >= 1e-3 ? `${(val*1e3).toFixed(2)}m` : val >= 1e-6 ? `${(val*1e6).toFixed(2)}u` : val >= 1e-9 ? `${(val*1e9).toFixed(2)}n` : `${(val*1e12).toFixed(2)}p`;
    if (unit === 'V') return val.toFixed(2);
    return val.toString();
  };

  const components = [];
  let id = 1;

  for (const comp of c) {
    if (!comp.editable && comp.ref !== 'Q1') continue; // skip display-only except Q1

    let libref = "Device:R", value = format(comp.rawValue, comp.unit);

    if (comp.ref.startsWith('R')) libref = "Device:R";
    else if (comp.ref.startsWith('C')) libref = "Device:C";
    else if (comp.ref.startsWith('D') || comp.ref.startsWith('Dz')) libref = comp.ref === 'D1' ? "Device:LED" : "Device:D_Zener";
    else if (comp.ref === 'Q1') libref = "Device:Q_NPN_BCE";
    else if (comp.ref === 'Rf' || comp.ref === 'Rg') { libref = "Device:R"; value = format(comp.rawValue, 'Ω'); }

    components.push({
      id: id++,
      name: comp.ref,
      libId: libref,
      package: comp.ref.startsWith('R') ? "R_0805" : comp.ref.startsWith('C') ? "C_0805" : comp.ref === 'Q1' ? "SOT-23" : "DO-35",
      value: value,
      x: 100 + (id % 5) * 50,
      y: 100 + Math.floor(id / 5) * 50,
    });
  }

  return {
    docType: "EasyEDA",
    version: "1.0",
    docId: circuit.id,
    title: circuit.name,
    description: circuit.explanation,
    components: components,
    wires: [],
    nets: [],
  };
}

export function downloadEasyEDAJson(circuit) {
  const json = generateEasyEDAJson(circuit);
  if (!json) return;
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${circuit.id}_easyeda.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
