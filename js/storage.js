/**
 * storage.js
 * Save and load application state to/from localStorage.
 * Converts runtime structures (Sets) to plain arrays for persistence.
 */

const KEY = 'menvuln-lite-store';
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
  a.download = `menvuln-export-${ts}.json`;
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

/* ---------------------------
   Selective JSON export/import
   --------------------------- */

/* Build a serializable object that contains only requested domains.
   domains: Set or Array of strings: 'attackers', 'targets', 'vulns', 'edges'
   Returns a plain object ready to JSON.stringify.
*/
export function toSerializableSelective(state, domains = []) {
  const want = new Set(Array.isArray(domains) ? domains : Array.from(domains || []));
  const serial = { version: CURRENT_VERSION };

  if (want.has('vulns') || want.has('all')) {
    serial.vulns = state.vulns.map(v => ({ id: v.id, name: v.name }));
  } else {
    serial.vulns = [];
  }

  if (want.has('targets') || want.has('all')) {
    serial.targets = state.targets.map(t => ({
      id: t.id,
      name: t.name,
      vulns: [...(t.vulns || [])],
      final: !!t.final
    }));
  } else {
    serial.targets = [];
  }

  if (want.has('attackers') || want.has('all')) {
    serial.attackers = state.attackers.map(a => ({
      id: a.id,
      name: a.name,
      entries: [...(a.entries || [])],
      exits:   [...(a.exits   || [])]
    }));
  } else {
    serial.attackers = [];
  }

  // Always export edges if targets included (otherwise empty)
  if (want.has('edges') || want.has('targets') || want.has('all')) {
    const setsToArraysLocal = (map) => {
      const out = {};
      Object.keys(map || {}).forEach(k => {
        const v = map[k];
        out[k] = Array.isArray(v) ? v.slice() : Array.from(v || []);
      });
      return out;
    };
    serial.edges = {
      direct:   setsToArraysLocal(state.edges.direct),
      lateral:  setsToArraysLocal(state.edges.lateral),
      contains: setsToArraysLocal(state.edges.contains)
    };
  } else {
    serial.edges = { direct:{}, lateral:{}, contains:{} };
  }

  return serial;
}

/**
 * Download a selective JSON file.
 * domains: array of domain keys to include (attackers, targets, vulns, edges, or 'all')
 */
export function exportJSONSelective(state, domains = ['all']) {
  const serial = toSerializableSelective(state, domains);
  const blob = new Blob([JSON.stringify(serial, null, 2)], { type: 'application/json' });
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `menvuln-export-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

/**
 * Parse a JSON string and return a partial serial object that contains only
 * the domains available in the file and optionally filtered by requested domains.
 * requestedDomains: array of 'attackers'|'targets'|'vulns'|'edges'|'all'
 * Returns { ok:true, payload: {version, attackers, targets, vulns, edges} } or { ok:false, error:.. }
 */
export function parseImportJSONPartial(jsonStr, requestedDomains = ['all']) {
  try {
    const obj = JSON.parse(jsonStr);
    if (!obj || typeof obj !== 'object') return { ok:false, error: 'invalid json' };
    const want = new Set(Array.isArray(requestedDomains) ? requestedDomains : [requestedDomains]);

    const pick = (key) => {
      if (want.has('all') || want.has(key)) {
        return Array.isArray(obj[key]) ? obj[key] : [];
      }
      return [];
    };

    // edges may be absent → normalize
    const rawEdges = obj.edges || {};
    const normalizeEdges = (m) => {
      const out = {};
      if (!m || typeof m !== 'object') return { direct:{}, lateral:{}, contains:{} };
      out.direct = m.direct || {};
      out.lateral = m.lateral || {};
      out.contains = m.contains || {};
      return out;
    };

    const payload = {
      version: typeof obj.version === 'number' ? obj.version : CURRENT_VERSION,
      attackers: pick('attackers'),
      targets: pick('targets'),
      vulns: pick('vulns'),
      edges: normalizeEdges(rawEdges)
    };

    return { ok:true, payload };
  } catch (e) {
    return { ok:false, error: e?.message || String(e) };
  }
}

