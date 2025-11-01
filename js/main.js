// js/main.js
// Entry point for the ENVULN client-side modular app.

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
import { computeAllPaths } from './paths.js';
import { buildSVGForPath } from './diagram.js';
import { exportODS } from './exportODS.js';

// ✅ extra initializers
import { initEditors } from './ui/editors.js';
import { wireLinksUI, populateLinkSelectors } from './ui/links.js';
import { initResultsPanel } from './ui/results.js';

// ✅ Simulation core + scenarios
import {
  runSimulation,
  disableTopButtons,
  enableTopButtons
} from './simulation/index.js';
import './simulation/scenarios.js'; // <— enregistre les scénarios

/* ---------- Local runtime helpers ---------- */
let lastResults = [];
let lastMeta = { cycles: false, truncated: false };
let lastDiagramSVG = null;

function renderStatus(s){ const sEl = el('status'); if(sEl) sEl.textContent = s; }

/* ---------- Life cycle: init ---------- */
async function init(){
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

  // 🔧 wire missing behaviors
  initEditors();            // editors panel (right)
  wireLinksUI();            // add/remove links buttons & inspector delegation
  initResultsPanel();       // results panel: refs + download hook
  populateLinkSelectors();  // ensure linkSource/linkDest have options

  wireUI();
}

function convertEdge(obj){
  const out = {};
  if(!obj) return out;
  for(const k in obj) out[k] = new Set(obj[k] || []);
  return out;
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

function filterOnlyVuln(results){
  const only = el('chkOnlyVuln')?.checked;
  if(!only) return results;
  return results.filter(p => Array.isArray(p.vulnsPerNode) && p.vulnsPerNode.every(v => v.length > 0));
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
    const attackerLabel = p.attackerName || p.attacker || p.attackerId || '—';
    left.innerHTML = `
      <div><strong>${attackerLabel}</strong></div>
      <div class="small">${(p.nodes || []).map(n => n.name).join(' → ')}</div>
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

async function onComputePaths(){
  try{
    renderStatus('Computing…');
    const opts = {
      includeLateral: el('includeLateral')?.checked,
      includeContains: el('includeContains')?.checked,
      maxPaths: parseInt(el('maxPaths')?.value || '2000', 10)
    };

    // computeAllPaths returns { paths, cycles, truncated }
    const out = computeAllPaths(
      StateMod.State,
      { includeLateral: !!opts.includeLateral, includeContains: !!opts.includeContains },
      opts.maxPaths
    );

    lastResults = out.paths || [];
    lastMeta = { cycles: !!out.cycles, truncated: !!out.truncated };

    renderResultsView(filterOnlyVuln(lastResults), lastMeta);
  }catch(e){
    console.error(e);
    alert('Path error');
  }
}

// ✅ fix signature order: exportODS(state, {results})
function onExportODS(){
  const resultsToExport = (el('chkOnlyVuln')?.checked ? filterOnlyVuln(lastResults) : lastResults) || [];
  if (!resultsToExport.length) { alert('No paths to export.'); return; }
  exportODS(StateMod.State, { results: resultsToExport });
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
        enableTopButtons(true);
        renderAllUI();
      }
    };
  }
}

window.__envuln_boot = { State: StateMod.State, computeAllPaths };

init();
