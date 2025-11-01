// js/main.js
// Entry point for the ENVULN client-side modular app.
//
// Expected module exports (adjust names if your modules differ):
// - ./helpers.js:        { el, uid, norm, clamp }
// - ./state.js:          { State, createAttacker, createTarget, createVuln, removeAttacker, removeTarget, removeVuln, setAttackerEntries, toggleTargetFinal, addEdge, removeEdge, ensureEdgeMaps }
// - ./storage.js:        { saveToLocal, loadFromLocal }
// - ./ui/lists.js:      { renderAttackers, renderTargets, renderVulns, populateSelectors, hydrateEntriesSelect, renderLinksInspector, renderDetailsPanel }
// - ./paths.js:          { computeAllPaths } // pure function, returns standardized results
// - ./diagram.js:        { buildSVGForPath } // returns SVG string
// - ./exportODS.js:      { exportODS } // takes results or uses globally accessible compute
// - ./simulation/index.js:{ runSimulation, registerScenario, disableTopButtons, enableTopButtons }
// Adjust imports if you used different filenames / function names.

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
  renderDetailsPanel
} from './ui/lists.js';
import { computeAllPaths } from './paths.js';
import { buildSVGForPath } from './diagram.js';
import { exportODS } from './exportODS.js';
import { runSimulation, registerScenario, disableTopButtons, enableTopButtons } from './simulation/index.js';

/* ---------- Local runtime helpers ---------- */
let lastResults = [];   // raw (unfiltered) results from computeAllPaths()
let lastMeta = { cycles: false };
let lastDiagramSVG = null;

function renderStatus(s){ const sEl = el('status'); if(sEl) sEl.textContent = s; }

/* ---------- Life cycle: init ---------- */
async function init(){
  // load persisted state (if any)
  const loaded = loadFromLocal();
  if (loaded) {
    // hydrate state module
    // NOTE: loadFromLocal should return a plain serial object. state.js should provide a hydrate function,
    // but if not, we do a minimal hydration here.
    if (typeof StateMod.hydrate === 'function') {
      StateMod.hydrate(loaded);
    } else {
      // naive hydration (assumes same shape)
      StateMod.State.version = loaded.version || StateMod.State.version;
      StateMod.State.vulns = loaded.vulns || [];
      StateMod.State.targets = (loaded.targets || []).map(t => ({ id: t.id, name: t.name, vulns: new Set(t.vulns || []), final: !!t.final }));
      StateMod.State.attackers = (loaded.attackers || []).map(a => ({ id: a.id, name: a.name, entries: new Set(a.entries || []) }));
      StateMod.State.edges = {
        direct: (loaded.edges && loaded.edges.direct) ? toSetObj(loaded.edges.direct) : {},
        lateral: (loaded.edges && loaded.edges.lateral) ? toSetObj(loaded.edges.lateral) : {},
        contains: (loaded.edges && loaded.edges.contains) ? toSetObj(loaded.edges.contains) : {}
      };
    }
  }

  // ensure edges map entries for existing targets
  (StateMod.State.targets || []).forEach(t => StateMod.ensureEdgeMaps(t.id));

  // first render
  renderAllUI();

  // wire UI events
  wireUI();
}

/* helper: convert serialized obj (arrs) to { id: Set(...) } */
function toSetObj(obj){
  const out = {};
  for(const k in obj) out[k] = new Set(obj[k] || []);
  return out;
}

/* ---------- UI render orchestration ---------- */
function renderAllUI(){
  renderAttackers(StateMod.State);
  renderTargets(StateMod.State);
  renderVulns(StateMod.State);
  populateSelectors(StateMod.State);
  hydrateEntriesSelect();
  renderLinksInspector();
  renderDetailsPanel();
}

/* ---------- compute / render results ---------- */
function filterOnlyVuln(results){
  const only = !!(el('chkOnlyVuln') && el('chkOnlyVuln').checked);
  if(!only) return results;
  return results.filter(p => (p.vulnsPerNode || []).every(arr => Array.isArray(arr) && arr.length > 0));
}

function renderResultsView(results, meta){
  // results is already filtered or raw depending on caller
  const container = el('results');
  container.innerHTML = '';
  if(!results.length){
    container.innerHTML = '<div class="small">No paths (check entries and final targets).</div>';
    renderStatus('0 paths');
    return;
  }
  results.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'path';
    const left = document.createElement('div'); left.className = 'left';
    left.innerHTML = `<div><strong>${escapeHtml(p.attacker)}</strong></div>
                      <div class="small">${p.nodes.map(n=>escapeHtml(n.name)).join(' → ')}</div>
                      <div class="mini">${p.vulnsPerNode.map((vs,i)=> vs.length ? `[${escapeHtml(p.nodes[i].name)}: ${escapeHtml(vs.join(', '))}]` : `[${escapeHtml(p.nodes[i].name)}: —]`).join(' ')}</div>`;
    const right = document.createElement('div');
    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.textContent = 'Diagram';
    btn.onclick = () => {
      lastDiagramSVG = buildSVGForPath(p, StateMod.State);
      const diagramBox = el('diagramBox');
      if (diagramBox) diagramBox.innerHTML = lastDiagramSVG;
      // update svg size
      const svgNode = diagramBox ? diagramBox.querySelector('svg') : null;
      if(svgNode && el('svgSize')){
        const w = svgNode.getAttribute('width') || svgNode.viewBox?.baseVal?.width || '?';
        const h = svgNode.getAttribute('height') || svgNode.viewBox?.baseVal?.height || '?';
        el('svgSize').textContent = `${w} × ${h}px`;
      }
    };
    right.appendChild(btn);
    row.appendChild(left);
    row.appendChild(right);
    container.appendChild(row);
  });
  renderStatus(`${results.length} paths${meta.cycles? ' • cycles detected (simple paths only)': ''}`);
}

/* ---------- compute button handler ---------- */
async function onComputePaths(){
  try{
    renderStatus('Computing…');
    const includeLateral = !!el('includeLateral')?.checked;
    const includeContains = !!el('includeContains')?.checked;
    const maxPaths = Math.max(100, parseInt(el('maxPaths')?.value || '2000', 10));

    const opts = { includeLateral, includeContains, maxPaths };

    // computeAllPaths is expected to return [{ attacker, attackerId, nodes: [targetObjs], vulnsPerNode: [[vulnNames]] }, ...]
    const results = computeAllPaths(StateMod.State, opts);

    lastResults = results;
    lastMeta = { cycles: false }; // if computeAllPaths returns cycles flag, you can set it here

    const toDisplay = filterOnlyVuln(lastResults);
    renderResultsView(toDisplay, lastMeta);
  } catch(e){
    console.error(e);
    renderStatus('Error computing paths (see console)');
    alert('Error computing paths. See console.');
  }
}

/* ---------- export / import ---------- */
function onExportODS(){
  // export honors the UI filter checkbox (if desired)
  const resultsToExport = filterOnlyVuln(lastResults.length ? lastResults : computeAllPaths(StateMod.State, { includeLateral: !!el('includeLateral')?.checked, includeContains: !!el('includeContains')?.checked, maxPaths: Math.max(100, parseInt(el('maxPaths')?.value || '2000',10)) }));
  exportODS(resultsToExport, { state: StateMod.State });
}

function onImportJSON(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try{
      const obj = JSON.parse(e.target.result);
      if(typeof StateMod.hydrate === 'function'){
        StateMod.hydrate(obj);
      } else {
        // minimal apply: user should implement hydrate for robustness
        console.warn('hydrate not implemented in state module; manual import may be partial.');
      }
      saveToLocal(StateMod.State);
      renderAllUI();
      renderStatus('Import OK');
    }catch(err){
      console.error(err);
      alert('Invalid JSON');
    }
  };
  reader.readAsText(file);
}

/* ---------- diagram download ---------- */
function onDownloadSVG(){
  if(!lastDiagramSVG){
    alert('No diagram generated yet.');
    return;
  }
  const svgText = lastDiagramSVG;
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  a.download = `attack-diagram-${ts}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 0);
}

/* ---------- small util ---------- */
function escapeHtml(s){
  return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

/* ---------- main wiring ---------- */
function wireUI(){
  // add entity
  const btnAddAttacker = el('btnAddAttacker');
  if(btnAddAttacker){
    btnAddAttacker.onclick = () => {
      const name = norm(el('attackerName').value || '');
      if(!name) return alert('Name required');
      StateMod.createAttacker(name);
      el('attackerName').value = '';
      saveToLocal(StateMod.State);
      renderAllUI();
    };
  }

  const btnAddTarget = el('btnAddTarget');
  if(btnAddTarget){
    btnAddTarget.onclick = () => {
      const name = norm(el('targetName').value || '');
      if(!name) return alert('Name required');
      StateMod.createTarget(name, false);
      el('targetName').value = '';
      saveToLocal(StateMod.State);
      renderAllUI();
    };
  }

  const btnAddVuln = el('btnAddVuln');
  if(btnAddVuln){
    btnAddVuln.onclick = () => {
      const name = norm(el('vulnName').value || '');
      if(!name) return alert('Name required');
      StateMod.createVuln(name);
      el('vulnName').value = '';
      saveToLocal(StateMod.State);
      renderAllUI();
    };
  }

  // attacker entries multi-select auto-save
  const selAttacker = el('selAttacker');
  const selEntriesAll = el('selEntriesAll');
  if(selAttacker && selEntriesAll){
    selAttacker.onchange = () => hydrateEntriesSelect(); // UI helper populates the entries selection
    selEntriesAll.onchange = () => {
      const aid = selAttacker.value;
      if(!aid) return;
      const picked = [...selEntriesAll.selectedOptions].map(o => o.value);
      StateMod.setAttackerEntries(aid, picked);
      saveToLocal(StateMod.State);
      renderAllUI();
    };
  }

  // links add/remove
  const btnAddLink = el('btnAddLink');
  if(btnAddLink){
    btnAddLink.onclick = () => {
      const from = el('linkSource')?.value;
      const tos = [...el('linkDest').selectedOptions].map(o => o.value);
      const type = el('linkType')?.value || 'direct';
      if(!from || !tos.length) return alert('source and at least one destination required');
      StateMod.addEdge(type, from, tos);
      saveToLocal(StateMod.State);
      renderAllUI();
    };
  }
  const btnRemoveLink = el('btnRemoveLink');
  if(btnRemoveLink){
    btnRemoveLink.onclick = () => {
      const from = el('linkSource')?.value;
      const tos = [...el('linkDest').selectedOptions].map(o => o.value);
      const type = el('linkType')?.value || 'direct';
      if(!from || !tos.length) return alert('source and at least one destination required');
      StateMod.removeEdge(type, from, tos);
      saveToLocal(StateMod.State);
      renderAllUI();
    };
  }

  // link inspector
  const linkSource = el('linkSource');
  if(linkSource) linkSource.onchange = () => renderLinksInspector();

  // compute / results
  const btnFindPaths = el('btnFindPaths');
  if(btnFindPaths) btnFindPaths.onclick = onComputePaths;

  // export / import
  const btnExportODS = el('btnExportODS') || el('btnExportExcel'); // accept both names
  if(btnExportODS) btnExportODS.onclick = onExportODS;
  const btnImportJSON = el('btnImportJSON');
  if(btnImportJSON) btnImportJSON.onclick = () => el('fileIn')?.click();
  const fileIn = el('fileIn');
  if(fileIn) fileIn.onchange = (e) => { if(e.target.files.length) onImportJSON(e.target.files[0]); e.target.value = null; };

  // diagram download
  const btnDownloadSVG = el('btnDownloadSVG');
  if(btnDownloadSVG) btnDownloadSVG.onclick = onDownloadSVG;

  // simulation
  const btnSimu = el('btnSimu');
  if(btnSimu){
    btnSimu.onclick = async () => {
      try{
        disableTopButtons(true);
        btnSimu.disabled = true;
        btnSimu.textContent = 'Simulating…';
        await runSimulation({ stateModule: StateMod, renderCallback: () => { renderAllUI(); } });
      } catch(e){
        console.error(e);
        alert('Simulation failed (see console)');
      } finally {
        btnSimu.disabled = false;
        btnSimu.textContent = 'Simulation';
        enableTopButtons(true);
        renderAllUI();
      }
    };
  }

  // filter checkbox for vulnerabilities
  const chkOnlyVuln = el('chkOnlyVuln');
  if(chkOnlyVuln) chkOnlyVuln.onchange = () => {
    const filtered = filterOnlyVuln(lastResults);
    renderResultsView(filtered, lastMeta);
  };

  // simulate speed UI (visual)
  const simSpeed = el('simSpeed');
  const simSpeedValue = el('simSpeedValue');
  if(simSpeed && simSpeedValue){
    const update = () => simSpeedValue.textContent = `×${Number(simSpeed.value).toFixed(1)}`;
    simSpeed.addEventListener('input', update);
    update();
  }
}

/* ---------- Expose some debug hooks (optional) ---------- */
window.__envuln_boot = { State: StateMod.State, computeAllPaths };

/* ---------- Start ---------- */
init();
