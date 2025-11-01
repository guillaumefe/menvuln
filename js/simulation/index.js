// js/simulation/index.js
// Simulateur "utilisateur" : curseur visible, mouvements, clics réels, saisie au clavier.

/* =======================
   Registry / API publique
   ======================= */

const SCENARIOS = [];

export function registerScenario(name, fn, weight = 1) {
  SCENARIOS.push({ name, fn, weight });
}

function pickScenario() {
  const tot = SCENARIOS.reduce((s, x) => s + (x.weight || 1), 0);
  if (!tot) return null;
  let r = Math.random() * tot;
  for (const s of SCENARIOS) {
    r -= (s.weight || 1);
    if (r <= 0) return s;
  }
  return SCENARIOS[SCENARIOS.length - 1] || null;
}

export async function runSimulation(opts = {}) {
  // Empêche double clic sur "Simulation" et actions globales, mais laisse actifs les boutons d'ajout.
  disableTopButtons(true);

  try {
    const sc = opts.scenarioName
      ? SCENARIOS.find(s => s.name === opts.scenarioName)
      : pickScenario();

    if (!sc) {
      alert('No scenarios registered');
      return;
    }

    await sc.fn();

    // Callback de rafraîchissement si fourni
    if (typeof opts.renderCallback === 'function') {
      try { opts.renderCallback(); } catch (e) { console.error(e); }
    }
  } catch (e) {
    console.error('[simulation] error in scenario:', e);
  } finally {
    disableTopButtons(false);
  }
}

// Raccourcis export
export const runRandomScenario = async () => {
  const sc = pickScenario();
  if (!sc) return alert('No scenarios registered');
  await sc.fn();
};

export async function runScenario(name) {
  const sc = SCENARIOS.find(s => s.name === name);
  if (!sc) throw new Error('Scenario not found');
  await sc.fn();
}

// Exposer aussi pour compat compat
export {
  SCENARIOS
};

/* =======================
   Gestion des boutons top
   ======================= */

// On laisse actifs les boutons d'ajout pendant la simulation.
// On ne désactive que les actions globales qui gênent la démo si déclenchées au mauvais moment.
function $(id) { return document.getElementById(id); }

export function disableTopButtons(disabled = true) {
  [
    'btnSimu',
    'btnFindPaths',
    'btnExportODS',
    'btnAddLink',
    'btnRemoveLink',
    'btnImportJSON',
    'btnExportJSON',
    'btnDownloadSVG'
  ].forEach(id => {
    const b = $(id);
    if (b) b.disabled = disabled;
  });
}
export function enableTopButtons() { disableTopButtons(false); }

/* =======================
   Curseur & gestes "humains"
   ======================= */

const g = {
  el: (id) => document.getElementById(id),
  wait,
  moveToEl,
  click,
  dblclick,
  typeInto,
  selectByText,
  multiSelectByTexts,
  ensureInView,
  disableTopButtons, // laissé pour scenarios.js
  ensureSpeedHook
};
export { g };

// Curseur visuel
let cursorNode = null;
let isCursorInit = false;

function ensureCursor() {
  if (isCursorInit) return;
  isCursorInit = true;

  cursorNode = document.createElement('div');
  cursorNode.id = 'envuln-sim-cursor';
  Object.assign(cursorNode.style, {
    position: 'fixed',
    left: '8px',
    top: '8px',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: '#7dd3fc',
    boxShadow: '0 0 0 2px rgba(125,211,252,.35)',
    zIndex: '999999',
    pointerEvents: 'none',
    transition: 'transform 0.08s ease'
  });
  document.body.appendChild(cursorNode);
}

function getSpeed() {
  // slider #simSpeed : min 0.2, max 3, default 1
  const s = $('simSpeed');
  const val = parseFloat(s?.value || '1');
  if (!Number.isFinite(val)) return 1;
  return Math.max(0.2, Math.min(3, val));
}

function ensureSpeedHook() {
  const s = $('simSpeed'), span = $('simSpeedValue');
  if (!s || !span) return;
  const update = () => { span.textContent = `×${parseFloat(s.value).toFixed(1)}`; };
  if (!s._envulnHooked) {
    s.addEventListener('input', update);
    s._envulnHooked = true;
  }
  update();
}

function ease(a, b, t) {
  // easeInOutQuad
  t = Math.max(0, Math.min(1, t));
  const tt = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  return a + (b - a) * tt;
}

async function moveCursorTo(x, y, ms = 300) {
  ensureCursor();
  const speed = getSpeed();
  ms = ms / speed;

  const rect = cursorNode.getBoundingClientRect();
  const x0 = rect.left + rect.width / 2;
  const y0 = rect.top + rect.height / 2;

  const frames = Math.max(10, Math.round(ms / 16));
  for (let i = 0; i <= frames; i++) {
    const t = i / frames;
    const nx = ease(x0, x, t);
    const ny = ease(y0, y, t);
    cursorNode.style.transform = `translate(${nx - 6}px, ${ny - 6}px)`;
    await wait(16);
  }
}

function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
}

async function moveToEl(el, offsetX = 0, offsetY = 0, duration = 350) {
  if (!el) return;
  ensureInView(el);
  await wait(20);
  const { x, y, rect } = centerOf(el);
  const tx = x + offsetX;
  const ty = y + offsetY;
  await moveCursorTo(tx, ty, Math.max(200, duration + (rect.width + rect.height) * 0.1));
}

async function dispatchMouseSequence(el, type = 'click') {
  if (!el) return;
  const { x, y } = centerOf(el);
  const evOpts = (t) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, view: window, button: 0 });

  el.dispatchEvent(new MouseEvent('pointerover', evOpts('pointerover')));
  el.dispatchEvent(new MouseEvent('mouseover', evOpts('mouseover')));
  el.dispatchEvent(new MouseEvent('mouseenter', evOpts('mouseenter')));

  el.dispatchEvent(new MouseEvent('pointerdown', evOpts('pointerdown')));
  el.dispatchEvent(new MouseEvent('mousedown', evOpts('mousedown')));

  // focus si focusable
  if (typeof el.focus === 'function') el.focus();

  el.dispatchEvent(new MouseEvent('pointerup', evOpts('pointerup')));
  el.dispatchEvent(new MouseEvent('mouseup', evOpts('mouseup')));
  el.dispatchEvent(new MouseEvent(type, evOpts(type)));
}

async function click(el) {
  if (!el) return;
  if (el.disabled) console.warn('[sim] click on disabled element:', el.id || el.tagName);
  await moveToEl(el);
  await dispatchMouseSequence(el, 'click');
  await wait(80 / getSpeed());
}

async function dblclick(el) {
  if (!el) return;
  await moveToEl(el);
  await dispatchMouseSequence(el, 'click');
  await wait(60 / getSpeed());
  await dispatchMouseSequence(el, 'click');
  await wait(120 / getSpeed());
}

/* =======================
   Saisie clavier & selects
   ======================= */

async function typeChar(target, ch) {
  const speed = getSpeed();
  const delay = 40 / speed;

  const key = ch;
  const code = `Key${(ch || '').toUpperCase().charCodeAt(0)}`;

  const mk = (t) => new KeyboardEvent(t, {
    bubbles: true, cancelable: true, key, code
  });

  target.dispatchEvent(mk('keydown'));
  target.dispatchEvent(mk('keypress'));

  const before = target.value ?? '';
  // on simule l'insertion
  try {
    const start = target.selectionStart ?? before.length;
    const end = target.selectionEnd ?? start;
    target.value = before.slice(0, start) + ch + before.slice(end);
    target.selectionStart = target.selectionEnd = start + ch.length;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  } catch {
    // fallback : concat
    target.value = before + ch;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  target.dispatchEvent(mk('keyup'));
  await wait(delay);
}

async function typeInto(inputEl, text, perCharMs = 40) {
  if (!inputEl) return;
  await moveToEl(inputEl);
  await click(inputEl); // focus
  for (const ch of String(text)) {
    await typeChar(inputEl, ch);
  }
  // petite pause après saisie
  await wait(120 / getSpeed());
}

function optionMatchesText(opt, txt) {
  return String(opt.textContent || '').trim().toLowerCase() === String(txt || '').trim().toLowerCase();
}

async function selectByText(selectEl, text) {
  if (!selectEl) return;
  await moveToEl(selectEl);
  await click(selectEl);

  const opts = [...selectEl.options];
  const o = opts.find(opt => optionMatchesText(opt, text));
  if (!o) {
    console.warn('[sim] option not found:', text);
    return;
  }
  o.selected = true;
  selectEl.dispatchEvent(new Event('input', { bubbles: true }));
  selectEl.dispatchEvent(new Event('change', { bubbles: true }));

  await wait(100 / getSpeed());
}

async function multiSelectByTexts(selectEl, textsArray) {
  if (!selectEl) return;
  const want = new Set(textsArray.map(s => String(s).trim().toLowerCase()));
  await moveToEl(selectEl);
  await click(selectEl);

  [...selectEl.options].forEach(opt => {
    const match = want.has(String(opt.textContent || '').trim().toLowerCase());
    opt.selected = match;
  });

  selectEl.dispatchEvent(new Event('input', { bubbles: true }));
  selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(120 / getSpeed());
}

/* =======================
   QoL helpers
   ======================= */

function ensureInView(node, block = 'center') {
  try { node?.scrollIntoView({ behavior: 'smooth', block }); } catch {}
}

function wait(ms) {
  const speed = getSpeed();
  const real = ms / speed;
  return new Promise(res => setTimeout(res, real));
}

/* =======================
   Démo intégrée minimale
   ======================= */

// Petit scénario de secours : fait un clic sur "Compute paths"
registerScenario('Demo Scenario', async () => {
  ensureSpeedHook();

  const btn = $('btnFindPaths');
  if (!btn) return;

  await moveToEl(btn);
  await click(btn);
  await wait(300);
});

// Export par défaut (facilite certains bundlers)
export default {
  registerScenario,
  runSimulation,
  runRandomScenario,
  runScenario,
  SCENARIOS,
  disableTopButtons,
  enableTopButtons,
  g
};
