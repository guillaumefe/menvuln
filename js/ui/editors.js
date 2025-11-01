// js/ui/editors.js
// Editor UI module: target editor, attacker editor, details panel
// Imports expected from the modular structure:
//  - State (singleton) from ../state.js
//  - saveToLocal(state) from ../storage.js
//  - helpers: el, norm
//
// The module emits `document.dispatchEvent(new CustomEvent('state:changed'))`
// after any mutation so other UI modules can re-render.

import { State } from '../state.js';
import { saveToLocal } from '../storage.js';
import { el, norm } from '../helpers.js';

function emitChange() {
  try { saveToLocal(State); } catch (e) { console.warn('save failed', e); }
  document.dispatchEvent(new CustomEvent('state:changed'));
}

/* ---------- Target editor (vulns / final flag) ---------- */
export function renderTargetEditor(targetId) {
  const details = el('details');
  if (!details) return;

  const target = State.targets.find(t => t.id === targetId);
  if (!target) {
    details.innerHTML = `<div class="small">Select a target to edit its vulnerabilities and properties.</div>`;
    return;
  }

  // Build editor UI
  const wrapper = document.createElement('div');
  wrapper.className = 'col';

  // Header: name + rename button
  const header = document.createElement('div');
  header.innerHTML = `<strong>${escapeHtml(target.name)}</strong>`;
  const headerRow = document.createElement('div');
  headerRow.className = 'row';
  const renameBtn = document.createElement('button');
  renameBtn.textContent = 'Rename';
  renameBtn.onclick = () => {
    const newName = prompt('Rename target', target.name);
    if (newName === null) return;
    const n = norm(newName);
    if (!n) return alert('Invalid name');
    // check duplicates
    if (State.targets.some(t => t.name.toLowerCase() === n.toLowerCase() && t.id !== target.id)) return alert('Name already used');
    target.name = n;
    emitChange();
  };
  const finalLabel = document.createElement('label');
  finalLabel.className = 'small';
  finalLabel.style.display = 'inline-flex';
  finalLabel.style.alignItems = 'center';
  finalLabel.style.gap = '8px';
  const finalCb = document.createElement('input');
  finalCb.type = 'checkbox';
  finalCb.checked = !!target.final;
  finalCb.onchange = () => {
    target.final = finalCb.checked;
    emitChange();
  };
  finalLabel.append(finalCb, document.createTextNode(' Final flag'));
  headerRow.append(header, finalLabel, renameBtn);
  wrapper.appendChild(headerRow);

  // Vulnerabilities editor
  const vLabel = document.createElement('div');
  vLabel.className = 'small';
  vLabel.textContent = 'Vulnerabilities (check all that apply)';
  wrapper.appendChild(vLabel);

  const vulnBox = document.createElement('div');
  vulnBox.className = 'col';
  vulnBox.style.marginTop = '6px';

  // For each global vulnerability, show checkbox
  State.vulns.forEach(v => {
    const lab = document.createElement('label');
    lab.className = 'small';
    lab.style.display = 'flex';
    lab.style.alignItems = 'center';
    lab.style.gap = '8px';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    const currentVulns = target.vulns instanceof Set ? target.vulns : new Set(target.vulns || []);
    cb.checked = currentVulns.has(v.id);
    cb.onchange = () => {
      target.vulns = target.vulns instanceof Set ? target.vulns : new Set(target.vulns || []);
      if (cb.checked) target.vulns.add(v.id);
      else target.vulns.delete(v.id);
      emitChange();
    };
    const span = document.createElement('span');
    span.textContent = v.name;
    lab.append(cb, span);
    vulnBox.appendChild(lab);
  });

  // Add quick "add new vuln" line
  const addVRow = document.createElement('div');
  addVRow.className = 'row';
  addVRow.style.marginTop = '6px';
  const inputNewV = document.createElement('input');
  inputNewV.type = 'text';
  inputNewV.placeholder = 'New vulnerability name';
  inputNewV.style.flex = '1';
  const addVBtn = document.createElement('button');
  addVBtn.textContent = 'Add & attach';
  addVBtn.onclick = () => {
    const name = norm(inputNewV.value);
    if (!name) return alert('Name required');
    // avoid duplicate vulnerability names
    if (State.vulns.some(x => x.name.toLowerCase() === name.toLowerCase())) {
      // attach existing vuln if present
      const existing = State.vulns.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        target.vulns = target.vulns instanceof Set ? target.vulns : new Set(target.vulns || []);
        target.vulns.add(existing.id);
        inputNewV.value = '';
        emitChange();
        return;
      }
      return;
    }
    // create new vuln id and add globally
    const id = (Date.now().toString(36) + Math.random().toString(36).slice(2,6));
    State.vulns.push({ id, name });
    // attach to target
    target.vulns = target.vulns instanceof Set ? target.vulns : new Set(target.vulns || []);
    target.vulns.add(id);
    inputNewV.value = '';
    emitChange();
  };
  addVRow.append(inputNewV, addVBtn);

  wrapper.appendChild(vulnBox);
  wrapper.appendChild(addVRow);

  // Links quick view (read-only summary)
  const linksLabel = document.createElement('div');
  linksLabel.className = 'small';
  linksLabel.style.marginTop = '10px';
  linksLabel.textContent = 'Outgoing links (summary)';
  wrapper.appendChild(linksLabel);

  const linksSummary = document.createElement('div');
  linksSummary.className = 'small';
  linksSummary.style.marginTop = '6px';
  // summarise by type
  const outDirect = (State.edges.direct[target.id] || new Set());
  const outLat = (State.edges.lateral[target.id] || new Set());
  const outContains = (State.edges.contains[target.id] || new Set());
  linksSummary.innerHTML = `
    <div><strong>Direct:</strong> ${[...outDirect].map(id => (State.targets.find(t => t.id === id) || {name:'?'}).name).join(', ') || '—'}</div>
    <div><strong>Lateral:</strong> ${[...outLat].map(id => (State.targets.find(t => t.id === id) || {name:'?'}).name).join(', ') || '—'}</div>
    <div><strong>Contains:</strong> ${[...outContains].map(id => (State.targets.find(t => t.id === id) || {name:'?'}).name).join(', ') || '—'}</div>
  `;
  wrapper.appendChild(linksSummary);

  // put everything in details
  details.innerHTML = '';
  details.appendChild(wrapper);
}

/* ---------- Attacker editor (entries multi-select) ---------- */
export function renderAttackerEditor(attackerId) {
  const details = el('details');
  if (!details) return;

  const attacker = State.attackers.find(a => a.id === attackerId);
  if (!attacker) {
    details.innerHTML = `<div class="small">Select an attacker to edit its entry points.</div>`;
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'col';

  const header = document.createElement('div');
  header.innerHTML = `<strong>${escapeHtml(attacker.name)}</strong>`;
  const renameBtn = document.createElement('button');
  renameBtn.textContent = 'Rename';
  renameBtn.onclick = () => {
    const newName = prompt('Rename attacker', attacker.name);
    if (newName === null) return;
    const n = norm(newName);
    if (!n) return alert('Invalid name');
    if (State.attackers.some(x => x.name.toLowerCase() === n.toLowerCase() && x.id !== attacker.id)) return alert('Name already used');
    attacker.name = n;
    emitChange();
  };
  header.appendChild(renameBtn);
  wrapper.appendChild(header);

  // Entries multi-select
  const lbl = document.createElement('div');
  lbl.className = 'small';
  lbl.textContent = 'Entry points (select one or many from targets below)';
  wrapper.appendChild(lbl);

  const sel = document.createElement('select');
  sel.id = 'editorEntriesSelect';
  sel.multiple = true;
  sel.size = Math.min(10, Math.max(6, State.targets.length));
  sel.style.width = '100%';

  // Normalize attacker.entries to a Set before checking membership
  const entriesSet = attacker.entries instanceof Set ? attacker.entries : new Set(attacker.entries || []);

  State.targets.forEach(t => {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.name;
    o.selected = entriesSet.has(t.id);
    sel.appendChild(o);
  });

  sel.onchange = () => {
    const picked = [...sel.selectedOptions].map(o => o.value);
    attacker.entries = new Set(picked);
    emitChange();
  };

  wrapper.appendChild(sel);

  // Quick helpers: select all / none
  const btnRow = document.createElement('div');
  btnRow.className = 'row';
  const btnAll = document.createElement('button');
  btnAll.textContent = 'Select all';
  btnAll.onclick = () => {
    for (const o of sel.options) { o.selected = true; }
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const btnNone = document.createElement('button');
  btnNone.textContent = 'Select none';
  btnNone.className = 'ghost';
  btnNone.onclick = () => {
    for (const o of sel.options) { o.selected = false; }
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  };
  btnRow.append(btnAll, btnNone);
  wrapper.appendChild(btnRow);

  details.innerHTML = '';
  details.appendChild(wrapper);
}

/* ---------- Helpers & init ---------- */
function escapeHtml(s) {
  return String(s||'').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
}

/**
 * Re-render whichever details panel is relevant to the current selection.
 * If a target is selected, render the target editor; otherwise, if an attacker is
 * selected, render the attacker editor. If nothing is selected, clear the panel.
 */
export function hydrateDetailsPanel() {
  const details = el('details');
  if (!details) return;

  const selTarget = el('selectTarget') || el('linkSource');
  const selAttacker = el('selAttacker');

  if (selTarget && selTarget.value) {
    renderTargetEditor(selTarget.value);
    return;
  }
  if (selAttacker && selAttacker.value) {
    renderAttackerEditor(selAttacker.value);
    return;
  }
  details.innerHTML = `<div class="small">Select an attacker or target to edit.</div>`;
}

/**
 * initEditors
 * - wires main high-level editor controls: when selectAttacker changes, render attacker editor;
 *   when selectTarget changes, render target editor.
 * - listens to global `state:changed` to re-populate selects (targets / vulns) so editors remain live.
 */
export function initEditors() {
  // populate initial selects in the central UI if they exist
  const selAttacker = el('selAttacker');
  const selTarget = el('selectTarget') || el('linkSource'); // support both naming conventions
  // When attacker selection changes, present attacker editor
  if (selAttacker) {
    selAttacker.onchange = () => {
      renderAttackerEditor(selAttacker.value);
    };
  }

  // When target selection changes, present target editor
  if (selTarget) {
    selTarget.onchange = () => {
      renderTargetEditor(selTarget.value);
    };
  }

  // when global state changes, re-populate selects so editors remain in sync
  document.addEventListener('state:changed', () => {
    // re-fill attacker select
    if (selAttacker) {
      const cur = selAttacker.value;
      selAttacker.innerHTML = '';
      State.attackers.forEach(a => {
        const o = document.createElement('option');
        o.value = a.id; o.textContent = a.name;
        selAttacker.appendChild(o);
      });
      if (State.attackers.some(a=>a.id===cur)) selAttacker.value = cur;
    }
    // re-fill central target selects used by UI
    const selTargets = [ 'selectTarget', 'linkSource', 'linkDest', 'selEntriesAll', 'selectStartPool' ];
    selTargets.forEach(id => {
      const s = el(id);
      if (!s) return;
      const prev = s.value;
      const selectedValues = [...(s.selectedOptions || [])].map(o => o.value);
      s.innerHTML = '';
      State.targets.forEach(t => {
        const o = document.createElement('option'); o.value = t.id; o.textContent = t.name;
        // re-select previously selected items if still present
        if (selectedValues.includes(o.value)) o.selected = true;
        s.appendChild(o);
      });
      if (prev && [...s.options].some(o => o.value === prev)) s.value = prev;
    });

    // If there is a currently rendered details editor, re-render it to reflect vulnerabilities and flags
    hydrateDetailsPanel();
  });

  // initial population in case DOM is already ready
  document.dispatchEvent(new CustomEvent('state:changed'));
}
