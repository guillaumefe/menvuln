// js/paths.js
// Pure graph path enumeration utilities for ENVULN (client-side).
// Exports:
//   adjacency(state, id, opts)
//   isDAG(state, opts)
//   enumeratePaths_DAG(state, starts, opts)
//   enumeratePaths_General(state, starts, opts, maxPaths)
//   computePathsForAttacker(state, attackerId, opts)
//   computeAllPaths(state, opts)

/**
 * @typedef {Object} State
 * @property {Array<{id:string,name:string,entries?:Array<string>}>} attackers
 * @property {Array<{id:string,name:string,vulns?:Set<string>,final?:boolean}>} targets
 * @property {Array<{id:string,name:string}>} vulns
 * @property {Object<string,Set<string>>} edges.direct
 * @property {Object<string,Set<string>>} edges.lateral
 * @property {Object<string,Set<string>>} edges.contains
 */

/**
 * Options for enumeration
 * @typedef {Object} Options
 * @property {boolean} includeLateral
 * @property {boolean} includeContains
 */

/* ------------------ helpers ------------------ */

/**
 * Return a map id -> target object (for quick lookup).
 * Non-mutating.
 * @param {State} state
 * @returns {Object<string, any>}
 */
function targetMap(state){
  const m = Object.create(null);
  (state.targets || []).forEach(t => { m[t.id] = t; });
  return m;
}

/**
 * Safe accessor for an edge-set map. Returns an array (may be empty).
 * @param {Object<string,Set<string>>} map
 * @param {string} id
 * @returns {Array<string>}
 */
function outsFrom(map, id){
  if(!map) return [];
  const s = map[id];
  if(!s) return [];
  return Array.from(s);
}

/* ------------------ adjacency ------------------ */

/**
 * Return outgoing neighbors of a node id according to options.
 * Does not mutate state.
 * @param {State} state
 * @param {string} id
 * @param {Options} opts
 * @returns {Array<string>}
 */
export function adjacency(state, id, opts = { includeLateral: true, includeContains: true }){
  const out = new Set();
  const e = state.edges || {};
  outsFrom(e.direct, id).forEach(x => out.add(x));
  if(opts.includeLateral) outsFrom(e.lateral, id).forEach(x => out.add(x));
  if(opts.includeContains) outsFrom(e.contains, id).forEach(x => out.add(x));
  return Array.from(out);
}

/* ------------------ DAG detection ------------------ */

/**
 * Detect whether the directed graph (under opts) is acyclic (a DAG).
 * Uses DFS with 3-color marking. Pure (read-only).
 * @param {State} state
 * @param {Options} opts
 * @returns {boolean} true if DAG (no back-edge found)
 */
export function isDAG(state, opts = { includeLateral: true, includeContains: true }){
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = Object.create(null);
  for(const t of (state.targets || [])) color[t.id] = WHITE;
  let hasCycle = false;

  function dfs(u){
    color[u] = GRAY;
    const neigh = adjacency(state, u, opts);
    for(const v of neigh){
      if(color[v] === GRAY){
        hasCycle = true;
        return;
      }
      if(color[v] === WHITE) dfs(v);
      if(hasCycle) return;
    }
    color[u] = BLACK;
  }

  for(const t of (state.targets || [])){
    if(color[t.id] === WHITE) dfs(t.id);
    if(hasCycle) break;
  }
  return !hasCycle;
}

/* ------------------ DAG enumeration (memoized) ------------------ */

/**
 * Enumerate all simple paths from a starting node in a DAG.
 * Memoization avoids exponential re-work.
 * Returns array of arrays of target ids (each path is a sequence of ids).
 *
 * @param {State} state
 * @param {string} startId
 * @param {Map<string, Array<Array<string>>>} memo
 * @param {Options} opts
 * @returns {Array<Array<string>>}
 */
function enumeratePaths_DAG_from(state, startId, memo, opts){
  if(memo.has(startId)) return memo.get(startId);

  const results = [];
  const outs = adjacency(state, startId, opts);
  const t = (state.targets || []).find(x => x.id === startId);
  const isFinal = !!(t && t.final);

  // If no outgoing neighbors or this node is final, path can end here
  if(outs.length === 0 || isFinal){
    results.push([startId]);
  }

  for(const v of outs){
    const subs = enumeratePaths_DAG_from(state, v, memo, opts);
    for(const sub of subs){
      // concatenate
      results.push([startId, ...sub]);
    }
  }

  memo.set(startId, results);
  return results;
}

/**
 * Enumerate all paths from multiple start nodes in a DAG.
 * @param {State} state
 * @param {Array<string>} starts
 * @param {Options} opts
 * @returns {Array<Array<string>>}
 */
export function enumeratePaths_DAG(state, starts, opts){
  const memo = new Map();
  let all = [];
  for(const s of starts){
    const sub = enumeratePaths_DAG_from(state, s, memo, opts);
    all = all.concat(sub);
  }
  return all;
}

/* ------------------ General graph enumeration (DFS, pruning) ------------------ */

/**
 * Enumerate simple paths (no repeated nodes in a path) from a set of starts.
 * Stops when maxPaths is reached. Detects cycles encountered (returns cycles flag).
 *
 * @param {State} state
 * @param {Array<string>} starts
 * @param {Options} opts
 * @param {number} maxPaths
 * @returns {{ paths: Array<Array<string>>, cycles: boolean }}
 */
export function enumeratePaths_General(state, starts, opts, maxPaths = 5000){
  const paths = [];
  let cycles = false;

  const adj = (id) => adjacency(state, id, opts);

  function dfs(u, visited, stack){
    if(paths.length >= maxPaths) return;
    const t = (state.targets || []).find(x => x.id === u);
    const isFinal = !!(t && t.final);
    const outs = adj(u);

    if(outs.length === 0 || isFinal){
      paths.push([...stack, u]);
      return;
    }

    visited.add(u);
    for(const v of outs){
      if(visited.has(v)){
        cycles = true;
        continue; // skip to avoid infinite loop
      }
      dfs(v, visited, [...stack, u]);
      if(paths.length >= maxPaths) break;
    }
    visited.delete(u);
  }

  for(const s of starts){
    dfs(s, new Set(), []);
    if(paths.length >= maxPaths) break;
  }

  return { paths, cycles };
}

/* ------------------ Public compute functions ------------------ */

/**
 * Compute paths (in normalized object form) for a single attacker.
 * Returns:
 *   { paths: Array<{ attackerId, attackerName, nodes:Array<targetObj>, vulnsPerNode:Array<Array<string>> }>, cycles: boolean, truncated: boolean }
 *
 * This function is pure w.r.t. state (does not mutate).
 *
 * @param {State} state
 * @param {string} attackerId
 * @param {Options} opts
 * @param {number} maxPaths
 */
export function computePathsForAttacker(state, attackerId, opts = { includeLateral: true, includeContains: true }, maxPaths = 5000){
  const attacker = (state.attackers || []).find(a => a.id === attackerId);
  if(!attacker) return { paths: [], cycles: false, truncated: false };

  const starts = Array.from(attacker.entries || []);
  if(starts.length === 0) return { paths: [], cycles: false, truncated: false };

  const dag = isDAG(state, opts);

  let pathNodeArrays = [];
  let cycles = false;

  if(dag){
    pathNodeArrays = enumeratePaths_DAG(state, starts, opts);
  } else {
    const out = enumeratePaths_General(state, starts, opts, maxPaths);
    pathNodeArrays = out.paths;
    cycles = out.cycles;
  }

  const targetsById = targetMap(state);
  const normalized = pathNodeArrays.map(nodes => {
    const nodeObjs = nodes.map(id => targetsById[id]).filter(Boolean);
    const vulnsPerNode = nodes.map(id => {
      const t = targetsById[id];
      if(!t) return [];
      // t.vulns might be a Set or Array depending on storage; normalize
      if(Array.isArray(t.vulns)) return t.vulns.map(vId => {
        const v = (state.vulns || []).find(x => x.id === vId);
        return v ? v.name : vId;
      }).filter(Boolean);
      if(t.vulns && typeof t.vulns.has === 'function') {
        return [...t.vulns].map(vId => {
          const v = (state.vulns || []).find(x => x.id === vId);
          return v ? v.name : vId;
        }).filter(Boolean);
      }
      return [];
    });

    return {
      attackerId: attacker.id,
      attackerName: attacker.name,
      nodes: nodeObjs,
      vulnsPerNode
    };
  });

  const truncated = (!dag && pathNodeArrays.length >= maxPaths);
  return { paths: normalized, cycles, truncated };
}

/**
 * Compute all paths for all attackers (flattened).
 * Returns array of normalized path objects (see computePathsForAttacker).
 *
 * @param {State} state
 * @param {Options} opts
 * @param {number} maxPathsPerAttacker
 * @returns {{ paths: Array, cycles: boolean, truncated: boolean }}
 */
export function computeAllPaths(state, opts = { includeLateral: true, includeContains: true }, maxPathsPerAttacker = 5000){
  const all = [];
  let anyCycles = false;
  let anyTruncated = false;

  for(const a of (state.attackers || [])){
    const out = computePathsForAttacker(state, a.id, opts, maxPathsPerAttacker);
    all.push(...out.paths);
    if(out.cycles) anyCycles = true;
    if(out.truncated) anyTruncated = true;
  }

  return { paths: all, cycles: anyCycles, truncated: anyTruncated };
}

/* ------------------ end of paths.js ------------------ */
