// js/simulation/index.js
// Simulation engine: mouse-driven, human-like behavior

/* =====================================================
   Scenario registry
   ===================================================== */

const SCENARIOS = [];

export function registerScenario(name, fn, weight = 1) {
  SCENARIOS.push({ name, fn, weight });
}

export async function runScenario(name, opts = {}) {
  const sc = SCENARIOS.find(s => s.name === name);
  if (!sc) throw new Error(`Scenario not found: ${name}`);
  disableTopButtons(true);

  try {
    await sc.fn(opts);
    if (opts.renderCallback) opts.renderCallback();
  } catch (err) {
    console.error('[simulation] scenario error', err);
  } finally {
    disableTopButtons(false);
  }
}

export const runRandomScenario = async () => {
  const tot = SCENARIOS.reduce((s,x)=>s+(x.weight||1),0);
  let r = Math.random() * tot;
  for(const s of SCENARIOS){
    r -= (s.weight||1);
    if(r<=0) return runScenario(s.name);
  }
  return runScenario(SCENARIOS[0]?.name);
};

export async function runSimulation(opts = {}) {
  return runRandomScenario();
}

export { SCENARIOS };

/* =====================================================
   Disable top buttons (only global actions)
   ===================================================== */

function $(id){ return document.getElementById(id); }

export function disableTopButtons(disabled = true) {
  [
    'btnSimu',
    'btnFindPaths',
    'btnExportODS',
    'btnAddLink',
    'btnRemoveLink',
    'btnImportJSON',
    'btnExportJSON',
    'btnDownloadSVG'
  ].forEach(id=>{
    const b = $(id);
    if(b) b.disabled = disabled;
  });
}

export function enableTopButtons(){ disableTopButtons(false); }

/* =====================================================
   Gesture engine: cursor + events
   ===================================================== */

const g = {
  el: (id)=>$(id),
  wait,
  moveToEl,
  click,
  dblclick,
  typeInto,
  selectByText,
  multiSelectByTexts,
  ensureInView,
  disableTopButtons,
  ensureSpeedHook
};
export { g };

// Visual cursor
let cursorNode = null;
let cursorInit = false;

function ensureCursor() {
  if(cursorInit) return;
  cursorInit = true;
  cursorNode = document.createElement('div');
  cursorNode.id='envuln-sim-cursor';
  Object.assign(cursorNode.style,{
    position:'fixed',
    width:'12px',
    height:'12px',
    borderRadius:'50%',
    background:'#7dd3fc',
    boxShadow:'0 0 0 2px rgba(125,211,252,.35)',
    zIndex:'99999',
    pointerEvents:'none',
    transition:'transform 0.08s ease'
  });
  document.body.appendChild(cursorNode);
}

function getSpeed(){
  const s = $('simSpeed');
  const v = parseFloat(s?.value||'1');
  return Math.max(0.2, Math.min(3,v));
}

function ensureSpeedHook(){
  const s=$('simSpeed'), span=$('simSpeedValue');
  if(!s||!span) return;
  const update=()=>{
    span.textContent=`×${parseFloat(s.value).toFixed(1)}`;
  };
  if(!s._hooked){
    s.addEventListener('input',update);
    s._hooked=true;
  }
  update();
}

function wait(ms){
  return new Promise(res => setTimeout(res, ms/getSpeed()));
}

/* =====================================================
   List-click guard: avoid opening Details/editor
   ===================================================== */

function isInsideList(node){
  return node && node.closest &&
    (node.closest('#targetList')
     || node.closest('#attackerList')
     || node.closest('#vulnList'));
}

/* =====================================================
   Mouse movement and events
   ===================================================== */

function centerOf(el){
  const r = el.getBoundingClientRect();
  return { x:r.left+r.width/2, y:r.top+r.height/2, rect:r };
}

async function moveCursorTo(x,y,ms=300){
  ensureCursor();
  ms = ms/getSpeed();
  const r = cursorNode.getBoundingClientRect();
  const x0 = r.left+6, y0 = r.top+6;
  const frames = Math.max(10, Math.round(ms/16));
  for(let i=0;i<=frames;i++){
    const t=i/frames;
    const nx=x0+(x-x0)*t;
    const ny=y0+(y-y0)*t;
    cursorNode.style.transform=`translate(${nx-6}px,${ny-6}px)`;
    await wait(16);
  }
}

async function moveToEl(el,offsetX=0,offsetY=0,d=350){
  if(!el) return;
  ensureInView(el);
  await wait(20);
  const {x,y,rect}=centerOf(el);

  // If target is a list item → push cursor down
  if(isInsideList(el)) offsetY+=35;

  await moveCursorTo(x+offsetX,y+offsetY,d+(rect.width+rect.height)*.1);
}

async function dispatchMouseSequence(el,type='click'){
  const {x,y}=centerOf(el);
  const ev = t => new MouseEvent(t,{
    bubbles:true, cancelable:true,
    clientX:x, clientY:y, view:window, button:0
  });
  el.dispatchEvent(ev('pointerover'));
  el.dispatchEvent(ev('mouseover'));
  el.dispatchEvent(ev('mouseenter'));
  el.dispatchEvent(ev('pointerdown'));
  el.dispatchEvent(ev('mousedown'));
  el.focus?.();
  el.dispatchEvent(ev('pointerup'));
  el.dispatchEvent(ev('mouseup'));
  el.dispatchEvent(ev(type));
}

async function click(el){
  if(!el) return;

  // Hard block: if element is in list → skip
  if(isInsideList(el)){
    console.warn('[sim] skipped click inside list:',el);
    return;
  }

  await moveToEl(el);
  await dispatchMouseSequence(el,'click');
  await wait(80);
}

async function dblclick(el){
  if(!el) return;
  await moveToEl(el);
  await dispatchMouseSequence(el,'click');
  await wait(60);
  await dispatchMouseSequence(el,'click');
  await wait(120);
}

/* =====================================================
   Keyboard and select helpers
   ===================================================== */

async function typeChar(inp,ch){
  const key = ch;
  const mk = e=>new KeyboardEvent(e,{ bubbles:true, cancelable:true, key });
  inp.dispatchEvent(mk('keydown'));
  inp.dispatchEvent(mk('keypress'));

  const v = inp.value ?? '';
  inp.value = v+ch;
  inp.dispatchEvent(new Event('input',{bubbles:true}));
  inp.dispatchEvent(new Event('change',{bubbles:true}));

  inp.dispatchEvent(mk('keyup'));
  await wait(40);
}

async function typeInto(inp,text,perChar=40){
  if(!inp) return;
  await moveToEl(inp);
  await click(inp);
  for(const ch of String(text)) await typeChar(inp,ch);
  await wait(120);
}

function selectByText(sel,text){
  const o = [...sel.options].find(o=>
    o.textContent.trim().toLowerCase() === String(text).trim().toLowerCase()
  );
  if(o){
    sel.value=o.value;
    sel.dispatchEvent(new Event('change',{bubbles:true}));
  }
}

function multiSelectByTexts(sel,texts){
  const want=new Set(texts.map(s=>s.toLowerCase().trim()));
  [...sel.options].forEach(o=>{
    o.selected = want.has(o.textContent.trim().toLowerCase());
  });
  sel.dispatchEvent(new Event('change',{bubbles:true}));
}

/* =====================================================
   Scroll helper
   ===================================================== */

function ensureInView(node,block='center'){
  try{ node?.scrollIntoView({behavior:'smooth',block}); }catch{}
}

/* =====================================================
   Default fallback scenario
   ===================================================== */

registerScenario('Demo Scenario', async () => {
  const b=$('btnFindPaths');
  if(!b) return;
  await moveToEl(b);
  await click(b);
  await wait(300);
});

/* =====================================================
   Default export
   ===================================================== */

export default {
  registerScenario,
  runSimulation,
  runRandomScenario,
  runScenario,
  SCENARIOS,
  disableTopButtons,
  enableTopButtons,
  g
};
