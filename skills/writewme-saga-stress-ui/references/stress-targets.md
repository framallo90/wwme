# Stress Targets

Use these targets to reason about "serious saga" scale.

## Table of Contents

1. Dataset tiers
2. Surface checks
3. Failure signals
4. Preferred mitigation patterns
5. Reporting notes

## 1. Dataset Tiers

Treat these as working targets for stress reasoning:

### Medium saga

- 4 books
- 60 chapters
- 80 characters
- 180 relationships
- 120 locations
- 200 timeline events
- 80 routes

### Large saga

- 7 books
- 140 chapters
- 200 characters
- 800 relationships
- 500 locations
- 1000 timeline events
- 400 routes

### Extreme saga

- 10 books
- 240 chapters
- 400 characters
- 2000 relationships
- 1000 locations
- 2500 timeline events
- 1000 routes

## 2. Surface Checks

### Timeline

- Lanes remain readable without forcing uncontrolled horizontal scroll.
- Durations and dependencies are still understandable at large counts.
- Era grouping or collapse options prevent visual noise.

### Atlas

- Pins do not become unclickable at density.
- Layers remain filterable.
- Routes snap or simplify instead of turning into visual static.

### Relationship graph

- Overview mode trims or ranks nodes aggressively.
- Focus mode preserves the selected character and direct context.
- Dense dynastic data does not produce a useless hairball.

### Continuity and consistency

- Findings remain evidence-based.
- Expensive checks can be narrowed or scoped.
- Output stays reviewable by a human editor.

### Export packs

- Role-specific bundles still complete under large projects.
- Large supporting data does not silently disappear from exports.

## 3. Failure Signals

Flag as high risk when:

- Rendered density makes the view unreadable even if timing is acceptable.
- Overview tries to show everything at once.
- Builders produce large intermediate sets that the UI does not need.
- A fix improves timing but removes trust or traceability.

## 4. Preferred Mitigation Patterns

Prefer:

- ranked trimming in overview mode
- neighborhood or focus mode around the active entity
- collapse by era, lane, family branch, or layer
- clustering or snapping for dense atlas data
- staged rendering for expensive supporting detail
- export packaging by role instead of one giant output

Avoid:

- rendering the full set "because the data exists"
- adding complexity when a visibility cap would solve the problem
- hiding failures behind optimistic summaries

## 5. Reporting Notes

When exact timings are unavailable, be explicit:

- say what was measured
- say what was inferred from code structure
- state what still needs a browser-level stress pass
