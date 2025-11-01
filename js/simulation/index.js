// js/simulation/index.js
// Simulation core: registry + "mouse-like" gesture helpers.

const SCENARIOS = []; // { name, fn, weight }

// -- registry
function addScenario(name, fn, weight = 1) {
  SCENARIOS.push({ name, fn, weight });
}
function pickScenario() {
  const total = SCENARIOS.reduce((s, x) => s + (x.weight || 1), 0);
  if (!total) return null;
  let r = Math.random() * total;
  for (const s of SCENARIOS) { r -= (s.weight || 1); if (r <= 0) return s; }
  return SCENARIOS.at(-1) || null;
}

// -- “mouse” helpers
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise(res => setTimeout(res, ms));
function ensureInView(n, block='center'){ try{ n?.scrollIntoView({behavior:'smooth', block}); }catch{} }
function _move(el,x=8,y=8){ if(!el) return; const r=el.getBoundingClientRect(); const e=new MouseEvent('mousemove',{bubbles:true,clientX:r.left+x,clientY:r.top+y}); el.dispatchEvent(e); }
async function moveToEl(el, offX=8, offY=8){ if(!el) return; ensureInView(el); await wait(120); _move(el,offX,offY); await wait(60); }
async function click(el){ if(!el) return; await moveToEl(el); el.focus?.(); el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); el.click?.(); await wait(80); }
async function typeInto(input, text, perCharMs=12){ if(!input) return; await moveToEl(input,10,10); input.focus(); input.value=''; input.dispatchEvent(new Event('input',{bubbles:true})); for(const ch of String(text)){ input.value+=ch; input.dispatchEvent(new Event('input',{bubbles:true})); await wait(perCharMs);} }
function selectByText(sel, text){ if(!sel) return; const t=String(text).toLowerCase(); for(const o of sel.options){ if(String(o.textContent||'').toLowerCase()===t){ sel.value=o.value; sel.dispatchEvent(new Event('change',{bubbles:true})); break; }} }
function multiSelectByTexts(sel, texts){ if(!sel) return; const wants=new Set(texts.map(x=>String(x).toLowerCase())); for(const o of sel.options){ o.selected=wants.has(String(o.textContent||'').toLowerCase()); } sel.dispatchEvent(new Event('change',{bubbles:true})); }

// -- top buttons
function disableTopButtons(disabled=true){ ['btnSimu','btnFindPaths','btnExportODS','btnImportJSON','btnExportJSON'].forEach(id=>{ const b=$(id); if(b) b.disabled=disabled; }); }
function enableTopButtons(){ disableTopButtons(false); }

// -- runner
async function runScenarioObject(sc){ disableTopButtons(true); try{ await sc.fn({ g }); } catch(e){ console.error('[simulation] scenario failed:', e); } finally{ disableTopButtons(false); } }
async function runRandomScenario(){ const sc=pickScenario(); if(!sc){ alert('No simulation scenarios registered.'); return; } await runScenarioObject(sc); }
async function runScenario(name){ const sc=SCENARIOS.find(s=>s.name===name); if(!sc) throw new Error(`Scenario not found: ${name}`); await runScenarioObject(sc); }
async function runSimulation(opts={}){ if(opts.scenarioName) await runScenario(opts.scenarioName); else await runRandomScenario(); if(typeof opts.renderCallback==='function'){ try{ opts.renderCallback(); }catch(e){ console.error(e); } } }

// -- public gesture surface
const g = { el:$, wait, moveToEl, click, typeInto, selectByText, multiSelectByTexts, ensureInView, disableTopButtons };

// -- exports (keep both names for compatibility)
export {
  addScenario,                 // <— for scenarios.js that imports addScenario
  addScenario as registerScenario,
  runSimulation,
  runRandomScenario,
  runScenario,
  pickScenario,
  SCENARIOS,
  disableTopButtons,
  enableTopButtons,
  g,
};

export default { registerScenario:addScenario, runSimulation, disableTopButtons, enableTopButtons, g };
