// js/main.js
// Main UI logic with immediate persistence and dual playback:
// - dataset playback for computed paths (left/right navigation)
// - simulation playback bridge (play/pause/stop/restart/step; speed control)

import './simulation/scenarios.js';

import { el, norm } from './helpers.js';
import * as StateMod from './state.js';
import { saveToLocal, loadFromLocal, exportJSON, importJSON, clearLocal } from './storage.js';
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
  enableTopButtons,
  simPlay, simPause, simToggle, simStop, simStep, simSetSpeed,
  simStepBack, simStepForward,
  simIsRunning, simIsPaused,
  simCanStepBack, simCanStepForward
} from './simulation/index.js';

let lastResults = [];
let lastMeta = { cycles: false, truncated: false };

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */
function renderStatus(s) {
  const sEl = el('status');
  if (sEl) sEl.textContent = s;
}

/* -------------------------------------------------------------------------- */
/* Global rerender                                                            */
/* -------------------------------------------------------------------------- */
function emitStateChanged() {
  try { saveToLocal(StateMod.State); } catch {}
  renderAllUI();
}

/* -------------------------------------------------------------------------- */
/* Select helper                                                              */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Playback UI helpers                                                        */
/* -------------------------------------------------------------------------- */
let playbackControlsEnabled = false; // source of truth for enabling the row

function setPlayPauseVisual(isPlaying) {
  const btn = el('btnPlayPause');
  if (!btn) return;
  btn.textContent = isPlaying ? '⏸' : '▶';
}

function setPlaybackEnabled(enabled) {
  playbackControlsEnabled = !!enabled;
  const ids = ['btnPlayPause','btnStop','btnRestart','btnStepBack','btnStepForward'];
  ids.forEach(id => {
    const b = document.getElementById(id);
    if (b) b.disabled = !playbackControlsEnabled || !playback.dataset.length;
  });
  const row = document.getElementById('playbackRow');
  if (row) row.classList.toggle('is-disabled', !playbackControlsEnabled);
  if (!playbackControlsEnabled) setPlayPauseVisual(false);
}

/* -------------------------------------------------------------------------- */
/* Full wipe (used by Reset All) — clears state + results + diagram + playback */
/* -------------------------------------------------------------------------- */
function resetAllApp() {
  // 1) stop any running simulation & remove cursor
  try { simStop(); } catch {}
  const cur = document.getElementById('__sim_cursor'); if (cur) cur.remove();

  // 2) wipe domain state (attackers/targets/vulns/edges)
  StateMod.State.attackers = [];
  StateMod.State.targets   = [];
  StateMod.State.vulns     = [];
  StateMod.State.edges     = { direct: {}, lateral: {}, contains: {} };

  // 3) storage + last-results cache
  try { clearLocal(); } catch {}
  lastResults = [];
  lastMeta = { cycles: false, truncated: false };

  // 4) clear UI: results list, diagram area, size/status labels, inputs
  const resultsEl = el('results');    if (resultsEl) resultsEl.innerHTML = '';
  const diagram   = el('diagramBox');
  if (diagram) {
    diagram.innerHTML = '';
    diagram.removeAttribute('style');
    const oldSvg = diagram.querySelector('svg'); if (oldSvg) oldSvg.remove();
    const ph = document.createElement('div');
    ph.className = 'small';
    ph.textContent = 'Select a path → Diagram';
    diagram.appendChild(ph);
  }
  const svgSizeEl = el('svgSize'); if (svgSizeEl) svgSizeEl.textContent = '—';
  const statusEl  = el('status');  if (statusEl)  statusEl.textContent  = '—';

  const inAtt = el('attackerName'); if (inAtt) inAtt.value = '';
  const inTar = el('targetName');   if (inTar) inTar.value = '';
  const inVul = el('vulnName');     if (inVul) inVul.value = '';

  // 5) **critical** — clear playback dataset BEFORE resetting it,
  //    otherwise playback_resetToStart() will re-render old diagram.
  playback_setDataset([]);   // empties dataset and updates buttons
  playback_resetToStart();   // pauses, index=0, does NOT re-render an old SVG now

  // 6) disable playback controls & re-render lists/selectors
  setPlaybackEnabled(false);
  setPlayPauseVisual(false);
  renderAllUI();
}

/* -------------------------------------------------------------------------- */
/* Bridge playback controls to simulation engine                              */
/* -------------------------------------------------------------------------- */
function bridgeSimulationPlayback() {
  // intentionally empty: unified handlers in wirePlaybackControls()
}

/* -------------------------------------------------------------------------- */
/* Hidden buttons for scenarios that call add/remove link by clicking         */
/* -------------------------------------------------------------------------- */
function ensureSimScenarioLinkButtons() {
  const byId = (id) => document.getElementById(id);

  ['btnAddLink','btnRemoveLink'].forEach(id => {
    if (!byId(id)) {
      const b = document.createElement('button');
      b.id = id;
      b.type = 'button';
      b.hidden = true;
      document.body.appendChild(b);
    }
  });

  const btnAdd = byId('btnAddLink');
  const btnDel = byId('btnRemoveLink');

  const srcSel  = byId('linkSource');
  const dstSel  = byId('linkDest');
  const typeSel = byId('linkType');

  const apply = (mode) => {
    const from = srcSel?.value;
    const type = typeSel?.value || 'direct';
    if (!from || !dstSel) return;

    const selectedTos = [...dstSel.selectedOptions].map(o => o.value);
    if (!selectedTos.length) return;

    selectedTos.forEach(to => {
      try {
        if (mode === 'add') {
          StateMod.addEdge(type, from, to);
        } else {
          StateMod.removeEdge(type, from, to);
        }
      } catch {}
    });

    try { saveToLocal(StateMod.State); } catch {}
    renderLinksInspector();
  };

  if (btnAdd) btnAdd.addEventListener('click', () => apply('add'));
  if (btnDel) btnDel.addEventListener('click', () => apply('del'));
}

/* -------------------------------------------------------------------------- */
/* Initialization                                                             */
/* -------------------------------------------------------------------------- */
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
  wirePlaybackControls();
  bridgeSimulationPlayback();
  ensureSimScenarioLinkButtons();

  // Playback disabled by default until a simulation is started
  setPlaybackEnabled(false);
  setPlayPauseVisual(false);
  playback_setDataset([]);
  playback_renderCurrent();
  playback_updateButtons();
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */
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

  playback_updateButtons();
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

/* -------------------------------------------------------------------------- */
/* Add controls + Reset All                                                   */
/* -------------------------------------------------------------------------- */
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

  const btnResetAll = el('btnResetAll');
  if (btnResetAll) {
    btnResetAll.onclick = () => {
      if (confirm('This will erase all attackers, targets, vulnerabilities, links, results and local storage. Continue?')) {
        resetAllApp();
      }
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Attacker selection                                                         */
/* -------------------------------------------------------------------------- */
function wireAttackerSelection() {
  el('selAttacker').addEventListener('change', () => {
    hydrateEntries();
    hydrateExits();
  });
}

/* -------------------------------------------------------------------------- */
/* Entries (real-time + clear)                                                */
/* -------------------------------------------------------------------------- */
function wireEntries() {
  const sel = el('selEntriesAll');
  const btnClear = el('btnClearEntries');

  if (sel) {
    sel.addEventListener('change', () => {
      const attId = el('selAttacker').value;
      if (!attId) return;
      const ids = [...sel.selectedOptions].map(o => o.value);
      StateMod.setAttackerEntries(attId, ids);
      emitStateChanged();
    });
  }

  if (btnClear) {
    btnClear.onclick = () => {
      const attId = el('selAttacker').value;
      if (!attId) return;
      [...sel.options].forEach(o => o.selected = false);
      StateMod.setAttackerEntries(attId, []);
      emitStateChanged();
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Exits (real-time + clear)                                                  */
/* -------------------------------------------------------------------------- */
function wireExits() {
  const sel = el('selExitsAll');
  const btnClear = el('btnClearExits');

  if (sel) {
    sel.addEventListener('change', () => {
      const attId = el('selAttacker').value;
      if (!attId) return;
      const ids = [...sel.selectedOptions].map(o => o.value);
      StateMod.setAttackerExits(attId, ids);
      emitStateChanged();
    });
  }

  if (btnClear) {
    btnClear.onclick = () => {
      const attId = el('selAttacker').value;
      if (!attId) return;
      [...sel.options].forEach(o => o.selected = false);
      StateMod.setAttackerExits(attId, []);
      emitStateChanged();
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Vulnerabilities (real-time + clear)                                        */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Results rendering                                                          */
/* -------------------------------------------------------------------------- */
function renderResultsList(results) {
  const cont = el('results');
  const svgSizeEl = el('svgSize');
  cont.innerHTML = '';
  if (!results.length) {
    cont.innerHTML = '<div class="small">No paths.</div>';
    if (svgSizeEl) svgSizeEl.textContent = '—';
    playback_setDataset([]);
    return;
  }

  results.forEach((p, idx) => {
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
    btn.onclick = () => playback_showIndex(idx, true);

    row.append(left, btn);
    cont.appendChild(row);
  });

  playback_setDataset(results);
}

/* -------------------------------------------------------------------------- */
/* Top actions (compute/export/import/download)                               */
/* -------------------------------------------------------------------------- */
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
    playback_resetToStart();
  };

  if (chkOnlyVuln) chkOnlyVuln.addEventListener('change', () => {
    renderFiltered();
    playback_resetToStart();
  });

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
      playback_resetToStart();
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Simulation launcher button (auto-scenarios)                                */
/* -------------------------------------------------------------------------- */
function wireSimulationButton() {
  const btn = el('btnSimu');
  if (!btn) return;
  btn.onclick = async () => {
    try {
      disableTopButtons(true);
      setPlaybackEnabled(true);
      setPlayPauseVisual(true); // show "pause" while scenarios run
      btn.textContent = 'Simulating…';
      btn.disabled = true;
      await runSimulation({ renderCallback: () => renderAllUI() });
    } finally {
      btn.textContent = 'Simulation';
      btn.disabled = false;
      enableTopButtons();
      setPlayPauseVisual(false);
      setPlaybackEnabled(false); // re-disable controls when scenarios end
      renderAllUI();
      playback_resetToStart?.();
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Fresh simulation reset helper                                              */
/* -------------------------------------------------------------------------- */
function resetForFreshSimulation() {
  try { simStop(); } catch {}
  const cur = document.getElementById('__sim_cursor');
  if (cur) cur.remove();

  StateMod.State.attackers = [];
  StateMod.State.targets   = [];
  StateMod.State.vulns     = [];
  StateMod.State.edges     = { direct: {}, lateral: {}, contains: {} };

  lastResults = [];
  lastMeta = { cycles: false, truncated: false };

  const resultsEl = el('results');    if (resultsEl) resultsEl.innerHTML = '';
  const diagram = el('diagramBox');
  if (diagram) {
    diagram.innerHTML = '';
    diagram.removeAttribute('style');
    const oldSvg = diagram.querySelector('svg'); if (oldSvg) oldSvg.remove();
    const ph = document.createElement('div'); ph.className = 'small'; ph.textContent = 'Select a path → Diagram';
    diagram.appendChild(ph);
  }

  const svgSizeEl1 = el('svgSize'); if (svgSizeEl1) svgSizeEl1.textContent = '—';
  const statusEl  = el('status');   if (statusEl)  statusEl.textContent = '—';

  try { localStorage.removeItem('envuln-lite-store'); } catch {}

  renderAllUI();
  if (typeof playback_resetToStart === 'function') playback_resetToStart();
  setPlaybackEnabled(false);
  setPlayPauseVisual(false);
}

/* -------------------------------------------------------------------------- */
/* Results playback (diagram paging)                                          */
/* -------------------------------------------------------------------------- */
const playback = {
  dataset: [],
  index: 0,
  playing: false,
  timer: null,
  speed: 1.0,
  baseDelayMs: 1200
};

window.__updatePlaybackButtons = () => playback_updateButtons();

function playback_setDataset(results) {
  playback.dataset = Array.isArray(results) ? results.slice() : [];
  playback.index = 0;
  playback_updateButtons();
}
function playback_current() {
  return playback.dataset[playback.index] || null;
}
function playback_renderCurrent() {
  const p = playback_current();
  const box = el('diagramBox');
  const svgSizeEl = el('svgSize');
  if (!p || !box) {
    if (box) box.innerHTML = '<div class="small">Select a path → Diagram</div>';
    if (svgSizeEl) svgSizeEl.textContent = '—';
    return;
  }
  const svgStr = buildSVGForPath(p, StateMod.State);
  box.innerHTML = svgStr;
  const svg = box.querySelector('svg');
  if (svg && svgSizeEl) {
    const w = +svg.getAttribute('width') || svg.viewBox?.baseVal?.width || svg.getBoundingClientRect().width;
    const h = +svg.getAttribute('height') || svg.viewBox?.baseVal?.height || svg.getBoundingClientRect().height;
    svgSizeEl.textContent = `${Math.round(w)} × ${Math.round(h)} px`;
  }
}
function playback_updateButtons() {
  const btnPP         = el('btnPlayPause');
  const btnStop       = el('btnStop');
  const btnRestart    = el('btnRestart');
  const btnStepBack   = el('btnStepBack');
  const btnStepForward= el('btnStepForward');

  const simRunning = (typeof simIsRunning === 'function') && simIsRunning();
  const hasData    = playback.dataset.length > 0;
  const enableRow  = playbackControlsEnabled && (simRunning || hasData);

  [btnPP, btnStop, btnRestart, btnStepBack, btnStepForward].forEach(b => {
    if (b) b.disabled = !enableRow;
  });

  if (enableRow) {
    if (simRunning) {
      if (btnStepBack)    btnStepBack.disabled    = !simCanStepBack();
      if (btnStepForward) btnStepForward.disabled = !simCanStepForward();
    } else {
      // dataset playback : griser aux bords
      if (btnStepBack)    btnStepBack.disabled    = playback.index <= 0;
      if (btnStepForward) btnStepForward.disabled = playback.index >= (playback.dataset.length - 1);
    }
  }

  if (btnPP) btnPP.textContent = playback.playing ? '⏸' : '▶';
}
function playback_tick() {
  if (!playback.playing) return;
  const delay = Math.max(200, Math.floor(playback.baseDelayMs / Math.max(0.2, playback.speed)));
  clearTimeout(playback.timer);
  playback.timer = setTimeout(() => {
    playback_stepForward();
    if (playback.playing) playback_tick();
  }, delay);
}
function playback_play() {
  if (!playback.dataset.length) return;
  playback.playing = true;
  playback_updateButtons();
  setPlayPauseVisual(true);
  playback_tick();
}
function playback_pause() {
  playback.playing = false;
  clearTimeout(playback.timer);
  playback_updateButtons();
  setPlayPauseVisual(false);
}
function playback_stop() {
  playback_pause();
  playback.index = 0;
  playback_renderCurrent();
}
function playback_restart() {
  playback.index = 0;
  playback_renderCurrent();
  if (playback.playing) playback_tick();
}
function playback_stepForward() {
  if (!playback.dataset.length) return;
  if (playback.index < playback.dataset.length - 1) {
    playback.index += 1;
    playback_renderCurrent();
  }
  playback_updateButtons();
}
function playback_stepBack() {
  if (!playback.dataset.length) return;
  if (playback.index > 0) {
    playback.index -= 1;
    playback_renderCurrent();
  }
  playback_updateButtons();
}
function playback_setSpeed(mult) {
  playback.speed = Math.max(0.2, Math.min(3, +mult || 1));
  const lab = el('simSpeedValue');
  if (lab) lab.textContent = `×${playback.speed.toFixed(1)}`;
  if (playback.playing) playback_tick();
}
function playback_resetToStart() {
  playback_pause();
  playback.index = 0;
  playback_renderCurrent();
}
function playback_showIndex(idx, pauseAfter = false) {
  if (!playback.dataset.length) return;
  playback.index = Math.max(0, Math.min(playback.dataset.length - 1, idx));
  playback_renderCurrent();
  if (pauseAfter) playback_pause();
}
function playback_computeIfNeededAndStart() {
  if (playback.dataset.length > 0) {
    playback_play();
    return;
  }
  const opts = {
    includeLateral: !!el('includeLateral')?.checked,
    includeContains: !!el('includeContains')?.checked
  };
  const max = parseInt(el('maxPaths')?.value || '2000', 10);
  const out = computeAllPaths(StateMod.State, opts, max);
  lastResults = out.paths || [];
  lastMeta = { cycles: !!out.cycles, truncated: !!out.truncated };

  const chkOnlyVuln = el('chkOnlyVuln');
  const hasVulnsEverywhere = p =>
    Array.isArray(p.vulnsPerNode) && p.vulnsPerNode.every(v => Array.isArray(v) && v.length > 0);
  const display = chkOnlyVuln && chkOnlyVuln.checked
    ? lastResults.filter(hasVulnsEverywhere)
    : lastResults;

  renderResultsList(display);

  if (display.length) {
    playback_renderCurrent();
    playback_play();
  } else {
    renderStatus('0 paths • check entries/exits and links');
  }
}

/* -------------------------------------------------------------------------- */
/* Wire dataset+simulation playback controls (single source of truth)         */
/* -------------------------------------------------------------------------- */
function wirePlaybackControls() {
  const btnPP         = el('btnPlayPause');
  const btnStop       = el('btnStop');
  const btnRestart    = el('btnRestart');
  const btnStepBack   = el('btnStepBack');
  const btnStepForward= el('btnStepForward');
  const speed         = el('simSpeed');

  // Play / Pause
  if (btnPP) {
    btnPP.onclick = () => {
      if (simIsRunning && simIsRunning()) {
        if (simIsPaused && simIsPaused()) {
          try { simPlay(); } catch {}
          setPlayPauseVisual(true);
        } else {
          try { simPause(); } catch {}
          setPlayPauseVisual(false);
        }
        playback_updateButtons();
        return;
      }
      // Dataset playback
      if (playback.playing) {
        playback_pause();
      } else {
        if (!playback.dataset.length) {
          playback_computeIfNeededAndStart();
        } else {
          if (!el('diagramBox')?.querySelector('svg')) playback_renderCurrent();
          playback_play();
        }
      }
      playback_updateButtons();
    };
  }

  // Stop
  if (btnStop) {
    btnStop.onclick = () => {
      if (simIsRunning && simIsRunning()) {
        try { simStop(); } catch {}
        try { simCleanupUI(); } catch {}
        setPlayPauseVisual(false);
        setPlaybackEnabled(false);
        playback_updateButtons();
        return;
      }
      // Dataset playback stop
      playback_stop();
      playback_updateButtons();
    };
  }

  if (btnRestart) {
    btnRestart.onclick = async () => {
      if (simIsRunning && simIsRunning()) {
        try { simStop(); } catch {}
        try { simCleanupUI(); } catch {}

        try {
          disableTopButtons(true);
          setPlaybackEnabled(true);
          setPlayPauseVisual(true);
          const b = el('btnSimu');
          if (b) { b.textContent = 'Simulating…'; b.disabled = true; }
          await runSimulation({ renderCallback: () => renderAllUI() });
        } finally {
          const b = el('btnSimu');
          if (b) { b.textContent = 'Simulation'; b.disabled = false; }
          enableTopButtons();
          setPlayPauseVisual(false);
          setPlaybackEnabled(false);
          renderAllUI();
          playback_resetToStart?.();
          playback_updateButtons();
        }
        return;
      }
      playback_restart();
      playback_updateButtons();
    };
  }

  // Step back
  if (btnStepBack) {
    btnStepBack.onclick = () => {
      if (simIsRunning && simIsRunning()) {
        try { simPause(); } catch {}
        try { simStepBack(10); } catch {}
        setPlayPauseVisual(false);
        playback_updateButtons();
        return;
      }
      playback_pause();
      playback_stepBack();
      playback_updateButtons();
    };
  }

  // Step forward
  if (btnStepForward) {
    btnStepForward.onclick = () => {
      if (simIsRunning && simIsRunning()) {
        try { simPause(); } catch {}
        try { simStepForward(10); } catch {}
        setPlayPauseVisual(false);
        playback_updateButtons();
        return;
      }
      playback_pause();
      playback_stepForward();
      playback_updateButtons();
    };
  }

  // Speed
  if (speed) {
    playback_setSpeed(speed.value || 1);
    try { simSetSpeed(parseFloat(speed.value || '1') || 1); } catch {}
    const lab = el('simSpeedValue');
    if (lab) lab.textContent = `×${(+speed.value || 1).toFixed(1)}`;
    speed.addEventListener('input', () => {
      playback_setSpeed(speed.value);
      try { simSetSpeed(parseFloat(speed.value || '1') || 1); } catch {}
    });
  }

  // État initial propre
  playback_updateButtons();
  playback_renderCurrent();
}

/* -------------------------------------------------------------------------- */
/* Convenience export if needed elsewhere                                     */
/* -------------------------------------------------------------------------- */
function playback_setExternalResults(results) {
  playback_setDataset(results);
  playback_resetToStart();
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */
window.__envuln_boot = {
  State: StateMod.State,
  computeAllPaths,
  playback_setExternalResults
};
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
