// js/paths.js
// Graph path enumeration for ENVULN

/**
 * Return a map id -> target
 */
function targetMap(state){
  const m = Object.create(null);
  (state.targets || []).forEach(t => { m[t.id] = t; });
  return m;
}

export function nameOfTarget(state, id){
  return (state.targets || []).find(t => t.id === id)?.name || String(id || '');
}

function outsFrom(map, id){
  if(!map) return [];
  const s = map[id];
  if(!s) return [];
  return Array.isArray(s) ? s.slice() : Array.from(s);
}

export function adjacency(state, id, opts = { includeLateral: true, includeContains: true }){
  const out = new Set();
  const e = state.edges || {};
  outsFrom(e.direct, id).forEach(x => out.add(x));
  if(opts.includeLateral) outsFrom(e.lateral, id).forEach(x => out.add(x));
  if(opts.includeContains) outsFrom(e.contains, id).forEach(x => out.add(x));
  return Array.from(out);
}

export function isDAG(state, opts = { includeLateral: true, includeContains: true }){
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = Object.create(null);
  for(const t of (state.targets || [])) color[t.id] = WHITE;
  let hasCycle = false;

  function dfs(u){
    color[u] = GRAY;
    const nexts = adjacency(state, u, opts);
    for(const v of nexts){
      if(color[v] === GRAY){ hasCycle = true; return; }
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

function enumeratePaths_DAG_from(state, startId, memo, opts){
  if(memo.has(startId)) return memo.get(startId);

  const results = [];
  const nexts = adjacency(state, startId, opts);
  const t = (state.targets || []).find(x => x.id === startId);
  const isFinal = !!(t && t.final);

  if(nexts.length === 0 || isFinal){
    results.push([startId]);
  }

  for(const v of nexts){
    const subs = enumeratePaths_DAG_from(state, v, memo, opts);
    for(const sub of subs){
      results.push([startId, ...sub]);
    }
  }

  memo.set(startId, results);
  return results;
}

export function enumeratePaths_DAG(state, starts, opts){
  const memo = new Map();
  let all = [];
  for(const s of starts){
    const sub = enumeratePaths_DAG_from(state, s, memo, opts);
    all = all.concat(sub);
  }
  return all;
}

export function enumeratePaths_General(state, starts, opts, maxPaths = 5000){
  const paths = [];
  let cycles = false;

  const adj = (id) => adjacency(state, id, opts);

  function dfs(u, visited, stack){
    if(paths.length >= maxPaths) return;
    const t = (state.targets || []).find(x => x.id === u);
    const isFinal = !!(t && t.final);
    const nexts = adj(u);

    if(nexts.length === 0 || isFinal){
      paths.push([...stack, u]);
      return;
    }

    visited.add(u);
    for(const v of nexts){
      if(visited.has(v)){ cycles = true; continue; }
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

export function computePathsForAttacker(
  state,
  attackerId,
  opts = { includeLateral: true, includeContains: true },
  maxPaths = 5000
){
  const attacker = (state.attackers || []).find(a => a.id === attackerId);
  if(!attacker) return { paths: [], cycles: false, truncated: false };

  const starts = Array.from(attacker.entries || []);
  if(starts.length === 0) return { paths: [], cycles: false, truncated: false };

  const dag = isDAG(state, opts);

  let nodePaths = [];
  let cycles = false;

  if(dag){
    nodePaths = enumeratePaths_DAG(state, starts, opts);
  } else {
    const out = enumeratePaths_General(state, starts, opts, maxPaths);
    nodePaths = out.paths;
    cycles = out.cycles;
  }

  const exits = new Set(Array.from(attacker.exits || []).map(String));
  if(exits.size > 0){
    nodePaths = nodePaths.filter(path => exits.has(path[path.length - 1]));
  }

  const targetsById = targetMap(state);
  const normalized = nodePaths.map(nodes => {
    return {
      attackerId: attacker.id,
      attackerName: attacker.name,
      nodes: nodes.map(id => targetsById[id]).filter(Boolean),
      vulnsPerNode: nodes.map(id => {
        const t = targetsById[id];
        if(!t) return [];
        const list = Array.isArray(t.vulns) ? t.vulns : Array.from(t.vulns || []);
        return list.map(vId => {
          const v = (state.vulns || []).find(x => x.id === vId);
          return v ? v.name : vId;
        }).filter(Boolean);
      })
    };
  });

  const truncated = (!dag && nodePaths.length >= maxPaths);
  return { paths: normalized, cycles, truncated };
}

export function computeAllPaths(
  state,
  opts = { includeLateral: true, includeContains: true },
  maxPathsPerAttacker = 5000
){
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
