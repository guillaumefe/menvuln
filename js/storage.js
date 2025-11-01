/**
 * storage.js
 * Handles saving/loading ENVULN application state to/from localStorage.
 * Pure: does not touch DOM. Does not modify State directly.
 * All transformations to/from persisted format are isolated here.
 */

const KEY = 'envuln-lite-store';
const CURRENT_VERSION = 4;

/* ------------ Public API ------------ */

/**
 * Serialize runtime State -> localStorage
 * @param {object} state The live application state singleton
 */
export function saveToLocal(state){
  try{
    localStorage.setItem(KEY, JSON.stringify(toSerializable(state)));
  }catch(e){
    console.warn('[storage] save error:', e);
  }
}

/**
 * Load from localStorage, convert to runtime state object.
 * @returns {object|null} stateOrNull
 */
export function loadFromLocal(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return null;

    const obj = JSON.parse(raw);
    if(!obj.version || obj.version !== CURRENT_VERSION){
      console.warn('[storage] version mismatch: resetting storage');
      return null;
    }
    return fromSerializable(obj);
  }catch(e){
    console.warn('[storage] load error -> reset storage:', e);
    return null;
  }
}

/** Clear storage completely */
export function clearLocal(){
  localStorage.removeItem(KEY);
}

/**
 * Export JSON as Blob for user download
 */
export function exportJSON(state){
  const serial = toSerializable(state);
  const blob = new Blob([JSON.stringify(serial, null, 2)], { type:'application/json' });
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `envuln-export-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),0);
}

/**
 * Import JSON file content -> runtime state object
 * (does NOT write State singleton; caller must assign & rerender)
 */
export function importJSON(jsonStr){
  try{
    const obj = JSON.parse(jsonStr);
    return fromSerializable(obj);
  }catch(e){
    console.warn('[storage] invalid import JSON', e);
    return null;
  }
}

/* ------------ Internal: runtime → serial ------------ */

function toSerializable(state){
  return {
    version: CURRENT_VERSION,
    attackers: state.attackers.map(a=>({
      id: a.id,
      name: a.name,
      entries: [...a.entries]
    })),
    targets: state.targets.map(t=>({
      id: t.id,
      name: t.name,
      vulns: [...t.vulns],
      final: !!t.final
    })),
    vulns: state.vulns.map(v=>({ id:v.id, name:v.name })),
    edges: {
      direct: setsToArrays(state.edges.direct),
      lateral: setsToArrays(state.edges.lateral),
      contains: setsToArrays(state.edges.contains),
    }
  };
}

/* ------------ Internal: serial → runtime ------------ */

function fromSerializable(obj){
  if(!obj || typeof obj !== 'object'){
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
    vulns: vulns.map(v => ({ id:v.id, name:v.name })),
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
    })),
    edges: {
      direct: arraysToSets(edges.direct || {}),
      lateral: arraysToSets(edges.lateral || {}),
      contains: arraysToSets(edges.contains || {})
    }
  };
}

/* ------------ Helpers ------------ */

function setsToArrays(map){
  const out = {};
  for(const k in map){
    out[k] = [...(map[k] || [])];
  }
  return out;
}
function arraysToSets(map){
  const out = {};
  for(const k in map){
    out[k] = new Set(map[k] || []);
  }
  return out;
}

