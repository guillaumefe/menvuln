// js/simulation/index.js

// --- Scenario registry ---
const SCENARIOS = [];

function addScenario(name, fn, weight = 1){
  SCENARIOS.push({ name, fn, weight });
}

function pickScenario(){
  const tot = SCENARIOS.reduce((s,x)=>s+x.weight,0);
  if(!tot) return null;
  let r = Math.random()*tot;
  for(const s of SCENARIOS){
    r -= s.weight;
    if(r<=0) return s;
  }
  return SCENARIOS[SCENARIOS.length-1];
}

// --- DOM helpers ---
const $ = id => document.getElementById(id);
const wait = ms => new Promise(res => setTimeout(res, ms));

function disableTopButtons(disabled=true){
  ['btnSimu','btnFindPaths','btnExportODS','btnAddAttacker','btnAddTarget','btnAddVuln','btnAddLink','btnRemoveLink']
    .forEach(id=>{
      const b=$(id); if(b) b.disabled=disabled;
    });
}
function enableTopButtons(){ disableTopButtons(false); }

// --- Small UI gestures object (needed by scenarios.js) ---
const g = {
  el: $,
  wait,
  async moveToEl(node){ try{ node?.scrollIntoView({ behavior:'smooth', block:'center' }); await wait(120); }catch{} },
  async click(node){ try{ node?.click?.(); await wait(60); }catch{} },
  async typeInto(input, text, perCharMs=10){
    if(!input) return;
    input.focus();
    input.value = '';
    for(const ch of String(text)){ input.value += ch; await wait(perCharMs); }
    input.dispatchEvent(new Event('input', { bubbles:true }));
    input.dispatchEvent(new Event('change', { bubbles:true }));
  },
  selectByText(sel, text){
    if(!sel) return;
    const o = [...sel.options].find(o => o.textContent === text);
    if(o){ sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles:true })); }
  },
  multiSelectByTexts(sel, texts){
    if(!sel) return;
    const set = new Set(texts);
    [...sel.options].forEach(o => o.selected = set.has(o.textContent));
    sel.dispatchEvent(new Event('change', { bubbles:true }));
  },
  disableTopButtons,
  ensureInView(node, block='center'){ try{ node?.scrollIntoView({ behavior:'smooth', block }); }catch{} }
};

// --- Runners ---
async function runScenarioObj(sc){
  disableTopButtons(true);
  try { await sc.fn(); }
  catch(e){ console.error(e); }
  finally { disableTopButtons(false); }
}

async function runRandomScenario(){
  const sc = pickScenario();
  if(!sc) return alert('No scenarios registered');
  return runScenarioObj(sc);
}

async function runScenario(name){
  const sc = SCENARIOS.find(s=>s.name===name);
  if(!sc) throw new Error('Scenario not found');
  return runScenarioObj(sc);
}

// ✅ This is what main.js imports
async function runSimulation(opts={}){
  if(opts.scenarioName) await runScenario(opts.scenarioName);
  else await runRandomScenario();

  if(typeof opts.renderCallback === 'function'){
    try{ opts.renderCallback(); }catch(e){ console.error(e); }
  }
}

// ✅ Required named exports
export {
  addScenario as registerScenario,
  runSimulation,
  runRandomScenario,
  runScenario,
  pickScenario,
  SCENARIOS,
  disableTopButtons,
  enableTopButtons,
  g // 👈 export du helper pour scenarios.js
};

// ✅ Default export for fallback / bundler quirks
export default {
  registerScenario: addScenario,
  runSimulation,
  disableTopButtons,
  enableTopButtons,
  g
};

// --- Example built-in minimal scenario (non destructif) ---
addScenario('Demo Scenario', async () => {
  const btn = $('btnFindPaths');
  if(btn){
    btn.scrollIntoView({behavior:'smooth'});
    await wait(300);
    btn.click();
    await wait(200);
  }
});
