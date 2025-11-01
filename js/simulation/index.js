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
  return SCENARIOS[SCENARIOS.length-1] || null;
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

// --- Public runner helpers (unchanged) ---
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

// ✅ Export an automation "gesture" helper used by scenarios.js
const g = {
  el: $,
  wait,
  async moveToEl(node, offsetX=0, offsetY=0) {
    try {
      node?.scrollIntoView({ behavior:'smooth', block:'center' });
      await wait(120);
    } catch {}
  },
  async click(node) {
    try { node?.click?.(); } catch {}
    await wait(60);
  },
  async typeInto(input, text, perCharMs = 18) {
    if(!input) return;
    input.focus?.();
    input.value = '';
    for (const ch of String(text)) {
      input.value += ch;
      input.dispatchEvent(new Event('input', { bubbles:true }));
      await wait(perCharMs);
    }
    input.dispatchEvent(new Event('change', { bubbles:true }));
  },
  selectByText(sel, text) {
    if(!sel) return;
    const o = [...sel.options].find(o => (o.textContent || '').trim() === String(text).trim());
    if(o){
      sel.value = o.value;
      sel.dispatchEvent(new Event('change', { bubbles:true }));
    }
  },
  multiSelectByTexts(sel, textsArray) {
    if(!sel) return;
    const set = new Set((textsArray || []).map(s => String(s).trim()));
    [...sel.options].forEach(o => { o.selected = set.has((o.textContent || '').trim()); });
    sel.dispatchEvent(new Event('change', { bubbles:true }));
  },
  disableTopButtons,
  ensureInView(node, block='center'){ try{ node?.scrollIntoView({behavior:'smooth', block}); }catch{} }
};

// ✅ This is what main.js imports
async function runSimulation(opts={}){
  if(opts.scenarioName) await runScenario(opts.scenarioName);
  else await runRandomScenario();

  if(typeof opts.renderCallback === 'function'){
    try{ opts.renderCallback(); }catch(e){ console.error(e); }
  }
}

// --- Built-in minimal demo scenario (kept) ---
addScenario('Demo Scenario', async () => {
  const btn = $('btnFindPaths');
  if(btn){
    btn.scrollIntoView({behavior:'smooth'});
    await wait(500);
    btn.click();
    await wait(300);
  }
});

// ✅ Named exports (now also exporting addScenario and g)
export {
  addScenario,               // <— important pour scenarios.js
  g,                         // <— important pour scenarios.js
  runSimulation,
  runRandomScenario,
  runScenario,
  pickScenario,
  SCENARIOS,
  disableTopButtons,
  enableTopButtons
};

// ✅ Default export (fallback)
export default {
  addScenario,
  g,
  runSimulation,
  disableTopButtons,
  enableTopButtons
};
