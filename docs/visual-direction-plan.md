# WriteWMe Visual Direction Plan

Date: 2026-03-07

## Objective

Move WriteWMe away from "competent writer dashboard" and toward a product that feels like a premium literary workshop: part manuscript desk, part cartographer table, part saga command bridge.

## Direction

Working concept: `Archivo de las Eras`

The interface should feel editorial and intentional, not generic or over-decorated. The logo already gives us a strong base: deep blue authority, pale cyan precision, and warm ivory memory. The product should extend that language into a world of parchment, atlas marks, chronicle bands, and archival labels.

## Design Pillars

1. Editorial gravity
   - The writing surface should feel like a manuscript, not a form.
   - Typography must carry authority and calm.

2. Cartographic intelligence
   - Atlas and timeline should look like tools for worldbuilders, not generic data panes.
   - Layers, routes, eras, and markers should read visually before the user parses labels.

3. Guided focus
   - Dense controls should collapse into modes, shelves, drawers, or grouped bands.
   - The screen should make the next best action obvious.

4. Surface differentiation
   - `Editor`, `Atlas`, `Timeline`, `Saga`, and `IA` must not share the same skin.
   - Repeating the same white rounded card everywhere weakens identity.

## Typography

Current state: system stack in `src/App.css` keeps the app readable but generic.

Recommended direction:

- Display and section titles:
  - `Cormorant Garamond`
  - fallback: `Georgia`
- Interface body:
  - `Source Sans 3`
  - fallback: `Trebuchet MS`, `Segoe UI`
- Code, diff, and evidence blocks:
  - `IBM Plex Mono`
  - fallback: `Consolas`

Rule:

- Serif for narrative gravity.
- Sans for controls and dense metadata.
- Mono only for evidence, diffs, and scripts.

## Color System

Keep the current brand anchors and expand them into role-based tokens:

- Ink navy: `#173862`
- Deep maritime blue: `#214b87`
- Cyan accent: `#79d9ea`
- Pale cyan wash: `#bfeff4`
- Ivory parchment: `#e8d6c0`
- Warm paper: `#f4ede4`
- Brass accent for dividers and chronology marks: `#b89a63`
- Slate shadow: `#22344f`

Rules:

- Use brass sparingly for chronicle markers, atlas scales, and premium emphasis.
- Use cyan as an active signal, not as a blanket highlight.
- Use parchment and warm paper to reduce the "software white card" feeling.

## Layout Changes

### 1. Top toolbar

Problem:

- Too many equal-weight actions.
- Functional, but visually flat.

Target:

- Reframe into four macro modes:
  - `Escritura`
  - `Mundo`
  - `Saga`
  - `Publicacion`
- Keep utility actions (`Nuevo`, `Abrir`, `Preferencias`, `Foco`) visually separate.
- Let the active mode tint the workspace subtly.

### 2. Sidebar and library

Problem:

- Reads like an admin list.

Target:

- Turn book cards into "volumes" or archival entries.
- Make progress, saga membership, and draft state easier to scan.
- Use badges like editorial tabs rather than generic pills.

### 3. Editor

Problem:

- Strong function, weak atmosphere.

Target:

- Manuscript-first composition with quieter utility chrome.
- Page tone or paper wash in focus mode.
- Continuity warnings should feel like discreet margin marks, not alarms.

### 4. Saga panel

Problem:

- It works, but it does not yet look like the command bridge of a seven-book project.

Target:

- Open like a control deck with health bands:
  - canon health
  - timeline pressure
  - unresolved threads
  - pinned laws of the world

### 5. Timeline

Problem:

- Functionality is improving faster than the visual language.

Target:

- Chronicle board, not spreadsheet.
- Era bands, lane headers, and dependency lines should feel like a historical record.
- Duration bars need stronger contrast and grouping by narrative era.

### 6. Atlas

Problem:

- Still risks reading like "panel with map inside."

Target:

- Make it feel like a map table.
- Add scale treatment, legend treatment, and layer controls that resemble cartographic tools.
- Pins and routes should feel authored, not generic.

### 7. IA panel

Problem:

- Too easy to look like a generic assistant widget.

Target:

- Present as a literary consultant desk.
- Separate `Consultor` from `Reescritura` visually and behaviorally.
- Evidence, context visibility, and pinned laws should dominate trust language.

## Immediate Wins

These can raise perceived quality fast without a full rewrite:

1. Split `src/App.css` into tokens, shell, and per-view files.
2. Introduce a real typography pair.
3. Redesign the top toolbar into macro modes.
4. Give `Timeline` and `Atlas` their own visual shells.
5. Reduce repeated card styling across the app.
6. Audit all long labels and narrow-width wraps.

## Near-Term Backlog

### Phase 1: Structural polish

- Token cleanup
- Typographic hierarchy
- Toolbar rewrite
- Scroll ownership audit

### Phase 2: Signature surfaces

- Editor manuscript treatment
- Saga command bridge
- Timeline chronicle styling
- Atlas cartographic styling

### Phase 3: Premium finish

- Motion system with restrained reveals
- Refined empty states
- Export and publication UI that feels professional, not utility-only

## Anti-Patterns To Avoid

- More glassmorphism for its own sake
- One-card-fits-all styling
- Overuse of cyan as decoration
- Decorative textures that reduce legibility
- Replacing hierarchy problems with more icons

## Success Test

If a writer sees screenshots of `Editor`, `Timeline`, and `Atlas`, they should recognize one product with one worldview. It should look built for worldbuilders, not adapted from a generic management tool.
