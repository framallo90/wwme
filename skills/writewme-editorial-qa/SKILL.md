# Skill: writewme-editorial-qa

Professional editorial quality assurance for fiction manuscripts.

## Use When

- The user requests revision, proofreading, or style improvements.
- A chapter feels flat, repetitive, or inconsistent.
- Localization quality is required (`es-ES`, `es-MX`, `en-US`, etc.).

## Core Principle

Edit in ordered passes. Never mix all edits at once.

## Required Inputs

- Full text or selected chapters.
- Target locale and tone.
- Priority (clarity, pacing, voice, grammar, market readiness).

## Pass Sequence

1. Pass 1 - Structural QA
   - Check plot logic, chapter purpose, scene ordering.
   - Flag missing setup/payoff links.

2. Pass 2 - Narrative QA
   - Check POV drift, tense consistency, and pacing rhythm.
   - Confirm each scene changes narrative state.

3. Pass 3 - Voice and Dialogue QA
   - Detect generic dialogue and same-voice characters.
   - Align dialogue diction with character profile.

4. Pass 4 - Line Edit QA
   - Remove redundancy and vague verbs.
   - Tighten sentence clarity and paragraph flow.

5. Pass 5 - Language and Locale QA
   - Validate orthography and punctuation.
   - Flag region-specific wording risks for target locale.

6. Pass 6 - Proof QA
   - Final typo and formatting pass only after prior passes are approved.

## Output Contract

Always return:

- Findings sorted by severity: critical, major, minor.
- Chapter/section references for each issue.
- Suggested edits (minimal and safe).
- Residual risks list (what still needs human validation).

## High-Risk Checks

- Regex replacement corruption:
  - If replacing text with `$` in JS-style replacement engines, escape replacement strings or use callback replacement.
- Numeric locale mismatch:
  - Inputs like `4,50` can be parsed incorrectly by strict dot-decimal parsers.
- Silent config corruption:
  - Reject `NaN` before persisting numeric settings.

## Quality Gates

- No unresolved critical issues.
- No contradictory facts across chapters.
- Locale-sensitive terms reviewed for target market.
- Repetition hotspots reduced below user-defined threshold.

## References

See: `references/pro_sources.md`
