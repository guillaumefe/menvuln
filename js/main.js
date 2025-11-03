// js/main.js
// Main UI logic with immediate persistence and dual playback:
// - dataset playback for computed paths (left/right navigation)
// - simulation playback bridge (play/pause/stop/restart/step; speed control)

import './simulation/scenarios.js';

import { el, norm, uid } from './helpers.js';
import * as StateMod from './state.js';
import { saveToLocal, loadFromLocal, clearLocal } from './storage.js';
import { exportJSONSelective, parseImportJSONPartial } from './storage.js';
import {
  renderAttackers,
  renderTargets,
  renderVulns,
  populateSelectors,
  renderLinksInspector,
  setOptions,
  hydrateEntriesSelect,
  hydrateExitsSelect,
  hydrateVulnSelectors
} from './ui/lists.js';
import { wireLinksUI } from './ui/links.js';
import { computeAllPaths } from './paths.js';
import { buildSVGForPath } from './diagram.js';
import { exportODS } from './exportODS.js';
import {
  runSimulation,
  disableTopButtons,
  enableTopButtons,
  simPlay, simPause, simStop, simStep, simSetSpeed,
  simStepBack, simStepForward,
  simIsRunning, simIsPaused,
  simCanStepBack, simCanStepForward,
  simCleanupUI
} from './simulation/index.js';

let lastResults = [];
let lastMeta = { cycles: false, truncated: false };

/* -------------------------------------------------------------------------- */
/* UI selection store                                                         */
/* -------------------------------------------------------------------------- */
const UI_STORE_KEY = 'menvuln-lite-ui';
function saveUISelection(){
  try {
    localStorage.setItem(UI_STORE_KEY, JSON.stringify({
      attackerId: el('selAttacker')?.value || null,
      vulnTargetId: el('selVulnElement')?.value || null
    }));
  } catch {}
}
function loadUISelection(){
  try { return JSON.parse(localStorage.getItem(UI_STORE_KEY) || '{}'); }
  catch { return {}; }
}

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
/* Playback UI helpers                                                        */
/* -------------------------------------------------------------------------- */
let playbackControlsEnabled = false;

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
/* Full wipe (used by Reset All)                                              */
/* -------------------------------------------------------------------------- */
function resetAllApp() {
  try { simStop(); } catch {}
  const cur = document.getElementById('__sim_cursor'); if (cur) cur.remove();

  StateMod.State.attackers = [];
  StateMod.State.targets   = [];
  StateMod.State.vulns     = [];
  StateMod.State.edges     = { direct: {}, lateral: {}, contains: {} };

  try { clearLocal(); } catch {}
  try { localStorage.removeItem(UI_STORE_KEY); } catch {}
  lastResults = [];
  lastMeta = { cycles: false, truncated: false };

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

  playback_setDataset([]);
  playback_resetToStart();

  setPlaybackEnabled(false);
  setPlayPauseVisual(false);
  renderAllUI();
}

/* -------------------------------------------------------------------------- */
/* Bridge playback controls to simulation engine                              */
/* -------------------------------------------------------------------------- */
function bridgeSimulationPlayback() {
  // no-op
}

/* --------------------------------------------------------------------------
   Hidden buttons for scenarios that call add/remove link by clicking
   -------------------------------------------------------------------------- */
function ensureSimScenarioLinkButtons() {
  const byId = (id) => document.getElementById(id);

  ['btnAddLink', 'btnRemoveLink'].forEach(id => {
    if (!byId(id)) {
      const b = document.createElement('button');
      b.id = id;
      b.type = 'button';
      b.hidden = true;
      document.body.appendChild(b);
    }
  });

  function ensureSelect(id, multiple = false) {
    let s = byId(id);
    if (!s) {
      s = document.createElement('select');
      s.id = id;
      if (multiple) s.multiple = true;
      s.hidden = true;
      document.body.appendChild(s);
    }
    return s;
  }

  const srcSel  = ensureSelect('linkSource', false);
  const dstSel  = ensureSelect('linkDest', true);
  const typeSel = ensureSelect('linkType', false);

  if (typeSel.options.length === 0) {
    ['direct','lateral','contains'].forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      typeSel.appendChild(opt);
    });
  }

  function populateTargetOptions() {
    [srcSel, dstSel].forEach(sel => {
      while (sel.firstChild) sel.removeChild(sel.firstChild);
    });

    (window.State?.targets || []).forEach(t => {
      const o1 = document.createElement('option');
      o1.value = t.id;
      o1.textContent = t.name;
      srcSel.appendChild(o1);

      const o2 = document.createElement('option');
      o2.value = t.id;
      o2.textContent = t.name;
      dstSel.appendChild(o2);
    });
  }

  populateTargetOptions();

  document.addEventListener('state:changed', () => {
    populateTargetOptions();
  });

  const btnAdd = byId('btnAddLink');
  const btnDel = byId('btnRemoveLink');

  const apply = (mode, btnClicked) => {
    populateTargetOptions();

    let from = srcSel?.value;
    const type = typeSel?.value || 'direct';
    let selectedTos = [...(dstSel?.selectedOptions || [])].map(o => o.value);

    if ((!from || !selectedTos.length) && btnClicked) {
      const ds = btnClicked.dataset || {};
      if (!from && ds.src) from = ds.src;
      if ((!selectedTos.length) && ds.tos) selectedTos = String(ds.tos).split(',').map(x=>x.trim()).filter(Boolean);
    }

    if (!from || !selectedTos.length) {
      console.warn('[sim links] apply() skipped: missing from or tos', { from, selectedTos, type });
      return;
    }

    try {
      selectedTos.forEach(to => {
        if (mode === 'add') {
          StateMod.addEdge(type, from, to);
        } else {
          StateMod.removeEdge(type, from, to);
        }
      });
    } catch (e) {
      console.error('[sim links] apply error', e);
    }

    try { saveToLocal(StateMod.State); } catch {}
    try { renderLinksInspector(); } catch {}
  };

  if (btnAdd) btnAdd.addEventListener('click', (ev) => apply('add', ev.currentTarget));
  if (btnDel) btnDel.addEventListener('click', (ev) => apply('del', ev.currentTarget));
}

/* -------------------------------------------------------------------------- */
/* Initialization                                                             */
/* -------------------------------------------------------------------------- */
async function init() {
  const loaded = loadFromLocal();
  if (loaded) StateMod.hydrate(loaded);

  StateMod.State.targets.forEach(t => StateMod.ensureEdgeMaps(t.id));

  renderAllUI();

  const ui = loadUISelection();
  if (ui.attackerId) {
    const selAtt = el('selAttacker');
    if (selAtt && [...selAtt.options].some(o => o.value === ui.attackerId)) {
      selAtt.value = ui.attackerId;
      hydrateEntriesSelect(StateMod.State);
      hydrateExitsSelect(StateMod.State);
    }
  }
  if (ui.vulnTargetId) {
    const selT = el('selVulnElement');
    if (selT && [...selT.options].some(o => o.value === ui.vulnTargetId)) {
      selT.value = ui.vulnTargetId;
      hydrateVulnSelectors(StateMod.State);
    }
  }

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

  hydrateEntriesSelect(StateMod.State);
  hydrateExitsSelect(StateMod.State);
  hydrateVulnSelectors(StateMod.State);

  renderLinksInspector();

  playback_updateButtons();
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
    hydrateEntriesSelect(StateMod.State);
    hydrateExitsSelect(StateMod.State);
    saveUISelection();
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
    hydrateVulnSelectors(StateMod.State);
    saveUISelection();
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
/* Helpers: “Only vulnerable paths” & result post-processing                  */
/* -------------------------------------------------------------------------- */
const hasVulnsEverywhere = (p) =>
  Array.isArray(p.vulnsPerNode) &&
  p.vulnsPerNode.length > 0 &&
  p.vulnsPerNode.every(v => Array.isArray(v) && v.length > 0);

// Boost enumeration to ensure we keep the shortest paths under a low UI limit.
// Then sort by hop count ascending and trim back to UI limit.
function postProcessResultsForLimit(paths, uiMax) {
  const sorted = (paths || []).slice().sort((a,b) => (a.nodes?.length||0) - (b.nodes?.length||0));
  const sliced  = sorted.slice(0, Math.max(0, +uiMax || 0));
  return sliced;
}

/* -------------------------------------------------------------------------- */
/* Results rendering                                                          */
/* -------------------------------------------------------------------------- */
function renderResultsList(results) {
  const cont = el('results');
  const svgSizeEl = el('svgSize');
  cont.innerHTML = '';
  if (!results.length) {
    const filterOn = !!el('chkOnlyVuln')?.checked;
    const msg = (filterOn && (lastResults?.length || 0) > 0)
      ? 'No paths match the "Only vulnerable paths" filter.'
      : 'No paths.';
    cont.innerHTML = `<div class="small">${msg}</div>`;
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
    const uiMax = parseInt(el('maxPaths').value, 10);

    // boost enumeration, then re-order and trim to UI limit
    const boostedMax = Math.min(Math.max(uiMax * 10, uiMax), 50000);
    const out = computeAllPaths(StateMod.State, opts, boostedMax);

    const reordered = postProcessResultsForLimit(out.paths || [], uiMax);
    lastResults = reordered;
    lastMeta = { cycles: !!out.cycles, truncated: (out.truncated || (out.paths || []).length > uiMax) };

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
      showExportJSONDialog();
    };
  }

  if (btnImportJSON && fileIn) {
    btnImportJSON.onclick = () => fileIn.click();

    fileIn.onchange = async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) { fileIn.value = ''; return; }
      const txt = await file.text();
      const autoParse = parseImportJSONPartial(txt, ['all']);
      if (!autoParse.ok) {
        alert('Invalid JSON file.');
        fileIn.value = '';
        return;
      }
      showImportJSONDialog(txt, autoParse.payload);
      fileIn.value = '';
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Modal helpers and JSON import/export dialogs                               */
/* -------------------------------------------------------------------------- */
function showModal(titleText, bodyEl, buttons) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:999999';
  const box = document.createElement('div');
  box.style.cssText = 'width:520px;max-width:92%;background:#0b1224;border-radius:8px;padding:16px;color:#e6eef8;box-shadow:0 8px 30px rgba(0,0,0,0.6)';
  const title = document.createElement('div'); title.style.fontWeight = '600'; title.style.marginBottom = '10px'; title.textContent = titleText;
  const content = document.createElement('div'); content.appendChild(bodyEl);
  const btnRow = document.createElement('div'); btnRow.style.marginTop = '12px'; btnRow.style.display = 'flex'; btnRow.style.justifyContent = 'flex-end'; btnRow.style.gap = '8px';

  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    btn.type = 'button';
    if (!b.primary) btn.className = 'ghost';
    btn.onclick = () => { document.body.removeChild(overlay); b.onClick(); };
    btnRow.appendChild(btn);
  });

  box.appendChild(title);
  box.appendChild(content);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function showExportJSONDialog() {
  const form = document.createElement('div');

  const help = document.createElement('div');
  help.className = 'small';
  help.textContent = 'Select domains to include in the exported JSON.';
  help.style.marginBottom = '8px';
  form.appendChild(help);

  const domains = ['attackers','targets','vulns','edges'];
  const checks = {};
  domains.forEach(d => {
    const row = document.createElement('div');
    row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '8px'; row.style.marginBottom = '6px';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = (d !== 'edges');
    checks[d] = cb;
    const lab = document.createElement('label'); lab.appendChild(cb); lab.append(' ' + d);
    row.appendChild(lab);
    form.appendChild(row);
  });

  showModal('Export JSON - Select domains', form, [
    { label: 'Cancel', onClick: () => {}, primary:false },
    { label: 'Export', onClick: () => {
      const selected = Object.keys(checks).filter(k => checks[k].checked);
      if (selected.includes('targets') && !selected.includes('edges')) selected.push('edges');
      exportJSONSelective(StateMod.dehydrate(), selected);
    }, primary:true }
  ]);
}

function showImportJSONDialog(txt, payload) {
  const form = document.createElement('div');

  const info = document.createElement('div');
  info.className = 'small';
  info.textContent = 'Select domains to import. Merge adds to current state; Wipe replaces selected domains.';
  info.style.marginBottom = '8px';
  form.appendChild(info);

  const domains = ['attackers','targets','vulns'];
  const checks = {};
  domains.forEach(d => {
    const row = document.createElement('div');
    row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '8px'; row.style.marginBottom = '6px';
    const cb = document.createElement('input'); cb.type = 'checkbox';
    cb.checked = Array.isArray(payload[d]) && payload[d].length > 0;
    checks[d] = cb;
    const lab = document.createElement('label'); lab.appendChild(cb); lab.append(' ' + d);
    row.appendChild(lab);
    form.appendChild(row);
  });

  const modeRow = document.createElement('div');
  modeRow.style.marginTop = '8px';
  const rWipe = document.createElement('input'); rWipe.type='radio'; rWipe.name='impMode'; rWipe.value='wipe'; rWipe.id='impWipe';
  const rMerge = document.createElement('input'); rMerge.type='radio'; rMerge.name='impMode'; rMerge.value='merge'; rMerge.id='impMerge'; rMerge.checked = true;
  const labW = document.createElement('label'); labW.appendChild(rWipe); labW.append(' Wipe (replace) ');
  const labM = document.createElement('label'); labM.appendChild(rMerge); labM.append(' Merge (add) ');
  modeRow.appendChild(labM); modeRow.appendChild(labW);
  form.appendChild(modeRow);

  const note = document.createElement('div'); note.className = 'small'; note.style.marginTop='8px';
  note.textContent = 'When merging, a namespace is required if duplicate names are detected. It must start with a letter and contain only letters, digits, or underscore.';
  form.appendChild(note);

  const nsRow = document.createElement('div');
  nsRow.style.marginTop = '8px';
  const nsLabel = document.createElement('label'); nsLabel.textContent = 'Namespace: ';
  const nsInput = document.createElement('input'); nsInput.type = 'text'; nsInput.placeholder = 'optional_namespace';
  nsInput.style.marginLeft = '8px';
  nsRow.appendChild(nsLabel); nsRow.appendChild(nsInput);
  form.appendChild(nsRow);

  function validateNamespace(s) {
    if (!s) return false;
    return /^[A-Za-z][A-Za-z0-9_]*$/.test(s);
  }

  showModal('Import JSON - Domains & mode', form, [
    { label: 'Cancel', onClick: () => {}, primary:false },
    { label: 'Next', onClick: () => {
      const selected = domains.filter(d => checks[d].checked);
      if (!selected.length) { alert('No domains selected.'); return; }
      const mode = rWipe.checked ? 'wipe' : 'merge';

      const parseRes = parseImportJSONPartial(txt, selected);
      if (!parseRes.ok) { alert('Failed to parse import JSON.'); return; }
      const imported = parseRes.payload;

      if (mode === 'wipe') {
        const current = StateMod.dehydrate();
        if (selected.includes('vulns')) current.vulns = imported.vulns || [];
        if (selected.includes('targets')) {
          current.targets = imported.targets || [];
          current.edges = imported.edges || {direct:{}, lateral:{}, contains:{}};
        }
        if (selected.includes('attackers')) current.attackers = imported.attackers || [];
        StateMod.hydrate(current);
        StateMod.State.targets.forEach(t => StateMod.ensureEdgeMaps(t.id));
        try { saveToLocal(StateMod.State); } catch {}
        renderAllUI();
        return;
      }

      const cur = StateMod.dehydrate();
      const dupeInfo = { attackers: [], targets: [], vulns: [] };
      const makeNameSet = (arr) => new Set((arr || []).map(x => String(x.name || '').trim().toLowerCase()));

      const curAttackers = makeNameSet(cur.attackers);
      const curTargets = makeNameSet(cur.targets);
      const curVulns = makeNameSet(cur.vulns);

      (imported.attackers || []).forEach(a => {
        if (curAttackers.has(String(a.name || '').trim().toLowerCase())) dupeInfo.attackers.push(a.name);
      });
      (imported.targets || []).forEach(t => {
        if (curTargets.has(String(t.name || '').trim().toLowerCase())) dupeInfo.targets.push(t.name);
      });
      (imported.vulns || []).forEach(v => {
        if (curVulns.has(String(v.name || '').trim().toLowerCase())) dupeInfo.vulns.push(v.name);
      });

      const anyDupe = (dupeInfo.attackers.length || dupeInfo.targets.length || dupeInfo.vulns.length) > 0;

      if (anyDupe && !validateNamespace(nsInput.value.trim())) {
        alert('Duplicate names detected. A valid namespace is required. Example: teamA_');
        showImportJSONDialog(txt, payload);
        return;
      }

      const namespace = nsInput.value.trim();
      const applyNamespaceToName = (name) => namespace ? `${namespace}_${name}` : name;

      const idMap = new Map();
      const remapped = { attackers: [], targets: [], vulns: [], edges: { direct: {}, lateral: {}, contains: {} } };

      (imported.vulns || []).forEach(v => {
        const newId = uid();
        idMap.set(String(v.id), newId);
        remapped.vulns.push({ id: newId, name: applyNamespaceToName(v.name) });
      });

      (imported.targets || []).forEach(t => {
        const newId = uid();
        idMap.set(String(t.id), newId);
        const newVulns = (t.vulns || []).map(vId => idMap.get(String(vId)) || String(vId));
        remapped.targets.push({ id: newId, name: applyNamespaceToName(t.name), vulns: newVulns, final: !!t.final });
      });

      (imported.attackers || []).forEach(a => {
        const newId = uid();
        idMap.set(String(a.id), newId);
        const newEntries = (a.entries || []).map(e => idMap.get(String(e)) || String(e));
        const newExits   = (a.exits   || []).map(e => idMap.get(String(e)) || String(e));
        remapped.attackers.push({ id: newId, name: applyNamespaceToName(a.name), entries: newEntries, exits: newExits });
      });

      const remapEdgeMap = (mapIn) => {
        const out = {};
        Object.keys(mapIn || {}).forEach(fromId => {
          const tos = Array.isArray(mapIn[fromId]) ? mapIn[fromId] : [];
          const newFrom = idMap.get(String(fromId)) || null;
          if (!newFrom) return;
          out[newFrom] = tos.map(t => idMap.get(String(t)) || String(t));
        });
        return out;
      };

      remapped.edges.direct = remapEdgeMap(imported.edges.direct || {});
      remapped.edges.lateral = remapEdgeMap(imported.edges.lateral || {});
      remapped.edges.contains = remapEdgeMap(imported.edges.contains || {});

      const merged = StateMod.dehydrate();

      if (selected.includes('vulns')) merged.vulns = merged.vulns.concat(remapped.vulns);
      if (selected.includes('targets')) merged.targets = merged.targets.concat(remapped.targets);
      if (selected.includes('attackers')) merged.attackers = merged.attackers.concat(remapped.attackers);

      if (selected.includes('targets')) {
        merged.edges.direct   = merged.edges.direct   || {};
        merged.edges.lateral  = merged.edges.lateral  || {};
        merged.edges.contains = merged.edges.contains || {};
        Object.assign(merged.edges.direct,   remapped.edges.direct || {});
        Object.assign(merged.edges.lateral,  remapped.edges.lateral || {});
        Object.assign(merged.edges.contains, remapped.edges.contains || {});
      }

      StateMod.hydrate(merged);
      StateMod.State.targets.forEach(t => StateMod.ensureEdgeMaps(t.id));
      try { saveToLocal(StateMod.State); } catch {}
      renderAllUI();
      return;
    }, primary:true }
  ]);
}

/* -------------------------------------------------------------------------- */
/* Simulation launcher button                                                 */
/* -------------------------------------------------------------------------- */
function wireSimulationButton() {
  const btn = el('btnSimu');
  if (!btn) return;
  btn.onclick = async () => {
    try {
      disableTopButtons(true);
      setPlaybackEnabled(true);
      setPlayPauseVisual(true);
      playback_updateButtons();
      btn.textContent = 'Simulating…';
      btn.disabled = true;
      await runSimulation({ renderCallback: () => renderAllUI() });
    } finally {
      btn.textContent = 'Simulation';
      btn.disabled = false;
      enableTopButtons();
      setPlayPauseVisual(false);
      setPlaybackEnabled(false);
      renderAllUI();
      playback_resetToStart?.();
      playback_updateButtons();
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
    const ph = document.createElement('div'); ph.className = 'small'; text = 'Select a path → Diagram';
    ph.textContent = text;
    diagram.appendChild(ph);
  }

  const svgSizeEl1 = el('svgSize'); if (svgSizeEl1) svgSizeEl1.textContent = '—';
  const statusEl  = el('status');   if (statusEl)  statusEl.textContent = '—';

  try { localStorage.removeItem('menvuln-lite-store'); } catch {}
  try { localStorage.removeItem(UI_STORE_KEY); } catch {}

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
  const btnPP          = el('btnPlayPause');
  const btnStop        = el('btnStop');
  const btnRestart     = el('btnRestart');
  const btnStepBack    = el('btnStepBack');
  const btnStepForward = el('btnStepForward');

  const simRunning = (typeof simIsRunning === 'function') && simIsRunning();
  const simPaused  = (typeof simIsPaused  === 'function') && simIsPaused();
  const hasData    = playback.dataset.length > 0;

  const enableRow  = playbackControlsEnabled && (simRunning || hasData);

  [btnPP, btnStop, btnRestart, btnStepBack, btnStepForward].forEach(b => {
    if (b) b.disabled = !enableRow;
  });

  if (enableRow) {
    if (simRunning) {
      if (btnStepBack)    btnStepBack.disabled    = !(typeof simCanStepBack === 'function' && simCanStepBack());
      if (btnStepForward) btnStepForward.disabled = !(typeof simCanStepForward === 'function' && simCanStepForward());
    } else {
      if (btnStepBack)    btnStepBack.disabled    = playback.index <= 0;
      if (btnStepForward) btnStepForward.disabled = playback.index >= (playback.dataset.length - 1);
    }
  }

  if (btnPP) {
    if (simRunning) {
      btnPP.textContent = simPaused ? '▶' : '⏸';
    } else {
      btnPP.textContent = playback.playing ? '⏸' : '▶';
    }
  }
}
function playback_tick() {
  if (!playback.playing) return;
  // Non-linear scaling so ×3 is much faster
  const denom = Math.pow(Math.max(0.2, playback.speed), 1.8);
  const delay = Math.max(80, Math.floor(playback.baseDelayMs / denom));
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
  const uiMax = parseInt(el('maxPaths')?.value || '2000', 10);

  const boostedMax = Math.min(Math.max(uiMax * 10, uiMax), 50000);
  const out = computeAllPaths(StateMod.State, opts, boostedMax);
  lastResults = postProcessResultsForLimit(out.paths || [], uiMax);
  lastMeta = { cycles: !!out.cycles, truncated: (out.truncated || (out.paths || []).length > uiMax) };

  const chkOnlyVuln = el('chkOnlyVuln');
  const display = chkOnlyVuln && chkOnlyVuln.checked
    ? lastResults.filter(hasVulnsEverywhere)
    : lastResults;

  renderResultsList(display);

  if (display.length) {
    playback_renderCurrent();
    playback_play();
  } else {
    const filterOn = !!el('chkOnlyVuln')?.checked;
    const anyExits = (StateMod.State.attackers || []).some(a => (a.exits instanceof Set ? a.exits.size : (a.exits || []).length) > 0);
    if (filterOn && (lastResults?.length || 0) > 0) {
      renderStatus('0 paths • all were excluded by "Only vulnerable paths".');
    } else if (anyExits) {
      renderStatus('0 paths • check exit nodes are actually reachable.');
    } else {
      renderStatus('0 paths • check entries, links and options.');
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Wire dataset + simulation playback controls                                */
/* -------------------------------------------------------------------------- */
function wirePlaybackControls() {
  const btnPP         = el('btnPlayPause');
  const btnStop       = el('btnStop');
  const btnRestart    = el('btnRestart');
  const btnStepBack   = el('btnStepBack');
  const btnStepForward= el('btnStepForward');
  const speed         = el('simSpeed');

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
window.__menvuln_boot = {
  State: StateMod.State,
  computeAllPaths,
  playback_setExternalResults
};
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

