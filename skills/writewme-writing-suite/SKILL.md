# Skill: writewme-writing-suite

End-to-end orchestrator for professional fiction production in WriteWMe.

## Use When

- The user wants a full workflow from concept to release-ready package.
- The user asks for "continue", "next step", or production planning.
- A project needs coordinated drafting, revision, and KDP preflight.

## Sub-Skills Order

1. `writewme-storycraft-pro`
2. `writewme-editorial-qa`
3. `writewme-kdp-production`
4. `writewme-export-qa`
5. `writewme-visual-audit`
6. `writewme-saga-stress-ui`

## Execution Contract

1. Run storycraft for planning/drafting artifacts.
2. Run editorial QA passes and close critical findings.
3. Run KDP production preflight and return go/no-go.
4. Run export QA when role-specific bundles or release exports changed.
5. Run visual audit when UI or navigation changed.
6. Run saga stress when scale, timeline, atlas, or relation views changed.

## Output Contract

- Current phase and completed checklist items.
- Blocking issues with fix order.
- Next action with expected improvement and why it matters.

## Quality Rule

Do not move to the next phase while critical blockers remain in the current phase.
