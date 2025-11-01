// js/simulation/index.js
// Simulation module: cursor-driven UI scenarios (client-side only, no server)
// Exports: registerScenario(name, fn, weight), runSimulation(opts?), runRandomScenario(), runScenario(name),
//          disableTopButtons(disabled), enableTopButtons()

const SCENARIOS = []; // { name, fn: async(), weight }

function addScenario(name, fn, weight = 1) {
  if (typeof fn !== 'function') throw new Error('Scenario must be a function');
  SCENARIOS.push({ name: String(name), fn, weight: Math.max(0, Number(weight) || 1) });
}

function pickScenario() {
  const total = SCENARIOS.reduce((s, x) => s + x.weight, 0);
  if (!total || SCENARIOS.length === 0) return null;
  let r = Math.random() * total;
  for (const s of SCENARIOS) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return SCENARIOS[SCENARIOS.length - 1];
}

/* ---------------- UI helpers (internal) ---------------- */
const $ = id => document.getElementById(id);
const cls = sel => document.querySelector(sel);
const qsAll = sel => Array.from(document.querySelectorAll(sel));

function safe(fn) { return (...args) => { try { return fn(...args); } catch (e) { console.error(e); } }; }

/* Cursor + caption (shared) */
const cursor = document.createElement('div');
const caption = document.createElement('div');
let cursorInitted = false;

function initCursor() {
  if (cursorInitted) return;
  Object.assign(cursor.style, {
    position: 'fixed', width: '14px', height: '14px', borderRadius: '50%',
    background: '#fff', boxShadow: '0 0 0 2px rgba(0,0,0,.5), 0 0 12px rgba(255,255,255,.35)',
    zIndex: 2147483647, left: '0px', top: '0px', transform: 'translate(-50%,-50%)', pointerEvents: 'none'
  });
  Object.assign(caption.style, {
    position: 'fixed', zIndex: 2147483646, background: 'rgba(15,23,42,.92)', color: '#e6eef8',
    border: '1px solid rgba(255,255,255,.15)', borderRadius: '10px',
    font: '13px/1.35 Inter, ui-sans-serif', padding: '8px 10px', maxWidth: '360px',
    transform: 'translate(-50%, calc(-100% - 16px))', pointerEvents: 'none', opacity: '0',
    transition: 'opacity .12s ease'
  });
  document.body.append(caption, cursor);
  cursorInitted = true;
}

/* Speed (reads slider id 'simSpeed' if present) */
function currentSpeed() {
  const s = $('simSpeed');
  const v = s ? parseFloat(s.value || '1') : 1;
  return Math.max(0.2, v);
}
const wait = ms => new Promise(res => setTimeout(res, Math.max(1, ms) / Math.max(0.01, currentSpeed())));

async function moveToEl(node, offsetX = 0, offsetY = 0) {
  if (!node) { await wait(140); return; }
  initCursor();
  try { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
  const r = node.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2 + offsetX);
  const y = Math.round(r.top + r.height / 2 + offsetY);
  const prevX = cursor._x ?? x;
  const prevY = cursor._y ?? y;
  const dist = Math.hypot(x - prevX, y - prevY) || 1;
  const dur = Math.min(900, Math.max(120, dist * 0.45)) / currentSpeed();
  cursor.style.transition = `transform ${dur}ms cubic-bezier(.2,.8,.2,1)`;
  cursor.style.transform = `translate(${x}px, ${y}px)`; cursor._x = x; cursor._y = y;
  await wait(dur + 30);
}

async function captionAt(node, text) {
  if (!node) return;
  initCursor();
  const r = node.getBoundingClientRect();
  caption.textContent = text;
  caption.style.left = (r.left + r.width / 2) + 'px';
  caption.style.top = (r.top) + 'px';
  caption.style.opacity = '1';
  await wait(140);
}

function hideCaption() { caption.style.opacity = '0'; }

async function clickEl(node) {
  if (!node) return;
  node.classList.add('sim-pulse');
  node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await wait(120);
  node.classList.remove('sim-pulse');
}

async function typeInto(inputEl, text, per = 55) {
  if (!inputEl) return;
  try { inputEl.focus && inputEl.focus(); } catch {}
  inputEl.value = '';
  for (const ch of text) {
    inputEl.value += ch;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(per + Math.random() * 30);
  }
  inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(90);
}

/* select utilities */
function selectByText(selectEl, text) {
  if (!selectEl || !text) return null;
  const t = String(text).trim().toLowerCase();
  for (const o of selectEl.options) {
    if (o.textContent.trim().toLowerCase() === t) {
      selectEl.value = o.value;
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      return o;
    }
  }
  return null;
}
function multiSelectByTexts(selectEl, texts) {
  if (!selectEl) return;
  const set = new Set((texts || []).map(x => String(x).toLowerCase()));
  for (const o of selectEl.options) o.selected = set.has(o.textContent.trim().toLowerCase());
  selectEl.dispatchEvent(new Event('change', { bubbles: true }));
}

/* disable top-level controls for clean simulation */
function disableTopButtons(disabled = true) {
  const ids = ['btnSimu', 'btnFindPaths', 'btnExportODS', 'btnExportJSON', 'btnImportJSON', 'btnAddLink', 'btnRemoveLink', 'btnAddTarget', 'btnAddAttacker', 'btnAddVuln'];
  ids.forEach(id => { const b = $(id); if (b) b.disabled = disabled; });
}

/* simple convenience counterpart used by main.js */
function enableTopButtons() { disableTopButtons(false); }

/* ---------------- Scenario helpers (idempotent helpers that use DOM) ---------------- */
/*
  These helpers assume certain DOM IDs exist in your UI:
  - targetName, btnAddTarget, attackerName, btnAddAttacker,
  - selAttacker, selEntriesAll, linkSource, linkDest, linkType, btnAddLink,
  - btnFindPaths, results, target list render structure (for marking final via checkbox)
*/
async function ensureTarget(name, finalFlag = false) {
  const sTarget = $('linkSource'); // presence check
  const targetSelect = $('linkDest') || $('selEntriesAll') || null;
  const entriesSelect = $('selEntriesAll');
  if (entriesSelect && selectByText(entriesSelect, name)) {
    if (finalFlag) await markTargetFinalByName(name);
    return true;
  }
  const tn = $('targetName');
  const addBtn = $('btnAddTarget');
  if (!tn || !addBtn) return false;
  await captionAt(tn, `Create target "${name}"`);
  await moveToEl(tn); await clickEl(tn); await typeInto(tn, name);
  if (finalFlag) {
    const chk = $('targetFinalFlag');
    if (chk && !chk.checked) { await moveToEl(chk); await clickEl(chk); }
  }
  await moveToEl(addBtn); await clickEl(addBtn);
  if (finalFlag) {
    const chk = $('targetFinalFlag'); if (chk && chk.checked) { await moveToEl(chk); await clickEl(chk); }
    await markTargetFinalByName(name);
  }
  hideCaption();
  await wait(120);
  return true;
}

async function ensureAttacker(name) {
  const selAtt = $('selAttacker');
  if (selAtt && selectByText(selAtt, name)) return true;
  const an = $('attackerName');
  const add = $('btnAddAttacker');
  if (!an || !add) return false;
  await captionAt(an, `Create attacker "${name}"`);
  await moveToEl(an); await clickEl(an); await typeInto(an, name);
  await moveToEl(add); await clickEl(add);
  hideCaption();
  await wait(120);
  if ($('selAttacker')) selectByText($('selAttacker'), name);
  return true;
}

async function ensureVuln(name) {
  const s = $('vulnName'); const add = $('btnAddVuln');
  if (!s || !add) return false;
  const exists = qsAll('#vulnList .item').some(div => div.textContent.trim().toLowerCase().includes(String(name).toLowerCase()));
  if (exists) return true;
  await captionAt(s, `Create vuln "${name}"`);
  await moveToEl(s); await clickEl(s); await typeInto(s, name);
  await moveToEl(add); await clickEl(add);
  hideCaption(); await wait(90);
  return true;
}

async function markTargetFinalByName(name) {
  const items = qsAll('#targetList .item');
  for (const item of items) {
    if (item.textContent && item.textContent.trim().toLowerCase().includes(String(name).toLowerCase())) {
      const cb = item.querySelector('input[type=checkbox]');
      if (cb && !cb.checked) {
        await moveToEl(cb); await clickEl(cb); await wait(60);
      }
      return;
    }
  }
}

/* ---------------- Public runner functions ---------------- */

async function runScenarioObj(scenario) {
  if (!scenario) throw new Error('No scenario provided');
  disableTopButtons(true);
  try {
    const simBtn = $('btnSimu') || cls('button#simulateBtn');
    if (simBtn) { simBtn.disabled = true; simBtn.textContent = `Simulating: ${scenario.name}…`; }
    if (simBtn) await captionAt(simBtn, `Scenario: ${scenario.name}`);
    await scenario.fn();
  } catch (err) {
    console.error('[simulation] scenario failed', err);
  } finally {
    disableTopButtons(false);
    const simBtn = $('btnSimu') || cls('button#simulateBtn');
    if (simBtn) { simBtn.disabled = false; simBtn.textContent = 'Simulation'; }
    hideCaption();
    await wait(120);
  }
}

async function runRandomScenario() {
  const picked = pickScenario();
  if (!picked) { alert('No scenarios registered'); return; }
  return runScenarioObj(picked);
}

async function runScenario(name) {
  const s = SCENARIOS.find(x => x.name === name);
  if (!s) throw new Error('Scenario not found: ' + name);
  return runScenarioObj(s);
}

/* A thin wrapper used by main.js. Accepts options but they’re optional.
   - opts.scenarioName: run a specific scenario if provided; otherwise random.
   - opts.renderCallback(): invoked after run to let caller refresh UI. */
async function runSimulation(opts = {}) {
  if (opts.scenarioName) {
    await runScenario(opts.scenarioName);
  } else {
    await runRandomScenario();
  }
  if (typeof opts.renderCallback === 'function') {
    try { opts.renderCallback(); } catch (e) { console.error(e); }
  }
}

/* ---------------- convenience exports ---------------- */
export {
  addScenario as registerScenario,
  runSimulation,
  runRandomScenario,
  runScenario,
  pickScenario,
  SCENARIOS,
  disableTopButtons,
  enableTopButtons
};

/* ---------------- Example: register built-in simple scenarios (optional) ----------------
   You can remove or edit these examples. They show how to use the helpers above.
   They assume the UI has the same IDs used elsewhere in the app.
*/

// Example scenario: Web -> DB -> Admin Console
addScenario('Web → DB → Admin Console', async () => {
  const clear = $('clearAll');
  if (clear) { await moveToEl(clear); await clickEl(clear); }

  await ensureTarget('Web Server DMZ', false);
  await ensureTarget('Database', false);
  await ensureTarget('Admin Console', true);

  await ensureAttacker('APT Operator');

  const entriesSel = $('selEntriesAll');
  if (entriesSel) {
    selectByText($('selAttacker'), 'APT Operator');
    await moveToEl(entriesSel); multiSelectByTexts(entriesSel, ['Web Server DMZ']);
  }

  await moveToEl($('linkSource')); selectByText($('linkSource'), 'Web Server DMZ');
  await moveToEl($('linkDest')); multiSelectByTexts($('linkDest'), ['Database']);
  selectByText($('linkType'), 'direct');
  await moveToEl($('btnAddLink')); await clickEl($('btnAddLink'));

  await moveToEl($('linkSource')); selectByText($('linkSource'), 'Database');
  await moveToEl($('linkDest')); multiSelectByTexts($('linkDest'), ['Admin Console']);
  await moveToEl($('btnAddLink')); await clickEl($('btnAddLink'));

  await moveToEl($('btnFindPaths')); await clickEl($('btnFindPaths'));
  const firstBtn = document.querySelector('#results .path button');
  if (firstBtn) { await moveToEl(firstBtn); await clickEl(firstBtn); }
}, 1);

// Simple second example: Phishing -> Workstation -> DC -> Admin
addScenario('Phishing lateral to DC', async () => {
  const clear = $('clearAll'); if (clear) { await moveToEl(clear); await clickEl(clear); }
  await ensureTarget('Email Gateway', false);
  await ensureTarget('User Workstation', false);
  await ensureTarget('Domain Controller', false);
  await ensureTarget('Admin Console', true);

  await ensureAttacker('Phishing Campaign');
  selectByText($('selAttacker'), 'Phishing Campaign');
  multiSelectByTexts($('selEntriesAll'), ['Email Gateway']);

  selectByText($('linkSource'), 'Email Gateway'); multiSelectByTexts($('linkDest'), ['User Workstation']); selectByText($('linkType'), 'direct'); await clickEl($('btnAddLink'));
  selectByText($('linkSource'), 'User Workstation'); multiSelectByTexts($('linkDest'), ['Domain Controller']); selectByText($('linkType'), 'lateral'); await clickEl($('btnAddLink'));
  selectByText($('linkSource'), 'Domain Controller'); multiSelectByTexts($('linkDest'), ['Admin Console']); selectByText($('linkType'), 'direct'); await clickEl($('btnAddLink'));

  await moveToEl($('btnFindPaths')); await clickEl($('btnFindPaths'));
  const firstBtn = document.querySelector('#results .path button');
  if (firstBtn) { await moveToEl(firstBtn); await clickEl(firstBtn); }
}, 1);

/* End of simulation module */
