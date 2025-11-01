/**
 * simulation/scenarios.js
 *
 * Purpose:
 *   Declare and register UI-driven demo scenarios that the simulation can pick at random.
 *
 * Assumptions:
 *   - simulation/index.js exports:
 *       - addScenario(name: string, fn: () => Promise<void>, weight?: number): void
 *       - g: an object with UI gesture helpers:
 *           g.el(id)
 *           g.wait(ms)
 *           g.moveToEl(node, offsetX?, offsetY?)
 *           g.click(node)
 *           g.typeInto(inputEl, text, perCharMs?)
 *           g.selectByText(selectEl, text)
 *           g.multiSelectByTexts(selectEl, textsArray)
 *           g.disableTopButtons(boolean)        // optional (no-op if missing)
 *           g.ensureInView(node, block?)
 *   - The main UI provides the following element IDs:
 *       attackerName, btnAddAttacker, selAttacker, selEntriesAll,
 *       targetName, btnAddTarget, targetList,
 *       linkSource, linkDest, linkType, btnAddLink,
 *       includeContains, btnFindPaths, results
 *   - The target “final” flag is a checkbox in each row inside #targetList .item
 */

import { addScenario, g } from './index.js';

/* ---------- small DOM helpers (scoped here) ---------- */

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

// Adds a target quickly via the left panel controls
async function addTargetQuick(name) {
  await g.moveToEl(g.el('targetName'));
  await g.typeInto(g.el('targetName'), name);
  await g.moveToEl(g.el('btnAddTarget'));
  await g.click(g.el('btnAddTarget'));
}

// Adds an attacker quickly via the left panel controls
async function addAttackerQuick(name) {
  await g.moveToEl(g.el('attackerName'));
  await g.typeInto(g.el('attackerName'), name);
  await g.moveToEl(g.el('btnAddAttacker'));
  await g.click(g.el('btnAddAttacker'));
}

// Select attacker and set entries (multi-select)
async function setEntries(attackerLabel, entriesLabels) {
  await g.moveToEl(g.el('selAttacker'));
  g.selectByText(g.el('selAttacker'), attackerLabel);
  await g.moveToEl(g.el('selEntriesAll'));
  g.multiSelectByTexts(g.el('selEntriesAll'), entriesLabels);
  await g.wait(120);
}

// Add link(s)
async function addLink(type, fromLabel, toLabels) {
  g.selectByText(g.el('linkSource'), fromLabel);
  g.multiSelectByTexts(g.el('linkDest'), toLabels);
  g.selectByText(g.el('linkType'), type);
  await g.moveToEl(g.el('btnAddLink'));
  await g.click(g.el('btnAddLink'));
  await g.wait(120);
}

// Compute & open first diagram if any
async function computeAndOpenFirstDiagram() {
  await g.moveToEl(g.el('btnFindPaths'));
  await g.click(g.el('btnFindPaths'));
  await g.wait(300);

  const firstDiagramBtn = document.querySelector('#results .path button');
  if (firstDiagramBtn) {
    await g.moveToEl(firstDiagramBtn);
    await g.click(firstDiagramBtn);
  }
}

/* ---------- Scenarios ---------- */

/**
 * 1) Web → DB → Admin Console (direct chain)
 */
async function scenario_Web_DB_Console() {
  g.disableTopButtons?.(true);

  // Targets
  await addTargetQuick('Web Server DMZ');
  await addTargetQuick('Database');
  await addTargetQuick('Admin Console');

  // Mark final
  const cb = findFinalCheckboxByLabel('Admin Console');
  if (cb) { await g.moveToEl(cb); await g.click(cb); }

  // Attacker
  await addAttackerQuick('APT Operator');
  await setEntries('APT Operator', ['Web Server DMZ']);

  // Links
  await addLink('direct', 'Web Server DMZ', ['Database']);
  await addLink('direct', 'Database', ['Admin Console']);

  await computeAndOpenFirstDiagram();
  g.disableTopButtons?.(false);
}

/**
 * 2) Phishing → Workstation (direct), then lateral to DC → Admin Console
 */
async function scenario_Phishing_Lateral() {
  g.disableTopButtons?.(true);

  // Targets
  await addTargetQuick('Email Gateway');
  await addTargetQuick('User Workstation');
  await addTargetQuick('Domain Controller');
  await addTargetQuick('Admin Console');

  // Final
  const cb = findFinalCheckboxByLabel('Admin Console');
  if (cb) { await g.moveToEl(cb); await g.click(cb); }

  // Attacker + entries
  await addAttackerQuick('Phishing Campaign');
  await setEntries('Phishing Campaign', ['Email Gateway']);

  // Links
  await addLink('direct',  'Email Gateway',     ['User Workstation']);
  await addLink('lateral', 'User Workstation',  ['Domain Controller']);
  await addLink('direct',  'Domain Controller', ['Admin Console']);

  await computeAndOpenFirstDiagram();
  g.disableTopButtons?.(false);
}

/**
 * 3) VPN → Internal Network (contains) → Admin Console (direct)
 */
async function scenario_VPN_contains() {
  g.disableTopButtons?.(true);

  await addTargetQuick('VPN Appliance');
  await addTargetQuick('Internal Network');
  await addTargetQuick('Admin Console');

  // Final
  const cb = findFinalCheckboxByLabel('Admin Console');
  if (cb) { await g.moveToEl(cb); await g.click(cb); }

  // Attacker + entries
  await addAttackerQuick('VPN Exploit');
  await setEntries('VPN Exploit', ['VPN Appliance']);

  // Links
  await addLink('contains', 'VPN Appliance',     ['Internal Network']);
  await addLink('direct',   'Internal Network',  ['Admin Console']);

  // Ensure "contains" is enabled (id: includeContains)
  const includeContains = g.el('includeContains');
  if (includeContains && !includeContains.checked) {
    await g.moveToEl(includeContains);
    await g.click(includeContains);
  }

  await computeAndOpenFirstDiagram();
  g.disableTopButtons?.(false);
}

/**
 * 4) Ransomware lateral spread (two finals)
 */
async function scenario_Ransomware_Spread() {
  g.disableTopButtons?.(true);

  await addTargetQuick('User Workstation');
  await addTargetQuick('File Server');
  await addTargetQuick('Domain Controller');
  await addTargetQuick('Backup Server');
  await addTargetQuick('Admin Console');

  // Finals: Admin Console + Backup Server
  const cb1 = findFinalCheckboxByLabel('Admin Console');
  const cb2 = findFinalCheckboxByLabel('Backup Server');
  if (cb1) { await g.moveToEl(cb1); await g.click(cb1); }
  if (cb2) { await g.moveToEl(cb2); await g.click(cb2); }

  await addAttackerQuick('Ransomware Operator');
  await setEntries('Ransomware Operator', ['User Workstation']);

  // Lateral spread and direct to finals
  await addLink('lateral', 'User Workstation', ['File Server', 'Domain Controller']);
  await addLink('direct',  'File Server',      ['Backup Server']);
  await addLink('direct',  'Domain Controller',['Admin Console']);

  await computeAndOpenFirstDiagram();
  g.disableTopButtons?.(false);
}

/**
 * 5) Supply-chain with dual entries + contains pivot
 */
async function scenario_SupplyChain_DualEntry() {
  g.disableTopButtons?.(true);

  await addTargetQuick('Web Server DMZ');
  await addTargetQuick('Email Gateway');
  await addTargetQuick('Internal Network');
  await addTargetQuick('Build Server');
  await addTargetQuick('Admin Console');

  const cb = findFinalCheckboxByLabel('Admin Console');
  if (cb) { await g.moveToEl(cb); await g.click(cb); }

  await addAttackerQuick('Supply Chain Threat');
  await setEntries('Supply Chain Threat', ['Web Server DMZ', 'Email Gateway']);

  // contains: Internal Network → Build Server
  await addLink('contains', 'Internal Network', ['Build Server']);

  // direct: Web → Internal, Email → Internal
  await addLink('direct', 'Web Server DMZ', ['Internal Network']);
  await addLink('direct', 'Email Gateway',  ['Internal Network']);

  // lateral: Build Server → Admin Console
  await addLink('lateral', 'Build Server', ['Admin Console']);

  // ensure contains is enabled
  const includeContains = g.el('includeContains');
  if (includeContains && !includeContains.checked) {
    await g.moveToEl(includeContains);
    await g.click(includeContains);
  }

  await computeAndOpenFirstDiagram();
  g.disableTopButtons?.(false);
}

/**
 * 6) Lateral loop A→B→C→A (cycle) then branch to Ops → Admin Console
 */
async function scenario_Loop_Prune() {
  g.disableTopButtons?.(true);

  await addTargetQuick('Host A');
  await addTargetQuick('Host B');
  await addTargetQuick('Host C');
  await addTargetQuick('Ops Server');
  await addTargetQuick('Admin Console');

  const cb = findFinalCheckboxByLabel('Admin Console');
  if (cb) { await g.moveToEl(cb); await g.click(cb); }

  await addAttackerQuick('Worm Operator');
  await setEntries('Worm Operator', ['Host A']);

  // Cycle
  await addLink('lateral', 'Host A', ['Host B']);
  await addLink('lateral', 'Host B', ['Host C']);
  await addLink('lateral', 'Host C', ['Host A', 'Ops Server']);

  // Exit to final
  await addLink('direct', 'Ops Server', ['Admin Console']);

  await computeAndOpenFirstDiagram();
  g.disableTopButtons?.(false);
}

/* ---------- Register scenarios (weighted random ready) ---------- */

addScenario('Web → DB → Admin Console',         scenario_Web_DB_Console,     1);
addScenario('Phishing lateral to DC',           scenario_Phishing_Lateral,    1);
addScenario('VPN + contains pivot',             scenario_VPN_contains,        1);
addScenario('Ransomware lateral spread',        scenario_Ransomware_Spread,   1);
addScenario('Supply-chain via Web & Email',     scenario_SupplyChain_DualEntry,1);
addScenario('Lateral loop + prune to final',    scenario_Loop_Prune,          1);

// Copy/paste and add more scenarios above, then register here with addScenario(...).
