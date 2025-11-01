// js/simulation/index.js
// Simulation core with “mouse-like” gestures + resilient scenario loading.

const SCENARIOS = []; // [{ name, fn, weight }]

// ---------------- Registry ----------------
function addScenario(name, fn, weight = 1) {
  SCENARIOS.push({ name, fn, weight });
}
const registerScenario = addScenario;

function pickScenario() {
  const total = SCENARIOS.reduce((s, x) => s + (x.weight ?? 1), 0);
  if (!total) return null;
  let r = Math.random() * total;
  for (const s of SCENARIOS) {
    r -= (s.weight ?? 1);
    if (r <= 0) return s;
  }
  return SCENARIOS.at(-1) || null;
}

// ---------------- Mouse-like helpers ----------------
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise(res => setTimeout(res, ms));
function ensureInView(node, block = 'center') {
  try { node?.scrollIntoView({ behavior: 'smooth', block }); } catch {}
}

function _mouse(el, type, opts = {}) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const ev = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: r.left + (opts.offX ?? 8),
    clientY: r.top + (opts.offY ?? 8)
  });
  el.dispatchEvent(ev);
}

async function moveToEl(el, offX = 8, offY = 8) {
  if (!el) return;
  ensureInView(el);
  await wait(120);
  _mouse(el, 'mousemove', { offX, offY });
  await wait(60);
}

async function click(el) {
  if (!el) return;
  await moveToEl(el);
  el.focus?.();
  _mouse(el, 'mousedown');
  _mouse(el, 'mouseup');
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

function selectByText(sel, text) {
  if (!sel) return;
  const target = String(text).toLowerCase();
  for (const o of sel.options) {
    if (String(o.textContent || '').toLowerCase() === target) {
      sel.value = o.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      break;
    }
  }
}

function multiSelectByTexts(sel, texts) {
  if (!sel) return;
  const want = new Set(texts.map(t => String(t).toLowerCase()));
  for (const o of sel.options) {
    o.selected = want.has(String(o.textContent || '').toLowerCase());
  }
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

// ---------------- Top buttons ----------------
function disableTopButtons(disabled = true) {
  ['btnSimu', 'btnFindPaths', 'btnExportODS', 'btnImportJSON', 'btnExportJSON']
    .forEach(id => { const b = $(id); if (b) b.disabled = disabled; });
}
function enableTopButtons() { disableTopButtons(false); }

// ---------------- Lazy scenario loading ----------------
let triedDynamicLoad = false;
async function ensureScenariosLoadedOnce() {
  if (SCENARIOS.length > 0) return;

  // If main.js didn’t side-effect import scenarios.js, try dynamic import now.
  if (!triedDynamicLoad) {
    triedDynamicLoad = true;
    try {
      // Use URL to be safe in ESM.
      await import(new URL('./scenarios.js', import.meta.url));
    } catch (e) {
      console.warn('[simulation] dynamic scenarios load failed:', e);
    }
  }

  // If still nothing, install a minimal built-in fallback.
  if (SCENARIOS.length === 0) {
    console.warn('[simulation] no scenarios registered; installing fallback scenario.');
    addScenario('Fallback Demo', async ({ g }) => {
      // Create a minimal chain via the real UI.
      await typeInto(g.el('targetName'), 'Host A');
      await g.click(g.el('btnAddTarget'));

      await typeInto(g.el('targetName'), 'Host B');
      await g.click(g.el('btnAddTarget'));

      // mark Host B as final (via left list row)
      const rows = document.querySelectorAll('#targetList .item');
      for (const r of rows) {
        if ((r.textContent || '').includes('Host B')) {
          const cb = r.querySelector('input[type="checkbox"]');
          if (cb) { await moveToEl(cb); await click(cb); }
          break;
        }
      }

      // attacker
      await typeInto(g.el('attackerName'), 'Demo Attacker');
      await g.click(g.el('btnAddAttacker'));

      // select attacker + entries
      g.selectByText(g.el('selAttacker'), 'Demo Attacker');
      g.multiSelectByTexts(g.el('selEntriesAll'), ['Host A']);
      await g.wait(120);

      // link A -> B (direct)
      g.selectByText(g.el('linkSource'), 'Host A');
      g.multiSelectByTexts(g.el('linkDest'), ['Host B']);
      g.selectByText(g.el('linkType'), 'direct');
      await g.click(g.el('btnAddLink'));

      // compute
      await g.moveToEl(g.el('btnFindPaths'));
      await g.click(g.el('btnFindPaths'));
    }, 1);
  }
}

// ---------------- Runner ----------------
const g = { el: $, wait, moveToEl, click, typeInto, selectByText, multiSelectByTexts, ensureInView, disableTopButtons };

async function runScenarioObject(sc) {
  disableTopButtons(true);
  try { await sc.fn({ g }); }
  catch (e) { console.error('[simulation] scenario failed:', e); }
  finally { disableTopButtons(false); }
}

async function runRandomScenario() {
  await ensureScenariosLoadedOnce();
  const sc = pickScenario();
  if (!sc) { alert('No simulation scenarios registered.'); return; }
  await runScenarioObject(sc);
}

async function runScenario(name) {
  await ensureScenariosLoadedOnce();
  const sc = SCENARIOS.find(s => s.name === name);
  if (!sc) throw new Error(`Scenario not found: ${name}`);
  await runScenarioObject(sc);
}

async function runSimulation(opts = {}) {
  if (opts.scenarioName) await runScenario(opts.scenarioName);
  else await runRandomScenario();

  if (typeof opts.renderCallback === 'function') {
    try { opts.renderCallback(); } catch (e) { console.error(e); }
  }
}

// ---------------- Exports ----------------
export {
  addScenario,
  registerScenario,
  runSimulation,
  runRandomScenario,
  runScenario,
  pickScenario,
  SCENARIOS,
  disableTopButtons,
  enableTopButtons,
  g
};

export default {
  registerScenario: addScenario,
  runSimulation,
  disableTopButtons,
  enableTopButtons,
  g
};
