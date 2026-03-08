# Visual Checklist

Use this checklist after opening only the surfaces relevant to the task.

## Table of Contents

1. Viewport matrix
2. Overflow and scroll ownership
3. Hierarchy and density
4. Distinctive identity
5. Screen-specific prompts
6. Report shape

## 1. Viewport Matrix

Check at least these widths in code review or manual UI review:

- 1366x768
- 1440x900
- 1536x864
- 1728x1117

If a panel is likely to live inside a split layout, also inspect the narrowed state mentally or in-browser.

## 2. Overflow and Scroll Ownership

Ask these questions first:

- Which container owns the scroll?
- Does a sticky header or footer hide content behind it?
- Do long button labels wrap cleanly?
- Can chips, pills, or counters force horizontal overflow?
- Are side panels allowed to grow beyond viewport height?
- Is any text clipped instead of wrapping?

Immediate failures:

- Controls leaving the viewport.
- Nested scrollbars fighting each other.
- Horizontal scroll on a surface that should behave like a document.

## 3. Hierarchy and Density

Ask:

- What is the main action on this screen?
- What should the writer notice in the first two seconds?
- Which controls are noisy but low value?
- Are there too many equal-weight buttons?
- Does spacing tell the user what belongs together?

Immediate failures:

- Toolbar actions all feel equally important.
- The editor competes with utility panels instead of leading.
- Dense data views show everything at once with no focus mode.

## 4. Distinctive Identity

WriteWMe should feel like a literary workshop with cartographic tools.

Ask:

- Does this surface look unique to its job?
- Does `Timeline` feel different from `Atlas` and `Saga`?
- Are we repeating the same white rounded card everywhere?
- Does typography carry any editorial weight?
- Does the surface feel premium or merely functional?

Immediate failures:

- Every panel uses the same card shell, spacing, and contrast.
- All views feel like variations of a settings page.
- The color system exists, but the interface still feels generic.

## 5. Screen-Specific Prompts

### Top Toolbar

- Can actions be grouped into macro modes instead of a flat ribbon?
- Are destructive and frequent actions clearly separated?
- Can long labels survive translation and narrow widths?

### Sidebar

- Does the library feel like a live archive instead of a generic list?
- Are book states, badges, and actions easy to scan?

### Editor

- Does the manuscript dominate?
- Are support controls quiet until needed?
- Does focus mode stay visually calm?

### AI Panel

- Do quick actions wrap safely?
- Is consultor mode clearly distinct from rewrite mode?
- Does evidence or context visibility feel trustworthy?

### Timeline

- Can multiple lanes remain readable without visual collapse?
- Are durations, dependencies, and era boundaries legible?

### Atlas

- Do pins, layers, and routes remain clickable under density?
- Does the surface read like a map table, not just another panel?

### Relationship Graph

- Does overview trim aggressively enough?
- Does focus mode preserve context without exploding node count?

## 6. Report Shape

Return:

- Findings ordered by severity.
- The visible symptom.
- The likely root cause in layout or CSS.
- The smallest safe fix.
- One follow-up pass that would meaningfully raise product quality.
