// js/ui/lists.js
// Utilities and renderers for side lists and central selectors.

import { State, deleteAttacker, deleteTarget, deleteVuln } from '../state.js';
import { saveToLocal } from '../storage.js';
import { el } from '../helpers.js';

import { hydrateDetailsPanel } from './editors.js';
import { renderLinksInspector as _renderLinksInspector } from './links.js';
import { renderResults } from './results.js';

/* ---------------------------------------------------------- */
/* Small DOM helpers                                           */
/* ---------------------------------------------------------- */
function createButton(label, onClick, ghost = false){
  const b = document.createElement('button');
  b.textContent = label;
  b.className = ghost ? 'ghost' : '';
  b.onclick = onClick;
  return b;
}

function badge(text){
  const d = document.createElement('div');
  d.className = 'badge';
  d.textContent = text;
  return d;
}

function mini(text){
  const d = document.createElement('div');
  d.className = 'mini';
  d.textContent = text;
  return d;
}

function emitStateChanged() {
  try { saveToLocal(State); } catch(e) {}
  document.dispatchEvent(new CustomEvent('state:changed'));
}

/* ---------------------------------------------------------- */
/* setOptions : peuple un <select> et conserve la sélection    */
/* - Si `selected` est fourni (Set), il est prioritaire.       */
/* - Sinon on restaure la sélection précédente (multi/single). */
/* ---------------------------------------------------------- */
export function setOptions(
  selectEl,
  items,
  { getValue = x => x.id, getLabel = x => x.name, selected = null } = {}
){
  if(!selectEl) return;

  const wasMultiple = !!selectEl.multiple;

  // capture sélection courante
  const prevSelected = wasMultiple
    ? new Set([...selectEl.selectedOptions].map(o => String(o.value)))
    : new Set(selectEl.value ? [String(selectEl.value)] : []);

  const prevValue = selectEl.value;

  // rebuild
  selectEl.innerHTML = '';
  (items || []).forEach(item => {
    const val = String(getValue(item));
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = String(getLabel(item));

    // priorité: selected (fourni) > sélection précédente
    if (selected instanceof Set) {
      opt.selected = selected.has(val);
    } else if (prevSelected.has(val)) {
      opt.selected = true;
    }

    selectEl.appendChild(opt);
  });

  // pour les selects non-multiples, restaurer la value si possible
  if (!wasMultiple && prevValue && [...selectEl.options].some(o => o.value === prevValue)) {
    selectEl.value = prevValue;
  }
}

/* ---------------------------------------------------------- */
/* Side panel : ATTACKERS                                     */
/* ---------------------------------------------------------- */
export function renderAttackers(){
  const container = el('attackerList');
  if(!container) return;
  container.innerHTML = '';

  (State.attackers || []).forEach(a => {
    const row = document.createElement('div');
    row.className = 'item';

    const left = document.createElement('div');
    left.className = 'left';

    const entries = a.entries instanceof Set ? a.entries : new Set(a.entries || []);
    left.appendChild(badge(a.name));
    left.appendChild(mini(`Entries: ${[...entries].map(id => {
      const t = (State.targets || []).find(x => x.id === id);
      return t ? t.name : '?';
    }).join(', ') || '—'}`));

    const right = document.createElement('div');

    // rename
    right.appendChild(createButton('Rename', () => {
      const name = prompt('Rename attacker', a.name);
      if(!name) return;
      a.name = name;
      emitStateChanged();
      renderAllLists();
    }));

    // delete
    right.appendChild(createButton('Delete', () => {
      if(confirm('Delete attacker?')){
        deleteAttacker(a.id);
        emitStateChanged();
        renderAllLists();
      }
    }, true));

    row.append(left, right);
    container.appendChild(row);
  });
}

/* ---------------------------------------------------------- */
/* Side panel : TARGETS                                       */
/* ---------------------------------------------------------- */
export function renderTargets(){
  const container = el('targetList');
  if(!container) return;
  container.innerHTML = '';

  (State.targets || []).forEach(t => {
    const row = document.createElement('div');
    row.className = 'item';

    const left = document.createElement('div');
    left.className = 'left';

    left.appendChild(badge(t.name));

    const vulnsSet = t.vulns instanceof Set ? t.vulns : new Set(t.vulns || []);
    left.appendChild(mini(`Vulns: ${
      [...vulnsSet].map(id => (State.vulns || []).find(v => v.id === id)?.name || '?').join(', ') || '—'
    }`));

    const right = document.createElement('div');

    right.appendChild(createButton('Rename', () => {
      const name = prompt('Rename target', t.name);
      if(!name) return;
      t.name = name;
      emitStateChanged();
      renderAllLists();
    }));

    right.appendChild(createButton('Delete', () => {
      if(confirm('Delete target?')){
        deleteTarget(t.id);
        emitStateChanged();
        renderAllLists();
        renderLinksInspector();
        renderResults([]);
      }
    }, true));

    row.append(left, right);
    container.appendChild(row);
  });
}

/* ---------------------------------------------------------- */
/* Side panel : VULNERABILITIES                               */
/* ---------------------------------------------------------- */
export function renderVulns(){
  const container = el('vulnList');
  if(!container) return;
  container.innerHTML = '';

  (State.vulns || []).forEach(v => {
    const row = document.createElement('div');
    row.className = 'item';

    const left = document.createElement('div');
    left.className = 'left';
    left.appendChild(badge(v.name));

    const right = document.createElement('div');
    right.appendChild(createButton('Delete', () => {
      if(confirm('Delete vulnerability?')){
        deleteVuln(v.id);
        emitStateChanged();
        renderAllLists();
        hydrateDetailsPanel();
      }
    }, true));

    row.append(left, right);
    container.appendChild(row);
  });
}

/* ---------------------------------------------------------- */
/* Re-render lists globally                                   */
/* ---------------------------------------------------------- */
export function renderAllLists(){
  renderAttackers();
  renderTargets();
  renderVulns();
  hydrateDetailsPanel();
}

/* ---------------------------------------------------------- */
/* Populate ALL selectors (menus)                             */
/* ---------------------------------------------------------- */
export function populateSelectors(state = State){
  setOptions(el('selAttacker'), state.attackers || []);

  setOptions(el('selEntriesAll'), state.targets || []);
  setOptions(el('selExitsAll'),   state.targets || []);

  setOptions(el('linkSource'), state.targets || []);
  setOptions(el('linkDest'),   state.targets || []);

  hydrateEntriesSelect(state);
  hydrateExitsSelect(state);
  hydrateVulnSelectors(state);

  renderLinksInspector();
}

/* ---------------------------------------------------------- */
/* Hydrate Entries (multi)                                    */
/* ---------------------------------------------------------- */
export function hydrateEntriesSelect(state = State){
  const selAtt = el('selAttacker');
  const sel = el('selEntriesAll');
  if(!selAtt || !sel) return;

  const att = (state.attackers || []).find(a => String(a.id) === String(selAtt.value));
  const selected = new Set(att?.entries ? [...att.entries].map(String) : []);
  [...sel.options].forEach(o => { o.selected = selected.has(o.value); });
}

/* ---------------------------------------------------------- */
/* Hydrate Exits (multi)                                      */
/* ---------------------------------------------------------- */
export function hydrateExitsSelect(state = State){
  const selAtt = el('selAttacker');
  const sel = el('selExitsAll');
  if(!selAtt || !sel) return;

  const att = (state.attackers || []).find(a => String(a.id) === String(selAtt.value));
  const selected = new Set(att?.exits ? [...att.exits].map(String) : []);
  [...sel.options].forEach(o => { o.selected = selected.has(o.value); });
}

/* ---------------------------------------------------------- */
/* Hydrate Vulns (multi, persist visuellement)                */
/* ---------------------------------------------------------- */
export function hydrateVulnSelectors(state = State){
  const selT = el('selVulnElement');
  const selV = el('selVulnsForElement');
  if(!selT || !selV) return;

  // (1) cibles
  setOptions(selT, state.targets || []);

  // (2) vulns de la cible courante
  const t = (state.targets || []).find(x => String(x.id) === String(selT.value));
  const current = t ? (t.vulns instanceof Set ? t.vulns : new Set(t.vulns || [])) : new Set();
  const selected = new Set([...current].map(String));

  setOptions(selV, state.vulns || [], { selected });
}

/* ---------------------------------------------------------- */
/* Re-export                                                  */
/* ---------------------------------------------------------- */
export const renderLinksInspector = _renderLinksInspector;
