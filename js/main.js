// Entry point for ENVULN adapted to latest UI layout (no legacy selectors)

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

// Simulation (mouse-driven)
import {
  runSimulation,
  disableTopButtons,
  enableTopButtons
} from './simulation/index.js';

// Ensure scenarios are registered
import './simulation/scenarios.js';

/* -------------------------------------------------- */
let lastResults = [];
let lastMeta = { cycles: false, truncated: false };
let lastDiagramSVG = null;

/* Status display */
function renderStatus(s){
  const sEl = el('status');
  if (sEl) sEl.textContent = s;
}

function emitStateChanged() {
  try { saveToLocal(StateMod.State); } catch {}
  renderAllUI();
}

/* Option builder */
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

/* -------------------------------------------------- */
/* INITIALIZATION */
async function init(){
  const loaded = loadFromLocal();
  if (loaded) StateMod.hydrate(loaded);

  StateMod.State.targets.forEach(t => StateMod.ensureEdgeMaps(t.id));

  renderAllUI();
  wireAddControls();
  wireAttackerSelection();
  wireEntries();
  wireExits();
  wireVulnAssociations();
  wireLinksUI();
  wireTopActions();

  document.dispatchEvent(new CustomEvent('state:changed'));
}

/* -------------------------------------------------- */
/* UI REFRESH */
function renderAllUI(){
  renderAttackers(StateMod.State);
  renderTargets(StateMod.State);
  renderVulns(StateMod.State);

  populateSelectors(StateMod.State); // fills attacker + all target selectors for links

  hydrateAttackerSelectors();
  hydrateEntries();
  hydrateExits();
  hydrateVulnElementsSelectors();

  renderLinksInspector();
}

/* ---------- Attacker selection (center top) ---------- */
function hydrateAttackerSelectors(state = StateMod.State){
  const selAtt = el('selAttacker');
  setOptions(selAtt, state.attackers || []);
}

/* ---------- Entries ---------- */
function hydrateEntries(state = StateMod.State){
  const selAtt = el('selAttacker');
  const sel = el('selEntriesAll');
  if (!selAtt || !sel) return;

  const att = state.attackers.find(a => String(a.id) === selAtt.value);
  const selected = att ? new Set([...att.entries].map(String)) : new Set();

  setOptions(sel, state.targets, { selectedSet: selected });
}

/* ---------- Exits ---------- */
function hydrateExits(state = StateMod.State){
  const selAtt = el('selAttacker');
  const sel = el('selExitsAll');
  if (!selAtt || !sel) return;

  const att = state.attackers.find(a => String(a.id) === selAtt.value);
  const selected = att ? new Set([...att.exits].map(String)) : new Set();

  setOptions(sel, state.targets, { selectedSet: selected });
}

/* ---------- Vulnerability associations ---------- */
function hydrateVulnElementsSelectors(state = StateMod.State){
  setOptions(el('selVulnElement'), state.targets);
  setOptions(el('selVulnsForElement'), state.vulns);
}

/* -------------------------------------------------- */
/* WIRING */
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
    const id = StateMod.createTarget(name, false);
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

/* Attacker selector */
function wireAttackerSelection(){
  const sel = el('selAttacker');
  if (sel) sel.addEventListener('change', () => {
    hydrateEntries();
    hydrateExits();
  });
}

/* Entry points */
function wireEntries(){
  const sel = el('selEntriesAll');
  if (sel) sel.addEventListener('change', () => {
    const attId = el('selAttacker').value;
    const ids = [...sel.selectedOptions].map(o => o.value);
    StateMod.setAttackerEntries(attId, ids);
    emitStateChanged();
  });
}

/* Exit points */
function wireExits(){
  const sel = el('selExitsAll');
  if (sel) sel.addEventListener('change', () => {
    const attId = el('selAttacker').value;
    const ids = [...sel.selectedOptions].map(o => o.value);
    StateMod.setAttackerExits(attId, ids);
    emitStateChanged();
  });
}

/* Vulnerabilities */
function wireVulnAssociations(){
  el('btnAttachVulns').onclick = () => {
    const tid = el('selVulnElement').value;
    const vids = [...el('selVulnsForElement').selectedOptions].map(o => o.value);
    if (!tid || !vids.length) return;

    vids.forEach(v => StateMod.toggleVulnOnTarget(tid, v, true));
    emitStateChanged();
  };

  el('btnDetachVulns').onclick = () => {
    const tid = el('selVulnElement').value;
    const vids = [...el('selVulnsForElement').selectedOptions].map(o => o.value);
    if (!tid || !vids.length) return;

    vids.forEach(v => StateMod.toggleVulnOnTarget(tid, v, false));
    emitStateChanged();
  };
}

/* -------------------------------------------------- */
/* PATH FINDING + EXPORT + DIAGRAM */
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

/* -------------------------------------------------- */
init();
