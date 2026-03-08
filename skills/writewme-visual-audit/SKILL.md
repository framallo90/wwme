---
name: writewme-visual-audit
description: Audit WriteWMe UI for overflow, hierarchy, density, visual consistency, and distinctiveness. Use when refining App.css, toolbar/sidebar/layout panels, before release, or when the interface feels generic, cramped, or visually repetitive.
metadata:
  short-description: Visual QA for WriteWMe
---

# Skill: writewme-visual-audit

Professional visual QA for a writing-first product.

## Use When

- The user asks to review or improve visual polish.
- Labels overflow, panels clip, or the interface feels crowded.
- A change touches `src/App.css` or a major UI surface.
- The product needs stronger identity than a generic dashboard.

## Primary Surfaces

- `src/App.css`
- `src/components/TopToolbar.tsx`
- `src/components/Sidebar.tsx`
- `src/components/AIPanel.tsx`
- `src/components/TiptapEditor.tsx`
- `src/components/TimelineView.tsx`
- `src/components/WorldMapView.tsx`
- `src/components/RelationshipGraphView.tsx`
- `src/components/SagaPanel.tsx`

## Workflow

1. Read only the touched surfaces plus `references/visual-checklist.md`.
2. Check viewport ownership first: page scroll, panel scroll, sticky regions, long labels, wrapping, and horizontal escape.
3. Check hierarchy second: what is primary, what is secondary, and what competes with the act of writing.
4. Check distinctiveness third: each major view should look like it serves a different literary job.
5. Check states and density next: active, hover, disabled, empty, loading, and high-density data.
6. If edits are requested, prefer surgical fixes that preserve accessibility and existing behavior.
7. Return findings first, ordered by severity, with file references and the smallest safe fix.

## Output Contract

Always return:

- Findings first, ordered as `critical`, `major`, `minor`.
- File references for each finding.
- Why the issue breaks writer flow, trust, or readability.
- The smallest safe fix, not a vague redesign note.
- `Visual identity wins`: what already works and should be preserved.
- `Residual risks`: what still needs manual UI review in-browser.
- `Next pass`: the most valuable follow-up after current fixes.

## Quality Gates

- No accidental horizontal overflow at 1366px, 1440px, or narrow laptop widths.
- Primary writing actions stay obvious in every main view.
- Dense surfaces degrade by wrapping, collapsing, trimming, or switching mode instead of clipping.
- Major views do not all share the same card treatment and visual weight.
- Focus, hover, active, and disabled states remain clear.

## Notes

- If browser automation or screenshot tools are unavailable, inspect CSS and layout code, then state the manual UI gaps explicitly.
- Push the interface toward a literary atelier, not a generic admin panel.

## References

See `references/visual-checklist.md`.
