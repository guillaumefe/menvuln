/* =========================================================
   simulation/index.js
   UI-driven simulation with a virtual cursor (mouse gestures)
   Controller supports play / pause / stop / restart /step,
   speed control, and cursor timeline stepping.
   ========================================================= */

import { State } from '../state.js';
import { saveToLocal } from '../storage.js';

const SCENARIOS = [];

/* ---------------- Registry ---------------- */
export function registerScenario(name, fn, weight = 1) {
  SCENARIOS.push({ name, fn, weight: Math.max(0, +weight || 1) });
}

/* ---------------- Global controller state ---------------- */
const CTRL = {
  paused: false,
  stopRequested: false,
  running: false,
  stepArmed: false,   // single-step gate for "step forward"
  speed: 1.0          // 0.2..3.0
};

/* ---------------- Abort helper ---------------- */
function shouldAbort() { return CTRL.stopRequested === true; }

/* ---------------- State snapshot / restore (sandbox) ---------------- */
let _snapshot = null;

function takeSnapshot() {
  try {
    // structuredClone preserves Sets/Maps/Date; good for our State shape.
    _snapshot = structuredClone(State);
  } catch {
    // last resort: shallow rebuild (Sets will still be Sets because current State uses Sets)
    _snapshot = JSON.parse(JSON.stringify({
      version: State.version,
      attackers: State.attackers.map(a => ({
        id: a.id, name: a.name,
        entries: [...a.entries],
        exits:   [...a.exits]
      })),
      targets: State.targets.map(t => ({
        id: t.id, name: t.name,
        vulns: [...t.vulns],
        final: !!t.final
      })),
      edges: {
        direct:   Object.fromEntries(Object.entries(State.edges.direct   || {}).map(([k,v]) => [k, [...v]])),
        lateral:  Object.fromEntries(Object.entries(State.edges.lateral  || {}).map(([k,v]) => [k, [...v]])),
        contains: Object.fromEntries(Object.entries(State.edges.contains || {}).map(([k,v]) => [k, [...v]])),
      }
    }));
    // Rehydrate Sets
    _snapshot.targets.forEach(t => t.vulns = new Set(t.vulns || []));
    _snapshot.attackers.forEach(a => {
      a.entries = new Set(a.entries || []);
      a.exits   = new Set(a.exits   || []);
    });
    for (const m of ['direct','lateral','contains']) {
      for (const k in _snapshot.edges[m]) {
        _snapshot.edges[m][k] = new Set(_snapshot.edges[m][k] || []);
      }
    }
  }
}

function restoreSnapshot() {
  if (!_snapshot) return;

  // Replace State fields in-place (keep same object reference)
  State.version   = _snapshot.version;
  State.attackers = _snapshot.attackers.map(a => ({
    id: a.id, name: a.name,
    entries: new Set(a.entries),
    exits:   new Set(a.exits)
  }));
  State.targets   = _snapshot.targets.map(t => ({
    id: t.id, name: t.name,
    vulns: new Set(t.vulns),
    final: !!t.final
  }));
  State.edges = { direct:{}, lateral:{}, contains:{} };
  for (const m of ['direct','lateral','contains']) {
    for (const k in _snapshot.edges[m]) {
      State.edges[m][k] = new Set(_snapshot.edges[m][k]);
    }
  }

  try { saveToLocal(State); } catch {}
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
}

/* ---------------- Cursor timeline (for step back/forward) ---------------- */
const TIMELINE = { points: [], idx: -1 };

function timelineClear() { TIMELINE.points.length = 0; TIMELINE.idx = -1; safeUpdateButtons(); }

// last known cursor position (px)
let __lastCursorPos = { x: null, y: null };

// clamp helper
function _clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// record timeline but ignore invalid/meaningless points and duplicates
function timelineRecord(x, y) {
  // sanitize
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  // clamp to viewport + small margin
  const margin = 8;
  const px = _clamp(Math.round(x), margin, Math.max(margin, Math.round(window.innerWidth) - margin));
  const py = _clamp(Math.round(y), margin, Math.max(margin, Math.round(window.innerHeight) - margin));

  // ignore duplicate consecutive points
  const last = TIMELINE.points.length ? TIMELINE.points[TIMELINE.points.length - 1] : null;
  if (last && last.x === px && last.y === py) {
    TIMELINE.idx = TIMELINE.points.length - 1;
    return;
  }

  const t = performance.now();
  TIMELINE.points.push({ x: px, y: py, t });
  TIMELINE.idx = TIMELINE.points.length - 1;

  // update last known cursor pos
  __lastCursorPos.x = px;
  __lastCursorPos.y = py;

  safeUpdateButtons();
}

function timelineGoto(index) {
  const i = Math.max(0, Math.min(TIMELINE.points.length - 1, index));
  const p = TIMELINE.points[i];
  if (!p) return;
  const c = document.getElementById(CURSOR_ID) || ensureCursor();
  c.style.left = `${p.x}px`;
  c.style.top  = `${p.y}px`;
  TIMELINE.idx = i;
  safeUpdateButtons();
}

/* ---------------- Speed helpers ---------------- */
function readSpeedFromUI() {
  const el = document.getElementById('simSpeed');
  const v = el ? parseFloat(el.value) : 1;
  CTRL.speed = Math.max(0.2, Math.min(3, Number.isFinite(v) ? v : 1));
  const lab = document.getElementById('simSpeedValue');
  if (lab) lab.textContent = `×${CTRL.speed.toFixed(1)}`;
}
readSpeedFromUI();

/* ---------------- Public controls ---------------- */
export function simSetSpeed(mult) { CTRL.speed = Math.max(0.2, Math.min(3, +mult || 1)); }
export function simPlay() { CTRL.paused = false; CTRL.stepArmed = false; safeUpdateButtons(); }
export function simPause(){ CTRL.paused = true;  CTRL.stepArmed = false; safeUpdateButtons(); }
export function simToggle(){ CTRL.paused = !CTRL.paused; CTRL.stepArmed = false; safeUpdateButtons(); }
export function simStop() {
  CTRL.stopRequested = true;
  CTRL.paused = false;     // allow sleepers to exit
  CTRL.stepArmed = false;
  simCleanupUI();          // UI artifacts
}

/* one-step while paused */
export function simStep() { CTRL.stepArmed = true; }

/* step back/forward on cursor timeline (no state mutation) */
export function simStepBack(steps = 10) {
  CTRL.paused = true; CTRL.stepArmed = false;
  if (!TIMELINE.points.length) return;
  const next = Math.max(0, TIMELINE.idx - Math.max(1, steps | 0));
  timelineGoto(next);
}
export function simStepForward(steps = 10) {
  CTRL.paused = true; CTRL.stepArmed = false;
  if (!TIMELINE.points.length) return;
  const next = Math.min(TIMELINE.points.length - 1, TIMELINE.idx + Math.max(1, steps | 0));
  timelineGoto(next);
}
export function simCanStepBack()    { return TIMELINE.idx > 0; }
export function simCanStepForward() { return TIMELINE.idx >= 0 && TIMELINE.idx < (TIMELINE.points.length - 1); }

/* ---------------- DOM helpers ---------------- */
const $ = (id) => document.getElementById(id);
export function disableTopButtons(disabled = true) {
  ['btnSimu', 'btnFindPaths', 'btnExportODS', 'btnImportJSON', 'btnExportJSON'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.disabled = !!disabled;
  });
}
export function enableTopButtons() { disableTopButtons(false); }
function safeUpdateButtons() { try { window.__updatePlaybackButtons && window.__updatePlaybackButtons(); } catch {} }

/* ---------------- Edge helpers (for scenarios) ---------------- */
function ensureEdgeMaps(id) {
  State.edges.direct   = State.edges.direct   || {};
  State.edges.lateral  = State.edges.lateral  || {};
  State.edges.contains = State.edges.contains || {};
  if (!State.edges.direct[id])   State.edges.direct[id]   = new Set();
  if (!State.edges.lateral[id])  State.edges.lateral[id]  = new Set();
  if (!State.edges.contains[id]) State.edges.contains[id] = new Set();
}
export function simAddLink(type = 'direct', fromId, toId) {
  if (!fromId || !toId) return;
  ensureEdgeMaps(fromId);
  const m = (type === 'lateral') ? 'lateral' : (type === 'contains' ? 'contains' : 'direct');
  State.edges[m][fromId].add(toId);
  try { saveToLocal(State); } catch {}
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
}
export function simRemoveLink(type = 'direct', fromId, toId) {
  if (!fromId || !toId) return;
  ensureEdgeMaps(fromId);
  const m = (type === 'lateral') ? 'lateral' : (type === 'contains' ? 'contains' : 'direct');
  State.edges[m][fromId].delete(toId);
  try { saveToLocal(State); } catch {}
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
}

/* Sleep that honors pause/step/stop and speed */
function sleep(ms) {
  const base = Math.max(0, +ms || 0);
  // agressif: plus la vitesse est haute, plus on divise fortement
  const denom = Math.pow(Math.max(0.2, CTRL.speed), 1.8);
  const scaled = Math.max(10, Math.floor(base / denom));
  return new Promise((resolve) => {
    const start = performance.now();
    function loop() {
      if (CTRL.stopRequested) return resolve();
      if (CTRL.paused && !CTRL.stepArmed) return setTimeout(loop, 40);
      if (CTRL.stepArmed) CTRL.stepArmed = false;
      const elapsed = performance.now() - start;
      if (elapsed >= scaled) return resolve();
      setTimeout(loop, 16);
    }
    loop();
  });
}

/* ---------------- Cursor rendering ---------------- */
const CURSOR_ID = '__sim_cursor';
function ensureCursor() {
  let c = document.getElementById(CURSOR_ID);
  if (c) return c;
  c = document.createElement('div');
  c.id = CURSOR_ID;
  Object.assign(c.style, {
    position: 'fixed',
    zIndex: 999999,
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: 'rgba(59,130,246,.9)',
    boxShadow: '0 0 0 6px rgba(59,130,246,.18)',
    pointerEvents: 'none',
    transform: 'translate(-50%, -50%)',
    transition: 'transform 80ms linear, left 120ms linear, top 120ms linear'
  });
  // put it at center by default
  const cx = Math.round(window.innerWidth / 2);
  const cy = Math.round(window.innerHeight / 2);
  c.style.left = `${cx}px`;
  c.style.top  = `${cy}px`;
  __lastCursorPos.x = cx;
  __lastCursorPos.y = cy;
  document.body.appendChild(c);
  return c;
}

function removeCursor() {
  const c = document.getElementById(CURSOR_ID);
  if (c) c.remove();
}

/* --------- FAST-ABORT GUARDS inside helpers (critical!) --------- */
async function moveToPoint(x, y, msPer100px = 120) {
  if (shouldAbort()) return;
  const cur = ensureCursor();

  // coordonnées cibles valides ?
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  const margin = 8;
  const targetX = _clamp(Math.round(x), margin, Math.max(margin, Math.round(window.innerWidth)  - margin));
  const targetY = _clamp(Math.round(y), margin, Math.max(margin, Math.round(window.innerHeight) - margin));

  // point de départ fiable
  let fromX = __lastCursorPos.x;
  let fromY = __lastCursorPos.y;
  if (!Number.isFinite(fromX) || !Number.isFinite(fromY)) {
    try {
      const r0 = cur.getBoundingClientRect();
      fromX = Number.isFinite(r0.left) ? r0.left + 6 : Math.round(window.innerWidth  / 2);
      fromY = Number.isFinite(r0.top)  ? r0.top  + 6 : Math.round(window.innerHeight / 2);
    } catch {
      fromX = Math.round(window.innerWidth  / 2);
      fromY = Math.round(window.innerHeight / 2);
    }
  }

  const dx = targetX - fromX, dy = targetY - fromY;
  const dist = Math.hypot(dx, dy) || 1;

  // ► Ne plus "téléporter" via le centre : trajet direct, toujours
  const steps = Math.max(10, Math.floor(dist / 10));
  const denom = Math.pow(Math.max(0.2, CTRL.speed), 1.8);
  const dur   = Math.max(80, Math.floor((dist / 100) * msPer100px) / denom);
  const dt    = dur / steps;

  for (let i = 1; i <= steps; i++) {
    if (shouldAbort()) return;
    while (CTRL.paused && !CTRL.stepArmed && !CTRL.stopRequested) { await sleep(40); }
    if (CTRL.stepArmed) CTRL.stepArmed = false;

    const t = i / steps;
    const nx = Math.round(fromX + dx * t);
    const ny = Math.round(fromY + dy * t);

    cur.style.left = `${nx}px`;
    cur.style.top  = `${ny}px`;

    __lastCursorPos.x = nx;
    __lastCursorPos.y = ny;
    timelineRecord(nx, ny);
    await sleep(dt);
  }

  // set exact target at end
  cur.style.left = `${targetX}px`;
  cur.style.top  = `${targetY}px`;
  __lastCursorPos.x = targetX;
  __lastCursorPos.y = targetY;
  timelineRecord(targetX, targetY);
}

async function moveToEl(node, offX = 6, offY = 6) {
  if (shouldAbort() || !node) return;
  try {
    // scroll "instant" mais seulement si l'élément est dehors du viewport
    const r0 = node.getBoundingClientRect();
    const out =
      !r0 || r0.bottom < 0 || r0.top > window.innerHeight ||
      r0.right < 0 || r0.left > window.innerWidth;
    if (out) { try { node.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch {} }
  } catch {}

  // petit délai pour laisser le layout se stabiliser
  await sleep(50);

  // si l'élément a été re-rendu, ré-obtenir une référence fraîche
  if (!node.isConnected) {
    try { node = document.getElementById(node.id) || node; } catch {}
  }

  // re-lire le rect et valider
  let r;
  try { r = node.getBoundingClientRect(); } catch { r = null; }

  if (!r || !Number.isFinite(r.left) || !Number.isFinite(r.top) || r.width < 1 || r.height < 1) {
    // si rect invalide → rester sur la dernière position connue (pas de "coin haut-gauche")
    return;
  }

  await moveToPoint(r.left + Math.min(Math.max(2, r.width - 2), offX),
                    r.top  + Math.min(Math.max(2, r.height - 2), offY));
}

function fireMouse(node) {
  if (!node || shouldAbort()) return;
  const r = node.getBoundingClientRect();
  const centerX = r.left + r.width / 2;
  const centerY = r.top + r.height / 2;
  for (const type of ['mousedown', 'mouseup', 'click']) {
    if (shouldAbort()) return;
    node.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window,
      clientX: centerX, clientY: centerY, button: 0
    }));
  }
}

async function click(node, offX = 6, offY = 6) {
  if (shouldAbort() || !node) return;
  await moveToEl(node, offX, offY);
  if (shouldAbort()) return;
  fireMouse(node);
  await sleep(80);
}

async function typeInto(input, text, perCharMs = 28) {
  if (shouldAbort() || !input) return;
  await click(input);
  if (shouldAbort()) return;
  input.focus();
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  for (const ch of String(text)) {
    if (shouldAbort()) return;
    input.value += ch;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(perCharMs);
  }
}

async function selectByText(selectEl, text) {
  if (shouldAbort() || !selectEl) return;
  const target = String(text).toLowerCase();
  const options = [...selectEl.options];
  for (const opt of options) {
    if (shouldAbort()) return;
    if (opt.textContent.toLowerCase() === target) {
      await click(selectEl);
      if (shouldAbort()) return;
      await sleep(120);
      opt.selected = true;
      opt.scrollIntoView({ block: 'center', behavior: 'auto' });
      await click(opt);
      if (shouldAbort()) return;
      selectByBrowser(selectEl); // change event for UI handlers
      await sleep(120);
      return;
    }
  }
}

function selectByBrowser(selectEl) {
  if (shouldAbort() || !selectEl) return;
  selectEl.dispatchEvent(new Event('change', { bubbles: true }));
}

function multiSelectByTexts(selectEl, labels = []) {
  if (shouldAbort() || !selectEl) return;
  const wanted = new Set(labels.map(x => String(x).toLowerCase()));
  for (const opt of selectEl.options) {
    if (shouldAbort()) return;
    opt.selected = wanted.has(opt.textContent.toLowerCase());
  }
  selectByBrowser(selectEl);
}

/* ---------------- Simulation artifacts cleanup (UI only) ---------------- */
const SIM_TRACES = { nodes: new Set(), classAdds: [] };

export function simMarkEl(node) {
  if (!node) return null;
  try { node.setAttribute('data-sim', ''); } catch {}
  SIM_TRACES.nodes.add(node);
  return node;
}
export function simAddTempClass(node, className) {
  if (!node || !className) return;
  try {
    node.classList.add(className);
    SIM_TRACES.classAdds.push([node, className]);
  } catch {}
}

export function simCleanupUI() {
  // 1) remove cursor
  removeCursor();
  // 2) remove elements tagged as simulation artifacts
  try { document.querySelectorAll('[data-sim]').forEach(n => n.remove()); } catch {}
  // 3) remove temp classes
  SIM_TRACES.classAdds.forEach(([n, cls]) => { try { n.classList.remove(cls); } catch {} });
  SIM_TRACES.classAdds.length = 0;
  // 4) timeline reset
  timelineClear();
  safeUpdateButtons();
}

/* ---------------- Public gesture API used by scenarios ---------------- */
export const g = {
  el: (id) => document.getElementById(id),
  wait: sleep,
  moveToEl,
  click,
  typeInto,
  selectByText,
  multiSelectByTexts,
  // tagging helpers for cleanup
  markEl: simMarkEl,
  addClassTemp: simAddTempClass,
  // keep toolbar toggling consistent
  disableTopButtons: (disabled = true) => disableTopButtons(disabled),
  ensureInView: (node, block = 'center') => {
    try { node?.scrollIntoView({ block, behavior: 'auto' }); } catch {}
  },
  // NEW: link helpers so scenarios can pick edges for chosen entries
  addLink: simAddLink,
  removeLink: simRemoveLink
};

/* =========================================================
   Scenario runner
   ========================================================= */

async function runScenarioObject(sc) {
  try {
    await sc.fn(g);
  } catch (e) {
    if (!CTRL.stopRequested) console.error(e);
  }
}

export async function runSimulation(opts = {}) {
  if (CTRL.running) return;     // avoid concurrent runs
  CTRL.stopRequested = false;
  CTRL.paused = false;
  CTRL.stepArmed = false;
  readSpeedFromUI();

  // Take a state snapshot so STOP can fully roll back.
  takeSnapshot();

  // Fresh cursor/timeline/UI artifacts
  simCleanupUI();

  disableTopButtons(true);
  CTRL.running = true;

  for (const sc of SCENARIOS) {
    if (shouldAbort()) break;
    await runScenarioObject(sc);
    if (shouldAbort()) break;
    await sleep(300);
  }

  CTRL.running = false;
  disableTopButtons(false);

  // If aborted, restore snapshot so *nothing* from the scenario sticks.
  if (shouldAbort()) {
    restoreSnapshot();
  }

  // Always clean UI artifacts
  simCleanupUI();

  // Render after finishing/aborting
  if (typeof opts.renderCallback === 'function') {
    try { opts.renderCallback(); } catch {}
  }
}

/* ---------------- State queries for UI ---------------- */
export function simIsRunning() { return CTRL.running; }
export function simIsPaused()  { return CTRL.paused; }
export function simHasStopRequest() { return CTRL.stopRequested; }

/* ---------------- Default export ---------------- */
export default {
  registerScenario,
  runSimulation,
  simPlay, simPause, simToggle, simStop, simStep, simSetSpeed,
  simStepBack, simStepForward,
  simCanStepBack, simCanStepForward,
  simIsRunning, simIsPaused, simHasStopRequest,
  simCleanupUI, simMarkEl, simAddTempClass,
  g,
  SCENARIOS,
  simAddLink, simRemoveLink
};

