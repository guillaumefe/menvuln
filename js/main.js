// js/main.js — Entry point

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
import { wireLinksUI } from './ui/links.js';           // 👈 wiring des liens
import { computeAllPaths } from './paths.js';
import { buildSVGForPath } from './diagram.js';
import { exportODS } from './exportODS.js';

import {
  runSimulation,
  disableTopButtons,
  enableTopButtons
} from './simulation/index.js';

// 👇 Charger les scénarios (sinon Simulation ne fait rien)
import './simulation/scenarios.js';

/* ---------- Local runtime helpers ---------- */
let lastResults = [];                 // tableau de paths normalisés
let lastMeta = { cycles: false, truncated: false };
let lastDiagramSVG = null;

function renderStatus(s){ const sEl = el('status'); if(sEl) sEl.textContent = s || '—'; }

/* ---------- Life cycle: init ---------- */
async function init(){
  // 1) Hydrate State depuis localStorage
  const loaded = loadFromLocal();
  if (loaded) {
    // Pas de StateMod.hydrate fourni : on reconstruit les Sets
    StateMod.State.version  = loaded.version || StateMod.State.version;
    StateMod.State.vulns    = loaded.vulns || [];
    StateMod.State.targets  = (loaded.targets || []).map(t => ({ id:t.id, name:t.name, vulns:new Set(t.vulns), final:!!t.final }));
    StateMod.State.attackers= (loaded.attackers || []).map(a => ({ id:a.id, name:a.name, entries:new Set(a.entries) }));
    StateMod.State.edges = {
      direct:   convertEdge(loaded.edges?.direct),
      lateral:  convertEdge(loaded.edges?.lateral),
      contains: convertEdge(loaded.edges?.contains),
    };
  }
  (StateMod.State.targets || []).forEach(t => StateMod.ensureEdgeMaps(t.id));

  // 2) Rendu initial + wiring
  renderAllUI();
  wireUI();
  wireCreateButtons();   // 👈 Add attacker/target/vuln
  wireEntriesBinding();  // 👈 multi-select entries
  wireLinksUI();         // 👈 add/remove links

  renderStatus('Ready');
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
  hydrateEntriesSelect(StateMod.State);
  renderLinksInspector();
  renderDetailsPanel();
}

/* ---------- Results panel (simple) ---------- */
function filterOnlyVuln(results){
  const only = el('chkOnlyVuln')?.checked;
  if(!only) return results;
  return results.filter(p => p.vulnsPerNode?.every(v => Array.isArray(v) && v.length > 0));
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
  const bits = [`${results.length} paths`];
  if(meta?.cycles) bits.push('cycles detected');
  if(meta?.truncated) bits.push('truncated');
  renderStatus(bits.join(' • '));
}

/* ---------- Actions ---------- */
async function onComputePaths(){
  try{
    renderStatus('Computing…');
    const opts = {
      includeLateral:  !!el('includeLateral')?.checked,
      includeContains: !!el('includeContains')?.checked,
    };
    const maxPer = parseInt(el('maxPaths')?.value || '2000', 10);

    const out = computeAllPaths(StateMod.State, opts, maxPer); // { paths, cycles, truncated }
    lastResults = out.paths || [];
    lastMeta = { cycles: !!out.cycles, truncated: !!out.truncated };

    renderResultsView(filterOnlyVuln(lastResults), lastMeta);
  }catch(e){
    console.error(e);
    alert('Path error');
    renderStatus('Error');
  }
}

function onExportODS(){
  // ⚠️ Signature: exportODS(state, { results? })
  const toExport = filterOnlyVuln(lastResults);
  if(!toExport.length) return alert('No paths to export.');
  exportODS(StateMod.State, { results: toExport });
}

function onDownloadSVG(){
  if(!lastDiagramSVG) return alert('No diagram');
  const blob = new Blob([lastDiagramSVG], { type:'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `diagram.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),0);
}

/* ---------- Wiring global UI ---------- */
function wireUI(){
  el('btnFindPaths')    && (el('btnFindPaths').onclick    = onComputePaths);
  el('btnExportODS')    && (el('btnExportODS').onclick    = onExportODS);
  el('btnDownloadSVG')  && (el('btnDownloadSVG').onclick  = onDownloadSVG);

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

  // Refiltrer quand on coche “Only paths with vulns”
  const only = el('chkOnlyVuln');
  if (only) {
    only.onchange = () => renderResultsView(filterOnlyVuln(lastResults), lastMeta);
  }
}

/* ---------- Wiring: création + entries ---------- */
function wireCreateButtons(){
  const attackerInput = el('attackerName');
  const targetInput   = el('targetName');
  const vulnInput     = el('vulnName');

  const doSaveAndRefresh = () => { try{ saveToLocal(StateMod.State); }catch{} renderAllUI(); };

  const btnA = el('btnAddAttacker');
  if(btnA){
    btnA.onclick = () => {
      const name = norm(attackerInput?.value || '');
      if(!name) return alert('Attacker name required');
      try{
        StateMod.createAttacker(name);
        attackerInput.value = '';
        doSaveAndRefresh();
      }catch(e){ alert(e.message || 'Error'); }
    };
  }

  const btnT = el('btnAddTarget');
  if(btnT){
    btnT.onclick = () => {
      const name = norm(targetInput?.value || '');
      if(!name) return alert('Target name required');
      try{
        const id = StateMod.createTarget(name, false);
        StateMod.ensureEdgeMaps(id);
        targetInput.value = '';
        doSaveAndRefresh();
      }catch(e){ alert(e.message || 'Error'); }
    };
  }

  const btnV = el('btnAddVuln');
  if(btnV){
    btnV.onclick = () => {
      const name = norm(vulnInput?.value || '');
      if(!name) return alert('Vulnerability name required');
      try{
        StateMod.createVuln(name);
        vulnInput.value = '';
        doSaveAndRefresh();
      }catch(e){ alert(e.message || 'Error'); }
    };
  }
}

function wireEntriesBinding(){
  const selAttacker  = el('selAttacker');
  const selEntries   = el('selEntriesAll');
  if(!selAttacker || !selEntries) return;

  // Hydrate multiselect when attacker changes
  selAttacker.onchange = () => hydrateEntriesSelect(StateMod.State);

  // Persist entries when multiselect changes
  selEntries.onchange = () => {
    const attackerId = selAttacker.value;
    const picked = [...selEntries.selectedOptions].map(o => o.value);
    try{
      StateMod.setAttackerEntries(attackerId, picked);
      saveToLocal(StateMod.State);
    }catch(e){ console.warn(e); }
  };
}

/* ---------- expose debug ---------- */
window.__envuln_boot = { State: StateMod.State, computeAllPaths };

init();
