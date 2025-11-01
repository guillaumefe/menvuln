// js/main.js
// Main UI and app logic

import { el, norm } from './helpers.js';
import * as StateMod from './state.js';
import { saveToLocal, loadFromLocal } from './storage.js';
import {
  renderAttackers,
  renderTargets,
  renderVulns,
  populateSelectors,
  renderLinksInspector,
} from './ui/lists.js';
import { wireLinksUI } from './ui/links.js';
import { computeAllPaths } from './paths.js';
import { buildSVGForPath } from './diagram.js';
import { exportODS } from './exportODS.js';
import {
  runSimulation,
  disableTopButtons,
  enableTopButtons
} from './simulation/index.js';
import './simulation/scenarios.js';

let lastResults = [];
let lastMeta = { cycles: false, truncated: false };
let lastDiagramSVG = null;

function renderStatus(s){
  const sEl = el('status');
  if (sEl) sEl.textContent = s;
}

function emitStateChanged() {
  try { saveToLocal(StateMod.State); } catch {}
  renderAllUI();
}

function setOptions(selectEl, items, { getValue = x => x.id, getLabel = x => x.name, selectedSet = new Set() } = {}){
  if(!selectEl) return;
  const prev = selectEl.value;
  selectEl.innerHTML = '';
  (items || []).forEach(item => {
    const opt = document.createElement('option');
    opt.value = String(getValue(item));
    opt.textContent = getLabel(item);
    if (selectedSet.has(opt.value)) opt.selected = true;
    selectEl.appendChild(opt);
  });
  if (prev && [...selectEl.options].some(o => o.value === prev)){
    selectEl.value = prev;
  }
}

async function init(){
  const loaded = loadFromLocal();
  if (loaded) StateMod.hydrate(loaded);

  StateMod.State.targets.forEach(t => StateMod.ensureEdgeMaps(t.id));

  renderAllUI();
  wireAddControls();
  wireAttackerSelection();
  wireEntries();
  wireExits();
  wireVulns();
  wireLinksUI();
  wireTopActions();
}

function renderAllUI(){
  renderAttackers(StateMod.State);
  renderTargets(StateMod.State);
  renderVulns(StateMod.State);
  populateSelectors(StateMod.State);

  hydrateAttackerSelection();
  hydrateEntries();
  hydrateExits();
  hydrateVulnSelectors();

  renderLinksInspector();
}

function hydrateAttackerSelection(state = StateMod.State){
  setOptions(el('selAttacker'), state.attackers);
}

function hydrateEntries(state = StateMod.State){
  const selAtt = el('selAttacker');
  const sel = el('selEntriesAll');
  if (!selAtt || !sel) return;
  const attacker = state.attackers.find(a => a.id === selAtt.value);
  const selected = attacker ? new Set([...attacker.entries].map(String)) : new Set();
  setOptions(sel, state.targets, { selectedSet: selected });
}

function hydrateExits(state = StateMod.State){
  const selAtt = el('selAttacker');
  const sel = el('selExitsAll');
  if (!selAtt || !sel) return;
  const attacker = state.attackers.find(a => a.id === selAtt.value);
  const selected = attacker ? new Set([...attacker.exits].map(String)) : new Set();
  setOptions(sel, state.targets, { selectedSet: selected });
}

function hydrateVulnSelectors(state = StateMod.State){
  setOptions(el('selVulnElement'), state.targets);
  setOptions(el('selVulnsForElement'), state.vulns);
}

function wireAddControls(){
  el('btnAddAttacker').onclick = () => {
    const name = norm(el('attackerName').value);
    if (!name) return;
    StateMod.createAttacker(name);
    el('attackerName').value = '';
    emitStateChanged();
  };

  el('btnAddTarget').onclick = () => {
    const name = norm(el('targetName').value);
    if (!name) return;
    const id = StateMod.createTarget(name);
    StateMod.ensureEdgeMaps(id);
    el('targetName').value = '';
    emitStateChanged();
  };

  el('btnAddVuln').onclick = () => {
    const name = norm(el('vulnName').value);
    if (!name) return;
    StateMod.createVuln(name);
    el('vulnName').value = '';
    emitStateChanged();
  };
}

function wireAttackerSelection(){
  el('selAttacker').addEventListener('change', () => {
    hydrateEntries();
    hydrateExits();
  });
}

function wireEntries(){
  el('selEntriesAll').addEventListener('change', () => {
    const attId = el('selAttacker').value;
    const ids = [...el('selEntriesAll').selectedOptions].map(o => o.value);
    StateMod.setAttackerEntries(attId, ids);
    emitStateChanged();
  });
}

function wireExits(){
  el('selExitsAll').addEventListener('change', () => {
    const attId = el('selAttacker').value;
    const ids = [...el('selExitsAll').selectedOptions].map(o => o.value);
    StateMod.setAttackerExits(attId, ids);
    emitStateChanged();
  });
}

function wireVulns(){
  el('btnAttachVulns').onclick = () => {
    const targetId = el('selVulnElement').value;
    const vids = [...el('selVulnsForElement').selectedOptions].map(o => o.value);
    vids.forEach(v => StateMod.toggleVulnOnTarget(targetId, v, true));
    emitStateChanged();
  };

  el('btnDetachVulns').onclick = () => {
    const targetId = el('selVulnElement').value;
    const vids = [...el('selVulnsForElement').selectedOptions].map(o => o.value);
    vids.forEach(v => StateMod.toggleVulnOnTarget(targetId, v, false));
    emitStateChanged();
  };
}

function renderResults(results){
  const cont = el('results');
  cont.innerHTML = '';
  if(!results.length){
    cont.innerHTML = '<div class="small">No paths.</div>';
    return;
  }

  results.forEach(p => {
    const row = document.createElement('div');
    row.className = 'path';
    row.innerHTML = `
      <div><strong>${p.attackerName}</strong></div>
      <div class="small">${p.nodes.map(n=>n.name).join(' → ')}</div>
    `;
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.textContent = 'Diagram';
    btn.onclick = () => {
      lastDiagramSVG = buildSVGForPath(p, StateMod.State);
      el('diagramBox').innerHTML = lastDiagramSVG;
    };
    row.appendChild(btn);
    cont.appendChild(row);
  });
}

function wireTopActions(){
  el('btnFindPaths').onclick = () => {
    const opts = {
      includeLateral: el('includeLateral').checked,
      includeContains: el('includeContains').checked
    };
    const max = parseInt(el('maxPaths').value, 10);
    const out = computeAllPaths(StateMod.State, opts, max);
    lastResults = out.paths;
    lastMeta = out;
    renderResults(lastResults);
  };

  el('btnDownloadSVG').onclick = () => {
    if(!lastDiagramSVG) return;
    const blob = new Blob([lastDiagramSVG], { type:'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'diagram.svg';
    a.click();
  };
}

window.__envuln_boot = { State: StateMod.State, computeAllPaths };
init();
