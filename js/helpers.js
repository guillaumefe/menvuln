/*************************************************************
 * helpers.js — tiny shared utilities for Envuln
 * ⚙️ 100% client-side / no UI logic / no state mutations
 *************************************************************/

/**
 * Query DOM by ID (shorter to type)
 */
export const el = id => document.getElementById(id);

/**
 * Normalized string: trim + collapse spaces
 */
export const norm = s => (s || '').trim().replace(/\s+/g, ' ');

/**
 * Cheap unique ID — enough for UI graph nodes
 */
export const uid = () =>
  Math.random().toString(36).slice(2, 9) + '-' + Date.now().toString(36);

/**
 * Escape text for safe HTML/SVG insertion (no DOMParser needed)
 */
export const esc = s =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Safe integer parsing with fallback
 */
export const toInt = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Clamp number between min and max
 */
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * Remove duplicates while preserving order
 */
export const unique = arr => [...new Set(arr)];

/**
 * DOM: small utility to create elements faster
 * ex: div('.badge') or div({ class:'item', text:'Click!' })
 */
export function div(arg){
  const el = document.createElement('div');
  if(typeof arg === 'string'){
    el.className = arg.replace(/^\./,'');
  } else if(arg && typeof arg === 'object'){
    if(arg.class) el.className = arg.class;
    if(arg.text) el.textContent = arg.text;
    if(arg.html) el.innerHTML = arg.html;
  }
  return el;
}

/**
 * Scroll node into center view if needed (no crash if missing)
 */
export function ensureInView(node, block='center'){
  try { node?.scrollIntoView({ behavior:'smooth', block }); } catch {}
}

/**
 * Async wait helper (ms)
 */
export const wait = ms => new Promise(res => setTimeout(res, ms));

/**
 * Toggle class for a short pulse highlight
 */
export function pulse(node, duration = 600){
  if(!node) return;
  node.classList.add('sim-pulse');
  setTimeout(()=> node.classList.remove('sim-pulse'), duration);
}
