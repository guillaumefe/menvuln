// js/main.js
// Entry point for the ENVULN client-side modular app.

import { el, norm } from './helpers.js';
import * as StateMod from './state.js';
import {
  saveToLocal,
  loadFromLocal,
  exportJSON,
  importJSON
} from './storage.js';
import {
  renderAttackers,
  renderTargets,
  renderVulns,
  populateSelectors,
  hydrateEntriesSelect,
  renderLinksInspector,
  renderDetailsPanel,
} from './ui/lists.js';
import { computeAllPaths } from './paths.js';
import { buildSVGForPath } from './diagram.js';
import { exportODS } from './exportODS.js';

// extra initializers
import { initEditors } from './ui/editors.js';
import { wireLinksUI, populateLinkSelectors } from './ui/links.js';
import { initResultsPanel } from './ui/results.js';

// State helpers
import {
  createAttacker,
  createTarget,
  createVuln,
  setAttackerEntries,
} from './state.js';

// Simulation
import {
  runSimulation,
  disableTopButtons,
  enableTopButtons
} from './simulation/index.js';

/* ---------- Local runtime helpers ---------- */
let lastResults = [];
let lastMeta = { cycles: false, truncated: false };
let lastDiagramSVG = null;

function renderStatus(s){
  const sEl = el('status');
  if (sEl) sEl.textContent = s || '—';
}

function convertEdge(obj){
  const out = {};
  if(!obj) return out;
  for(const k in obj) out[k] = new Set(obj[k] || []);
  return out;
}

/* ---------- Life cycle: init ---------- */
async function init(){
  // rehydrate from storage
  const loaded = loadFromLocal();
  if (loaded) {
    if (typeof StateMod.hydrate === 'function') {
      StateMod.hydrate(loaded);
    } else {
      StateMod.State.version = loaded.version || StateMod.State.version;
      StateMod.State.vulns = loaded.vulns || [];
      StateMod.State.targets = (loaded.targets || []).map(t => ({ id: t.id, name: t.name, vulns: new Set(t.vulns), final: !!t.final }));
      StateMod.State.attackers = (loaded.attackers || []).map(a => ({ id: a.id, name: a.name, entries: new Set(a.entries) }));
      StateMod.State.edges = {
        direct: convertEdge(loaded.edges?.direct),
        lateral: convertEdge(loaded.edges?.lateral),
        contains: convertEdge(loaded.edges?.contains),
      };
    }
  }
  (StateMod.State.targets || []).forEach(t => StateMod.ensureEdgeMaps(t.id));

  renderAllUI();

  // wire sub-uis
  initEditors();
  wireLinksUI();
  initResultsPanel();
  populateLinkSelectors();

  wireUI();
  renderStatus('Ready');
}

function renderAllUI(){
  renderAttackers(StateMod.State);
  renderTargets(StateMod.State);
  renderVulns(StateMod.State);
  populateSelectors(StateMod.State);
  hydrateEntriesSelect();
  renderLinksInspector();
  renderDetailsPanel();
}

/* ---------- Results rendering helpers ---------- */
function filterOnlyVuln(results){
  const only = el('chkOnlyVuln')?.checked;
  if(!only) return results;
  return results.filter(p => Array.isArray(p.vulnsPerNode) && p.vulnsPerNode.every(v => v.length > 0));
}

function renderResultsView(results, meta){
  const container = el('results');
  if (!container) return;

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

    const attackerLabel = p.attackerName || p.attacker || p.attackerId || '—';
    const chain = (p.nodes || []).map(n => n.name).join(' → ');

    left.innerHTML = `
      <div><strong>${attackerLabel}</strong></div>
      <div class="small">${chain}</div>
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

  renderStatus(`${results.length} paths${meta.cycles ? ' (cycles detected)' : ''}${meta.truncated ? ' (truncated)' : ''}`);
}

/* ---------- Actions ---------- */
async function onComputePaths(){
  try{
    renderStatus('Computing…');
    const includeLateral  = !!el('includeLateral')?.checked;
    const includeContains = !!el('includeContains')?.checked;
    const maxPaths        = parseInt(el('maxPaths')?.value || '2000', 10);

    const out = computeAllPaths(StateMod.State, { includeLateral, includeContains }, maxPaths);
    lastResults = out.paths || [];
    lastMeta = { cycles: !!out.cycles, truncated: !!out.truncated };

    renderResultsView(filterOnlyVuln(lastResults), lastMeta);
  }catch(e){
    console.error(e);
    alert('Path error');
    renderStatus('Error');
  }
}

function onExportODS(){ exportODS(lastResults, { state: StateMod.State }); }

function onDownloadSVG(){
  if(!lastDiagramSVG) return alert('No diagram');
  const blob = new Blob([lastDiagramSVG], { type:'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `diagram.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function onExportJSON(){
  exportJSON(StateMod.State);
}

function onImportJSONFile(ev){
  const file = ev.target?.files?.[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const st = importJSON(String(reader.result || ''));
    if(!st) return alert('Invalid JSON.');
    // Rehydrate into live State
    if (typeof StateMod.hydrate === 'function') {
      StateMod.hydrate(st);
    } else {
      StateMod.State.version = st.version || StateMod.State.version;
      StateMod.State.vulns   = st.vulns || [];
      StateMod.State.targets = (st.targets || []).map(t => ({ id:t.id, name:t.name, vulns:new Set(t.vulns), final:!!t.final }));
      StateMod.State.attackers = (st.attackers || []).map(a => ({ id:a.id, name:a.name, entries:new Set(a.entries) }));
      StateMod.State.edges = {
        direct: convertEdge(st.edges?.direct),
        lateral: convertEdge(st.edges?.lateral),
        contains: convertEdge(st.edges?.contains)
      };
    }
    saveToLocal(StateMod.State);
    renderAllUI();
    renderStatus('Imported JSON');
  };
  reader.readAsText(file);
}

/* ---------- NEW: wire the left panel "Add" buttons ---------- */
function wireCreationButtons(){
  // Attacker
  const attackerInput = el('attackerName');
  const btnAddAttacker = el('btnAddAttacker');
  if (btnAddAttacker) {
    btnAddAttacker.onclick = () => {
      const name = norm(attackerInput?.value || '');
      if (!name) return alert('Attacker name required');
      try{
        createAttacker(name);
        attackerInput.value = '';
        saveToLocal(StateMod.State);
        renderAllUI();
      }catch(e){ alert(e.message || 'Failed to add attacker'); }
    };
  }

  // Target
  const targetInput = el('targetName');
  const btnAddTarget = el('btnAddTarget');
  if (btnAddTarget) {
    btnAddTarget.onclick = () => {
      const name = norm(targetInput?.value || '');
      if (!name) return alert('Target name required');
      try{
        createTarget(name, false);
        targetInput.value = '';
        saveToLocal(StateMod.State);
        renderAllUI();
      }catch(e){ alert(e.message || 'Failed to add target'); }
    };
  }

  // Vulnerability
  const vulnInput = el('vulnName');
  const btnAddVuln = el('btnAddVuln');
  if (btnAddVuln) {
    btnAddVuln.onclick = () => {
      const name = norm(vulnInput?.value || '');
      if (!name) return alert('Vulnerability name required');
      try{
        createVuln(name);
        vulnInput.value = '';
        saveToLocal(StateMod.State);
        renderAllUI();
      }catch(e){ alert(e.message || 'Failed to add vulnerability'); }
    };
  }
}

/* ---------- NEW: wire attacker entries multiselect ---------- */
function wireEntriesMultiSelect(){
  const selAttacker = el('selAttacker');
  const selEntriesAll = el('selEntriesAll');

  if (selAttacker) {
    selAttacker.onchange = () => {
      hydrateEntriesSelect(StateMod.State);
      renderDetailsPanel();
    };
  }

  if (selEntriesAll) {
    selEntriesAll.onchange = () => {
      const attackerId = selAttacker?.value;
      if (!attackerId) return;
      const picked = [...selEntriesAll.selectedOptions].map(o => o.value);
      try{
        setAttackerEntries(attackerId, picked);
        saveToLocal(StateMod.State);
        renderLinksInspector();
        renderDetailsPanel();
      }catch(e){ alert(e.message || 'Failed to set entries'); }
    };
  }
}

/* ---------- Wire top-level UI ---------- */
function wireUI(){
  // compute / export / svg / simu
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
        enableTopButtons(true);
        renderAllUI();
      }
    };
  }

  // JSON import/export
  const btnExportJSON = el('btnExportJSON');
  if (btnExportJSON) btnExportJSON.onclick = onExportJSON;

  const btnImportJSON = el('btnImportJSON');
  const fileIn = el('fileIn');
  if (btnImportJSON && fileIn) {
    btnImportJSON.onclick = () => fileIn.click();
    fileIn.onchange = onImportJSONFile;
  }

  // left panel creation + entries
  wireCreationButtons();
  wireEntriesMultiSelect();
}

window.__envuln_boot = { State: StateMod.State, computeAllPaths };

init();
