// /js/diagram.js
// ES module that builds and renders the attack path SVG diagrams.

export function buildSVGForPath(pathObj, state, options = {}) {
  // ---- options with sane defaults ----
  const {
    padX = 20,
    padY = 22,
    boxW = 220,
    boxH = 70,
    gap = 60,
    corner = 10,
    fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
    showVulns = true,
    vulnLineHeight = 14,
    maxTitleChars = 28,
    maxSubtitleChars = 34,
    maxVulnChars = 60,
    colors = {
      bg: '#0b1224',
      title: '#e6eef8',
      subtitle: '#9fb0c6',
      note: '#cbd5e1',
      strokeBase: '#a7b8cf',
      strokeDirect: '#a7b8cf',
      strokeLateral: '#fbbf24',
      strokeContains: '#60a5fa',
      boxBase: '#0b1730',
      boxAtt: '#a855f7',
      boxEntry: '#f59e0b',
      boxTarget: '#22c55e',
      boxFinal: '#16a34a'
    }
  } = options;

  // ---- guards ----
  if (!pathObj || !Array.isArray(pathObj.nodes) || !pathObj.nodes.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="120" viewBox="0 0 640 120" role="img" aria-label="Empty path">
      <rect x="0" y="0" width="640" height="120" fill="${colors.bg}"/>
      <text x="16" y="64" fill="${colors.title}" font-family="${fontFamily}" font-size="14">Empty path</text>
    </svg>`;
  }

  // ---- helpers ----
  const esc = s => String(s || '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
  const wrap = (text, max = 28) => {
    const t = String(text || '');
    if (t.length <= max) return [t];
    const words = t.split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const nextLen = (cur ? cur + ' ' : '').length + w.length;
      if (nextLen > max) {
        if (cur) lines.push(cur);
        cur = w;
      } else {
        cur = cur ? cur + ' ' + w : w;
      }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  };

  const nameOf = (id) => (state.targets.find(t => t.id === id) || { name: '?' }).name;

  // Decide edge type between consecutive nodes in the path
  const isInSet = (map, from, to) => {
    const set = map[from];
    if (!set) return false;
    // map can be Set or Array depending on how state was loaded
    if (set instanceof Set) return set.has(to);
    return Array.isArray(set) ? set.includes(to) : false;
  };
  const edgeTypeBetween = (fromId, toId) => {
    if (isInSet(state.edges?.lateral || {}, fromId, toId)) return 'lateral';
    if (isInSet(state.edges?.contains || {}, fromId, toId)) return 'contains';
    return 'direct';
  };

  // ---- build "steps" sequence ----
  const entriesNames = [...(state.attackers.find(a => a.id === pathObj.attackerId)?.entries || new Set())].map(nameOf);
  const steps = [
    { kind: 'attacker', title: 'Attacker', subtitle: pathObj.attackerName || '—' },
    { kind: 'entries',  title: 'Entries',  subtitle: entriesNames.length ? entriesNames.join(', ') : '—' },
    ...pathObj.nodes.map((n, i) => ({
      kind: 'target',
      title: `Target ${i + 1}${i === pathObj.nodes.length - 1 ? ' (final)' : ''}`,
      subtitle: n.name,
      isFinal: i === pathObj.nodes.length - 1,
      vulns: (pathObj.vulnsPerNode?.[i] || [])
    }))
  ];

  // ---- compute dynamic height for vuln lines (wrapped) ----
  const vulnTextPerTarget = steps
    .filter(s => s.kind === 'target')
    .map(s => s.vulns && s.vulns.length ? `Vulns: ${s.vulns.join(', ')}` : 'No vulnerabilities');
  const wrappedVulnLines = showVulns ? vulnTextPerTarget.map(txt => wrap(txt, maxVulnChars)) : [];
  const maxVulnLines = wrappedVulnLines.reduce((m, arr) => Math.max(m, arr.length), 0);

  // Determine canvas base dimensions
  const anyTarget = steps.some(s => s.kind === 'target');
  const extraVulnH = anyTarget && showVulns ? (maxVulnLines * vulnLineHeight + 16) : 0;
  const baseH = padY * 2 + boxH + extraVulnH;
  const baseW = padX * 2 + steps.length * boxW + (steps.length - 1) * gap;

  // ---- SVG construction ----
  let x = padX, y = padY;
  let svg = `
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${baseW} ${baseH}" width="${baseW}" height="${baseH}"
     role="img" aria-label="Attack path diagram">
  <defs>
    <marker id="arrowHead" markerWidth="12" markerHeight="8" refX="11" refY="4" orient="auto">
      <polygon points="0,0 12,4 0,8" fill="${colors.strokeBase}"/>
    </marker>
    <style>
      .title { font: 600 14px ${fontFamily}; fill: ${colors.title}; }
      .subtitle { font: 12px ${fontFamily}; fill: ${colors.subtitle}; }
      .note { font: 12px ${fontFamily}; fill: ${colors.note}; }
      .box { fill: ${colors.boxBase}; stroke-width: 1.4; rx: ${corner}; ry: ${corner}; }
      .box-att { stroke: ${colors.boxAtt}; }
      .box-entry { stroke: ${colors.boxEntry}; }
      .box-target { stroke: ${colors.boxTarget}; }
      .box-final { stroke: ${colors.boxFinal}; stroke-width: 2; }
      .arrow { stroke: ${colors.strokeDirect}; stroke-width: 1.6; fill: none; marker-end: url(#arrowHead); }
      .arrow-lat { stroke: ${colors.strokeLateral}; stroke-width: 1.4; fill: none; marker-end: url(#arrowHead); stroke-dasharray: 6 4; }
      .arrow-contains { stroke: ${colors.strokeContains}; stroke-width: 1.4; fill: none; marker-end: url(#arrowHead); stroke-dasharray: 2 4; }
      .bg { fill: ${colors.bg}; }
    </style>
  </defs>
  <rect class="bg" x="0" y="0" width="${baseW}" height="${baseH}" rx="${corner}" ry="${corner}"/>
`;

  // precompute edge types between consecutive target nodes
  const pathTargetIds = pathObj.nodes.map(n => n.id);
  const hopTypes = [];
  for (let i = 0; i < pathTargetIds.length - 1; i++) {
    hopTypes[i] = edgeTypeBetween(pathTargetIds[i], pathTargetIds[i + 1]);
  }

  function drawBox(className, title, subtitle, isFinal) {
    svg += `<rect class="box ${className} ${isFinal ? 'box-final' : ''}" x="${x}" y="${y}" width="${boxW}" height="${boxH}" />`;
    let ty = y + 24;
    wrap(title, maxTitleChars).forEach(ln => { svg += `<text class="title" x="${x + 12}" y="${ty}">${esc(ln)}</text>`; ty += 16; });
    wrap(subtitle, maxSubtitleChars).forEach(ln => { svg += `<text class="subtitle" x="${x + 12}" y="${ty}">${esc(ln)}</text>`; ty += 14; });
  }

  steps.forEach((s, i) => {
    const cls =
      s.kind === 'attacker' ? 'box-att' :
      s.kind === 'entries'  ? 'box-entry' : 'box-target';

    drawBox(cls, s.title, s.subtitle, s.isFinal);

    if (s.kind === 'target' && showVulns) {
      const raw = (s.vulns && s.vulns.length) ? `Vulns: ${s.vulns.join(', ')}` : 'No vulnerabilities';
      const lines = wrap(raw, maxVulnChars);
      let vy = y + boxH + 22;
      lines.forEach(ln => {
        svg += `<text class="note" x="${x + 10}" y="${vy}">${esc(ln)}</text>`;
        vy += vulnLineHeight;
      });
    }

    if (i < steps.length - 1) {
      // Draw edge to next step, deciding style by hop type (only between target→target)
      const nx = x + boxW + gap;
      const midY = y + boxH / 2;
      let clsArrow = 'arrow'; // default direct
      if (s.kind === 'target') {
        const idx = i - 2; // because steps[0]=attacker, steps[1]=entries
        if (idx >= 0 && idx < hopTypes.length) {
          const t = hopTypes[idx];
          if (t === 'lateral') clsArrow = 'arrow-lat';
          else if (t === 'contains') clsArrow = 'arrow-contains';
        }
      }
      svg += `<path class="${clsArrow}" d="M ${x + boxW} ${midY} C ${x + boxW + gap / 2} ${midY} ${nx - gap / 2} ${midY} ${nx} ${midY}" />`;
      x = nx;
    }
  });

  svg += `</svg>`;
  return svg;
}

/**
 * Render the diagram into a container element.
 * @param {HTMLElement} containerEl - target container (e.g., document.getElementById('diagramBox'))
 * @param {Object} pathObj - result item { attacker, attackerId, nodes: [{id,name}], vulnsPerNode: [...] }
 * @param {Object} state - full app state (targets, edges, attackers...)
 * @param {Object} options - same as buildSVGForPath options (optional)
 * @returns {SVGElement|null}
 */
export function renderDiagram(containerEl, pathObj, state, options = {}) {
  if (!containerEl) return null;
  const svgStr = buildSVGForPath(pathObj, state, options);
  containerEl.innerHTML = svgStr;
  const svg = containerEl.querySelector('svg');
  // small QoL: enable horizontal scroll with Shift+wheel
  containerEl.style.overflowX = 'auto';
  containerEl.style.overflowY = 'hidden';
  containerEl.onwheel = (ev) => {
    if (ev.shiftKey) {
      containerEl.scrollLeft += ev.deltaY;
      ev.preventDefault();
    }
  };
  return svg || null;
}

/**
 * Download an existing <svg> as an .svg file.
 * @param {SVGElement} svgEl
 * @param {string} filename
 */
export function downloadSVG(svgEl, filename = 'attack-diagram.svg') {
  if (!svgEl) return;
  const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

/* ===== Usage example (in UI code) =====
import { renderDiagram, downloadSVG } from './diagram.js';
import { State } from './state.js';

const svg = renderDiagram(document.getElementById('diagramBox'), pathItem, State, {
  showVulns: true,
  gap: 68
});
document.getElementById('btnDownloadSVG').onclick = () => downloadSVG(svg, 'attack-diagram.svg');
*/

