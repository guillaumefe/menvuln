// js/simulation/scenarios.js
//
// Real-user-style demo scenarios:
// • interacts only through visible UI buttons (Add, Compute, Diagram…)
// • waits for selects to be hydrated before operating
// • types text key-by-key using simulated keyboard events
// • avoids opening “Details / editor” by accident
// • prevents “destination required” alerts
//
// Depends on the gesture API `g` provided by simulation/index.js

import { registerScenario as addScenario, g } from './index.js';

/* ──────────────────────────────
   General Simulation Helpers
   ────────────────────────────── */

async function clickButton(id) {
  const b = g.el(id);
  if (!b) throw new Error(`Button not found: #${id}`);
  await g.ensureInView(b, 'center');
  // small downward offset so cursor doesn’t hit nearby list rows
  await g.moveToEl(b, 0, +6);
  await g.click(b);
}

async function typeAndClick(inputId, btnId, text) {
  const input = g.el(inputId);
  if (!input) throw new Error(`Input not found: #${inputId}`);
  await g.ensureInView(input, 'center');
  await g.moveToEl(input);
  await g.typeInto(input, text, 14); // human readable typing
  await clickButton(btnId);
}

/** Wait until the <select> exists and contains enough options */
async function waitForOptions(selector, minCount = 1, timeoutMs = 3000) {
  const started = Date.now();
  for (;;) {
    const sel = document.querySelector(selector);
    if (sel && sel.options.length >= minCount) return;
    if (Date.now() - started > timeoutMs) {
      console.warn('[sim] timeout waiting options for', selector);
      return;
    }
    await g.wait(60);
  }
}

function safeSelectByText(selectEl, text) {
  try { g.selectByText(selectEl, text); } catch {}
}
function safeMultiSelectByTexts(selectEl, texts) {
  try { g.multiSelectByTexts(selectEl, texts); } catch {}
}

/** Locate the “final flag” checkbox for a target by text matching */
function findFinalCheckboxByLabel(label) {
  const rows = document.querySelectorAll('#targetList .item');
  for (const row of rows) {
    if (row.textContent && row.textContent.includes(label)) {
      const cb = row.querySelector('input[type="checkbox"]');
      if (cb) return cb;
    }
  }
  return null;
}

/* ──────────────────────────────
   UI Interaction building blocks
   ────────────────────────────── */

async function addTargetQuick(name) {
  await typeAndClick('targetName', 'btnAddTarget', name);
  await waitForOptions('#linkSource', 1);
  await waitForOptions('#linkDest',   1);
  await g.wait(80);
}

async function addAttackerQuick(name) {
  await typeAndClick('attackerName', 'btnAddAttacker', name);
  await waitForOptions('#selAttacker', 1);
  await g.wait(80);
}

async function setEntries(attackerLabel, entriesLabels) {
  const selAtt = g.el('selAttacker');
  await g.ensureInView(selAtt, 'center');
  await g.moveToEl(selAtt);
  safeSelectByText(selAtt, attackerLabel);

  const selEntries = g.el('selEntriesAll');
  await waitForOptions('#selEntriesAll', 1);
  await g.moveToEl(selEntries);
  safeMultiSelectByTexts(selEntries, entriesLabels);

  await g.wait(120);
}

async function addLink(type, fromLabel, toLabels) {
  await waitForOptions('#linkSource', 1);
  await waitForOptions('#linkDest',   1);

  const srcSel  = g.el('linkSource');
  const dstSel  = g.el('linkDest');
  const typeSel = g.el('linkType');

  await g.ensureInView(srcSel, 'center');
  safeSelectByText(srcSel, fromLabel);

  await g.ensureInView(dstSel, 'center');
  // clear previous selections
  [...dstSel.options].forEach(o => o.selected = false);
  safeMultiSelectByTexts(dstSel, toLabels);

  await g.ensureInView(typeSel, 'center');
  safeSelectByText(typeSel, type);

  // guard: ensure at least one destination is selected
  const selectedCount = [...dstSel.options].filter(o => o.selected).length;
  if (!selectedCount) {
    console.warn('[sim] no destination selected; retrying text match');
    safeMultiSelectByTexts(dstSel, toLabels);
  }

  await clickButton('btnAddLink');
  await g.wait(100);
}

async function toggleFinal(labelText) {
  const cb = findFinalCheckboxByLabel(labelText);
  if (cb && !cb.checked) {
    await g.ensureInView(cb, 'center');
    await g.moveToEl(cb);
    await g.click(cb);
  }
}

async function computeAndOpenFirstDiagram() {
  await clickButton('btnFindPaths');
  await g.wait(250);
  const firstDiagramBtn = document.querySelector('#results .path button');
  if (firstDiagramBtn) {
    await g.ensureInView(firstDiagramBtn, 'center');
    await g.moveToEl(firstDiagramBtn);
    await g.click(firstDiagramBtn);
  }
}

/* ──────────────────────────────
   Scenarios
   ────────────────────────────── */

// 1) Simple direct chain
async function scenario_Web_DB_Console() {
  g.disableTopButtons?.(true);

  await addTargetQuick('Web Server DMZ');
  await addTargetQuick('Database');
  await addTargetQuick('Admin Console');
  await toggleFinal('Admin Console');

  await addAttackerQuick('APT Operator');
  await setEntries('APT Operator', ['Web Server DMZ']);

  await addLink('direct', 'Web Server DMZ', ['Database']);
  await addLink('direct', 'Database', ['Admin Console']);

  await computeAndOpenFirstDiagram();
  g.disableTopButtons?.(false);
}

// 2) Phishing into lateral movement to Domain Controller
async function scenario_Phishing_Lateral() {
  g.disableTopButtons?.(true);

  await addTargetQuick('Email Gateway');
  await addTargetQuick('User Workstation');
  await addTargetQuick('Domain Controller');
  await addTargetQuick('Admin Console');
  await toggleFinal('Admin Console');

  await addAttackerQuick('Phishing Campaign');
  await setEntries('Phishing Campaign', ['Email Gateway']);

  await addLink('direct',  'Email Gateway',     ['User Workstation']);
  await addLink('lateral', 'User Workstation',  ['Domain Controller']);
  await addLink('direct',  'Domain Controller', ['Admin Console']);

  await computeAndOpenFirstDiagram();
  g.disableTopButtons?.(false);
}

// 3) VPN access + contains pivot to final target
async function scenario_VPN_contains() {
  g.disableTopButtons?.(true);

  await addTargetQuick('VPN Appliance');
  await addTargetQuick('Internal Network');
  await addTargetQuick('Admin Console');
  await toggleFinal('Admin Console');

  await addAttackerQuick('VPN Exploit');
  await setEntries('VPN Exploit', ['VPN Appliance']);

  await addLink('contains', 'VPN Appliance',    ['Internal Network']);
  await addLink('direct',   'Internal Network', ['Admin Console']);

  const inc = g.el('includeContains');
  if (inc && !inc.checked) { await g.moveToEl(inc); await g.click(inc); }

  await computeAndOpenFirstDiagram();
  g.disableTopButtons?.(false);
}

// 4) Ransomware spreading laterally to multiple finals
async function scenario_Ransomware_Spread() {
  g.disableTopButtons?.(true);

  await addTargetQuick('User Workstation');
  await addTargetQuick('File Server');
  await addTargetQuick('Domain Controller');
  await addTargetQuick('Backup Server');
  await addTargetQuick('Admin Console');

  await toggleFinal('Admin Console');
  await toggleFinal('Backup Server');

  await addAttackerQuick('Ransomware Operator');
  await setEntries('Ransomware Operator', ['User Workstation']);

  await addLink('lateral', 'User Workstation',
                ['File Server', 'Domain Controller']);
  await addLink('direct',  'File Server',      ['Backup Server']);
  await addLink('direct',  'Domain Controller',['Admin Console']);

  await computeAndOpenFirstDiagram();
  g.disableTopButtons?.(false);
}

// 5) Supply-chain compromise with two entry points
async function scenario_SupplyChain_DualEntry() {
  g.disableTopButtons?.(true);

  await addTargetQuick('Web Server DMZ');
  await addTargetQuick('Email Gateway');
  await addTargetQuick('Internal Network');
  await addTargetQuick('Build Server');
  await addTargetQuick('Admin Console');
  await toggleFinal('Admin Console');

  await addAttackerQuick('Supply Chain Threat');
  await setEntries('Supply Chain Threat',
                   ['Web Server DMZ', 'Email Gateway']);

  await addLink('contains', 'Internal Network', ['Build Server']);
  await addLink('direct',   'Web Server DMZ',   ['Internal Network']);
  await addLink('direct',   'Email Gateway',    ['Internal Network']);
  await addLink('lateral',  'Build Server',     ['Admin Console']);

  const inc = g.el('includeContains');
  if (inc && !inc.checked) { await g.moveToEl(inc); await g.click(inc); }

  await computeAndOpenFirstDiagram();
  g.disableTopButtons?.(false);
}

// 6) Worm with lateral loop + prune to final
async function scenario_Loop_Prune() {
  g.disableTopButtons?.(true);

  await addTargetQuick('Host A');
  await addTargetQuick('Host B');
  await addTargetQuick('Host C');
  await addTargetQuick('Ops Server');
  await addTargetQuick('Admin Console');
  await toggleFinal('Admin Console');

  await addAttackerQuick('Worm Operator');
  await setEntries('Worm Operator', ['Host A']);

  await addLink('lateral', 'Host A', ['Host B']);
  await addLink('lateral', 'Host B', ['Host C']);
  await addLink('lateral', 'Host C', ['Host A', 'Ops Server']);
  await addLink('direct',  'Ops Server', ['Admin Console']);

  await computeAndOpenFirstDiagram();
  g.disableTopButtons?.(false);
}

/* ──────────────────────────────
   Registering all scenarios
   ────────────────────────────── */

addScenario('Web → DB → Admin Console',         scenario_Web_DB_Console,        1);
addScenario('Phishing lateral to DC',           scenario_Phishing_Lateral,      1);
addScenario('VPN + contains pivot',             scenario_VPN_contains,          1);
addScenario('Ransomware lateral spread',        scenario_Ransomware_Spread,     1);
addScenario('Supply-chain via Web & Email',     scenario_SupplyChain_DualEntry, 1);
addScenario('Lateral loop + prune to final',    scenario_Loop_Prune,            1);

// End of file
