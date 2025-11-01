// js/ui/lists.js
import { State, deleteAttacker, deleteTarget, deleteVuln } from '../state.js';
import { saveToLocal } from '../storage.js';
import { el } from '../helpers.js';

// keep this as a named import; editors.js should export hydrateDetailsPanel
import { hydrateDetailsPanel } from './editors.js';
import { renderLinksInspector as _renderLinksInspector } from './links.js';
import { renderResults } from './results.js';

/* ---- DOM Helpers ---- */
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
  try { saveToLocal(State); } catch(e) { console.warn('save failed', e); }
  document.dispatchEvent(new CustomEvent('state:changed'));
}

/* ---- Select Utility for Dropdowns ---- */
export function setOptions(selectEl, items, { getValue = x => x.id, getLabel = x => x.name, selected = new Set() } = {}){
  if(!selectEl) return;
  const prev = selectEl.value;
  selectEl.innerHTML = '';
  (items || []).forEach(item => {
    const opt = document.createElement('option');
    opt.value = String(getValue(item));
    opt.textContent = String(getLabel(item));
    if (selected.has(opt.value)) opt.selected = true;
    selectEl.appendChild(opt);
  });
  if (prev && [...selectEl.options].some(o => o.value === prev)) {
    selectEl.value = prev;
  }
}

/* ---- RENDER ATTACKERS ---- */
export function renderAttackers(){
  const container = el('attackerList');
  if(!container) return;
  container.innerHTML = '';

  State.attackers.forEach(a => {
    const row = document.createElement('div');
    row.className = 'item';

    const left = document.createElement('div');
    left.className = 'left';

    const entries = a.entries instanceof Set ? a.entries : new Set(a.entries || []);
    left.appendChild(badge(a.name));
    left.appendChild(mini(`Entries: ${[...entries].map(id => {
      const t = State.targets.find(x => x.id === id);
      return t ? t.name : '?';
    }).join(', ') || '—'}`));

    const right = document.createElement('div');

    const btnRename = createButton('Rename', () => {
      const name = prompt('Rename attacker', a.name);
      if(!name) return;
      a.name = name;
      emitStateChanged();
      renderAllLists();
    });

    const btnDel = createButton('Delete', () => {
      if(confirm('Delete attacker?')){
        deleteAttacker(a.id);
        emitStateChanged();
        renderAllLists();
      }
    }, true);

    right.append(btnRename, btnDel);
    row.append(left, right);
    container.appendChild(row);
  });
}

/* ---- RENDER TARGETS ---- */
export function renderTargets(){
  const container = el('targetList');
  if(!container) return;
  container.innerHTML = '';

  State.targets.forEach(t => {
    const row = document.createElement('div');
    row.className = 'item';

    const left = document.createElement('div');
    left.className = 'left';

    left.appendChild(badge(t.name));

    const vulnsSet = t.vulns instanceof Set ? t.vulns : new Set(t.vulns || []);
    left.appendChild(mini(`Vulns: ${
      [...vulnsSet].map(id => State.vulns.find(v => v.id === id)?.name || '?').join(', ') || '—'
    }`));

    const right = document.createElement('div');

    const btnRename = createButton('Rename', () => {
      const name = prompt('Rename target', t.name);
      if(!name) return;
      t.name = name;
      emitStateChanged();
      renderAllLists();
    });

    const btnDel = createButton('Delete', () => {
      if(confirm('Delete target?')){
        deleteTarget(t.id);
        emitStateChanged();
        renderAllLists();
        renderLinksInspector();
        renderResults([]);
      }
    }, true);

    right.append(btnRename, btnDel);
    row.append(left, right);
    container.appendChild(row);
  });
}

/* ---- RENDER VULNERABILITIES ---- */
export function renderVulns(){
  const container = el('vulnList');
  if(!container) return;
  container.innerHTML = '';

  State.vulns.forEach(v => {
    const row = document.createElement('div');
    row.className = 'item';

    const left = document.createElement('div');
    left.className = 'left';
    left.appendChild(badge(v.name));

    const right = document.createElement('div');
    const btnDel = createButton('Delete', () => {
      if(confirm('Delete vulnerability?')){
        deleteVuln(v.id);
        emitStateChanged();
        renderAllLists();
        hydrateDetailsPanel();
      }
    }, true);

    right.append(btnDel);
    row.append(left, right);
    container.appendChild(row);
  });
}

/* ---- Render all side panel lists ---- */
export function renderAllLists(){
  renderAttackers();
  renderTargets();
  renderVulns();
  hydrateDetailsPanel();
}

/* ---- Populate dropdown selectors ---- */
export function populateSelectors(state = State){
  const selAttacker = el('selAttacker');
  setOptions(selAttacker, state.attackers || []);

  const selEntriesAll = el('selEntriesAll');
  setOptions(selEntriesAll, state.targets || []);

  const linkSource = el('linkSource');
  const linkDest = el('linkDest');
  setOptions(linkSource, state.targets || []);
  setOptions(linkDest, state.targets || []);

  hydrateEntriesSelect(state);
  renderLinksInspector();
}

export function hydrateEntriesSelect(state = State){
  const selAttacker = el('selAttacker');
  const selEntriesAll = el('selEntriesAll');
  if(!selAttacker || !selEntriesAll) return;

  const attackerId = selAttacker.value;
  const attacker = (state.attackers || []).find(a => String(a.id) === String(attackerId));
  const selectedSet = new Set(
    attacker
      ? [...(attacker.entries instanceof Set ? attacker.entries : new Set(attacker.entries || []))].map(String)
      : []
  );

  [...selEntriesAll.options].forEach(opt => {
    opt.selected = selectedSet.has(opt.value);
  });
}

/* ---- Right-panel updater ---- */
export function renderDetailsPanel(){
  hydrateDetailsPanel();
}

/* ---- Re-export links inspector ---- */
export const renderLinksInspector = _renderLinksInspector;
