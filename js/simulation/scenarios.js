/* =========================================================
   simulation/scenarios.js
   Complete end-to-end automated scenarios
   ========================================================= */

import { registerScenario, g } from './index.js';

/* Utility to commit link changes when using a multiselect-only UI */
function commitLinkSelection() {
  const sel = g.el('linkDest');
  if (!sel) return;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

/* Utility to commit vulnerability selection from the multiselect */
function commitVulnSelection() {
  const sel = g.el('selVulnsForElement');
  if (!sel) return;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

/* SCENARIO 1 — A basic chain with one entry and one exit */
registerScenario('Full flow A', async () => {
  await g.typeInto(g.el('attackerName'), 'Attacker A');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(300);
  document.dispatchEvent(new CustomEvent('state:changed'));

  const targets = ['Web Server', 'App Server', 'DB'];
  for (const t of targets) {
    await g.typeInto(g.el('targetName'), t);
    await g.click(g.el('btnAddTarget'));
    await g.wait(200);
  }
  document.dispatchEvent(new CustomEvent('state:changed'));

  await g.typeInto(g.el('vulnName'), 'Auth RCE');
  await g.click(g.el('btnAddVuln'));
  await g.wait(180);
  document.dispatchEvent(new CustomEvent('state:changed'));

  const selAtt = g.el('selAttacker');
  await g.click(selAtt);
  g.selectByText(selAtt, 'Attacker A');
  await g.wait(180);

  g.multiSelectByTexts(g.el('selEntriesAll'), ['Web Server']);
  g.multiSelectByTexts(g.el('selExitsAll'),   ['DB']);
  await g.wait(160);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Links: Web Server -> App Server
  g.selectByText(g.el('linkSource'), 'Web Server');
  g.multiSelectByTexts(g.el('linkDest'), ['App Server']);
  commitLinkSelection();
  await g.wait(180);

  // Links: App Server -> DB
  g.selectByText(g.el('linkSource'), 'App Server');
  g.multiSelectByTexts(g.el('linkDest'), ['DB']);
  commitLinkSelection();
  await g.wait(180);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Attach vulnerability to App Server by selecting it in the multiselect
  g.selectByText(g.el('selVulnElement'), 'App Server');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Auth RCE']);
  commitVulnSelection();
  await g.wait(200);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Compute
  await g.click(g.el('btnFindPaths'));
  await g.wait(500);
  document.dispatchEvent(new CustomEvent('state:changed'));
});

/* SCENARIO 2 — Multiple entries and a single exit */
registerScenario('Full flow B', async () => {
  await g.typeInto(g.el('attackerName'), 'Attacker B');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(280);
  document.dispatchEvent(new CustomEvent('state:changed'));

  const targets = ['Internet Gateway', 'Edge VM', 'Backend', 'Secrets'];
  for (const t of targets) {
    await g.typeInto(g.el('targetName'), t);
    await g.click(g.el('btnAddTarget'));
    await g.wait(160);
  }
  document.dispatchEvent(new CustomEvent('state:changed'));

  await g.typeInto(g.el('vulnName'), 'Open Port');
  await g.click(g.el('btnAddVuln'));
  await g.wait(140);
  await g.typeInto(g.el('vulnName'), 'Priv Esc');
  await g.click(g.el('btnAddVuln'));
  await g.wait(160);
  document.dispatchEvent(new CustomEvent('state:changed'));

  const selAtt = g.el('selAttacker');
  await g.click(selAtt);
  g.selectByText(selAtt, 'Attacker B');
  await g.wait(160);

  g.multiSelectByTexts(g.el('selEntriesAll'), ['Internet Gateway', 'Edge VM']);
  g.multiSelectByTexts(g.el('selExitsAll'),   ['Secrets']);
  await g.wait(160);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Internet Gateway -> Edge VM
  g.selectByText(g.el('linkSource'), 'Internet Gateway');
  g.multiSelectByTexts(g.el('linkDest'), ['Edge VM']);
  commitLinkSelection();
  await g.wait(160);

  // Edge VM -> Backend
  g.selectByText(g.el('linkSource'), 'Edge VM');
  g.multiSelectByTexts(g.el('linkDest'), ['Backend']);
  commitLinkSelection();
  await g.wait(160);

  // Backend -> Secrets
  g.selectByText(g.el('linkSource'), 'Backend');
  g.multiSelectByTexts(g.el('linkDest'), ['Secrets']);
  commitLinkSelection();
  await g.wait(160);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Vulns
  g.selectByText(g.el('selVulnElement'), 'Edge VM');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Open Port']);
  commitVulnSelection();
  await g.wait(140);

  g.selectByText(g.el('selVulnElement'), 'Backend');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Priv Esc']);
  commitVulnSelection();
  await g.wait(160);
  document.dispatchEvent(new CustomEvent('state:changed'));

  await g.click(g.el('btnFindPaths'));
  await g.wait(600);
  document.dispatchEvent(new CustomEvent('state:changed'));
});

/* SCENARIO 3 — Contains edges and multiple vulnerabilities */
registerScenario('Full flow C', async () => {
  await g.typeInto(g.el('attackerName'), 'Attacker C');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(280);
  document.dispatchEvent(new CustomEvent('state:changed'));

  const targets = ['Workstation', 'File Share', 'Service', 'DB Replica'];
  for (const t of targets) {
    await g.typeInto(g.el('targetName'), t);
    await g.click(g.el('btnAddTarget'));
    await g.wait(160);
  }
  document.dispatchEvent(new CustomEvent('state:changed'));

  await g.typeInto(g.el('vulnName'), 'Insecure SMB');
  await g.click(g.el('btnAddVuln'));
  await g.wait(140);
  await g.typeInto(g.el('vulnName'), 'Unpatched Service');
  await g.click(g.el('btnAddVuln'));
  await g.wait(160);
  document.dispatchEvent(new CustomEvent('state:changed'));

  await g.click(g.el('selAttacker'));
  g.selectByText(g.el('selAttacker'), 'Attacker C');
  await g.wait(160);

  g.multiSelectByTexts(g.el('selEntriesAll'), ['Workstation']);
  g.multiSelectByTexts(g.el('selExitsAll'),   ['DB Replica']);
  await g.wait(160);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Workstation -> File Share
  g.selectByText(g.el('linkSource'), 'Workstation');
  g.multiSelectByTexts(g.el('linkDest'), ['File Share']);
  commitLinkSelection();
  await g.wait(160);

  // File Share -> Service
  g.selectByText(g.el('linkSource'), 'File Share');
  g.multiSelectByTexts(g.el('linkDest'), ['Service']);
  commitLinkSelection();
  await g.wait(160);

  // Service -> DB Replica
  g.selectByText(g.el('linkSource'), 'Service');
  g.multiSelectByTexts(g.el('linkDest'), ['DB Replica']);
  commitLinkSelection();
  await g.wait(160);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Vulns
  g.selectByText(g.el('selVulnElement'), 'File Share');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Insecure SMB']);
  commitVulnSelection();
  await g.wait(140);

  g.selectByText(g.el('selVulnElement'), 'Service');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Unpatched Service']);
  commitVulnSelection();
  await g.wait(160);
  document.dispatchEvent(new CustomEvent('state:changed'));

  await g.click(g.el('btnFindPaths'));
  await g.wait(600);
  document.dispatchEvent(new CustomEvent('state:changed'));
});

/* SCENARIO 4 — Fan-out and fan-in */
registerScenario('Full flow D', async () => {
  await g.typeInto(g.el('attackerName'), 'Attacker D');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(260);
  document.dispatchEvent(new CustomEvent('state:changed'));

  const targets = ['Proxy', 'Cache', 'API', 'Auth', 'Store'];
  for (const t of targets) {
    await g.typeInto(g.el('targetName'), t);
    await g.click(g.el('btnAddTarget'));
    await g.wait(140);
  }
  document.dispatchEvent(new CustomEvent('state:changed'));

  await g.typeInto(g.el('vulnName'), 'SQLi');
  await g.click(g.el('btnAddVuln'));
  await g.wait(120);
  await g.typeInto(g.el('vulnName'), 'Weak TLS');
  await g.click(g.el('btnAddVuln'));
  await g.wait(140);
  document.dispatchEvent(new CustomEvent('state:changed'));

  await g.click(g.el('selAttacker'));
  g.selectByText(g.el('selAttacker'), 'Attacker D');
  await g.wait(140);

  g.multiSelectByTexts(g.el('selEntriesAll'), ['Proxy']);
  g.multiSelectByTexts(g.el('selExitsAll'),   ['Store']);
  await g.wait(140);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Proxy -> Cache, API
  g.selectByText(g.el('linkSource'), 'Proxy');
  g.multiSelectByTexts(g.el('linkDest'), ['Cache', 'API']);
  commitLinkSelection();
  await g.wait(140);

  // Cache -> API
  g.selectByText(g.el('linkSource'), 'Cache');
  g.multiSelectByTexts(g.el('linkDest'), ['API']);
  commitLinkSelection();
  await g.wait(140);

  // API -> Auth, Store
  g.selectByText(g.el('linkSource'), 'API');
  g.multiSelectByTexts(g.el('linkDest'), ['Auth', 'Store']);
  commitLinkSelection();
  await g.wait(140);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Vulns
  g.selectByText(g.el('selVulnElement'), 'API');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['SQLi']);
  commitVulnSelection();
  await g.wait(140);

  g.selectByText(g.el('selVulnElement'), 'Proxy');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Weak TLS']);
  commitVulnSelection();
  await g.wait(140);
  document.dispatchEvent(new CustomEvent('state:changed'));

  await g.click(g.el('btnFindPaths'));
  await g.wait(700);
  document.dispatchEvent(new CustomEvent('state:changed'));
});
