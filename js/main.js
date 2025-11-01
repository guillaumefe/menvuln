// js/main.js
// Main UI logic with immediate persistence and dual playback:
// - dataset playback for computed paths (left/right navigation)
// - simulation playback bridge (play/pause/stop/restart/step; speed control)

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
  enableTopButtons,
  simPlay, simPause, simToggle, simStop, simStep, simSetSpeed,
  simIsRunning, simIsPaused,
  simStepBack, simStepForward
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
/* Playback bridge to the simulation                                          */
/* -------------------------------------------------------------------------- */
function bridgeSimulationPlayback() {
  const btnPP = el('btnPlayPause');
  const btnStop = el('btnStop');
  const btnRestart = el('btnRestart');
  const btnStepBack = el('btnStepBack');
  const btnStepForward = el('btnStepForward');
  const speed = el('simSpeed');
  const speedLabel = el('simSpeedValue');

  const updateLabels = () => {
    const running = simIsRunning();
    const paused  = simIsPaused();
    if (btnPP) btnPP.textContent = (running && !paused) ? 'Pause' : 'Play';
  };

  // speed → simulation
  if (speed) {
    const applySpeed = () => {
      const v = parseFloat(speed.value || '1') || 1;
      simSetSpeed(v);
      if (speedLabel) speedLabel.textContent = `×${v.toFixed(1)}`;
    };
    applySpeed();
    speed.addEventListener('input', applySpeed);
  }

  // play/pause
  if (btnPP) {
    btnPP.addEventListener('click', async () => {
      if (!simIsRunning()) {
        simPlay();
        updateLabels(); // should display "Pause"
        await runSimulation({ renderCallback: () => renderAllUI() });
        updateLabels();
      } else {
        simToggle();
        updateLabels();
      }
    });
  }

  // stop: fully stop and hide cursor (handled in simStop)
  if (btnStop) {
    btnStop.addEventListener('click', () => {
      if (simIsRunning()) simStop();
      updateLabels(); // back to Play
    });
  }

  // restart: stop then start fresh
  if (btnRestart) {
    btnRestart.addEventListener('click', async () => {
      if (simIsRunning()) simStop();
      setTimeout(async () => {
        simPlay();
        updateLabels();
        await runSimulation({ renderCallback: () => renderAllUI() });
        updateLabels();
      }, 60);
    });
  }

  // step back/forward: move the cursor a few timeline ticks and remain paused
  if (btnStepBack) {
    btnStepBack.addEventListener('click', () => {
      simStepBack(10);
      if (btnPP) btnPP.textContent = 'Play';
    });
  }
  if (btnStepForward) {
    btnStepForward.addEventListener('click', () => {
      simStepForward(10);
      if (btnPP) btnPP.textContent = 'Play';
    });
  }

  updateLabels();
}

/* -------------------------------------------------------------------------- */
/* Shim for scenario link buttons (works even if buttons are not in the DOM)  */
/* -------------------------------------------------------------------------- */
function ensureSimScenarioLinkButtons() {
  const byId = (id) => document.getElementById(id);

  // create hidden buttons if missing
  ['btnAddLink','btnRemoveLink'].forEach(id => {
    if (!byId(id)) {
      const b = document.createElement('button');
      b.id = id;
      b.type = 'button';
      b.hidden = true;
      document.body.appendChild(b);
    }
  });

  // handlers: read current UI selections and apply state changes
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
      } catch(e) { /* ignore */ }
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
  wirePlaybackControls();       // dataset playback
  bridgeSimulationPlayback();   // simulation playback
  ensureSimScenarioLinkButtons();
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
/* Add controls                                                               */
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
      btn.textContent = 'Simulating…';
      btn.disabled = true;
      await runSimulation({ renderCallback: () => renderAllUI() });
    } finally {
      btn.textContent = 'Simulation';
      btn.disabled = false;
      enableTopButtons();
      renderAllUI();
      playback_resetToStart();
    }
  };
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
  const hasData = playback.dataset.length > 0;
  const btnPP = el('btnPlayPause');
  const btnStop = el('btnStop');
  const btnRestart = el('btnRestart');
  const btnStepBack = el('btnStepBack');
  const btnStepForward = el('btnStepForward');

  [btnPP, btnStop, btnRestart, btnStepBack, btnStepForward].forEach(b => {
    if (b) b.disabled = !hasData;
  });
  if (btnPP) btnPP.textContent = playback.playing ? 'Pause' : 'Play';
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
  playback_tick();
}
function playback_pause() {
  playback.playing = false;
  clearTimeout(playback.timer);
  playback_updateButtons();
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
  playback.index = (playback.index + 1) % playback.dataset.length;
  playback_renderCurrent();
}
function playback_stepBack() {
  if (!playback.dataset.length) return;
  playback.index = (playback.index - 1 + playback.dataset.length) % playback.dataset.length;
  playback_renderCurrent();
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
/* Wire dataset playback controls                                             */
/* -------------------------------------------------------------------------- */
function wirePlaybackControls() {
  const btnPP = el('btnPlayPause');
  const btnStop = el('btnStop');
  const btnRestart = el('btnRestart');
  const btnStepBack = el('btnStepBack');
  const btnStepForward = el('btnStepForward');
  const speed = el('simSpeed');

  if (btnPP) {
    btnPP.onclick = () => {
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
    };
  }
  if (btnStop) btnStop.onclick = () => playback_stop();
  if (btnRestart) btnRestart.onclick = () => playback_restart();
  if (btnStepBack) btnStepBack.onclick = () => { playback_pause(); playback_stepBack(); };
  if (btnStepForward) btnStepForward.onclick = () => { playback_pause(); playback_stepForward(); };

  if (speed) {
    playback_setSpeed(speed.value || 1);
    speed.addEventListener('input', () => playback_setSpeed(speed.value));
  }

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
init();
