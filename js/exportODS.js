// exportODS.js
// Generate a Flat ODS (.fods) spreadsheet fully client-side

import { computeAllPaths, nameOfTarget } from './paths.js';

/**
 * Export results into a Flat ODS file (.fods)
 * @param {Object} state Current state (from state.js)
 * @param {Object} options Optional: { results?:Array, filter?:Function }
 *   - results: precomputed paths array (same shape as computeAllPaths(...).paths)
 *   - filter : (path) => boolean  (to include/exclude rows)
 */
export function exportODS(state, options = {}) {
  const pre = (options.results && Array.isArray(options.results)) ? options.results : null;
  const results = pre ?? computeAllPaths(state).paths;

  const filterFn = typeof options.filter === 'function' ? options.filter : () => true;

  const filtered = results.filter(filterFn);
  if (!filtered.length) {
    alert("No paths to export.");
    return;
  }

  // Helpers
  const esc = s => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  // ===== HEADERS =====
  const headPaths  = ['#','Attacker','Chain','Length','Final','Vulnerabilities (summary)'];
  const headDetail = ['Attacker','Step','Target','Final?','Vulnerabilities'];
  const headGraph  = ['Type','Source','Destination'];

  // ===== ROW BUILDERS =====
  const rowsPaths = filtered.map((p, idx) => {
    const chain = p.nodes.map(n => n.name).join(' → ');
    const len = p.nodes.length;
    const finale = len ? p.nodes[len - 1].name : '';
    const vulnSummary = p.vulnsPerNode.map((vs, i) => {
      const n = p.nodes[i]?.name || '?';
      return `[${n}: ${vs?.length ? vs.join(', ') : '—'}]`;
    }).join(' ');
    return [ String(idx+1), p.attackerName || p.attacker || '', chain, String(len), finale, vulnSummary ];
  });

  const rowsDetail = [];
  filtered.forEach(p => {
    p.nodes.forEach((n, i) => {
      const vs = p.vulnsPerNode?.[i] || [];
      rowsDetail.push([
        p.attackerName || p.attacker || '',
        String(i + 1),
        n?.name || '',
        (i === p.nodes.length - 1) ? 'Yes' : 'No',
        vs.length ? vs.join(', ') : '—'
      ]);
    });
  });

  const rowsGraph = [];
  const pushEdges = (type, map) => {
    for (const from in map) {
      const tos = Array.isArray(map[from]) ? map[from] : Array.from(map[from] || []);
      tos.forEach(to => {
        rowsGraph.push([
          type,
          nameOfTarget(state, from),
          nameOfTarget(state, to)
        ]);
      });
    }
  };
  pushEdges('direct',   state.edges?.direct || {});
  pushEdges('lateral',  state.edges?.lateral || {});
  pushEdges('contains', state.edges?.contains || {});

  // ===== STYLE (readability) =====
  const styles = `
  <office:styles>
    <!-- Bold header -->
    <style:style style:name="hdr" style:family="table-cell">
      <style:text-properties fo:font-weight="bold"/>
      <style:table-cell-properties fo:background-color="#0b1730"
        fo:padding-left="0.1cm" fo:padding-right="0.1cm"
        fo:padding-top="0.05cm" fo:padding-bottom="0.05cm"/>
      <style:paragraph-properties fo:margin="0cm"/>
    </style:style>

    <!-- Zebra row styles -->
    <style:style style:name="z1" style:family="table-cell">
      <style:table-cell-properties
        fo:padding-left="0.1cm" fo:padding-right="0.1cm"
        fo:padding-top="0.05cm" fo:padding-bottom="0.05cm"
        style:vertical-align="top"/>
      <style:text-properties fo:font-size="10pt"/>
    </style:style>

    <style:style style:name="z2" style:family="table-cell">
      <style:table-cell-properties
        fo:padding-left="0.1cm" fo:padding-right="0.1cm"
        fo:padding-top="0.05cm" fo:padding-bottom="0.05cm"
        fo:background-color="#0f223f" style:vertical-align="top"/>
      <style:text-properties fo:font-size="10pt"/>
    </style:style>

    <!-- Wrapped text -->
    <style:style style:name="wrap" style:family="table-cell">
      <style:table-cell-properties
        fo:padding-left="0.1cm" fo:padding-right="0.1cm"
        fo:padding-top="0.05cm" fo:padding-bottom="0.05cm"
        style:vertical-align="top"/>
      <style:text-properties fo:font-size="10pt"/>
    </style:style>

    <!-- Column widths -->
    <style:style style:name="colNarrow" style:family="table-column">
      <style:table-column-properties style:column-width="1.2cm"/>
    </style:style>
    <style:style style:name="colMed" style:family="table-column">
      <style:table-column-properties style:column-width="4.2cm"/>
    </style:style>
    <style:style style:name="colWide" style:family="table-column">
      <style:table-column-properties style:column-width="9.5cm"/>
    </style:style>
    <style:style style:name="colXL" style:family="table-column">
      <style:table-column-properties style:column-width="14cm"/>
    </style:style>
  </office:styles>`;

  // ===== XML TABLE UTILS =====
  const mkHeader = heads => `
    <table:table-header-rows>
      <table:table-row>
        ${heads.map(h =>
          `<table:table-cell office:value-type="string" table:style-name="hdr">
             <text:p>${esc(h)}</text:p>
           </table:table-cell>`
        ).join('')}
      </table:table-row>
    </table:table-header-rows>`;

  const mkRow = (cells, zebra=false, wrapIdx=new Set()) => `
    <table:table-row>
      ${cells.map((c,i)=>{
        const style = wrapIdx.has(i) ? 'wrap' : (zebra ? 'z2' : 'z1');
        return `<table:table-cell office:value-type="string" table:style-name="${style}">
                  <text:p>${esc(c)}</text:p>
                </table:table-cell>`;
      }).join('')}
    </table:table-row>`;

  // Columns that should wrap
  const wrapPaths  = new Set([2, 5]); // Chain, Vulnerabilities (summary)
  const wrapDetail = new Set([4]);    // Vulnerabilities
  const wrapGraph  = new Set([]);     // None

  // Build table bodies
  const headerPaths  = mkHeader(headPaths);
  const bodyPaths    = rowsPaths.map((r,i)=> mkRow(r, i%2===1, wrapPaths)).join('');
  const headerDetail = mkHeader(headDetail);
  const bodyDetail   = rowsDetail.map((r,i)=> mkRow(r, i%2===1, wrapDetail)).join('');
  const headerGraph  = mkHeader(headGraph);
  const bodyGraph    = rowsGraph.map((r,i)=> mkRow(r, i%2===1, wrapGraph)).join('');

  // Column layouts
  const colsPaths = `
    <table:table-column table:style-name="colNarrow"/>
    <table:table-column table:style-name="colMed"/>
    <table:table-column table:style-name="colXL"/>
    <table:table-column table:style-name="colNarrow"/>
    <table:table-column table:style-name="colMed"/>
    <table:table-column table:style-name="colXL"/>`;

  const colsDetail = `
    <table:table-column table:style-name="colMed"/>
    <table:table-column table:style-name="colNarrow"/>
    <table:table-column table:style-name="colMed"/>
    <table:table-column table:style-name="colNarrow"/>
    <table:table-column table:style-name="colXL"/>`;

  const colsGraph = `
    <table:table-column table:style-name="colMed"/>
    <table:table-column table:style-name="colMed"/>
    <table:table-column table:style-name="colMed"/>`;

  // ===== ASSEMBLY =====
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document
 xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
 office:version="1.2"
 office:mimetype="application/vnd.oasis.opendocument.spreadsheet">
 ${styles}
 <office:body>
   <office:spreadsheet>

     <!-- Paths sheet -->
     <table:table table:name="Paths">
       ${colsPaths}
       ${headerPaths}
       ${bodyPaths}
     </table:table>

     <!-- Detail sheet -->
     <table:table table:name="Detail">
       ${colsDetail}
       ${headerDetail}
       ${bodyDetail}
     </table:table>

     <!-- Graph sheet -->
     <table:table table:name="Graph">
       ${colsGraph}
       ${headerGraph}
       ${bodyGraph}
     </table:table>

   </office:spreadsheet>
 </office:body>
</office:document>`;

  // ===== DOWNLOAD =====
  const blob = new Blob(
    [xml],
    { type: 'application/vnd.oasis.opendocument.spreadsheet' }
  );
  const filename = `menvuln-export-${new Date().toISOString().replace(/[:.]/g,'-')}.fods`;

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}
