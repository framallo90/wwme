# Tooling Review

Date: 2026-03-07

## Scope

Review the current skills, MCPs, and practical "superpowers" available for building WriteWMe, with emphasis on visual quality and product hardening.

## Current Useful Setup

### Codex skills already relevant

Global skills already installed and useful for this repo:

- `writewme-verify-book`
- `writewme-verify-build`
- `writewme-verify-ollama`
- `writewme-verify-suite`

Repo-local skills already present and useful for product work:

- `.codex/skills/writewme-editorial-qa`
- `.codex/skills/writewme-storycraft-pro`
- `.codex/skills/writewme-writing-suite`
- `.codex/skills/writewme-kdp-production`

Portable skill packages added in this pass:

- `skills/writewme-visual-audit`
- `skills/writewme-saga-stress-ui`

### Claude MCPs currently configured

From `C:/Users/Sergio/.claude/settings.json`:

- `context7`
- `memory`
- `sequential-thinking`
- `desktop-commander`

These are a good base for:

- framework and docs lookup
- project memory across sessions
- structured reasoning
- local file and command work

## Superpowers: Practical Reading

No separate "superpowers" registry was found in `C:/Users/Sergio/.codex/config.toml`.

In practice, the current superpowers are:

- local verification skills
- repo-local writing and QA skills
- the configured MCP stack in Claude

That setup is enough for engineering and editorial logic. It is not yet ideal for visual refinement.

## Gaps That Matter Now

### 1. Browser screenshot or Playwright-style MCP

Highest-value missing capability for design work.

Why it matters:

- real screenshot QA
- viewport regression checks
- overflow confirmation
- interaction-state capture

Current limitation:

- this environment is network-restricted, so remote discovery or installation was not possible in this pass

### 2. Figma or design-token MCP

Useful only if the product will maintain a formal visual system outside code.

Why it matters:

- token consistency
- faster iteration on distinct visual language
- easier handoff between design intent and implementation

### 3. Dedicated visual and stress workflows

Addressed locally in this pass through:

- `skills/writewme-visual-audit`
- `skills/writewme-saga-stress-ui`

## Tools To Keep, Ignore, or Revisit

### Keep

- `context7`
- `memory`
- `sequential-thinking`
- `desktop-commander`
- all `writewme-verify-*` skills

### Ignore for this product

- `wa-bot-content`
- `wa-bot-smoke`

They are unrelated to WriteWMe.

### Revisit

`C:/Users/Sergio/.claude/plugins/blocklist.json` currently blocks:

- `code-review@claude-plugins-official`
- `fizz@testmkt-marketplace`

Only revisit if those blocks were accidental. Neither is required for the current plan.

## What Can Be Improved In The Product Right Now

### Visual system

- Split `src/App.css` into smaller files by tokens, shell, and view families.
- Replace the current generic system typography with a deliberate serif + sans pairing.
- Rebuild the top toolbar around macro modes instead of a flat ribbon of actions.
- Give `Editor`, `Timeline`, `Atlas`, `Saga`, and `IA` visibly different surface languages.

### Visual QA discipline

- Make overflow and wrap checks mandatory on any UI-heavy change.
- Treat narrow laptop widths as first-class, not edge cases.
- Stop shipping panels that rely on hope instead of scroll ownership.

### Product trust

- Keep continuity evidence visible.
- Continue hardening relationship graph and timeline stress behavior.
- Add browser-level stress passes when a screenshot/browser MCP is available.

### Architecture for faster design work

- Reduce the amount of styling concentrated in `src/App.css`.
- Promote tokens and per-surface classes so redesigns do not become global surgery.

## Recommendation

Short term:

1. Use the new portable skills for every meaningful UI or scale pass.
2. Execute the visual direction in `docs/visual-direction-plan.md`.
3. Prioritize a browser screenshot MCP as the next external capability to add.

Medium term:

1. Turn the top toolbar into macro modes.
2. Give `Timeline` and `Atlas` their own signature shells.
3. Run a visual audit after each of those rewrites.

The immediate problem is not missing raw engineering power. The immediate problem is that the product still looks more generic than it should for the sophistication it already contains.
