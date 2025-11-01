// js/main.js — App bootstrap (adapté)

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

function renderStatus(s) {
  const sEl = el('status');
  if (sEl) sEl.textContent = s || '';
}

function safeInt(v, fallback, { min, max } = {}) {
  let n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) n = fallback;
  if (typeof min === 'number') n = Math.max(min, n);
  if (typeof max === 'number') n = Math.min(max, n);
  return n;
}

function convertEdge(obj) {
  const out = {};
  if (!obj) return out;
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) {
      out[k] = new Set(obj[k] || []);
    }
  }
  return out;
}

function initStateFromStorage() {
  const loaded = loadFromLocal();
  if (!loaded) return;

  if (typeof StateMod.hydrate === 'function') {
    StateMod.hydrate(loaded);
    return;
  }
  // Fallback hydrate
  StateMod.State.version = loaded.version || StateMod.State.version;
  StateMod.State.vulns = loaded.vulns || [];
  StateMod.State.targets = (loaded.targets || []).map(t => ({
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

function makePathRow(p) {
  const row = document.createElement('div');
  row.className = 'path';

  const left = document.createElement('div');
  left.className = 'left';

  // Attacker name
  const attackerDiv = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = String(p.attackerName || p.attacker || '');
  attackerDiv.appendChild(strong);

  // Path nodes
  const nodesDiv = document.createElement('div');
  nodesDiv.className = 'small';
  const pathText = (p.nodes || []).map(n => n?.name || '').join(' → ');
  nodesDiv.textContent = pathText;

  left.append(attackerDiv, nodesDiv);

  const right = document.createElement('div');
  const btn = document.createElement('button');
  btn.className = 'ghost';
  btn.type = 'button';
  btn.textContent = 'Diagram';
  btn.addEventListener('click', () => {
    try {
      lastDiagramSVG = buildSVGForPath(p, StateMod.State);
      const box = el('diagramBox');
      if (box) {
        // Injection sûre : SVG généré par notre code
        box.innerHTML = lastDiagramSVG;
      }
    } catch (e) {
      console.error(e);
      alert('Diagram build error.');
    }
  });
  right.appendChild(btn);

  row.append(left, right);
  return row;
}

function renderResultsView(results, meta) {
  const container = el('results');
  if (!container) return;

  // Clear
  while (container.firstChild) container.removeChild(container.firstChild);

  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'small';
    empty.textContent = 'No paths.';
    container.appendChild(empty);
    renderStatus('0 paths');
    return;
  }

  results.forEach(p => container.appendChild(makePathRow(p)));

  const parts = [`${results.length} paths`];
  if (meta.cycles) parts.push('(cycles detected)');
  if (meta.truncated) parts.push('(truncated)');
  renderStatus(parts.join(' '));
}

async function onComputePaths() {
  try {
    renderStatus('Computing…');

    const maxPaths = safeInt(el('maxPaths')?.value || '2000', 2000, { min: 1, max: 100000 });
    const opts = {
      includeLateral:  !!el('includeLateral')?.checked,
      includeContains: !!el('includeContains')?.checked,
      maxPaths
    };

    const out = computeAllPaths(StateMod.State, opts, maxPaths);
    lastResults = out.paths || [];
    lastMeta = { cycles: !!out.cycles, truncated: !!out.truncated };

    renderResultsView(filterOnlyVuln(lastResults), lastMeta);
    saveToLocal(StateMod.State);
  } catch (e) {
    console.error(e);
    alert('Path computation error.');
    renderStatus('Error');
  }
}

function onExportODS() {
  if (!lastResults.length) {
    alert('No paths to export.');
    return;
  }
  try {
    exportODS(lastResults, { state: StateMod.State });
  } catch (e) {
    console.error(e);
    alert('Export error.');
  }
}

function onDownloadSVG() {
  if (!lastDiagramSVG) {
    alert('No diagram');
    return;
  }
  try {
    const blob = new Blob([lastDiagramSVG], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Révoque de façon sûre après le click
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (e) {
    console.error(e);
    alert('Download error.');
  }
}

function wireUI() {
  el('btnFindPaths')?.addEventListener('click', onComputePaths);
  el('btnExportODS')?.addEventListener('click', onExportODS);
  el('btnDownloadSVG')?.addEventListener('click', onDownloadSVG);

  const btnSimu = el('btnSimu');
  if (btnSimu) {
    btnSimu.addEventListener('click', async () => {
      try {
        disableTopButtons(true);
        btnSimu.textContent = 'Simulating…';
        btnSimu.disabled = true;
        await runSimulation({ renderCallback: () => renderAllUI() });
      } catch (e) {
        console.error(e);
        alert('Simulation error.');
      } finally {
        btnSimu.textContent = 'Simulation';
        btnSimu.disabled = false;
        enableTopButtons(true);
        renderAllUI();
      }
    });
  }

  el('chkOnlyVuln')?.addEventListener('change', () => {
    renderResultsView(filterOnlyVuln(lastResults), lastMeta);
  });
}

async function init() {
  try {
    initStateFromStorage();
    (StateMod.State.targets || []).forEach(t => StateMod.ensureEdgeMaps(t.id));
    renderAllUI();
    wireUI();
  } catch (e) {
    console.error(e);
    alert('Init error.');
  }
}

window.__envuln_boot = { State: StateMod.State, computeAllPaths };
init();
