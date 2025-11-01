// Entry point for the ENVULN client-side app (mouse-driven simulation ready)

import { el, norm } from './helpers.js';
import * as StateMod from './state.js';
import { saveToLocal, loadFromLocal } from './storage.js';
import {
  renderAttackers,
  renderTargets,
  renderVulns,
  populateSelectors,
  hydrateEntriesSelect,
  renderLinksInspector,
  renderDetailsPanel,
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

/* ---------- Local runtime helpers ---------- */
let lastResults = [];
let lastMeta = { cycles: false, truncated: false };
let lastDiagramSVG = null;

function renderStatus(s){ const sEl = el('status'); if (sEl) sEl.textContent = s; }

function emitStateChanged() {
  try { saveToLocal(StateMod.State); } catch {}
  document.dispatchEvent(new CustomEvent('state:changed'));
}

/* ---------- Small DOM util for options ---------- */
function setOptions(selectEl, items, { getValue = x => x.id, getLabel = x => x.name, selected = new Set(), keepPrev = true } = {}){
  if(!selectEl) return;
  const prev = selectEl.value;
  const prevSelected = new Set([...(selectEl.selectedOptions || [])].map(o => o.value));
  selectEl.innerHTML = '';
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = String(getValue(item));
    opt.textContent = String(getLabel(item));
    if (selected.has(opt.value) || (keepPrev && prevSelected.has(opt.value))) opt.selected = true;
    selectEl.appendChild(opt);
  });
  if (keepPrev && prev && [...selectEl.options].some(o => o.value === prev)) {
    selectEl.value = prev;
  }
}

/* ---------- Life cycle: init ---------- */
async function init(){
  const loaded = loadFromLocal();
  if (loaded) {
    // backward/compat hydration
    if (typeof StateMod.hydrate === 'function') {
      StateMod.hydrate(loaded);
    } else {
      StateMod.State.version   = loaded.version || StateMod.State.version;
      StateMod.State.vulns     = loaded.vulns || [];
      StateMod.State.targets   = (loaded.targets || []).map(t => ({ id: t.id, name: t.name, vulns: new Set(t.vulns), final: !!t.final }));
      StateMod.State.attackers = (loaded.attackers || []).map(a => ({
        id: a.id, name: a.name,
        entries: new Set(a.entries),
        exits: new Set(a.exits || []) // tolerate absence in storage
      }));
      StateMod.State.edges = {
        direct:   convertEdge(loaded.edges?.direct),
        lateral:  convertEdge(loaded.edges?.lateral),
        contains: convertEdge(loaded.edges?.contains),
      };
    }
  }
  (StateMod.State.targets || []).forEach(t => StateMod.ensureEdgeMaps(t.id));

  renderAllUI();
  wireAddControls();    // “Add” buttons
  wireVulnAssoc();      // attach/detach vulnerabilities block
  wireLinksUI();        // links add/remove wiring
  wireUI();             // top buttons + simulation

  // initial “changed” so right panel & selectors hydrate
  document.dispatchEvent(new CustomEvent('state:changed'));
}

function convertEdge(obj){
  const out = {};
  if(!obj) return out;
  for(const k in obj) out[k] = new Set(obj[k] || []);
  return out;
}

/* ---------- Extra selectors population (new UI) ---------- */
function populateExtraSelectors(state = StateMod.State){
  // Attacker exit points
  const selExitsAll = el('selExitsAll');
  setOptions(selExitsAll, state.targets || []);

  // Vulnerability association block
  const selTargetAssoc = el('selTargetAssoc');
  const selVulnsAssoc  = el('selVulnsAssoc');
  setOptions(selTargetAssoc, state.targets || []);
  setOptions(selVulnsAssoc, state.vulns || []);
}

/* ---------- Hydrate exits multiselect from current attacker ---------- */
function hydrateExitsSelect(state = StateMod.State){
  const selAttacker = el('selAttacker');
  const selExitsAll = el('selExitsAll');
  if(!selAttacker || !selExitsAll) return;

  const attackerId = selAttacker.value;
  const attacker = (state.attackers || []).find(a => String(a.id) === String(attackerId));
  const selectedSet = new Set(
    attacker
      ? [...(attacker.exits instanceof Set ? attacker.exits : new Set(attacker.exits || []))].map(String)
      : []
  );

  [...selExitsAll.options].forEach(opt => {
    opt.selected = selectedSet.has(opt.value);
  });
}

/* ---------- Render all UI ---------- */
function renderAllUI(){
  renderAttackers(StateMod.State);
  renderTargets(StateMod.State);
  renderVulns(StateMod.State);
  populateSelectors(StateMod.State);  // lists.js (attacker, entries, link selectors)
  populateExtraSelectors(StateMod.State); // new selectors here
  hydrateEntriesSelect(StateMod.State);
  hydrateExitsSelect(StateMod.State);
  renderLinksInspector();
  renderDetailsPanel();
}

/* ---------- Add buttons wiring (left panel) ---------- */
function wireAddControls(){
  const attackerInput = el('attackerName');
  const attackerBtn   = el('btnAddAttacker');
  if (attackerBtn && attackerInput) {
    attackerBtn.onclick = () => {
      const name = norm(attackerInput.value);
      if (!name) return alert('Attacker name required');
      try {
        StateMod.createAttacker(name);
        attackerInput.value = '';
        emitStateChanged();
        renderAllUI();
      } catch (e) { alert(e.message || 'Failed to add attacker'); }
    };
  }

  const targetInput = el('targetName');
  const targetBtn   = el('btnAddTarget');
  if (targetBtn && targetInput) {
    targetBtn.onclick = () => {
      const name = norm(targetInput.value);
      if (!name) return alert('Target name required');
      try {
        const id = StateMod.createTarget(name, false);
        StateMod.ensureEdgeMaps(id);
        targetInput.value = '';
        emitStateChanged();
        renderAllUI();
      } catch (e) { alert(e.message || 'Failed to add target'); }
    };
  }

  const vulnInput = el('vulnName');
  const vulnBtn   = el('btnAddVuln');
  if (vulnBtn && vulnInput) {
    vulnBtn.onclick = () => {
      const name = norm(vulnInput.value);
      if (!name) return alert('Vulnerability name required');
      try {
        StateMod.createVuln(name);
        vulnInput.value = '';
        emitStateChanged();
        renderAllUI();
      } catch (e) { alert(e.message || 'Failed to add vulnerability'); }
    };
  }
}

/* ---------- Vulnerability association wiring ---------- */
function wireVulnAssoc(){
  const btnAttach = el('btnAttachVulns');
  const btnDetach = el('btnDetachVulns');

  if(btnAttach){
    btnAttach.onclick = () => {
      const targetId = el('selTargetAssoc')?.value;
      const vulnIds  = [...(el('selVulnsAssoc')?.selectedOptions || [])].map(o=>o.value);
      if(!targetId) return alert('Pick a target to attach vulnerabilities to.');
      if(!vulnIds.length) return alert('Pick one or more vulnerabilities.');
      try {
        vulnIds.forEach(vId => StateMod.toggleVulnOnTarget(targetId, vId, true));
        emitStateChanged();
        renderAllUI();
        const s = el('assocStatus'); if(s) s.textContent = `Attached ${vulnIds.length} vuln(s).`;
      } catch(e){
        alert(e.message || 'Attach failed');
      }
    };
  }

  if(btnDetach){
    btnDetach.onclick = () => {
      const targetId = el('selTargetAssoc')?.value;
      const vulnIds  = [...(el('selVulnsAssoc')?.selectedOptions || [])].map(o=>o.value);
      if(!targetId) return alert('Pick a target to detach vulnerabilities from.');
      if(!vulnIds.length) return alert('Pick one or more vulnerabilities.');
      try {
        vulnIds.forEach(vId => StateMod.toggleVulnOnTarget(targetId, vId, false));
        emitStateChanged();
        renderAllUI();
        const s = el('assocStatus'); if(s) s.textContent = `Detached ${vulnIds.length} vuln(s).`;
      } catch(e){
        alert(e.message || 'Detach failed');
      }
    };
  }

  // Keep exits & entries in sync when the attacker changes
  const selAttacker = el('selAttacker');
  if (selAttacker && !selAttacker._wiredForExits) {
    selAttacker.addEventListener('change', () => {
      hydrateEntriesSelect(StateMod.State);
      hydrateExitsSelect(StateMod.State);
    });
    selAttacker._wiredForExits = true;
  }

  // Persist entries multi-select
  const selEntriesAll = el('selEntriesAll');
  if (selEntriesAll && !selEntriesAll._wiredPersist) {
    selEntriesAll.addEventListener('change', () => {
      const attackerId = el('selAttacker')?.value;
      if(!attackerId) return;
      const picked = [...selEntriesAll.selectedOptions].map(o => o.value);
      StateMod.setAttackerEntries(attackerId, picked);
      emitStateChanged();
    });
    selEntriesAll._wiredPersist = true;
  }

  // Persist exits multi-select
  const selExitsAll = el('selExitsAll');
  if (selExitsAll && !selExitsAll._wiredPersist) {
    selExitsAll.addEventListener('change', () => {
      const attackerId = el('selAttacker')?.value;
      if(!attackerId) return;
      const picked = [...selExitsAll.selectedOptions].map(o => o.value);
      StateMod.setAttackerExits(attackerId, picked);
      emitStateChanged();
    });
    selExitsAll._wiredPersist = true;
  }
}

/* ---------- Results panel (center) ---------- */
function filterOnlyVuln(results){
  const only = el('chkOnlyVuln')?.checked;
  if(!only) return results;
  return results.filter(p => Array.isArray(p.vulnsPerNode) && p.vulnsPerNode.every(vs => vs && vs.length));
}

function renderResultsView(results, meta){
  const container = el('results');
  container.innerHTML = '';
  if(!results.length){
    container.innerHTML = `<div class="small">No paths.</div>`;
    renderStatus('0 paths');
    return;
  }
  results.forEach(p => {
    const row = document.createElement('div');
    row.className = 'path';
    const left = document.createElement('div');
    left.className = 'left';
    left.innerHTML = `
      <div><strong>${p.attackerName || p.attacker || ''}</strong></div>
      <div class="small">${p.nodes.map(n => n.name).join(' → ')}</div>
    `;
    const right = document.createElement('div');
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.textContent = 'Diagram';
    btn.onclick = () => {
      lastDiagramSVG = buildSVGForPath(p, StateMod.State);
      const box = el('diagramBox');
      if(box) box.innerHTML = lastDiagramSVG;
    };
    right.appendChild(btn);
    row.appendChild(left);
    row.appendChild(right);
    container.appendChild(row);
  });
  const bits = [`${results.length} paths`];
  if (meta?.cycles) bits.push('cycles detected');
  if (meta?.truncated) bits.push('truncated by ceiling');
  renderStatus(bits.join(' • '));
}

async function onComputePaths(){
  try{
    renderStatus('Computing…');
    const opts = {
      includeLateral: el('includeLateral')?.checked,
      includeContains: el('includeContains')?.checked
    };
    const maxPaths = parseInt(el('maxPaths')?.value || '2000', 10);

    // computeAllPaths returns { paths, cycles, truncated }
    const out = computeAllPaths(StateMod.State, opts, maxPaths);
    lastResults = out.paths || [];
    lastMeta = { cycles: !!out.cycles, truncated: !!out.truncated };

    renderResultsView(filterOnlyVuln(lastResults), lastMeta);
  }catch(e){
    console.error(e);
    alert('Path error');
  }
}

function onExportODS(){
  if (!lastResults.length) return alert('No paths to export.');
  exportODS(StateMod.State, { results: lastResults });
}

function onDownloadSVG(){
  if(!lastDiagramSVG) return alert('No diagram');
  const blob = new Blob([lastDiagramSVG], { type:'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `diagram.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- Top bar wiring ---------- */
function wireUI(){
  const btnFindPaths = el('btnFindPaths');
  if(btnFindPaths) btnFindPaths.onclick = onComputePaths;

  const btnExport = el('btnExportODS');
  if(btnExport) btnExport.onclick = onExportODS;

  const btnDownload = el('btnDownloadSVG');
  if(btnDownload) btnDownload.onclick = onDownloadSVG;

  const btnSimu = el('btnSimu');
  if(btnSimu){
    btnSimu.onclick = async () => {
      try{
        disableTopButtons(true);
        btnSimu.textContent = 'Simulating…';
        btnSimu.disabled = true;
        await runSimulation({ renderCallback: () => renderAllUI() });
      }finally{
        btnSimu.textContent = 'Simulation';
        btnSimu.disabled = false;
        enableTopButtons();
        renderAllUI();
      }
    };
  }

  const chkOnly = el('chkOnlyVuln');
  if (chkOnly) {
    chkOnly.addEventListener('change', () => {
      renderResultsView(filterOnlyVuln(lastResults), lastMeta);
    });
  }
}

window.__envuln_boot = { State: StateMod.State, computeAllPaths };
init();
