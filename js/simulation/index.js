/* =========================================================
   simulation/index.js
   UI-driven simulation with a fake cursor (mouse gestures)
   ========================================================= */

const SCENARIOS = [];

/* ---------------- Registry ---------------- */
export function registerScenario(name, fn, weight = 1) {
  SCENARIOS.push({ name, fn, weight: Math.max(0, +weight || 1) });
}

/* ---------------- DOM helpers ---------------- */
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

export function disableTopButtons(disabled = true) {
  [
    'btnSimu',
    'btnFindPaths',
    'btnExportODS',
    'btnImportJSON',
    'btnExportJSON'
  ].forEach(id => {
    const b = $(id);
    if (b) b.disabled = disabled;
  });
}

export function enableTopButtons() {
  disableTopButtons(false);
}

/* =========================================================
   Gesture engine
   ========================================================= */

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
  const dur = Math.max(80, Math.floor((dist / 100) * msPer100px));
  const dt = dur / steps;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const nx = from.x + dx * t;
    const ny = from.y + dy * t;
    cur.style.left = `${nx}px`;
    cur.style.top = `${ny}px`;
    await sleep(dt);
  }
}

async function moveToEl(node, offX = 6, offY = 6) {
  if (!node) return;
  node.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY,
      button: 0
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

function selectByText(selectEl, text) {
  if (!selectEl) return;
  const target = String(text).toLowerCase();
  for (const opt of selectEl.options) {
    if (opt.textContent.toLowerCase() === target) {
      opt.selected = true;
      selectEl.value = opt.value;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
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

export const g = {
  el: (id) => document.getElementById(id),
  wait: sleep,
  moveToEl,
  click,
  typeInto,
  selectByText,
  multiSelectByTexts,
  disableTopButtons,
  ensureInView: (node, block = 'center') => {
    try { node?.scrollIntoView({ block, behavior: 'smooth' }); } catch {}
  }
};

/* =========================================================
   Scenario runner
   ========================================================= */

async function runScenarioObject(sc) {
  disableTopButtons(true);
  try {
    await sc.fn(g);
  } catch (e) {
    console.error(e);
  } finally {
    disableTopButtons(false);
  }
}

export async function runSimulation(opts = {}) {
  disableTopButtons(true);
  for (const sc of SCENARIOS) {
    await runScenarioObject(sc);
    await sleep(300);
  }
  enableTopButtons();

  if (typeof opts.renderCallback === 'function') {
    try { opts.renderCallback(); } catch {}
  }
}

export default {
  registerScenario,
  runSimulation,
  disableTopButtons,
  enableTopButtons,
  g,
  SCENARIOS
};
