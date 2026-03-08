---
name: writewme-export-qa
description: Validate WriteWMe export bundles for editor, cartographer, and historian workflows. Use when export code changes, before release, after adding role-specific packs, or when exported ZIP/TXT/DOCX/EPUB outputs may be incomplete, malformed, or missing expected files.
---

# Skill: writewme-export-qa

QA for WriteWMe exports with focus on role-specific deliverables.

## Core Targets

- `src/lib/export.ts`
- `scripts/verify_export_packs.mjs`
- `src/components/Sidebar.tsx`
- `src/components/AmazonPanel.tsx`
- `tests/unit/suite.ts`

## Workflow

1. If export builders changed, inspect `src/lib/export.ts` first.
2. For ZIP role packs, run `node scripts/verify_export_packs.mjs <pack.zip>` or specify `--kind`.
3. For code-only validation, run the unit suite and verify pack structure tests.
4. Check three things together:
   - expected files exist
   - machine-readable files parse
   - human-facing notes/manuscript files still match the role intent
5. If a pack fails, fix the archive builder before touching UI labels.
6. Report the exact missing or malformed artifact, not a vague export failure.

## Output Contract

Always return:

- Failing export kind
- Missing or malformed entries
- File reference for the builder responsible
- Smallest safe fix
- Residual risk if the export was not generated in a full app run

## Quality Gates

- Cartographer pack contains atlas config, layers, locations, pins, routes, and notes.
- Historian pack contains timeline, secrets, and a readable chronicle summary.
- Editorial pack contains manuscript, context, and machine-readable metadata.
- Export labels in UI still match the actual artifact contents.

## References

See `references/export-checklist.md`.
