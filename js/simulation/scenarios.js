// js/simulation/scenarios.js
// Register mouse-driven UI scenarios for ENVULN
//
// IMPORTANT: Works with current gesture engine in js/simulation/index.js
//
// It simulates REAL user interactions: typing, clicking,
// ensuring elements exist and dispatching DOM events correctly.

import { registerScenario, g } from './index.js';

registerScenario("Auto Build Demo", async () => {

  /* ------------------------------
     Step 1 — Create targets
     ------------------------------ */
  await g.typeInto(g.el('targetName'), "Host A");
  await g.click(g.el('btnAddTarget'));
  await g.wait(300);

  await g.typeInto(g.el('targetName'), "Host B");
  await g.click(g.el('btnAddTarget'));
  await g.wait(300);

  /* ------------------------------
     Step 2 — Create attacker
     ------------------------------ */
  await g.typeInto(g.el('attackerName'), "Operator");
  await g.click(g.el('btnAddAttacker'));
  await g.wait(400);

  /* ------------------------------
     Step 3 — Attacker can enter Host A
     ------------------------------ */
  const selAtt = g.el('selAttacker');
  g.selectByText(selAtt, "Operator");
  await g.wait(400);

  const selEntries = g.el('selEntriesAll');
  g.multiSelectByTexts(selEntries, ["Host A"]);
  await g.wait(400);

  /* ------------------------------
     Step 4 — Add Direct Link: Host A → Host B
     ------------------------------ */
  const src = g.el('linkSource');
  g.selectByText(src, "Host A");
  await g.wait(250);

  const dst = g.el('linkDest');
  g.multiSelectByTexts(dst, ["Host B"]);
  await g.wait(250);

  await g.click(g.el('btnAddLink'));
  await g.wait(600);

  /* ------------------------------
     Step 5 — Compute Attack Paths
     ------------------------------ */
  await g.click(g.el('btnFindPaths'));
  await g.wait(600);

  /* Done! */
});
