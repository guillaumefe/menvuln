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
  ['btnSimu','btnFindPaths','btnExportODS'].forEach(id=>{
    const b=$(id); if(b) b.disabled=disabled;
  });
}
function enableTopButtons(){ disableTopButtons(false); }

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
  enableTopButtons
};

// ✅ Default export for fallback / bundler quirks
export default {
  registerScenario: addScenario,
  runSimulation,
  disableTopButtons,
  enableTopButtons
};

// --- Example built-in scenario ---
addScenario('Demo Scenario', async () => {
  const btn = $('btnFindPaths');
  if(btn){
    btn.scrollIntoView({behavior:'smooth'});
    await wait(500);
    btn.click();
    await wait(300);
  }
});
