# 𝕄EN𝕍ULN

## What this app does
This app builds a small graph of **attackers**, **targets**, and **links** (direct, lateral, contains).  
It lets you attach **vulnerabilities** to targets, compute **attack paths** from selected entries to exits, and visualize each path as an SVG diagram.

## How to use
1. **Add data**
   - Add an attacker.
   - Add targets (systems, hosts, apps).
   - Add vulnerabilities (names only).
2. **Assign entry/exit nodes**
   - Select the attacker.
   - Pick one or more **Entries** (where an attack can start).
   - Pick one or more **Exits** (final targets to reach).
3. **Create links**
   - Choose a **source target**, select one or more **destination targets**, choose link **type** (direct/lateral/contains), then add the link.
4. **Set vulnerabilities on targets**
   - Choose a target, select one or more vulnerabilities for it.
5. **Find paths**
   - Click **Find Paths**.
   - Optionally enable **include lateral** / **include contains**.
   - Adjust **Path limit** to cap the number of returned paths. The engine prefers paths with fewer intermediate targets.
6. **View diagrams**
   - Click **Diagram** on a result to render an SVG of that path.
   - Vulnerabilities appear under each target box when enabled.

## Filtering
- **Only vulnerable paths**: show only paths where **every target on the path** (excluding attacker and “Entries” box) has at least one vulnerability.

## Simulation (optional)
- Click **Simulation** to auto-populate a realistic scenario.
- Use the playback bar to **play/pause/stop/restart** and **step** the cursor timeline.
- **Speed** slider changes animation and wait times.

## Export / Import
- **Export ODS**: save the current graph and results to a spreadsheet file.
- **Export JSON**: choose domains to export (attackers, targets, vulns, edges).
- **Import JSON**: merge or wipe selected domains; use a namespace when merging duplicate names.
- **Download SVG**: save the currently displayed path diagram.

## Persistence
- The app stores state in the browser’s local storage.  
- **Reset All** clears attackers, targets, vulnerabilities, links, results, and local storage.

