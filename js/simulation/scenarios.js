/* =========================================================
   simulation/scenarios.js
   Realistic, dense, varied automated scenarios for the
   simulation runner. Each scenario is self-contained and
   independent. The registered scenario randomly picks one
   story and plays it — so clicking "Simulation" runs exactly
   one scenario and stops.
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

/* Helper: add a named vulnerability (if not present) and return its name for selection */
async function ensureVuln(name) {
  const inp = g.el('vulnName');
  if (!inp) return;
  await g.typeInto(inp, name);
  await g.click(g.el('btnAddVuln'));
  await g.wait(140);
  document.dispatchEvent(new CustomEvent('state:changed'));
}

/* Helper: add a target and return its label */
async function addTarget(label) {
  await g.typeInto(g.el('targetName'), label);
  await g.click(g.el('btnAddTarget'));
  await g.wait(120);
  document.dispatchEvent(new CustomEvent('state:changed'));
}

/* -------------------------
   Scenario definitions
   ------------------------- */

/* 1) Minimal web app chain — few paths (realistic single flow) */
async function scenario_small_webapp() {
  await g.typeInto(g.el('attackerName'), 'Threat Actor — WebApp');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(240);
  document.dispatchEvent(new CustomEvent('state:changed'));

  const targets = ['Internet LB', 'Web Server', 'App Server', 'Database'];
  for (const t of targets) await addTarget(t);

  await ensureVuln('Auth RCE');

  // select attacker
  g.selectByText(g.el('selAttacker'), 'Threat Actor — WebApp');
  await g.wait(140);

  // entries & exits
  g.multiSelectByTexts(g.el('selEntriesAll'), ['Internet LB']);
  g.multiSelectByTexts(g.el('selExitsAll'),   ['Database']);
  await g.wait(140);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Links chain
  g.selectByText(g.el('linkSource'), 'Internet LB');
  g.multiSelectByTexts(g.el('linkDest'), ['Web Server']);
  commitLinkSelection();
  await g.wait(100);

  g.selectByText(g.el('linkSource'), 'Web Server');
  g.multiSelectByTexts(g.el('linkDest'), ['App Server']);
  commitLinkSelection();
  await g.wait(100);

  g.selectByText(g.el('linkSource'), 'App Server');
  g.multiSelectByTexts(g.el('linkDest'), ['Database']);
  commitLinkSelection();
  await g.wait(100);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Attach vuln
  g.selectByText(g.el('selVulnElement'), 'Web Server');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Auth RCE']);
  commitVulnSelection();
  await g.wait(160);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Compute
  await g.click(g.el('btnFindPaths'));
  await g.wait(420);
  document.dispatchEvent(new CustomEvent('state:changed'));
}

/* 2) Corporate network — branches and lateral moves (medium paths) */
async function scenario_corporate_network() {
  await g.typeInto(g.el('attackerName'), 'APT — Corporate');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(260);
  document.dispatchEvent(new CustomEvent('state:changed'));

  const targets = [
    'Internet Gateway', 'Perimeter FW', 'Proxy', 'Mail Server',
    'VPN Gateway', 'Edge VM', 'Internal App', 'DB Cluster', 'Secrets Store'
  ];
  for (const t of targets) await addTarget(t);

  await ensureVuln('Open Port');
  await ensureVuln('Phishing OTP');
  await ensureVuln('Priv Esc');

  g.selectByText(g.el('selAttacker'), 'APT — Corporate');
  await g.wait(120);

  // multiple entries (Internet Gateway, Mail Server) and a sensitive exit
  g.multiSelectByTexts(g.el('selEntriesAll'), ['Internet Gateway', 'Mail Server']);
  g.multiSelectByTexts(g.el('selExitsAll'),   ['Secrets Store']);
  await g.wait(160);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Topology: Internet -> Perimeter -> Proxy/Firewall -> internal systems
  g.selectByText(g.el('linkSource'), 'Internet Gateway');
  g.multiSelectByTexts(g.el('linkDest'), ['Perimeter FW', 'Mail Server']);
  commitLinkSelection();
  await g.wait(120);

  g.selectByText(g.el('linkSource'), 'Perimeter FW');
  g.multiSelectByTexts(g.el('linkDest'), ['Proxy', 'VPN Gateway']);
  commitLinkSelection();
  await g.wait(120);

  g.selectByText(g.el('linkSource'), 'Proxy');
  g.multiSelectByTexts(g.el('linkDest'), ['Edge VM', 'Internal App']);
  commitLinkSelection();
  await g.wait(120);

  g.selectByText(g.el('linkSource'), 'Edge VM');
  g.multiSelectByTexts(g.el('linkDest'), ['Internal App']);
  commitLinkSelection();
  await g.wait(80);

  g.selectByText(g.el('linkSource'), 'Internal App');
  g.multiSelectByTexts(g.el('linkDest'), ['DB Cluster']);
  commitLinkSelection();
  await g.wait(80);

  g.selectByText(g.el('linkSource'), 'DB Cluster');
  g.multiSelectByTexts(g.el('linkDest'), ['Secrets Store']);
  commitLinkSelection();
  await g.wait(100);

  // lateral link: Mail Server -> Edge VM (phishing->internal)
  g.selectByText(g.el('linkSource'), 'Mail Server');
  g.multiSelectByTexts(g.el('linkDest'), ['Edge VM']);
  commitLinkSelection();
  await g.wait(80);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // attach vulnerabilities in a way that creates multiple viable paths
  g.selectByText(g.el('selVulnElement'), 'Mail Server');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Phishing OTP']);
  commitVulnSelection();
  await g.wait(80);

  g.selectByText(g.el('selVulnElement'), 'Edge VM');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Open Port']);
  commitVulnSelection();
  await g.wait(80);

  g.selectByText(g.el('selVulnElement'), 'Internal App');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Priv Esc']);
  commitVulnSelection();
  await g.wait(100);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // compute
  await g.click(g.el('btnFindPaths'));
  await g.wait(700);
  document.dispatchEvent(new CustomEvent('state:changed'));
}

/* 3) Cloud infra with contains relationships (containers/hosts) — produces moderate to many paths */
async function scenario_cloud_containers() {
  await g.typeInto(g.el('attackerName'), 'Cloud Operator Bug');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(220);
  document.dispatchEvent(new CustomEvent('state:changed'));

  const hosts = ['LB', 'Web Pod', 'App Pod', 'Cache Pod', 'DB Pod', 'Backup Pod'];
  for (const h of hosts) await addTarget(h);

  await ensureVuln('Container Escape');
  await ensureVuln('Unpatched Service');

  g.selectByText(g.el('selAttacker'), 'Cloud Operator Bug');
  await g.wait(120);

  // entries from LB
  g.multiSelectByTexts(g.el('selEntriesAll'), ['LB']);
  g.multiSelectByTexts(g.el('selExitsAll'),   ['Backup Pod']);
  await g.wait(120);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // direct flows and some "contains" relationships: LB -> Web -> App, App -> DB, App contains Cache
  g.selectByText(g.el('linkSource'), 'LB');
  g.multiSelectByTexts(g.el('linkDest'), ['Web Pod']);
  commitLinkSelection();
  await g.wait(90);

  g.selectByText(g.el('linkSource'), 'Web Pod');
  g.multiSelectByTexts(g.el('linkDest'), ['App Pod']);
  commitLinkSelection();
  await g.wait(90);

  g.selectByText(g.el('linkSource'), 'App Pod');
  g.multiSelectByTexts(g.el('linkDest'), ['DB Pod', 'Cache Pod']);
  commitLinkSelection();
  await g.wait(90);

  // mark "contains" — e.g., Cache Pod contains smaller service (simulate with contains edges)
  // To create contains edges we simply set the linkType selector to "contains"
  g.selectByText(g.el('linkSource'), 'App Pod');
  g.selectByText(g.el('linkType'), 'contains');
  g.multiSelectByTexts(g.el('linkDest'), ['Cache Pod']);
  commitLinkSelection();
  await g.wait(120);

  // return link type to direct for subsequent additions
  g.selectByText(g.el('linkType'), 'direct');
  document.dispatchEvent(new CustomEvent('state:changed'));

  // vulnerabilities to create branching
  g.selectByText(g.el('selVulnElement'), 'Web Pod');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Unpatched Service']);
  commitVulnSelection();
  await g.wait(80);

  g.selectByText(g.el('selVulnElement'), 'App Pod');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Container Escape']);
  commitVulnSelection();
  await g.wait(100);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // compute
  await g.click(g.el('btnFindPaths'));
  await g.wait(650);
  document.dispatchEvent(new CustomEvent('state:changed'));
}

/* 4) IoT/OT network — many entry points, many possible paths (dense) */
async function scenario_iot_ot_dense() {
  await g.typeInto(g.el('attackerName'), 'Script Kiddie — IoT Wave');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(260);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Create many IoT devices + aggregator + admin consoles
  const devices = [];
  for (let i = 1; i <= 10; i++) {
    const name = `Sensor-${i}`;
    devices.push(name);
    await addTarget(name);
  }
  // core infrastructure
  const core = ['Aggregator', 'Edge Controller', 'Admin Console', 'Historian', 'PLC'];
  for (const c of core) await addTarget(c);

  await ensureVuln('Default Creds');
  await ensureVuln('Telnet Open');
  await ensureVuln('Weak Auth');

  g.selectByText(g.el('selAttacker'), 'Script Kiddie — IoT Wave');
  await g.wait(120);

  // entries: many sensors are externally reachable
  g.multiSelectByTexts(g.el('selEntriesAll'), devices.slice(0, 6));
  g.multiSelectByTexts(g.el('selExitsAll'), ['PLC']);
  await g.wait(160);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Sensors -> Aggregator (many-to-one)
  g.selectByText(g.el('linkSource'), 'Sensor-1');
  g.multiSelectByTexts(g.el('linkDest'), ['Aggregator']);
  commitLinkSelection();
  await g.wait(60);
  // reuse a loop for remaining sensors
  g.selectByText(g.el('linkSource'), 'Sensor-2');
  g.multiSelectByTexts(g.el('linkDest'), ['Aggregator', 'Edge Controller']);
  commitLinkSelection();
  await g.wait(60);
  g.selectByText(g.el('linkSource'), 'Sensor-3');
  g.multiSelectByTexts(g.el('linkDest'), ['Aggregator']);
  commitLinkSelection();
  await g.wait(60);
  g.selectByText(g.el('linkSource'), 'Sensor-4');
  g.multiSelectByTexts(g.el('linkDest'), ['Aggregator', 'Edge Controller']);
  commitLinkSelection();
  await g.wait(60);
  g.selectByText(g.el('linkSource'), 'Sensor-5');
  g.multiSelectByTexts(g.el('linkDest'), ['Aggregator']);
  commitLinkSelection();
  await g.wait(60);
  g.selectByText(g.el('linkSource'), 'Sensor-6');
  g.multiSelectByTexts(g.el('linkDest'), ['Aggregator', 'Admin Console']);
  commitLinkSelection();
  await g.wait(80);

  // Aggregator -> Edge Controller -> Admin Console -> PLC
  g.selectByText(g.el('linkSource'), 'Aggregator');
  g.multiSelectByTexts(g.el('linkDest'), ['Edge Controller']);
  commitLinkSelection();
  await g.wait(80);
  g.selectByText(g.el('linkSource'), 'Edge Controller');
  g.multiSelectByTexts(g.el('linkDest'), ['Admin Console']);
  commitLinkSelection();
  await g.wait(80);
  g.selectByText(g.el('linkSource'), 'Admin Console');
  g.multiSelectByTexts(g.el('linkDest'), ['PLC', 'Historian']);
  commitLinkSelection();
  await g.wait(80);
  g.selectByText(g.el('linkSource'), 'Historian');
  g.multiSelectByTexts(g.el('linkDest'), ['PLC']);
  commitLinkSelection();
  await g.wait(80);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Attach many common IoT weak points (will create combinatorial paths)
  g.selectByText(g.el('selVulnElement'), 'Sensor-2');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Default Creds']);
  commitVulnSelection();
  await g.wait(40);

  g.selectByText(g.el('selVulnElement'), 'Sensor-4');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Default Creds']);
  commitVulnSelection();
  await g.wait(40);

  g.selectByText(g.el('selVulnElement'), 'Edge Controller');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Telnet Open']);
  commitVulnSelection();
  await g.wait(80);

  g.selectByText(g.el('selVulnElement'), 'Admin Console');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Weak Auth']);
  commitVulnSelection();
  await g.wait(100);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // compute — this scenario intentionally can produce *many* paths
  await g.click(g.el('btnFindPaths'));
  await g.wait(900); // give compute time
  document.dispatchEvent(new CustomEvent('state:changed'));
}

/* 5) High-connectivity mesh — combinatorial explosion (very dense) */
async function scenario_high_connectivity_mesh() {
  await g.typeInto(g.el('attackerName'), 'Black Hat — Mesh Experiment');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(220);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // create a moderate-size mesh (7 nodes)
  const nodes = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  for (const n of nodes) await addTarget(`Node ${n}`);

  await ensureVuln('Service X RCE');
  await ensureVuln('Auth Bypass');

  g.selectByText(g.el('selAttacker'), 'Black Hat — Mesh Experiment');
  await g.wait(80);

  // entry from Node A, exit Node G
  g.multiSelectByTexts(g.el('selEntriesAll'), ['Node A']);
  g.multiSelectByTexts(g.el('selExitsAll'),   ['Node G']);
  await g.wait(120);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Create near-complete directed mesh to produce many paths:
  for (let i = 0; i < nodes.length; i++) {
    const from = `Node ${nodes[i]}`;
    const toList = [];
    for (let j = i+1; j < nodes.length; j++) {
      toList.push(`Node ${nodes[j]}`);
    }
    if (toList.length) {
      g.selectByText(g.el('linkSource'), from);
      g.multiSelectByTexts(g.el('linkDest'), toList);
      commitLinkSelection();
      await g.wait(60);
    }
  }
  document.dispatchEvent(new CustomEvent('state:changed'));

  // Attach vulnerabilities to a subset to allow many traversal options
  g.selectByText(g.el('selVulnElement'), 'Node B');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Service X RCE']);
  commitVulnSelection();
  await g.wait(50);

  g.selectByText(g.el('selVulnElement'), 'Node D');
  g.multiSelectByTexts(g.el('selVulnsForElement'), ['Auth Bypass']);
  commitVulnSelection();
  await g.wait(70);
  document.dispatchEvent(new CustomEvent('state:changed'));

  // compute — this will produce many possible paths (combinatorial)
  await g.click(g.el('btnFindPaths'));
  await g.wait(1000);
  document.dispatchEvent(new CustomEvent('state:changed'));
}

/* -------------------------
   Scenario catalogue and runner
   ------------------------- */

/*
  We do NOT register all scenarios individually. Instead we keep a catalog
  of scenario functions (each independent) and register a single scenario
  handler that picks one story at random and runs it. This guarantees:
  - clicking Simulation runs exactly one complete story
  - scenarios don't chain
*/
const CATALOG = [
  { name: 'Small webapp chain', fn: scenario_small_webapp },
  { name: 'Corporate network', fn: scenario_corporate_network },
  { name: 'Cloud containers', fn: scenario_cloud_containers },
  { name: 'IoT / OT dense', fn: scenario_iot_ot_dense },
  { name: 'High-connectivity mesh', fn: scenario_high_connectivity_mesh }
];

registerScenario('Random: pick one realistic scenario', async () => {
  // pick weighted or uniform — here uniform
  const i = Math.floor(Math.random() * CATALOG.length);
  const picked = CATALOG[i];
  // Provide a visible hint in UI (type into attacker name field to surface selection)
  try {
    const txt = `Running scenario: ${picked.name}`;
    // create a small transient label in status via sim gestures
    const statusEl = g.el('status');
    if (statusEl) {
      statusEl.textContent = txt;
    }
    // run the scenario
    await picked.fn();
  } finally {
    // ensure UI renders final state (results/diagram) — the main runner will call renderCallback
    try { document.dispatchEvent(new CustomEvent('state:changed')); } catch {}
  }
});
