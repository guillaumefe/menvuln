// js/paths.js
// Graph path enumeration for Menvuln

/**
 * Build a map id -> target object for quick lookups.
 */
function targetMap(state) {
  const m = Object.create(null);
  (state.targets || []).forEach(t => { m[t.id] = t; });
  return m;
}

export function nameOfTarget(state, id) {
  return (state.targets || []).find(t => t.id === id)?.name || String(id || '');
}

function outsFrom(map, id) {
  if (!map) return [];
  const s = map[id];
  if (!s) return [];
  return Array.isArray(s) ? s.slice() : Array.from(s);
}

/**
 * Return unique outgoing neighbors from a node, honoring the includeLateral / includeContains flags.
 */
export function adjacency(state, id, opts = { includeLateral: true, includeContains: true }) {
  const out = new Set();
  const e = state.edges || {};
  outsFrom(e.direct, id).forEach(x => out.add(x));
  if (opts.includeLateral) outsFrom(e.lateral, id).forEach(x => out.add(x));
  if (opts.includeContains) outsFrom(e.contains, id).forEach(x => out.add(x));
  return Array.from(out);
}

/**
 * Fast cycle check (DFS colors) honoring adjacency options.
 */
export function isDAG(state, opts = { includeLateral: true, includeContains: true }) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = Object.create(null);
  for (const t of (state.targets || [])) color[t.id] = WHITE;
  let hasCycle = false;

  function dfs(u) {
    color[u] = GRAY;
    const nexts = adjacency(state, u, opts);
    for (const v of nexts) {
      if (color[v] === GRAY) { hasCycle = true; return; }
      if (color[v] === WHITE) dfs(v);
      if (hasCycle) return;
    }
    color[u] = BLACK;
  }

  for (const t of (state.targets || [])) {
    if (color[t.id] === WHITE) dfs(t.id);
    if (hasCycle) break;
  }
  return !hasCycle;
}

/* -------- DAG enumeration (memoized). Do NOT stop on exits here. -------- */
function enumeratePaths_DAG_from(state, startId, memo, opts /* stopSet unused */) {
  if (memo.has(startId)) return memo.get(startId);

  const results = [];
  const nexts = adjacency(state, startId, opts);
  const t = (state.targets || []).find(x => x.id === startId);
  const isFinal = !!(t && t.final);

  // Stop only on: no outgoing edges OR explicit final node.
  if (nexts.length === 0 || isFinal) {
    results.push([startId]);
  } else {
    for (const v of nexts) {
      const subs = enumeratePaths_DAG_from(state, v, memo, opts);
      for (const sub of subs) {
        results.push([startId, ...sub]);
      }
    }
  }

  memo.set(startId, results);
  return results;
}

export function enumeratePaths_DAG(state, starts, opts, stopSet /* kept for API parity */) {
  const memo = new Map();
  let all = [];
  for (const s of starts) {
    const sub = enumeratePaths_DAG_from(state, s, memo, opts, stopSet);
    all = all.concat(sub);
  }
  return all;
}

/* -------- General graph (cycles allowed). Do NOT stop on exits here. -------- */
export function enumeratePaths_General(state, starts, opts, stopSet /* used later */, maxPaths = 5000) {
  const paths = [];
  let cycles = false;

  const adj = (id) => adjacency(state, id, opts);

  function dfs(u, visited, stack) {
    if (paths.length >= maxPaths) return;

    const t = (state.targets || []).find(x => x.id === u);
    const isFinal = !!(t && t.final);
    const nexts = adj(u);

    // If node is explicit final, record the path and stop.
    if (isFinal) {
      paths.push([...stack, u]);
      return;
    }

    // Split neighbors by visited status to keep paths simple.
    const unvisited = [];
    for (const v of nexts) {
      if (visited.has(v)) { cycles = true; continue; }
      unvisited.push(v);
    }

    // If there are no unvisited neighbors, this is a maximal simple path → record it.
    if (unvisited.length === 0) {
      paths.push([...stack, u]);
      return;
    }

    // Otherwise, continue DFS on each unvisited neighbor.
    visited.add(u);
    for (const v of unvisited) {
      if (paths.length >= maxPaths) break;
      dfs(v, visited, [...stack, u]);
    }
    visited.delete(u);
  }

  for (const s of starts) {
    dfs(s, new Set(), []);
    if (paths.length >= maxPaths) break;
  }

  return { paths, cycles };
}

/**
 * Compute all simple paths for a single attacker.
 * - Traversal does NOT stop on exits; exits are used only as an end-filter.
 * - Honors lateral/contains inclusion flags.
 * - Applies a per-attacker path ceiling in cyclic graphs.
 */
export function computePathsForAttacker(
  state,
  attackerId,
  opts = { includeLateral: true, includeContains: true },
  maxPaths = 5000
) {
  const attacker = (state.attackers || []).find(a => a.id === attackerId);
  if (!attacker) return { paths: [], cycles: false, truncated: false };

  const starts = Array.from(attacker.entries || []).map(String);
  if (starts.length === 0) return { paths: [], cycles: false, truncated: false };

  // Exits selected in the UI are treated as allowed END nodes (filtering step only).
  const exits = new Set(Array.from(attacker.exits || []).map(String));

  const dag = isDAG(state, opts);

  let nodePaths = [];
  let cycles = false;

  if (dag) {
    nodePaths = enumeratePaths_DAG(state, starts, opts, exits);
  } else {
    const out = enumeratePaths_General(state, starts, opts, exits, maxPaths);
    nodePaths = out.paths;
    cycles = out.cycles;
  }

  // Keep only those that end on an exit if exits were provided.
  if (exits.size > 0) {
    nodePaths = nodePaths.filter(path => exits.has(String(path[path.length - 1])));
  }

  const targetsById = targetMap(state);
  const normalized = nodePaths.map(nodes => ({
    attackerId: attacker.id,
    attackerName: attacker.name,
    nodes: nodes.map(id => targetsById[id]).filter(Boolean),
    vulnsPerNode: nodes.map(id => {
      const t = targetsById[id];
      if (!t) return [];
      const list = Array.isArray(t.vulns) ? t.vulns : Array.from(t.vulns || []);
      return list
        .map(vId => (state.vulns || []).find(x => x.id === vId)?.name || vId)
        .filter(Boolean);
    })
  }));

  const truncated = (!dag && nodePaths.length >= maxPaths);
  return { paths: normalized, cycles, truncated };
}

/**
 * Compute paths for all attackers, concatenated.
 */
export function computeAllPaths(
  state,
  opts = { includeLateral: true, includeContains: true },
  maxPathsPerAttacker = 5000
) {
  const all = [];
  let anyCycles = false;
  let anyTruncated = false;

  for (const a of (state.attackers || [])) {
    const out = computePathsForAttacker(state, a.id, opts, maxPathsPerAttacker);
    all.push(...out.paths);
    if (out.cycles) anyCycles = true;
    if (out.truncated) anyTruncated = true;
  }

  return { paths: all, cycles: anyCycles, truncated: anyTruncated };
}

