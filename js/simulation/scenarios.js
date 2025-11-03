/* =========================================================
   simulation/scenarios.js
   Scénarios "humains" : chaque lien est créé via un vrai clic
   sur le bouton Add Link, puis la sélection est nettoyée pour
   éviter les boucles infinies.
   Adapté pour fallback vers simAddLink / écriture directe si l'UI
   n'a pas commité les liens (utile pour environnements headless).
   ========================================================= */

import { registerScenario, g } from './index.js';

// --- ROBUST LINK COMMIT: bypass UI and write directly into State ---
import * as StateMod from '../state.js';
import { saveToLocal } from '../storage.js';
import { renderLinksInspector } from '../ui/links.js';

window.humanCommitLinks = async function humanCommitLinks(fromName, toNames = [], type = 'direct') {
  const map = new Map(StateMod.State.targets.map(t => [String(t.name || '').toLowerCase(), t.id]));
  const fromId = map.get(String(fromName).toLowerCase());
  const toIds  = (toNames || []).map(n => map.get(String(n).toLowerCase())).filter(Boolean);

  if (!fromId || !toIds.length) return;

  // add edges directly; no DOM select / no virtual cursor
  toIds.forEach(to => StateMod.addEdge(type, fromId, to));

  try { saveToLocal(StateMod.State); } catch {}
  try { renderLinksInspector(); } catch {}
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
};

/* ---------------------------------------------------------
   Helpers: commit *comme un humain*
   --------------------------------------------------------- */

// Compte les arêtes pour détecter "rien n'a changé"
function __edgeCount(state) {
  const E = state?.edges || { direct:{}, lateral:{}, contains:{} };
  const sum = (m) => Object.values(E[m] || {}).reduce((n, s) => n + (s?.size || 0), 0);
  return { d: sum('direct'), l: sum('lateral'), c: sum('contains') };
}

/** Clique le vrai bouton "Add link" si présent, sinon fallback "change". Puis CLEAR la sélection. */
async function clickAddLinkButton() {
  const tryIds = ['btnAddLink','addLink','linkAdd','btnLinkAdd','btn-add-link','action-add-link'];
  let btn = null;
  for (const id of tryIds) { const n = g.el(id); if (n) { btn = n; break; } }

  // snapshot avant
  const S = window.__envuln_boot?.State || window.State || StateMod.State;
  const before = __edgeCount(S);

  if (btn) {
    await g.click(btn);
  } else {
    // fallback: déclenchement par change pour UIs sans bouton
    const sel = g.el('linkDest');
    if (sel) sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // laisser le temps aux handlers d'ajouter les liens
  await g.wait(160);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
  await g.wait(60);

  // CLEAR la sélection pour éviter les re-commits infinis
  const destSel = g.el('linkDest');
  if (destSel) {
    [...destSel.options].forEach(o => o.selected = false);
    destSel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // garde-fou : si rien n'a changé, on n'insiste pas mais renverra au caller
  const after = __edgeCount(S);
  const delta = (after.d - before.d) + (after.l - before.l) + (after.c - before.c);
  return delta; // nombre d'arêtes ajoutées (approx)
}

/** S'assure du type de lien (direct/lateral/contains) si le select existe. */
async function ensureLinkType(type = 'direct') {
  const selType = g.el('linkType');
  if (!selType) return;
  if (String(selType.value).toLowerCase() === String(type).toLowerCase()) return;
  await g.click(selType);
  await g.wait(40);
  await g.selectByText(selType, type);
  await g.wait(60);
}

/** Commit "humain" : source → type → destinations → Add → CLEAR selection.
 *  Si l'UI n'a pas pris en compte l'ajout (delta <= 0) on écrira directement
 *  dans l'état via StateMod.addEdge() et, si disponible, via g.addLink()
 */
async function humanCommitLinks(fromLabel, toLabels = [], type = 'direct') {
  // source
  await g.selectByText(g.el('linkSource'), fromLabel);
  await g.wait(60);

  // type
  await ensureLinkType(type);

  // destinations
  const destSel = g.el('linkDest');
  if (!destSel) {
    // no multi-select present: fallback direct
    // try to add via sim API if available
    const map = new Map(StateMod.State.targets.map(t => [String(t.name || '').toLowerCase(), t.id]));
    const fromId = map.get(String(fromLabel).toLowerCase());
    const toIds = (toLabels || []).map(n => map.get(String(n).toLowerCase())).filter(Boolean);
    if (fromId && toIds.length) {
      toIds.forEach(tid => {
        try {
          if (typeof g.addLink === 'function') g.addLink(type, fromId, tid);
          else StateMod.addEdge(type, fromId, tid);
        } catch {}
      });
      try { saveToLocal(StateMod.State); } catch {}
      try { renderLinksInspector(); } catch {}
      try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
    }
    return;
  }

  await g.click(destSel);
  await g.wait(40);
  g.multiSelectByTexts(destSel, toLabels);
  await g.wait(40);

  // commit via bouton (avec clear + vérif delta)
  const delta = await clickAddLinkButton();

  // si l'UI n'a rien fait (peut arriver dans certains builds), fallback direct
  if (!delta || delta <= 0) {
    // map names->ids
    const map = new Map(StateMod.State.targets.map(t => [String(t.name || '').toLowerCase(), t.id]));
    const fromId = map.get(String(fromLabel).toLowerCase());
    const toIds = (toLabels || []).map(n => map.get(String(n).toLowerCase())).filter(Boolean);

    if (!fromId || !toIds.length) return;

    for (const toId of toIds) {
      try {
        // Prefer simulation API if present (so it is visible in replay)
        if (typeof g.addLink === 'function') {
          g.addLink(type, fromId, toId);
        } else {
          StateMod.addEdge(type, fromId, toId);
        }
      } catch (e) {
        console.warn('fallback addEdge failed', e);
        try { StateMod.addEdge(type, fromId, toId); } catch {}
      }
    }

    try { saveToLocal(StateMod.State); } catch {}
    try { renderLinksInspector(); } catch {}
    try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
    await g.wait(40);
  }
}

/** Commit de la sélection de vulnérabilités (multi-select change). */
function commitVulnSelection() {
  const sel = g.el('selVulnsForElement');
  if (!sel) return;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
}

/* Ajouts via la vraie UI */
async function ensureVuln(name) {
  const inp = g.el('vulnName');
  if (!inp) return;
  await g.typeInto(inp, name);
  await g.click(g.el('btnAddVuln'));
  await g.wait(140);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
}

async function addTarget(label) {
  await g.typeInto(g.el('targetName'), label);
  await g.click(g.el('btnAddTarget'));
  await g.wait(120);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
}

/* ---------------------------------------------------------
   Scénarios (créent explicitement les liens nécessaires)
   --------------------------------------------------------- */

/* 1) Minimal web app chain — Internet LB -> Web Server -> App Server -> Database */
async function scenario_small_webapp() {
  await g.typeInto(g.el('attackerName'), 'Threat Actor — WebApp');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(240);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  const targets = ['Internet LB', 'Web Server', 'App Server', 'Database'];
  for (const t of targets) await addTarget(t);

  await ensureVuln('Auth RCE');

  await g.selectByText(g.el('selAttacker'), 'Threat Actor — WebApp');
  await g.wait(120);

  // entries & exits
  g.multiSelectByTexts(g.el('selEntriesAll'), ['Internet LB']);
  g.multiSelectByTexts(g.el('selExitsAll'),   ['Database']);
  await g.wait(140);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  // Liens
  await humanCommitLinks('Internet LB', ['Web Server'], 'direct');
  await g.wait(100);
  await humanCommitLinks('Web Server', ['App Server'], 'direct');
  await g.wait(100);
  await humanCommitLinks('App Server', ['Database'], 'direct');
  await g.wait(120);

  // Vuln
  await g.selectByText(g.el('selVulnElement'), 'Web Server');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Auth RCE']);
  commitVulnSelection();
  await g.wait(160);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  // Compute
  await g.click(g.el('btnFindPaths'));
  await g.wait(420);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
}

/* 2) Corporate network — plusieurs chemins + lien latéral depuis Mail */
async function scenario_corporate_network() {
  await g.typeInto(g.el('attackerName'), 'APT — Corporate');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(260);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  const targets = [
    'Internet Gateway', 'Perimeter FW', 'Proxy', 'Mail Server',
    'VPN Gateway', 'Edge VM', 'Internal App', 'DB Cluster', 'Secrets Store'
  ];
  for (const t of targets) await addTarget(t);

  await ensureVuln('Open Port');
  await ensureVuln('Phishing OTP');
  await ensureVuln('Priv Esc');

  await g.selectByText(g.el('selAttacker'), 'APT — Corporate');
  await g.wait(120);

  g.multiSelectByTexts(g.el('selEntriesAll'), ['Internet Gateway', 'Mail Server']);
  g.multiSelectByTexts(g.el('selExitsAll'),   ['Secrets Store']);
  await g.wait(160);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  // Topologie
  await humanCommitLinks('Internet Gateway', ['Perimeter FW', 'Mail Server'], 'direct');
  await g.wait(120);
  await humanCommitLinks('Perimeter FW', ['Proxy', 'VPN Gateway'], 'direct');
  await g.wait(120);
  await humanCommitLinks('Proxy', ['Edge VM', 'Internal App'], 'direct');
  await g.wait(120);
  await humanCommitLinks('Edge VM', ['Internal App'], 'direct');
  await g.wait(80);
  await humanCommitLinks('Internal App', ['DB Cluster'], 'direct');
  await g.wait(80);
  await humanCommitLinks('DB Cluster', ['Secrets Store'], 'direct');
  await g.wait(100);

  // Lateral : Mail -> Edge VM
  await humanCommitLinks('Mail Server', ['Edge VM'], 'lateral');
  await g.wait(80);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  // Vulns
  await g.selectByText(g.el('selVulnElement'), 'Mail Server');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Phishing OTP']);
  commitVulnSelection();
  await g.wait(80);

  await g.selectByText(g.el('selVulnElement'), 'Edge VM');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Open Port']);
  commitVulnSelection();
  await g.wait(80);

  await g.selectByText(g.el('selVulnElement'), 'Internal App');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Priv Esc']);
  commitVulnSelection();
  await g.wait(100);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  // Compute
  await g.click(g.el('btnFindPaths'));
  await g.wait(700);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
}

/* 3) Cloud containers — direct + contains + chemin vers Backup */
async function scenario_cloud_containers() {
  await g.typeInto(g.el('attackerName'), 'Cloud Operator Bug');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(220);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  const hosts = ['LB', 'Web Pod', 'App Pod', 'Cache Pod', 'DB Pod', 'Backup Pod'];
  for (const h of hosts) await addTarget(h);

  await ensureVuln('Container Escape');
  await ensureVuln('Unpatched Service');

  await g.selectByText(g.el('selAttacker'), 'Cloud Operator Bug');
  await g.wait(120);

  g.multiSelectByTexts(g.el('selEntriesAll'), ['LB']);
  g.multiSelectByTexts(g.el('selExitsAll'),   ['Backup Pod']);
  await g.wait(120);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  // Flots directs
  await humanCommitLinks('LB', ['Web Pod'], 'direct');
  await g.wait(90);
  await humanCommitLinks('Web Pod', ['App Pod'], 'direct');
  await g.wait(90);
  await humanCommitLinks('App Pod', ['DB Pod', 'Cache Pod'], 'direct');
  await g.wait(90);

  // Chemin vers exit
  await humanCommitLinks('DB Pod', ['Backup Pod'], 'direct');
  await g.wait(90);

  // Contains (sémantique)
  await humanCommitLinks('App Pod', ['Cache Pod'], 'contains');
  await g.wait(120);

  // Vulns
  await g.selectByText(g.el('selVulnElement'), 'Web Pod');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Unpatched Service']);
  commitVulnSelection();
  await g.wait(80);

  await g.selectByText(g.el('selVulnElement'), 'App Pod');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Container Escape']);
  commitVulnSelection();
  await g.wait(100);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  // Compute
  await g.click(g.el('btnFindPaths'));
  await g.wait(650);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
}

/* 4) IoT/OT dense — Sensors -> Aggregator -> Edge -> Admin -> PLC */
async function scenario_iot_ot_dense() {
  await g.typeInto(g.el('attackerName'), 'Script Kiddie — IoT Wave');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(260);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  const devices = [];
  for (let i = 1; i <= 10; i++) {
    const name = `Sensor-${i}`;
    devices.push(name);
    await addTarget(name);
  }
  const core = ['Aggregator', 'Edge Controller', 'Admin Console', 'Historian', 'PLC'];
  for (const c of core) await addTarget(c);

  await ensureVuln('Default Creds');
  await ensureVuln('Telnet Open');
  await ensureVuln('Weak Auth');

  await g.selectByText(g.el('selAttacker'), 'Script Kiddie — IoT Wave');
  await g.wait(120);

  // entries & exits
  g.multiSelectByTexts(g.el('selEntriesAll'), devices.slice(0, 6));
  g.multiSelectByTexts(g.el('selExitsAll'), ['PLC']);
  await g.wait(160);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  // Liens Sensors -> Aggregator / Edge / Admin
  await humanCommitLinks('Sensor-1', ['Aggregator'], 'direct');
  await g.wait(60);
  await humanCommitLinks('Sensor-2', ['Aggregator', 'Edge Controller'], 'direct');
  await g.wait(60);
  await humanCommitLinks('Sensor-3', ['Aggregator'], 'direct');
  await g.wait(60);
  await humanCommitLinks('Sensor-4', ['Aggregator', 'Edge Controller'], 'direct');
  await g.wait(60);
  await humanCommitLinks('Sensor-5', ['Aggregator'], 'direct');
  await g.wait(60);
  await humanCommitLinks('Sensor-6', ['Aggregator', 'Admin Console'], 'direct');
  await g.wait(80);

  await humanCommitLinks('Aggregator', ['Edge Controller'], 'direct');
  await g.wait(80);
  await humanCommitLinks('Edge Controller', ['Admin Console'], 'direct');
  await g.wait(80);
  await humanCommitLinks('Admin Console', ['PLC', 'Historian'], 'direct');
  await g.wait(80);
  await humanCommitLinks('Historian', ['PLC'], 'direct');
  await g.wait(80);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  // Vulns
  await g.selectByText(g.el('selVulnElement'), 'Sensor-2');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Default Creds']);
  commitVulnSelection();
  await g.wait(40);

  await g.selectByText(g.el('selVulnElement'), 'Sensor-4');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Default Creds']);
  commitVulnSelection();
  await g.wait(40);

  await g.selectByText(g.el('selVulnElement'), 'Edge Controller');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Telnet Open']);
  commitVulnSelection();
  await g.wait(80);

  await g.selectByText(g.el('selVulnElement'), 'Admin Console');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Weak Auth']);
  commitVulnSelection();
  await g.wait(100);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  // Compute
  await g.click(g.el('btnFindPaths'));
  await g.wait(900);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
}

/* 5) High-connectivity mesh — DAG dense A..G */
async function scenario_high_connectivity_mesh() {
  await g.typeInto(g.el('attackerName'), 'Black Hat — Mesh Experiment');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(220);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  const nodes = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  for (const n of nodes) await addTarget(`Node ${n}`);

  await ensureVuln('Service X RCE');
  await ensureVuln('Auth Bypass');

  await g.selectByText(g.el('selAttacker'), 'Black Hat — Mesh Experiment');
  await g.wait(100);

  g.multiSelectByTexts(g.el('selEntriesAll'), ['Node A']);
  g.multiSelectByTexts(g.el('selExitsAll'),   ['Node G']);
  await g.wait(120);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  // DAG dense: A -> B..G, B -> C..G, etc.
  for (let i = 0; i < nodes.length; i++) {
    const from = `Node ${nodes[i]}`;
    const toList = [];
    for (let j = i + 1; j < nodes.length; j++) toList.push(`Node ${nodes[j]}`);
    if (toList.length) {
      await humanCommitLinks(from, toList, 'direct');
      await g.wait(60);
    }
  }
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  // Vulns
  await g.selectByText(g.el('selVulnElement'), 'Node B');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Service X RCE']);
  commitVulnSelection();
  await g.wait(50);

  await g.selectByText(g.el('selVulnElement'), 'Node D');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Auth Bypass']);
  commitVulnSelection();
  await g.wait(70);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}

  // Compute
  await g.click(g.el('btnFindPaths'));
  await g.wait(1000);
  try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
}

/* ---------------------------------------------------------
   Catalogue & enregistrement (un scénario aléatoire)
   --------------------------------------------------------- */

const CATALOG = [
  { name: 'Small webapp chain', fn: scenario_small_webapp },
  { name: 'Corporate network', fn: scenario_corporate_network },
  { name: 'Cloud containers', fn: scenario_cloud_containers },
  { name: 'IoT / OT dense', fn: scenario_iot_ot_dense },
  { name: 'High-connectivity mesh', fn: scenario_high_connectivity_mesh }
];

registerScenario('Random: pick one realistic scenario', async () => {
  const i = Math.floor(Math.random() * CATALOG.length);
  const picked = CATALOG[i];
  try {
    const txt = `Running scenario: ${picked.name}`;
    const statusEl = g.el('status');
    if (statusEl) statusEl.textContent = txt;
    await picked.fn();
  } finally {
    try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
  }
});

