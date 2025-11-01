/* =========================================================
   simulation/index.js
   UI-driven simulation with a virtual cursor (mouse gestures)
   Controller supports play / pause / stop / restart / step,
   speed control, and cursor timeline stepping.
   ========================================================= */

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

/* ---------------- Cursor timeline (for step back/forward) ---------------- */
const TIMELINE = {
  points: [],  // [{x, y, t}]
  idx: -1
};

function timelineClear() {
  TIMELINE.points.length = 0;
  TIMELINE.idx = -1;
}
function timelineRecord(x, y) {
  const t = performance.now();
  TIMELINE.points.push({ x, y, t });
  TIMELINE.idx = TIMELINE.points.length - 1;
}
function timelineGoto(index) {
  const i = Math.max(0, Math.min(TIMELINE.points.length - 1, index));
  const p = TIMELINE.points[i];
  if (!p) return;
  const c = document.getElementById(CURSOR_ID) || ensureCursor();
  c.style.left = `${p.x}px`;
  c.style.top  = `${p.y}px`;
  TIMELINE.idx = i;
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
export function simSetSpeed(mult) {
  CTRL.speed = Math.max(0.2, Math.min(3, +mult || 1));
}
export function simPlay() {
  CTRL.paused = false;
  CTRL.stepArmed = false;
}
export function simPause() {
  CTRL.paused = true;
  CTRL.stepArmed = false;
}
export function simToggle() {
  CTRL.paused = !CTRL.paused;
  CTRL.stepArmed = false;
}
export function simStop() {
  CTRL.stopRequested = true;
  CTRL.paused = false;     // allow sleepers to exit
  CTRL.stepArmed = false;

  // remove cursor and reset timeline on full stop
  const c = document.getElementById(CURSOR_ID);
  if (c) c.remove();
  timelineClear();
}
export function simStep() {
  // allow one pause gate traversal
  CTRL.stepArmed = true;
}
// step back/forward move the cursor position across recorded timeline points
export function simStepBack(steps = 10) {
  CTRL.paused = true;
  CTRL.stepArmed = false;
  if (!TIMELINE.points.length) return;
  const next = Math.max(0, TIMELINE.idx - Math.max(1, steps | 0));
  timelineGoto(next);
}
export function simStepForward(steps = 10) {
  CTRL.paused = true;
  CTRL.stepArmed = false;
  if (!TIMELINE.points.length) return;
  const next = Math.min(TIMELINE.points.length - 1, TIMELINE.idx + Math.max(1, steps | 0));
  timelineGoto(next);
}

/* ---------------- DOM helpers ---------------- */
const $ = (id) => document.getElementById(id);

// toolbar togglers expected by main.js
export function disableTopButtons(disabled = true) {
  ['btnSimu', 'btnFindPaths', 'btnExportODS', 'btnImportJSON', 'btnExportJSON'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.disabled = !!disabled;
  });
}
export function enableTopButtons() {
  disableTopButtons(false);
}

/* Sleep that honors pause/step/stop and speed */
function sleep(ms) {
  const base = Math.max(0, +ms || 0);
  const scaled = Math.max(10, Math.floor(base / Math.max(0.2, CTRL.speed)));

  return new Promise((resolve) => {
    const start = performance.now();
    function loop() {
      if (CTRL.stopRequested) return resolve();
      if (CTRL.paused && !CTRL.stepArmed) {
        return setTimeout(loop, 40);
      }
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
    transition: 'transform 80ms linear'
  });
  document.body.appendChild(c);
  return c;
}

async function moveToPoint(x, y, msPer100px = 120) {
  const cur = ensureCursor();

  // record current position as timeline start
  {
    const r0 = cur.getBoundingClientRect();
    timelineRecord(r0.left + 6, r0.top + 6);
  }

  const rectNow = cur.getBoundingClientRect();
  const from = { x: rectNow.left + 6, y: rectNow.top + 6 };
  const dx = x - from.x, dy = y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const steps = Math.max(10, Math.floor(dist / 10));

  // duration is speed-aware
  const dur = Math.max(80, Math.floor((dist / 100) * msPer100px) / Math.max(0.2, CTRL.speed));
  const dt = dur / steps;

  for (let i = 1; i <= steps; i++) {
    if (CTRL.stopRequested) break;

    while (CTRL.paused && !CTRL.stepArmed && !CTRL.stopRequested) {
      await sleep(40);
    }
    if (CTRL.stepArmed) CTRL.stepArmed = false;

    const t = i / steps;
    const nx = from.x + dx * t;
    const ny = from.y + dy * t;
    cur.style.left = `${nx}px`;
    cur.style.top = `${ny}px`;

    // record each movement for timeline stepping
    timelineRecord(nx, ny);

    await sleep(dt);
  }
}

async function moveToEl(node, offX = 6, offY = 6) {
  if (!node) return;
  try { node.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
  await sleep(150);
  const r = node.getBoundingClientRect();
  await moveToPoint(r.left + Math.min(r.width - 2, offX), r.top + Math.min(r.height - 2, offY));
}

function fireMouse(node) {
  const r = node.getBoundingClientRect();
  const centerX = r.left + r.width / 2;
  const centerY = r.top + r.height / 2;
  for (const type of ['mousedown', 'mouseup', 'click']) {
    node.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window,
      clientX: centerX, clientY: centerY, button: 0
    }));
  }
}

async function click(node, offX = 6, offY = 6) {
  if (!node) return;
  await moveToEl(node, offX, offY);
  fireMouse(node);
  await sleep(80);
}

async function typeInto(input, text, perCharMs = 28) {
  if (!input) return;
  await click(input);
  input.focus();
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  for (const ch of String(text)) {
    input.value += ch;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(perCharMs);
  }
}

async function selectByText(selectEl, text) {
  if (!selectEl) return;
  const target = String(text).toLowerCase();
  const options = [...selectEl.options];

  for (const opt of options) {
    if (opt.textContent.toLowerCase() === target) {
      await click(selectEl);
      await sleep(120);
      opt.selected = true;
      opt.scrollIntoView({ block: 'center', behavior: 'smooth' });
      await click(opt);
      selectByBrowser(selectEl); // change event for UI handlers
      await sleep(120);
      return;
    }
  }
}

function selectByBrowser(selectEl) {
  selectEl.dispatchEvent(new Event('change', { bubbles: true }));
}

function multiSelectByTexts(selectEl, labels = []) {
  if (!selectEl) return;
  const wanted = new Set(labels.map(x => String(x).toLowerCase()));
  for (const opt of selectEl.options) {
    opt.selected = wanted.has(opt.textContent.toLowerCase());
  }
  selectByBrowser(selectEl);
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
  // keep toolbar toggling consistent
  disableTopButtons: (disabled = true) => disableTopButtons(disabled),
  ensureInView: (node, block = 'center') => {
    try { node?.scrollIntoView({ block, behavior: 'smooth' }); } catch {}
  }
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

function removeCursor() {
  const c = document.getElementById('__sim_cursor');
  if (c) c.remove();
}

export async function runSimulation(opts = {}) {
  if (CTRL.running) return;     // avoid concurrent runs
  CTRL.stopRequested = false;
  CTRL.paused = false;
  CTRL.stepArmed = false;
  readSpeedFromUI();

  // fresh cursor/timeline
  timelineClear();
  const existing = document.getElementById(CURSOR_ID);
  if (existing) existing.remove();

  g.disableTopButtons(true);
  CTRL.running = true;

  for (const sc of SCENARIOS) {
    if (CTRL.stopRequested) break;
    await runScenarioObject(sc);
    if (CTRL.stopRequested) break;
    await sleep(300);
  }

  CTRL.running = false;
  g.disableTopButtons(false);
  removeCursor();

  if (typeof opts.renderCallback === 'function') {
    try { opts.renderCallback(); } catch {}
  }
}

/* ---------------- State queries for UI ---------------- */
export function simIsRunning() { return CTRL.running; }
export function simIsPaused() { return CTRL.paused; }
export function simHasStopRequest() { return CTRL.stopRequested; }

/* ---------------- Default export ---------------- */
export default {
  registerScenario,
  runSimulation,
  simPlay, simPause, simToggle, simStop, simStep, simSetSpeed,
  simStepBack, simStepForward,
  simIsRunning, simIsPaused, simHasStopRequest,
  g,
  SCENARIOS
};
