/* =========================================================
   simulation/index.js
   UI-driven simulation with a fake cursor (mouse gestures)
   Controller supports play / pause / stop / restart / step
   and live speed changes tied to the UI slider.
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
  stepArmed: false,          // single-step gate
  speed: 1.0                 // 0.2..3.0
};

/* Speed helpers */
function readSpeedFromUI() {
  const el = document.getElementById('simSpeed');
  const v = el ? parseFloat(el.value) : 1;
  CTRL.speed = Math.max(0.2, Math.min(3, Number.isFinite(v) ? v : 1));
  const lab = document.getElementById('simSpeedValue');
  if (lab) lab.textContent = `×${CTRL.speed.toFixed(1)}`;
}
readSpeedFromUI();

/* Exposed controls */
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
  CTRL.paused = false;     // let sleepers exit promptly
  CTRL.stepArmed = false;
}

export function simStep() {
  // Arms a single “release” through the pause gate
  CTRL.stepArmed = true;
}

/* ---------------- DOM helpers ---------------- */
const $ = (id) => document.getElementById(id);

// Re-add main toolbar togglers so main.js imports keep working
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
      if (CTRL.stopRequested) return resolve(); // caller will check running flag
      // Pause gate: either paused=false, or a one-shot step unlock is armed
      if (CTRL.paused && !CTRL.stepArmed) {
        // stay paused, poll again
        return setTimeout(loop, 40);
      }
      // consume step if armed
      if (CTRL.stepArmed) CTRL.stepArmed = false;

      const elapsed = performance.now() - start;
      if (elapsed >= scaled) return resolve();
      setTimeout(loop, 16);
    }
    loop();
  });
}

/* Cursor rendering */
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
    transition: 'transform 80ms linear',
  });
  document.body.appendChild(c);
  return c;
}

async function moveToPoint(x, y, msPer100px = 120) {
  const cur = ensureCursor();
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
    // pause gate
    while (CTRL.paused && !CTRL.stepArmed && !CTRL.stopRequested) {
      // wait while paused
      // a tiny sleep avoids busy-wait
      // eslint-disable-next-line no-await-in-loop
      await sleep(40);
    }
    if (CTRL.stepArmed) CTRL.stepArmed = false;

    const t = i / steps;
    const nx = from.x + dx * t;
    const ny = from.y + dy * t;
    cur.style.left = `${nx}px`;
    cur.style.top = `${ny}px`;
    // eslint-disable-next-line no-await-in-loop
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
    // eslint-disable-next-line no-await-in-loop
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
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(120);
      return;
    }
  }
}

function multiSelectByTexts(selectEl, labels = []) {
  if (!selectEl) return;
  const wanted = new Set(labels.map(x => String(x).toLowerCase()));
  for (const opt of selectEl.options) {
    opt.selected = wanted.has(opt.textContent.toLowerCase());
  }
  selectEl.dispatchEvent(new Event('change', { bubbles: true }));
}

/* Public gesture API used by scenarios */
export const g = {
  el: (id) => document.getElementById(id),
  wait: sleep,
  moveToEl,
  click,
  typeInto,
  selectByText,
  multiSelectByTexts,
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
    // swallow if stopped; log otherwise
    if (!CTRL.stopRequested) console.error(e);
  }
}

export async function runSimulation(opts = {}) {
  if (CTRL.running) return;         // avoid concurrent runs
  CTRL.stopRequested = false;
  CTRL.paused = false;
  CTRL.stepArmed = false;
  readSpeedFromUI();

  // disable top buttons while running
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

  if (typeof opts.renderCallback === 'function') {
    try { opts.renderCallback(); } catch {}
  }
}

/* Convenience status getters for UI */
export function simIsRunning() { return CTRL.running; }
export function simIsPaused() { return CTRL.paused; }
export function simHasStopRequest() { return CTRL.stopRequested; }

/* Default export for completeness */
export default {
  registerScenario,
  runSimulation,
  simPlay, simPause, simToggle, simStop, simStep, simSetSpeed,
  simIsRunning, simIsPaused, simHasStopRequest,
  g,
  SCENARIOS
};
