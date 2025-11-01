/**
 * storage.js
 * Save and load application state to/from localStorage.
 * Converts runtime structures (Sets) to plain arrays for persistence.
 */

const KEY = 'envuln-lite-store';
const CURRENT_VERSION = 4;

/* ------------ Public API ------------ */

/**
 * Serialize runtime state to localStorage.
 * @param {object} state
 */
export function saveToLocal(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(toSerializable(state)));
  } catch (e) {
    console.warn('[storage] save error:', e);
  }
}

/**
 * Load from localStorage and convert back to runtime state.
 * @returns {object|null}
 */
export function loadFromLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const obj = JSON.parse(raw);
    if (!obj.version || obj.version !== CURRENT_VERSION) {
      console.warn('[storage] version mismatch: resetting storage');
      return null;
    }
    return fromSerializable(obj);
  } catch (e) {
    console.warn('[storage] load error -> reset storage:', e);
    return null;
  }
}

/** Clear storage */
export function clearLocal() {
  localStorage.removeItem(KEY);
}

/** Export JSON to a downloadable file */
export function exportJSON(state) {
  const serial = toSerializable(state);
  const blob = new Blob([JSON.stringify(serial, null, 2)], { type: 'application/json' });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `envuln-export-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

/**
 * Convert a JSON string previously exported back into runtime state.
 * The caller is responsible for assigning it to the live singleton.
 */
export function importJSON(jsonStr) {
  try {
    const obj = JSON.parse(jsonStr);
    return fromSerializable(obj);
  } catch (e) {
    console.warn('[storage] invalid import JSON', e);
    return null;
  }
}

/* ------------ Runtime → serial ------------ */

function toSerializable(state) {
  return {
    version: CURRENT_VERSION,
    attackers: state.attackers.map(a => ({
      id: a.id,
      name: a.name,
      entries: [...a.entries],
      exits:   [...a.exits]
    })),
    targets: state.targets.map(t => ({
      id: t.id,
      name: t.name,
      vulns: [...t.vulns],
      final: !!t.final
    })),
    vulns: state.vulns.map(v => ({ id: v.id, name: v.name })),
    edges: {
      direct:   setsToArrays(state.edges.direct),
      lateral:  setsToArrays(state.edges.lateral),
      contains: setsToArrays(state.edges.contains),
    }
  };
}

/* ------------ Serial → runtime ------------ */

function fromSerializable(obj) {
  if (!obj || typeof obj !== 'object') {
    console.warn('[storage] fromSerializable failed');
    return null;
  }

  const {
    attackers = [],
    targets = [],
    vulns = [],
    edges = {}
  } = obj;

  return {
    version: obj.version ?? CURRENT_VERSION,
    vulns: vulns.map(v => ({ id: v.id, name: v.name })),
    targets: targets.map(t => ({
      id: t.id,
      name: t.name,
      vulns: new Set(t.vulns || []),
      final: !!t.final
    })),
    attackers: attackers.map(a => ({
      id: a.id,
      name: a.name,
      entries: new Set(a.entries || []),
      exits:   new Set(a.exits   || [])
    })),
    edges: {
      direct:   arraysToSets(edges.direct   || {}),
      lateral:  arraysToSets(edges.lateral  || {}),
      contains: arraysToSets(edges.contains || {})
    }
  };
}

/* ------------ Helpers ------------ */

function setsToArrays(map) {
  const out = {};
  for (const k in map) {
    out[k] = [...(map[k] || [])];
  }
  return out;
}

function arraysToSets(map) {
  const out = {};
  for (const k in map) {
    out[k] = new Set(map[k] || []);
  }
  return out;
}
