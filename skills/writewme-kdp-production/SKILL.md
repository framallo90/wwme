# Skill: writewme-kdp-production

Production checklist for preparing fiction projects for Amazon KDP publication.

## Use When

- The user is preparing release assets (cover, metadata, export).
- The user needs to validate language-market-price consistency.
- The user asks for KDP-safe preflight before upload.

## Core Principle

Do not treat publishing as a single export click. Run structured preflight checks.

## Required Inputs

- Target formats: ebook, paperback, hardcover.
- Target marketplaces (for example `amazon.com`, `amazon.es`, `amazon.com.mx`).
- Primary language and localization variant.
- Cover/front/back assets and metadata text.

## Workflow

1. Format Decision
   - Confirm which formats are shipping now vs later.
   - For print formats, require trim size and estimated page count.

2. Cover Preflight
   - Ebook cover:
     - Validate ratio and minimum dimensions.
     - Validate file format and practical file size.
   - Print wrap cover:
     - Require KDP Cover Calculator output for exact template dimensions.

3. Metadata QA
   - Verify title/subtitle consistency across files.
   - Check language-market alignment.
   - Flag if language changed but market/pricing review was skipped.

4. Pricing and Market QA
   - Ensure each target market has explicit pricing review.
   - Flag psychologically odd converted prices for manual confirmation.

5. Final Publish Gate
   - No missing cover files.
   - No unresolved metadata conflicts.
   - No unresolved language-market warnings.

## Output Contract

- Preflight report with:
  - Passed checks
  - Blocking issues
  - Recommended fixes in execution order
- Final go/no-go recommendation.

## Amazon Cover Recommendations To Show In UI

When user uploads a cover, proactively show:

- "Recommended Kindle cover ratio: 1.6:1"
- "Recommended size example: 1600 x 2560 px or larger"
- "Minimum accepted: 1000 x 625 px"
- "Preferred file: JPG (RGB)"

For print cover:

- "Use KDP Cover Calculator template based on trim size and page count."

## References

See: `references/pro_sources.md`
