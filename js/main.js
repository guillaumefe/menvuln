// js/main.js
// Application bootstrap for ENVULN (client-side).

import { el } from './helpers.js';
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

import {
  runSimulation,
  registerScenario, // available for scenarios.js if needed
  disableTopButtons,
  enableTopButtons
} from './simulation/index.js';

/* ---------- Local state ---------- */
let lastResults = [];                 // array of path objects
let lastMeta = { cycles: false, truncated: false };
let lastDiagramSVG = null;

function renderStatus(s) {
  const sEl = el('status');
  if (sEl) sEl.textContent = s;
}

/* ---------- Init ---------- */
async function init() {
  // Rehydrate from localStorage (if any)
  const loaded = loadFromLocal();
  if (loaded) {
    if (typeof StateMod.hydrate === 'function') {
      StateMod.hydrate(loaded);
    } else {
      // manual migration to live State shape
      StateMod.State.version  = loaded.version || StateMod.State.version;
      StateMod.State.vulns    = loaded.vulns || [];
      StateMod.State.targets  = (loaded.targets || []).map(t => ({
        id: t.id, name: t.name, vulns: new Set(t.vulns), final: !!t.final
      }));
      StateMod.State.attackers = (loaded.attackers || []).map(a => ({
        id: a.id, name: a.name, entries: new Set(a.entries)
      }));
      StateMod.State.edges = {
        direct:   convertEdge(loaded.edges?.direct),
        lateral:  convertEdge(loaded.edges?.lateral),
        contains: convertEdge(loaded.edges?.contains),
      };
    }
  }

  // Ensure edge maps exist for all targets
  (StateMod.State.targets || []).forEach(t => StateMod.ensureEdgeMaps(t.id));

  renderAllUI();
  wireUI();
}

function convertEdge(obj) {
  const out = {};
  if (!obj) return out;
  for (const k in obj) out[k] = new Set(obj[k] || []);
  return out;
}

function renderAllUI() {
  renderAttackers(StateMod.State);
  renderTargets(StateMod.State);
  renderVulns(StateMod.State);
  populateSelectors(StateMod.State);
  hydrateEntriesSelect(StateMod.State);
  renderLinksInspector();
  renderDetailsPanel();
}

/* ---------- Results panel (simple local renderer) ---------- */
function filterOnlyVuln(paths) {
  const only = el('chkOnlyVuln')?.checked;
  if (!only) return paths;
  return paths.filter(p =>
    Array.isArray(p.vulnsPerNode) && p.vulnsPerNode.every(v => Array.isArray(v) && v.length > 0)
  );
}

function renderResultsView(paths, meta) {
  const container = el('results');
  container.innerHTML = '';
  if (!paths.length) {
    container.innerHTML = `<div class="small">No paths.</div>`;
    renderStatus('0 paths');
    return;
  }

  paths.forEach(p => {
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
      if (box) box.innerHTML = lastDiagramSVG;
    };

    right.appendChild(btn);
    row.appendChild(left);
    row.appendChild(right);
    container.appendChild(row);
  });

  const parts = [`${paths.length} paths`];
  if (meta.cycles) parts.push('(cycles detected)');
  if (meta.truncated) parts.push('(truncated)');
  renderStatus(parts.join(' '));
}

/* ---------- Actions ---------- */
async function onComputePaths() {
  try {
    renderStatus('Computing…');
    const opts = {
      includeLateral:  el('includeLateral')?.checked,
      includeContains: el('includeContains')?.checked,
      maxPaths: parseInt(el('maxPaths')?.value || '2000', 10),
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

/* ---------- Wire UI ---------- */
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

        // Run a random registered scenario (or pass {scenarioName:'...'} here)
        await runSimulation({ renderCallback: () => renderAllUI() });
      } finally {
        btnSimu.textContent = 'Simulation';
        btnSimu.disabled = false;
        enableTopButtons(true);
        renderAllUI();
      }
    };
  }

  // Recompute filter view when checkbox toggles
  el('chkOnlyVuln')?.addEventListener('change', () => {
    renderResultsView(filterOnlyVuln(lastResults), lastMeta);
  });
}

/* ---------- Expose for console debugging ---------- */
window.__envuln_boot = { State: StateMod.State, computeAllPaths };

/* ---------- Boot ---------- */
init();
