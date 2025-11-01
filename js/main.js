// js/main.js — App bootstrap

import { el } from './helpers.js';
import * as StateMod from './state.js';
import { saveToLocal, loadFromLocal } from './storage.js';
import {
  renderAttackers, renderTargets, renderVulns,
  populateSelectors, hydrateEntriesSelect,
  renderLinksInspector, renderDetailsPanel
} from './ui/lists.js';
import { computeAllPaths } from './paths.js';
import { buildSVGForPath } from './diagram.js';
import { exportODS } from './exportODS.js';

// Simulation core + ensure scenarios are registered (both ways)
import { runSimulation, disableTopButtons, enableTopButtons } from './simulation/index.js';
import './simulation/scenarios.js'; // side effects; harmless if also dynamically imported

let lastResults = [];
let lastMeta = { cycles: false, truncated: false };
let lastDiagramSVG = null;

function renderStatus(s) { const sEl = el('status'); if (sEl) sEl.textContent = s; }

async function init() {
  const loaded = loadFromLocal();
  if (loaded) {
    if (typeof StateMod.hydrate === 'function') {
      StateMod.hydrate(loaded);
    } else {
      StateMod.State.version  = loaded.version || StateMod.State.version;
      StateMod.State.vulns    = loaded.vulns || [];
      StateMod.State.targets  = (loaded.targets || []).map(t => ({ id: t.id, name: t.name, vulns: new Set(t.vulns), final: !!t.final }));
      StateMod.State.attackers= (loaded.attackers || []).map(a => ({ id: a.id, name: a.name, entries: new Set(a.entries) }));
      StateMod.State.edges = {
        direct:   convertEdge(loaded.edges?.direct),
        lateral:  convertEdge(loaded.edges?.lateral),
        contains: convertEdge(loaded.edges?.contains),
      };
    }
  }
  (StateMod.State.targets || []).forEach(t => StateMod.ensureEdgeMaps(t.id));
  renderAllUI();
  wireUI();
}

function convertEdge(obj) { const out = {}; if (!obj) return out; for (const k in obj) out[k] = new Set(obj[k] || []); return out; }

function renderAllUI() {
  renderAttackers(StateMod.State);
  renderTargets(StateMod.State);
  renderVulns(StateMod.State);
  populateSelectors(StateMod.State);
  hydrateEntriesSelect(StateMod.State);
  renderLinksInspector();
  renderDetailsPanel();
}

function filterOnlyVuln(results) {
  const only = el('chkOnlyVuln')?.checked;
  if (!only) return results;
  return results.filter(p => (p.vulnsPerNode || []).every(v => Array.isArray(v) && v.length > 0));
}

function renderResultsView(results, meta) {
  const container = el('results');
  container.innerHTML = '';
  if (!results.length) {
    container.innerHTML = `<div class="small">No paths.</div>`;
    renderStatus('0 paths');
    return;
  }

  results.forEach(p => {
    const row = document.createElement('div'); row.className = 'path';
    const left = document.createElement('div'); left.className = 'left';
    left.innerHTML = `
      <div><strong>${p.attackerName || p.attacker || ''}</strong></div>
      <div class="small">${(p.nodes || []).map(n => n.name).join(' → ')}</div>
    `;
    const right = document.createElement('div');
    const btn = document.createElement('button'); btn.className = 'ghost'; btn.textContent = 'Diagram';
    btn.onclick = () => {
      lastDiagramSVG = buildSVGForPath(p, StateMod.State);
      const box = el('diagramBox'); if (box) box.innerHTML = lastDiagramSVG;
    };
    right.appendChild(btn);
    row.append(left, right);
    container.appendChild(row);
  });

  const parts = [`${results.length} paths`];
  if (meta.cycles) parts.push('(cycles detected)');
  if (meta.truncated) parts.push('(truncated)');
  renderStatus(parts.join(' '));
}

async function onComputePaths() {
  try {
    renderStatus('Computing…');
    const opts = {
      includeLateral:  el('includeLateral')?.checked,
      includeContains: el('includeContains')?.checked,
      maxPaths: parseInt(el('maxPaths')?.value || '2000', 10)
    };
    const out = computeAllPaths(StateMod.State, opts, opts.maxPaths);
    lastResults = out.paths || [];
    lastMeta = { cycles: !!out.cycles, truncated: !!out.truncated };
    renderResultsView(filterOnlyVuln(lastResults), lastMeta);
    saveToLocal(StateMod.State);
  } catch (e) {
    console.error(e);
    alert('Path computation error.');
  }
}

function onExportODS() {
  if (!lastResults.length) return alert('No paths to export.');
  exportODS(lastResults, { state: StateMod.State });
}

function onDownloadSVG() {
  if (!lastDiagramSVG) return alert('No diagram');
  const blob = new Blob([lastDiagramSVG], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `diagram.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

function wireUI() {
  el('btnFindPaths')?.addEventListener('click', onComputePaths);
  el('btnExportODS')?.addEventListener('click', onExportODS);
  el('btnDownloadSVG')?.addEventListener('click', onDownloadSVG);

  const btnSimu = el('btnSimu');
  if (btnSimu) {
    btnSimu.onclick = async () => {
      try {
        disableTopButtons(true);
        btnSimu.textContent = 'Simulating…';
        btnSimu.disabled = true;
        await runSimulation({ renderCallback: () => renderAllUI() });
      } finally {
        btnSimu.textContent = 'Simulation';
        btnSimu.disabled = false;
        enableTopButtons(true);
        renderAllUI();
      }
    };
  }

  el('chkOnlyVuln')?.addEventListener('change', () => {
    renderResultsView(filterOnlyVuln(lastResults), lastMeta);
  });
}

window.__envuln_boot = { State: StateMod.State, computeAllPaths };
init();
