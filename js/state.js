// js/state.js
// Global application state

import { uid } from './helpers.js';

export const State = {
  version: 4,
  attackers: [],   // { id, name, entries:Set<targetId>, exits:Set<targetId> }
  targets: [],     // { id, name, vulns:Set<vulnId>, final:boolean }
  vulns: [],       // { id, name }
  edges: {
    direct: {},
    lateral: {},
    contains: {}
  }
};

export function ensureEdgeMaps(id){
  State.edges.direct[id]   = State.edges.direct[id]   || new Set();
  State.edges.lateral[id]  = State.edges.lateral[id]  || new Set();
  State.edges.contains[id] = State.edges.contains[id] || new Set();
}

function uniqueNameExists(list, name){
  return list.some(x => x.name.trim().toLowerCase() === name.trim().toLowerCase());
}

export function createAttacker(name){
  name = name.trim();
  if(!name) throw new Error('Attacker name required');
  if(uniqueNameExists(State.attackers, name)) throw new Error('Attacker already exists');
  const id = uid();
  State.attackers.push({ id, name, entries:new Set(), exits:new Set() });
  return id;
}

export function renameAttacker(id, newName){
  const a = State.attackers.find(x=>x.id===id);
  if(!a) throw new Error('Unknown attacker');
  newName = newName.trim();
  if(!newName) throw new Error('Invalid name');
  if(uniqueNameExists(State.attackers,newName) && a.name.toLowerCase()!==newName.toLowerCase())
    throw new Error('Name already in use');
  a.name = newName;
}

export function deleteAttacker(id){
  State.attackers = State.attackers.filter(a=>a.id!==id);
}

export function createTarget(name, isFinal=false){
  name = name.trim();
  if(!name) throw new Error('Target name required');
  if(uniqueNameExists(State.targets,name)) throw new Error('Target already exists');
  const id = uid();
  State.targets.push({ id, name, vulns:new Set(), final:!!isFinal });
  ensureEdgeMaps(id);
  return id;
}

export function renameTarget(id, newName){
  const t = State.targets.find(x=>x.id===id);
  if(!t) throw new Error('Unknown target');
  newName = newName.trim();
  if(!newName) throw new Error('Invalid name');
  if(uniqueNameExists(State.targets,newName) && t.name.toLowerCase()!==newName.toLowerCase())
    throw new Error('Name already in use');
  t.name = newName;
}

export function setTargetFinal(id, val){
  const t = State.targets.find(x=>x.id===id);
  if(!t) throw new Error('Unknown target');
  t.final = !!val;
}

export function deleteTarget(id){
  State.targets = State.targets.filter(t=>t.id!==id);
  for(const m of Object.values(State.edges)){
    delete m[id];
    for(const k in m) m[k].delete(id);
  }
  State.attackers.forEach(a => {
    a.entries?.delete(id);
    a.exits?.delete(id);
  });
}

export function createVuln(name){
  name = name.trim();
  if(!name) throw new Error('Vulnerability name required');
  if(uniqueNameExists(State.vulns,name)) throw new Error('Vulnerability already exists');
  const id = uid();
  State.vulns.push({ id, name });
  return id;
}

export function deleteVuln(id){
  State.vulns = State.vulns.filter(v=>v.id!==id);
  State.targets.forEach(t => t.vulns.delete(id));
}

export function toggleVulnOnTarget(targetId, vulnId, enable){
  const t = State.targets.find(x=>x.id===targetId);
  if(!t) throw new Error('Unknown target');
  if(!(t.vulns instanceof Set)) t.vulns = new Set(t.vulns || []);
  if(enable) t.vulns.add(vulnId); else t.vulns.delete(vulnId);
}

export function setAttackerEntries(attackerId, entryIds){
  const a = State.attackers.find(x=>x.id===attackerId);
  if(!a) throw new Error('Unknown attacker');
  a.entries = new Set(entryIds);
}

export function setAttackerExits(attackerId, exitIds){
  const a = State.attackers.find(x=>x.id===attackerId);
  if(!a) throw new Error('Unknown attacker');
  a.exits = new Set(exitIds);
}

export function addEdge(type, fromId, toId){
  if(!State.edges[type]) throw new Error('Invalid edge type');
  ensureEdgeMaps(fromId);
  State.edges[type][fromId].add(toId);
}

export function removeEdge(type, fromId, toId){
  if(!State.edges[type]) return;
  if(State.edges[type][fromId]) State.edges[type][fromId].delete(toId);
}

export const getAttackers = ()=> State.attackers;
export const getTargets   = ()=> State.targets;
export const getVulns     = ()=> State.vulns;

export function getTargetName(id){
  return (State.targets.find(t=>t.id===id)?.name) || '?';
}

if(typeof window !== 'undefined'){
  window.State = State;
}
