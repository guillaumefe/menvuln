// js/ui/results.js
// Module responsible for rendering computed attack paths (results panel).
// Exports: initResultsPanel, renderResults, computeAndRenderAll, renderDiagramForPath, getLastResults, getLastMeta
// Dependencies: ../helpers.js (el, esc), ../paths.js (computeAllPaths), ../diagram.js (buildSVGForPath), ../state.js (State)

import { el, esc } from '../helpers.js';
import { computeAllPaths } from '../paths.js';
import { buildSVGForPath } from '../diagram.js';
import { State } from '../state.js';
import { exportODS } from '../exportODS.js'; // optional: if you implemented exporter

// Internal cache
let lastResults = [];
let lastMeta = { cycles: false, truncated: false };

// UI element references (populated on init)
let resultsBox = null;
let chkOnlyVuln = null;
let statusEl = null;
let svgContainer = null;
let svgSizeEl = null;
let downloadSvgBtn = null;

/* ---------- UTIL ---------- */
// By design, we ignore the *first* node of the path for the vuln-everywhere filter,
// because entry nodes often don't carry a vulnerability in the model.
const hasVulnsEverywhere = (path) => {
  if (!Array.isArray(path.vulnsPerNode)) return false;
  const slice = path.vulnsPerNode.slice(1);
  if (!slice.length) return false;
  return slice.every(vs => Array.isArray(vs) && vs.length > 0);
};

const getDisplayResults = () => {
  if (chkOnlyVuln && chkOnlyVuln.checked) {
    return lastResults.filter(hasVulnsEverywhere);
  }
  return lastResults;
};

function renderSummary(count, meta = {}) {
  if (!statusEl) return;
  const parts = [];
  parts.push(`${count} path${count === 1 ? '' : 's'}`);
  if (meta.cycles) parts.push('cycles detected (simple paths)');
  if (meta.truncated) parts.push('truncated by ceiling');
  statusEl.textContent = parts.join(' • ');
}

/* ---------- RENDER RESULTS ---------- */
function renderResults(resultsArray, meta = {}) {
  if (!resultsBox) return;
  // Cache full (unfiltered) set and metadata
  lastResults = Array.isArray(resultsArray) ? resultsArray.slice() : [];
  lastMeta = Object.assign({}, meta);

  // Decide what to display
  const toDisplay = getDisplayResults();

  resultsBox.innerHTML = '';
  if (!toDisplay.length) {
    const empty = document.createElement('div');
    empty.className = 'small';
    const filtered = !!(chkOnlyVuln && chkOnlyVuln.checked);
    empty.textContent = filtered
      ? 'No paths match the “only vulnerable” filter.'
      : 'No paths (check entry points, finals and link types).';
    resultsBox.appendChild(empty);
    renderSummary(0, meta);
    return;
  }

  // Build entries
  toDisplay.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'path';
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'flex-start';
    row.style.gap = '10px';
    row.style.padding = '8px';
    row.style.borderRadius = '8px';
    row.style.background = 'rgba(255,255,255,0.02)';

    // Left column: attacker + chain + vulns summary
    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';
    left.style.gap = '6px';

    const title = document.createElement('div');
    title.innerHTML = `<strong>${esc(p.attacker)}</strong>`;
    left.appendChild(title);

    const chain = document.createElement('div');
    chain.className = 'small';
    chain.textContent = p.nodes.map(n => n.name).join(' → ');
    left.appendChild(chain);

    const vulnSummary = document.createElement('div');
    vulnSummary.className = 'mini';
    vulnSummary.style.fontSize = '12px';
    vulnSummary.style.color = 'var(--muted)';
    vulnSummary.textContent = p.vulnsPerNode.map((vs, i) =>
      vs && vs.length ? `[${p.nodes[i].name}: ${vs.join(', ')}]` : `[${p.nodes[i].name}: —]`
    ).join(' ');
    left.appendChild(vulnSummary);

    // Optionally grey-out impossible paths
    if (!hasVulnsEverywhere(p)) {
      row.style.opacity = '0.72';
      row.title = 'One or more targets have no vulnerabilities (path theoretically impossible)';
    }

    // Right column: actions
    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.flexDirection = 'column';
    right.style.gap = '6px';
    right.style.alignItems = 'flex-end';

    const btnDiagram = document.createElement('button');
    btnDiagram.textContent = 'Diagram';
    btnDiagram.className = 'ghost';
    btnDiagram.onclick = () => {
      renderDiagramForPath(p);
      // focus diagram in UI
      if (svgContainer) svgContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const btnZoom = document.createElement('button');
    btnZoom.textContent = 'Zoom';
    btnZoom.className = 'ghost';
    btnZoom.onclick = () => {
      // If a diagram is already rendered for this path, try to center it
      if (svgContainer) {
        svgContainer.style.boxShadow = '0 0 0 4px rgba(59,130,246,0.18)';
        setTimeout(() => svgContainer.style.boxShadow = 'none', 800);
      }
    };

    right.appendChild(btnDiagram);
    right.appendChild(btnZoom);

    row.appendChild(left);
    row.appendChild(right);
    resultsBox.appendChild(row);
  });

  renderSummary(toDisplay.length, meta);
}

/* ---------- DIAGRAM rendering + download ---------- */
function renderDiagramForPath(pathObj) {
  if (!svgContainer) return;
  try {
    // Pass live State so the builder can resolve entries, edge types, etc.
    const svgStr = buildSVGForPath(pathObj, State);
    svgContainer.innerHTML = svgStr;

    // store last svg for download
    const svgEl = svgContainer.querySelector('svg');
    if (svgEl) {
      // update size display (if provided)
      if (svgSizeEl) {
        const w = svgEl.getAttribute('width') || svgEl.viewBox?.baseVal?.width || svgEl.getBoundingClientRect().width;
        const h = svgEl.getAttribute('height') || svgEl.viewBox?.baseVal?.height || svgEl.getBoundingClientRect().height;
        svgSizeEl.textContent = `${Math.round(w)} × ${Math.round(h)} px`;
      }
      // attach download helper
      if (downloadSvgBtn) {
        downloadSvgBtn.onclick = () => {
          const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `attack-diagram-${ts}.svg`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 0);
        };
      }
    }
  } catch (err) {
    console.error('renderDiagramForPath:', err);
    if (svgContainer) svgContainer.innerHTML = `<div class="small">Failed to render diagram: ${esc(String(err))}</div>`;
  }
}

/* ---------- Compute (bridge to paths.js) ---------- */
async function computeAndRenderAll(state, opts = { includeLateral: true, includeContains: true, maxPaths: 2000 }) {
  // computeAllPaths returns an object { paths, cycles, truncated }
  const out = computeAllPaths(state, opts, opts.maxPaths);
  const arr = Array.isArray(out?.paths) ? out.paths : [];

  // ensure normalized shape: nodes are target objects and vulnsPerNode array exists
  const normalized = arr.map(r => {
    return {
      attacker: r.attackerName || r.attacker || r.attackerId || '',
      attackerId: r.attackerId || '',
      nodes: r.nodes || (r.nodeIds || []).map(id => ({ id, name: id })), // fallback
      vulnsPerNode: Array.isArray(r.vulnsPerNode) ? r.vulnsPerNode : (r.nodes ? r.nodes.map(() => []) : [])
    };
  });

  const meta = { cycles: !!out.cycles, truncated: !!out.truncated };

  // render
  renderResults(normalized, meta);
  return normalized;
}

/* ---------- Initialization ---------- */
function initResultsPanel(opts = {}) {
  resultsBox = el(opts.resultsBoxId || 'results');
  chkOnlyVuln = el(opts.chkOnlyVulnId || 'chkOnlyVuln');
  statusEl = el(opts.statusId || 'status');
  svgContainer = el(opts.svgContainerId || 'diagramBox');
  svgSizeEl = el(opts.svgSizeId || 'svgSize');
  downloadSvgBtn = el(opts.downloadSvgBtnId || 'btnDownloadSVG');

  // bind checkbox to re-render current cache
  if (chkOnlyVuln) {
    chkOnlyVuln.addEventListener('change', () => {
      renderResults(getDisplayResults(), lastMeta);
    });
  }

  // wire export ODS (if exporter present)
  const exportBtn = el(opts.exportOdsBtnId || 'btnExportODS');
  if (exportBtn && typeof exportODS === 'function') {
    exportBtn.addEventListener('click', () => {
      // Use filtered display results if checkbox on, else use full
      const toExport = chkOnlyVuln && chkOnlyVuln.checked ? getDisplayResults() : lastResults;
      if (!toExport || !toExport.length) return alert('No paths to export.');
      exportODS(State, { results: toExport });
    });
  }
}

/* ---------- accessors for other modules / app -------- */
function getLastResults() { return lastResults.slice(); }
function getLastMeta() { return Object.assign({}, lastMeta); }

export {
  initResultsPanel,
  renderResults,
  computeAndRenderAll,
  renderDiagramForPath,
  getLastResults,
  getLastMeta
};
