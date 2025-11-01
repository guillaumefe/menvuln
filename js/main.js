// js/main.js
// Main UI and app logic. Wires controls from the document to the application state.

import './simulation/scenarios.js';

import { el, norm } from './helpers.js';
import * as StateMod from './state.js';
import { saveToLocal, loadFromLocal, exportJSON, importJSON } from './storage.js';
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
import {
  runSimulation,
  disableTopButtons,
  enableTopButtons
} from './simulation/index.js';

let lastResults = [];
let lastMeta = { cycles: false, truncated: false };

/* ---------------- Status ---------------- */
function renderStatus(s) {
  const sEl = el('status');
  if (sEl) sEl.textContent = s;
}

/* ---------------- Global rerender ---------------- */
function emitStateChanged() {
  try { saveToLocal(StateMod.State); } catch {}
  renderAllUI();
}

/* ---------------- Select helper ---------------- */
function setOptions(selectEl, items, { getValue = x => x.id, getLabel = x => x.name, selectedSet = new Set() } = {}) {
  if (!selectEl) return;
  const prev = selectEl.value;
  selectEl.innerHTML = '';
  (items || []).forEach(item => {
    const opt = document.createElement('option');
    opt.value = String(getValue(item));
    opt.textContent = getLabel(item);
    if (selectedSet.has(opt.value)) opt.selected = true;
    selectEl.appendChild(opt);
  });
  if (prev && [...selectEl.options].some(o => o.value === prev)) {
    selectEl.value = prev;
  }
}

/* ---------------- Initialization ---------------- */
async function init() {
  const loaded = loadFromLocal();
  if (loaded) StateMod.hydrate(loaded);

  StateMod.State.targets.forEach(t => StateMod.ensureEdgeMaps(t.id));

  renderAllUI();
  wireAddControls();
  wireAttackerSelection();
  wireEntries();
  wireExits();
  wireVulns();
  wireLinksUI();
  wireTopActions();
  wireSimulationButton();
}

/* ---------------- Rendering ---------------- */
function renderAllUI() {
  renderAttackers(StateMod.State);
  renderTargets(StateMod.State);
  renderVulns(StateMod.State);
  populateSelectors(StateMod.State);

  hydrateAttackerSelection();
  hydrateEntries();
  hydrateExits();
  hydrateVulnSelectors();

  renderLinksInspector();
}

function hydrateAttackerSelection(state = StateMod.State) {
  setOptions(el('selAttacker'), state.attackers);
}

function hydrateEntries(state = StateMod.State) {
  const selAtt = el('selAttacker');
  const sel = el('selEntriesAll');
  if (!selAtt || !sel) return;
  const attacker = state.attackers.find(a => a.id === selAtt.value);
  const selected = attacker ? new Set([...attacker.entries].map(String)) : new Set();
  setOptions(sel, state.targets, { selectedSet: selected });
}

function hydrateExits(state = StateMod.State) {
  const selAtt = el('selAttacker');
  const sel = el('selExitsAll');
  if (!selAtt || !sel) return;
  const attacker = state.attackers.find(a => a.id === selAtt.value);
  const selected = attacker ? new Set([...attacker.exits].map(String)) : new Set();
  setOptions(sel, state.targets, { selectedSet: selected });
}

function hydrateVulnSelectors(state = StateMod.State) {
  setOptions(el('selVulnElement'), state.targets);
  setOptions(el('selVulnsForElement'), state.vulns);
}

/* ---------------- Add controls ---------------- */
function wireAddControls() {
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
    const id = StateMod.createTarget(name);
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

/* ---------------- Attacker selection ---------------- */
function wireAttackerSelection() {
  el('selAttacker').addEventListener('change', () => {
    hydrateEntries();
    hydrateExits();
  });
}

/* ---------------- Entries ---------------- */
function wireEntries() {
  const sel = el('selEntriesAll');
  const btnClear = el('btnClearEntries');

  sel.addEventListener('change', () => {
    const attId = el('selAttacker').value;
    const ids = [...sel.selectedOptions].map(o => o.value);
    StateMod.setAttackerEntries(attId, ids);
    emitStateChanged();
  });

  if (btnClear) {
    btnClear.onclick = () => {
      const attId = el('selAttacker').value;
      StateMod.setAttackerEntries(attId, []);
      emitStateChanged();
    };
  }
}

/* ---------------- Exits ---------------- */
function wireExits() {
  const sel = el('selExitsAll');
  const btnClear = el('btnClearExits');

  sel.addEventListener('change', () => {
    const attId = el('selAttacker').value;
    const ids = [...sel.selectedOptions].map(o => o.value);
    StateMod.setAttackerExits(attId, ids);
    emitStateChanged();
  });

  if (btnClear) {
    btnClear.onclick = () => {
      const attId = el('selAttacker').value;
      StateMod.setAttackerExits(attId, []);
      emitStateChanged();
    };
  }
}

/* ---------------- Vulnerabilities ---------------- */
function wireVulns() {
  const selTarget = el('selVulnElement');
  const selVulns = el('selVulnsForElement');
  const btnClear = el('btnClearVulnSelection');

  if (!selTarget || !selVulns) return;

  const applySelectionToState = () => {
    const targetId = selTarget.value;
    if (!targetId) return;
    const vids = [...selVulns.selectedOptions].map(o => o.value);
    const t = StateMod.State.targets.find(x => x.id === targetId);
    if (!t) return;
    t.vulns = new Set(vids);
    emitStateChanged();
  };

  selTarget.addEventListener('change', () => {
    const t = StateMod.State.targets.find(x => x.id === selTarget.value);
    const current = new Set(t ? Array.from(t.vulns || []) : []);
    [...selVulns.options].forEach(o => o.selected = current.has(o.value));
  });

  selVulns.addEventListener('change', applySelectionToState);

  if (btnClear) {
    btnClear.onclick = () => {
      [...selVulns.options].forEach(o => o.selected = false);
      applySelectionToState();
    };
  }
}

/* ---------------- Results rendering ---------------- */
function renderResultsList(results) {
  const cont = el('results');
  const svgSizeEl = el('svgSize');
  cont.innerHTML = '';
  if (!results.length) {
    cont.innerHTML = '<div class="small">No paths.</div>';
    if (svgSizeEl) svgSizeEl.textContent = '—';
    return;
  }

  results.forEach(p => {
    const row = document.createElement('div');
    row.className = 'path';

    const left = document.createElement('div');
    left.className = 'left';
    const title = document.createElement('div');
    title.innerHTML = `<strong>${p.attackerName}</strong>`;
    const chain = document.createElement('div');
    chain.className = 'small';
    chain.textContent = p.nodes.map(n => n.name).join(' → ');
    left.append(title, chain);

    const btn = document.createElement('button');
    btn.className = 'ghost';
    btn.textContent = 'Diagram';
    btn.onclick = () => {
      const svgStr = buildSVGForPath(p, StateMod.State);
      el('diagramBox').innerHTML = svgStr;

      const svg = el('diagramBox').querySelector('svg');
      if (svg && svgSizeEl) {
        const w = +svg.getAttribute('width') || svg.viewBox?.baseVal?.width || svg.getBoundingClientRect().width;
        const h = +svg.getAttribute('height') || svg.viewBox?.baseVal?.height || svg.getBoundingClientRect().height;
        svgSizeEl.textContent = `${Math.round(w)} × ${Math.round(h)} px`;
      }
    };

    row.append(left, btn);
    cont.appendChild(row);
  });
}

/* ---------------- Top actions ---------------- */
function wireTopActions() {
  const chkOnlyVuln = el('chkOnlyVuln');

  const summarize = (count, meta) => {
    const parts = [];
    parts.push(`${count} path${count === 1 ? '' : 's'}`);
    if (meta.cycles) parts.push('cycles detected (simple paths)');
    if (meta.truncated) parts.push('truncated by ceiling');
    renderStatus(parts.join(' • '));
  };

  const hasVulnsEverywhere = p =>
    Array.isArray(p.vulnsPerNode) && p.vulnsPerNode.every(v => Array.isArray(v) && v.length > 0);

  const renderFiltered = () => {
    const onlyVuln = !!(chkOnlyVuln && chkOnlyVuln.checked);
    const display = onlyVuln ? lastResults.filter(hasVulnsEverywhere) : lastResults;
    renderResultsList(display);
    summarize(display.length, lastMeta);
  };

  el('btnFindPaths').onclick = () => {
    const opts = {
      includeLateral: el('includeLateral').checked,
      includeContains: el('includeContains').checked
    };
    const max = parseInt(el('maxPaths').value, 10);
    const out = computeAllPaths(StateMod.State, opts, max);
    lastResults = out.paths || [];
    lastMeta = { cycles: !!out.cycles, truncated: !!out.truncated };
    renderFiltered();
  };

  if (chkOnlyVuln) chkOnlyVuln.addEventListener('change', renderFiltered);

  el('btnDownloadSVG').onclick = () => {
    const svg = el('diagramBox')?.querySelector('svg');
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `attack-diagram-${new Date().toISOString().replace(/[:.]/g, '-')}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  };

  const btnODS = el('btnExportODS');
  if (btnODS) {
    btnODS.onclick = () => {
      const onlyVuln = !!(chkOnlyVuln && chkOnlyVuln.checked);
      const display = onlyVuln ? lastResults.filter(hasVulnsEverywhere) : lastResults;
      if (!display.length) return alert('No paths to export.');
      exportODS(StateMod.State, { results: display });
    };
  }

  const btnExportJSON = el('btnExportJSON');
  const btnImportJSON = el('btnImportJSON');
  const fileIn = el('fileIn');

  if (btnExportJSON) {
    btnExportJSON.onclick = () => {
      saveToLocal(StateMod.State);
      exportJSON(StateMod.State);
    };
  }

  if (btnImportJSON && fileIn) {
    btnImportJSON.onclick = () => fileIn.click();
    fileIn.onchange = async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      const txt = await file.text();
      const state = importJSON(txt);
      if (!state) return alert('Invalid JSON.');
      StateMod.hydrate(state);
      StateMod.State.targets.forEach(t => StateMod.ensureEdgeMaps(t.id));
      renderAllUI();
      fileIn.value = '';
    };
  }
}

/* ---------------- Simulation button ---------------- */
function wireSimulationButton() {
  const btn = el('btnSimu');
  if (!btn) return;
  btn.onclick = async () => {
    try {
      disableTopButtons(true);
      btn.textContent = 'Simulating…';
      btn.disabled = true;
      await runSimulation({ renderCallback: () => renderAllUI() });
    } finally {
      btn.textContent = 'Simulation';
      btn.disabled = false;
      enableTopButtons();
      renderAllUI();
    }
  };
}

/* ---------------- Boot ---------------- */
window.__envuln_boot = { State: StateMod.State, computeAllPaths };
init();
