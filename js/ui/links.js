// js/ui/links.js
// UI logic for managing links between targets using the selectors present in the page.

import { State, ensureEdgeMaps } from '../state.js';
import { saveToLocal } from '../storage.js';
import { el } from '../helpers.js';

/* =========================
   Internal helpers
========================= */

function nameOfTarget(id) {
  const t = State.targets.find(x => x.id === id);
  return t ? t.name : '?';
}

function getLinkMapByType(type) {
  if (type === 'direct')   return State.edges.direct;
  if (type === 'lateral')  return State.edges.lateral;
  if (type === 'contains') return State.edges.contains;
  return null;
}

function addLink(type, from, to) {
  const map = getLinkMapByType(type);
  if (!map) return;
  ensureEdgeMaps(from);
  map[from].add(to);
}

function removeLink(type, from, to) {
  const map = getLinkMapByType(type);
  if (!map || !map[from]) return;
  map[from].delete(to);
}

function clearAndFillSelect(selectEl, items) {
  selectEl.innerHTML = '';
  items.forEach(({ id, name }) => {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = name;
    selectEl.appendChild(o);
  });
}

/* =========================
   Populate selectors
========================= */

export function populateLinkSelectors() {
  const src = el('linkSource');
  const dst = el('linkDest');
  const type = el('linkType');

  if (!src || !dst || !type) return;

  const items = State.targets.map(t => ({ id: t.id, name: t.name }));
  clearAndFillSelect(src, items);
  clearAndFillSelect(dst, items);

  if (!['direct', 'lateral', 'contains'].includes(type.value)) {
    type.value = 'direct';
  }
}

/* =========================
   Links inspector
========================= */

export function renderLinksInspector() {
  const box = el('linksInspector');
  const src = el('linkSource')?.value;

  if (!box) return;

  if (!src) {
    box.innerHTML = '<div class="mini">Pick a source to view its links.</div>';
    return;
  }

  const makeGroup = (label, mapObj, typeKey) => {
    const set = mapObj[src] || new Set();
    const items = Array.isArray(set) ? set : [...set];
    if (!items.length) {
      return `<div style="margin-top:6px"><strong>${label}:</strong> —</div>`;
    }
    const chips = items.map(toId => {
      const tName = nameOfTarget(toId);
      const btn = `<button data-type="${typeKey}" data-to="${toId}" class="ghost" style="padding:2px 6px;border-radius:6px">Remove</button>`;
      return `<span class="badge" style="display:inline-flex;align-items:center;gap:6px;margin:4px 6px 0 0">${tName}${btn}</span>`;
    }).join(' ');
    return `<div style="margin-top:6px"><strong>${label}:</strong><div style="margin-top:4px">${chips}</div></div>`;
  };

  box.innerHTML = [
    `<div class="mini">Links from <strong>${nameOfTarget(src)}</strong> (use "Remove" to delete)</div>`,
    makeGroup('direct',   State.edges.direct,   'direct'),
    makeGroup('lateral',  State.edges.lateral,  'lateral'),
    makeGroup('contains', State.edges.contains, 'contains'),
  ].join('');

  box.onclick = (e) => {
    const btn = e.target.closest('button[data-to]');
    if (!btn) return;
    const type = btn.getAttribute('data-type');
    const to   = btn.getAttribute('data-to');
    removeLink(type, src, to);
    saveToLocal(State);
    renderLinksInspector();
    // Keep the destination multiselect visually in sync
    syncDestSelectionFromState();
  };
}

/* =========================
   Event wiring
========================= */

let _syncDestSelectionFromState = null;
function syncDestSelectionFromState() {
  // late-bound to avoid accessing elements before ready
  if (typeof _syncDestSelectionFromState === 'function') {
    _syncDestSelectionFromState();
  }
}

export function wireLinksUI() {
  const srcSel   = el('linkSource');
  const dstSel   = el('linkDest');
  const typeSel  = el('linkType');
  const btnClear = el('btnClearLinkSelection');

  if (!srcSel || !dstSel || !typeSel) return;

  _syncDestSelectionFromState = () => {
    const from = srcSel.value;
    const type = typeSel.value;
    const map = getLinkMapByType(type) || {};
    const set = map[from] || new Set();
    const current = new Set(Array.isArray(set) ? set : Array.from(set));
    [...dstSel.options].forEach(o => { o.selected = current.has(o.value); });
    renderLinksInspector();
  };

  srcSel.addEventListener('change', _syncDestSelectionFromState);
  typeSel.addEventListener('change', _syncDestSelectionFromState);

  // Real-time persistence on every change
  dstSel.addEventListener('change', () => {
    const from = srcSel.value;
    if (!from) return;

    const type = typeSel.value;
    const map = getLinkMapByType(type) || {};
    ensureEdgeMaps(from);

    const before = new Set(Array.isArray(map[from]) ? map[from] : Array.from(map[from] || []));
    const after  = new Set([...dstSel.selectedOptions].map(o => o.value));

    for (const to of after) {
      if (!before.has(to)) addLink(type, from, to);
    }
    for (const to of before) {
      if (!after.has(to)) removeLink(type, from, to);
    }

    saveToLocal(State);
    renderLinksInspector();
  });

  // Clear selection button: clears UI and state through the change handler
  if (btnClear) {
    btnClear.onclick = () => {
      [...dstSel.options].forEach(o => o.selected = false);
      dstSel.dispatchEvent(new Event('change', { bubbles: true }));
    };
  }

  populateLinkSelectors();
  _syncDestSelectionFromState();
}
