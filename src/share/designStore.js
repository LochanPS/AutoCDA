/**
 * designStore.js — persist designs to localStorage for the "My designs" list.
 *
 * No backend: saved designs live in the browser. Every accessor is wrapped in
 * try/catch so the app still works in private mode, with storage disabled, or
 * when the stored JSON is corrupt (it heals by returning an empty list).
 */

const KEY = "autocda.designs.v1";

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((r) => r && r.design && r.design.type) : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** All saved designs, newest first. */
export function listDesigns() {
  return readAll().sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

/**
 * Save a design. Returns the stored record, or null if storage is unavailable.
 * @param {{type,targets,constraints,components}} design
 * @param {{name?: string}} [opts]
 */
export function saveDesign(design, { name } = {}) {
  if (!design || !design.type) return null;
  const list = readAll();
  // Strictly-increasing timestamp so ordering is stable even for rapid saves.
  const maxTs = list.reduce((m, r) => Math.max(m, r.ts || 0), 0);
  const record = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: (name || design.type).slice(0, 120),
    ts: Math.max(Date.now(), maxTs + 1),
    design: {
      type: design.type,
      targets: { ...(design.targets || {}) },
      constraints: { ...(design.constraints || {}) },
      components: (design.components || []).map((c) => ({ ref: c.ref, rawValue: c.rawValue, unit: c.unit })),
    },
  };
  list.push(record);
  return writeAll(list) ? record : null;
}

/** Delete one saved design by id. Returns the remaining list. */
export function deleteDesign(id) {
  const list = readAll().filter((r) => r.id !== id);
  writeAll(list);
  return listDesigns();
}

/** Remove every saved design. */
export function clearDesigns() {
  writeAll([]);
}
