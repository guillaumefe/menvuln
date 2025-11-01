/* =========================================================
   simulation/scenarios.js
   Example automated UX scenarios using the gesture engine
   ========================================================= */

import { registerScenario, g } from './index.js';

registerScenario('Add attacker', async () => {
  await g.typeInto(g.el('attackerName'), 'Attacker A');
  await g.click(g.el('btnAddAttacker'));
  await g.wait(300);
});

registerScenario('Add target', async () => {
  await g.typeInto(g.el('targetName'), 'Target A');
  await g.click(g.el('btnAddTarget'));
  await g.wait(300);
});

registerScenario('Assign entries and exits', async () => {
  const attackerSelect = g.el('selAttacker');
  if (!attackerSelect) return;
  await g.moveToEl(attackerSelect);
  await g.click(attackerSelect);
  g.selectByText(attackerSelect, attackerSelect.options[0]?.textContent);

  const targets = [...g.el('selEntriesAll').options].map(o => o.textContent);
  if (targets.length >= 2) {
    g.multiSelectByTexts(g.el('selEntriesAll'), [targets[0]]);
    g.multiSelectByTexts(g.el('selExitsAll'), [targets[1]]);
  }

  await g.wait(300);
});
