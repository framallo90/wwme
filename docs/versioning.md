# Versioning and Release Notes

## Policy

- Use semantic versioning: `MAJOR.MINOR.PATCH`.
- Bump `MINOR` for user-visible features or workflow changes.
- Bump `PATCH` for bug fixes without feature scope expansion.
- Bump `MAJOR` only for breaking behavior or storage format changes.

## Files to update on each significant release

- `package.json` -> `version`
- `src-tauri/tauri.conf.json` -> `version`
- `src-tauri/Cargo.toml` -> `[package].version`
- `README.md` -> `Version actual`
- `CHANGELOG.md` -> new entry with date + key changes

## Release checklist

1. Run `npm run lint`
2. Run `npx tsc -b`
3. Run `npm run verify:local` when environment allows Rust/Tauri checks
4. Confirm changelog entry
5. Commit with clear release/feture message

## Notes

- Keep changelog entries focused on user-visible impact.
- Document migration or compatibility notes when config/schema evolve.
