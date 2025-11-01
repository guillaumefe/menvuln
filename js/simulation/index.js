// js/simulation/index.js
// Simulation core: registers scenarios and drives "mouse-like" UI gestures.

//// ----------------------------
//// Internal registry & picker
//// ----------------------------
const SCENARIOS = []; // { name, fn, weight }

function addScenario(name, fn, weight = 1) {
  SCENARIOS.push({ name, fn, weight });
}

function pickScenario() {
  const total = SCENARIOS.reduce((s, x) => s + (x.weight || 1), 0);
  if (!total) return null;
  let r = Math.random() * total;
  for (const s of SCENARIOS) {
    r -= (s.weight || 1);
    if (r <= 0) return s;
  }
  return SCENARIOS[SCENARIOS.length - 1] || null;
}

//// ----------------------------
//// DOM helpers ("mouse-like")
//// ----------------------------
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

function ensureInView(node, block = 'center') {
  try { node?.scrollIntoView({ behavior: 'smooth', block }); } catch {}
}

function fakeMouseMove(el, x = 5, y = 5) {
  if (!el) return;
  const rect = el.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
  const clientX = rect.left + Math.max(2, Math.min(rect.width - 2, x));
  const clientY = rect.top + Math.max(2, Math.min(rect.height - 2, y));
  const evt = new MouseEvent('mousemove', { bubbles: true, clientX, clientY });
  el.dispatchEvent(evt);
}

async function moveToEl(el, offX = 8, offY = 8) {
  if (!el) return;
  ensureInView(el);
  await wait(120);
  fakeMouseMove(el, offX, offY);
  await wait(60);
}

async function click(el) {
  if (!el) return;
  await moveToEl(el);
  el.focus?.();
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  el.click?.();
  await wait(80);
}

async function typeInto(input, text, perCharMs = 12) {
  if (!input) return;
  await moveToEl(input, 10, 10);
  input.focus();
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  for (const ch of String(text)) {
    input.value += ch;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(perCharMs);
  }
}

function selectByText(selectEl, text) {
  if (!selectEl) return;
  const t = String(text).toLowerCase();
  for (const opt of selectEl.options) {
    if (String(opt.textContent || '').toLowerCase() === t) {
      selectEl.value = opt.value;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      break;
    }
  }
}

function multiSelectByTexts(selectEl, texts) {
  if (!selectEl) return;
  const wants = new Set(texts.map((x) => String(x).toLowerCase()));
  for (const opt of selectEl.options) {
    const should = wants.has(String(opt.textContent || '').toLowerCase());
    opt.selected = should;
  }
  selectEl.dispatchEvent(new Event('change', { bubbles: true }));
}

//// ----------------------------
//// Top buttons gating
//// ----------------------------
function disableTopButtons(disabled = true) {
  ['btnSimu', 'btnFindPaths', 'btnExportODS', 'btnImportJSON', 'btnExportJSON'].forEach((id) => {
    const b = $(id);
    if (b) b.disabled = disabled;
  });
}
function enableTopButtons() { disableTopButtons(false); }

//// ----------------------------
//// Runner
//// ----------------------------
async function runScenarioObject(sc) {
  disableTopButtons(true);
  try {
    await sc.fn({ g }); // pass gesture helpers
  } catch (e) {
    console.error('[simulation] scenario failed:', e);
  } finally {
    disableTopButtons(false);
  }
}

async function runRandomScenario() {
  const sc = pickScenario();
  if (!sc) {
    alert('No simulation scenarios registered.');
    return;
  }
  await runScenarioObject(sc);
}

async function runScenario(name) {
  const sc = SCENARIOS.find((s) => s.name === name);
  if (!sc) throw new Error(`Scenario not found: ${name}`);
  await runScenarioObject(sc);
}

/**
 * Entry point called from main UI.
 * @param {{scenarioName?: string, renderCallback?: Function}} opts
 */
async function runSimulation(opts = {}) {
  if (opts.scenarioName) await runScenario(opts.scenarioName);
  else await runRandomScenario();

  if (typeof opts.renderCallback === 'function') {
    try { opts.renderCallback(); } catch (e) { console.error(e); }
  }
}

//// ----------------------------
//// Public "gesture" surface
//// ----------------------------
const g = {
  el: $,
  wait,
  moveToEl,
  click,
  typeInto,
  selectByText,
  multiSelectByTexts,
  ensureInView,
  disableTopButtons,
};

//// ----------------------------
//// Exports
//// ----------------------------
export {
  addScenario as registerScenario,
  runSimulation,
  runRandomScenario,
  runScenario,
  pickScenario,
  SCENARIOS,
  disableTopButtons,
  enableTopButtons,
  g,
};

export default {
  registerScenario: addScenario,
  runSimulation,
  disableTopButtons,
  enableTopButtons,
  g,
};

// NOTE: No built-in demo scenario here on purpose.
// Real scenarios are defined in js/simulation/scenarios.js and will use the g-* helpers above.
