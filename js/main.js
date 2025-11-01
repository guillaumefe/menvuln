// Entry point for the ENVULN client-side app (fixed + simulation-ready)

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

// IMPORTANT: load scenarios so they are actually registered
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

/* ---------- Life cycle: init ---------- */
async function init(){
  const loaded = loadFromLocal();
  if (loaded) {
    // backward/compat hydration
    if (typeof StateMod.hydrate === 'function') {
      StateMod.hydrate(loaded);
    } else {
      StateMod.State.version = loaded.version || StateMod.State.version;
      StateMod.State.vulns   = loaded.vulns || [];
      StateMod.State.targets = (loaded.targets || []).map(t => ({ id: t.id, name: t.name, vulns: new Set(t.vulns), final: !!t.final }));
      StateMod.State.attackers = (loaded.attackers || []).map(a => ({ id: a.id, name: a.name, entries: new Set(a.entries) }));
      StateMod.State.edges = {
        direct:  convertEdge(loaded.edges?.direct),
        lateral: convertEdge(loaded.edges?.lateral),
        contains:convertEdge(loaded.edges?.contains),
      };
    }
  }
  (StateMod.State.targets || []).forEach(t => StateMod.ensureEdgeMaps(t.id));

  renderAllUI();
  wireAddControls();  // make the “Add” buttons work
  wireLinksUI();      // add/remove link wiring
  wireUI();           // top buttons + simulation

  // initial “changed” so right panel & selects hydrate
  document.dispatchEvent(new CustomEvent('state:changed'));
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

    // FIX: computeAllPaths returns { paths, cycles, truncated }
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
