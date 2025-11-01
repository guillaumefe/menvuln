/* =========================================================
   simulation/scenarios.js
   Complete end-to-end automated scenarios
   ========================================================= */

import { registerScenario, g } from './index.js';

/* SCENARIO 1 — Full flow: create attacker, create targets,
   set entries/exits, create links, attach vuln, compute paths */
registerScenario('Full flow A', async () => {
  // Create attacker
  await g.typeInto(g.el('attackerName'), 'Attacker A');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(300);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Create targets
  const targets = ['Web Server', 'App Server', 'DB'];
  for (const t of targets) {
    await g.typeInto(g.el('targetName'), t);
    await g.click(g.el('btnAddTarget'));
    await g.wait(220);
  }
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Create vuln and attach to App Server
  await g.typeInto(g.el('vulnName'), 'Auth RCE');
  await g.click(g.el('btnAddVuln'));
  await g.wait(200);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Select attacker
  const selAtt = g.el('selAttacker');
  await g.click(selAtt);
  g.selectByText(selAtt, 'Attacker A');
  await g.wait(200);

  // Set entries (Web Server) and exits (DB)
  g.multiSelectByTexts(g.el('selEntriesAll'), ['Web Server']);
  g.multiSelectByTexts(g.el('selExitsAll'), ['DB']);
  await g.wait(200);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Create links: Web Server -> App Server -> DB
  g.selectByText(g.el('linkSource'), 'Web Server');
  g.multiSelectByTexts(g.el('linkDest'), ['App Server']);
  await g.click(g.el('btnAddLink'));
  await g.wait(220);

  g.selectByText(g.el('linkSource'), 'App Server');
  g.multiSelectByTexts(g.el('linkDest'), ['DB']);
  await g.click(g.el('btnAddLink'));
  await g.wait(220);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Attach vulnerability to App Server
  g.selectByText(g.el('selVulnElement'), 'App Server');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Auth RCE']);
  await g.click(g.el('btnAttachVulns'));
  await g.wait(250);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Compute paths
  await g.click(g.el('btnFindPaths'));
  await g.wait(600);
  document.dispatchEvent(new CustomEvent('state:changed'));
});

/* SCENARIO 2 — Full flow B: multiple entries, multiple exits,
   different topology and vuln placement */
registerScenario('Full flow B', async () => {
  // Create attacker
  await g.typeInto(g.el('attackerName'), 'Attacker B');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(300);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Create targets
  const targets = ['Internet Gateway', 'Edge VM', 'Backend', 'Secrets'];
  for (const t of targets) {
    await g.typeInto(g.el('targetName'), t);
    await g.click(g.el('btnAddTarget'));
    await g.wait(180);
  }
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Create vulnerabilities
  await g.typeInto(g.el('vulnName'), 'Open Port');
  await g.click(g.el('btnAddVuln'));
  await g.wait(150);
  await g.typeInto(g.el('vulnName'), 'Priv Esc');
  await g.click(g.el('btnAddVuln'));
  await g.wait(200);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Select attacker
  const selAtt = g.el('selAttacker');
  await g.click(selAtt);
  g.selectByText(selAtt, 'Attacker B');
  await g.wait(200);

  // Set multiple entries and exits
  g.multiSelectByTexts(g.el('selEntriesAll'), ['Internet Gateway', 'Edge VM']);
  g.multiSelectByTexts(g.el('selExitsAll'), ['Secrets']);
  await g.wait(200);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Create links: Internet Gateway -> Edge VM -> Backend -> Secrets
  g.selectByText(g.el('linkSource'), 'Internet Gateway');
  g.multiSelectByTexts(g.el('linkDest'), ['Edge VM']);
  await g.click(g.el('btnAddLink'));
  await g.wait(200);

  g.selectByText(g.el('linkSource'), 'Edge VM');
  g.multiSelectByTexts(g.el('linkDest'), ['Backend']);
  await g.click(g.el('btnAddLink'));
  await g.wait(200);

  g.selectByText(g.el('linkSource'), 'Backend');
  g.multiSelectByTexts(g.el('linkDest'), ['Secrets']);
  await g.click(g.el('btnAddLink'));
  await g.wait(200);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Attach vulns: Open Port to Edge VM, Priv Esc to Backend
  g.selectByText(g.el('selVulnElement'), 'Edge VM');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Open Port']);
  await g.click(g.el('btnAttachVulns'));
  await g.wait(180);

  g.selectByText(g.el('selVulnElement'), 'Backend');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Priv Esc']);
  await g.click(g.el('btnAttachVulns'));
  await g.wait(220);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Compute paths
  await g.click(g.el('btnFindPaths'));
  await g.wait(700);
  document.dispatchEvent(new CustomEvent('state:changed'));
});

/* SCENARIO 3 — Full flow C: chain with contains edges and multiple vuln associations */
registerScenario('Full flow C', async () => {
  // Create attacker
  await g.typeInto(g.el('attackerName'), 'Attacker C');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(300);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Create targets
  const targets = ['Workstation', 'File Share', 'Service', 'DB Replica'];
  for (const t of targets) {
    await g.typeInto(g.el('targetName'), t);
    await g.click(g.el('btnAddTarget'));
    await g.wait(200);
  }
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Create vulnerabilities
  await g.typeInto(g.el('vulnName'), 'Insecure SMB');
  await g.click(g.el('btnAddVuln'));
  await g.wait(160);
  await g.typeInto(g.el('vulnName'), 'Unpatched Service');
  await g.click(g.el('btnAddVuln'));
  await g.wait(180);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Select attacker
  await g.click(g.el('selAttacker'));
  g.selectByText(g.el('selAttacker'), 'Attacker C');
  await g.wait(200);

  // Set entries & exits
  g.multiSelectByTexts(g.el('selEntriesAll'), ['Workstation']);
  g.multiSelectByTexts(g.el('selExitsAll'), ['DB Replica']);
  await g.wait(200);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Create links: Workstation -> File Share, File Share -> Service, Service -> DB Replica
  g.selectByText(g.el('linkSource'), 'Workstation');
  g.multiSelectByTexts(g.el('linkDest'), ['File Share']);
  await g.click(g.el('btnAddLink'));
  await g.wait(200);

  g.selectByText(g.el('linkSource'), 'File Share');
  g.multiSelectByTexts(g.el('linkDest'), ['Service']);
  await g.click(g.el('btnAddLink'));
  await g.wait(200);

  g.selectByText(g.el('linkSource'), 'Service');
  g.multiSelectByTexts(g.el('linkDest'), ['DB Replica']);
  await g.click(g.el('btnAddLink'));
  await g.wait(200);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Attach vulnerabilities to multiple nodes
  g.selectByText(g.el('selVulnElement'), 'File Share');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Insecure SMB']);
  await g.click(g.el('btnAttachVulns'));
  await g.wait(180);

  g.selectByText(g.el('selVulnElement'), 'Service');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Unpatched Service']);
  await g.click(g.el('btnAttachVulns'));
  await g.wait(200);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Compute paths
  await g.click(g.el('btnFindPaths'));
  await g.wait(700);
  document.dispatchEvent(new CustomEvent('state:changed'));
});

/* SCENARIO 4 — Full flow D: denser topology and mixed actions */
registerScenario('Full flow D', async () => {
  // Create attacker
  await g.typeInto(g.el('attackerName'), 'Attacker D');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(300);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Create targets
  const targets = ['Proxy', 'Cache', 'API', 'Auth', 'Store'];
  for (const t of targets) {
    await g.typeInto(g.el('targetName'), t);
    await g.click(g.el('btnAddTarget'));
    await g.wait(160);
  }
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Create vulnerabilities
  await g.typeInto(g.el('vulnName'), 'SQLi');
  await g.click(g.el('btnAddVuln'));
  await g.wait(140);
  await g.typeInto(g.el('vulnName'), 'Weak TLS');
  await g.click(g.el('btnAddVuln'));
  await g.wait(160);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Select attacker and set entries/exits
  await g.click(g.el('selAttacker'));
  g.selectByText(g.el('selAttacker'), 'Attacker D');
  await g.wait(180);

  g.multiSelectByTexts(g.el('selEntriesAll'), ['Proxy']);
  g.multiSelectByTexts(g.el('selExitsAll'), ['Store']);
  await g.wait(200);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Create multiple links to form fan-out and fan-in
  g.selectByText(g.el('linkSource'), 'Proxy');
  g.multiSelectByTexts(g.el('linkDest'), ['Cache', 'API']);
  await g.click(g.el('btnAddLink'));
  await g.wait(200);

  g.selectByText(g.el('linkSource'), 'Cache');
  g.multiSelectByTexts(g.el('linkDest'), ['API']);
  await g.click(g.el('btnAddLink'));
  await g.wait(200);

  g.selectByText(g.el('linkSource'), 'API');
  g.multiSelectByTexts(g.el('linkDest'), ['Auth', 'Store']);
  await g.click(g.el('btnAddLink'));
  await g.wait(200);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Attach vulns
  g.selectByText(g.el('selVulnElement'), 'API');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['SQLi']);
  await g.click(g.el('btnAttachVulns'));
  await g.wait(200);

  g.selectByText(g.el('selVulnElement'), 'Proxy');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Weak TLS']);
  await g.click(g.el('btnAttachVulns'));
  await g.wait(200);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Compute paths
  await g.click(g.el('btnFindPaths'));
  await g.wait(800);
  document.dispatchEvent(new CustomEvent('state:changed'));
});
