# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added
- Amazon/KDP validation module with readiness score, field-level errors/warnings and local category catalog checks.
- Amazon metadata CSV export and validation report export in the bundle flow.
- Local operations guide with command reference and verification report locations (`docs/operacion-local.md`).
- Chat persistence split into `/chats/` files (`book.json` + per-chapter JSON) with backward-compatible migration from legacy `book.json`.

### Changed
- Language workflow is now synchronized between `config.json` and `book.json` (Amazon language).
- Language input accepts ISO regional formats like `pt-BR`, `es-MX`, `en-US`.
- Language panel UX now includes dirty-state save enablement and save feedback states.
- Snapshot files now store lightweight chapter payloads (HTML + `contentJson: null`) to reduce version storage footprint.

### Fixed
- Prevented crashes in language panel when legacy/malformed config arrives with missing language values.
- Eliminated split language-update flow to avoid state desynchronization between base language and Amazon metadata.

## [0.2.0] - 2026-02-25

### Added
- Dedicated `Idioma` tab to choose and persist app writing language per book (`config.json`).
- Language-aware AI prompting across chat, quick actions, auto-rewrite and continuous agent flows.
- Product documentation baseline for release/version governance.

### Improved
- Documentation references for release history and versioning process in `README.md`.

## [0.1.0] - 2026-02-24

### Added
- Core offline book editor with local storage by folders/files.
- TipTap editor, chapter management, AI panel with Ollama integration.
- Cover/back cover management, Amazon section, exports, snapshots and undo basics.
- Library management, preview mode, accessibility settings and build verification scripts.
