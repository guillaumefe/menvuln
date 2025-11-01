// js/ui/lists.js
import { State, deleteAttacker, deleteTarget, deleteVuln } from '../state.js';
import { saveToLocal } from '../storage.js';
import { el } from '../helpers.js';

import { hydrateDetailsPanel } from './editors.js'; // update right panel
import { renderLinksInspector } from './links.js';  // update link list
import { renderResults } from './results.js';       // refresh if needed

/* ---- Helpers ---- */
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

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!t.final;
    cb.title = 'Mark as final (goal)';
    cb.onchange = () => {
      t.final = cb.checked;
      emitStateChanged();
      renderLinksInspector();
      hydrateDetailsPanel();
    };

    left.append(cb);
    left.append(badge(t.name));

    const vulnsSet = t.vulns instanceof Set ? t.vulns : new Set(t.vulns || []);
    left.append(mini(`Vulns: ${
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
        renderResults([]); // clear paths if invalidated
      }
    }, true);

    right.append(btnRename, btnDel);
    row.append(left, right);
    container.appendChild(row);
  });
}

/* ---- RENDER VULNS ---- */
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

/* ---- Render all lists together ---- */
export function renderAllLists(){
  renderAttackers();
  renderTargets();
  renderVulns();
  hydrateDetailsPanel(); // update right panel if selection exists
}
