---
name: writewme-saga-stress-ui
description: Stress-test WriteWMe UI and data builders for large sagas. Use when timeline, atlas, relationship graph, continuity, or export flows may degrade with many books, chapters, entities, routes, and events.
metadata:
  short-description: Stress UI for large sagas
---

# Skill: writewme-saga-stress-ui

Stress-test saga-heavy surfaces with performance and readability in the same pass.

## Use When

- Large saga readability or performance is in doubt.
- A change touches `TimelineView`, `WorldMapView`, `RelationshipGraphView`, `continuityGuard`, or export flows.
- The user reports slowness, clutter, or trust loss on dense projects.
- You are hardening a release candidate for serious long-form work.

## Core Rule

Measure compute cost and legibility together. Fast but unreadable still fails.

## Primary Surfaces

- `scripts/stress_saga.mjs`
- `tests/unit/suite.ts`
- `src/lib/continuityGuard.ts`
- `src/lib/sagaConsistency.ts`
- `src/lib/relationshipGraph.ts`
- `src/lib/worldMap.ts`
- `src/components/TimelineView.tsx`
- `src/components/WorldMapView.tsx`
- `src/components/RelationshipGraphView.tsx`

## Workflow

1. Start from the current baseline. Run `node scripts/stress_saga.mjs` when available.
2. If a visual view degrades, inspect the builder or reducer layer before changing the component.
3. Check three axes together:
   - compute cost
   - visible density
   - degraded-mode readability
4. Prefer guardrails such as trimming, clustering, grouping, focus mode, staged rendering, or narrowed summaries.
5. Add or update unit tests for the builder or reducer that protects the fix.
6. If browser automation is unavailable, state the manual UI gap instead of pretending the surface was fully exercised.

## Output Contract

Always return:

- Bottlenecks ordered by severity.
- Dataset size or scenario.
- Measured result or clear inference.
- Fix order.
- Residual risk, especially where only code inspection was possible.

## Quality Gates

- Overview modes do not explode into unreadable node or bar counts.
- Large saga views offer a way to focus, trim, or group content.
- Stress baselines do not regress by more than 20 percent without explanation.
- Export packs complete without missing required data.
- Continuity or consistency passes expose evidence instead of black-box conclusions.

## Notes

- Do not add optimization by reflex. Follow repo patterns and prefer clarity when a simple guardrail solves the actual failure mode.
- A smaller visible subset with a clear mode switch is usually better than rendering everything.

## References

See `references/stress-targets.md`.
