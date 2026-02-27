# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added
- Amazon/KDP validation module with readiness score, field-level errors/warnings and local category catalog checks.
- Amazon metadata CSV export and validation report export in the bundle flow.
- Local operations guide with command reference and verification report locations (`docs/operacion-local.md`).
- Chat persistence split into `/chats/` files (`book.json` + per-chapter JSON) with backward-compatible migration from legacy `book.json`.
- Optional IA continuity guard (`continuityGuardEnabled`) with Settings toggle and prompt/parser support for PASS/FAIL continuity checks before save.

### Changed
- Language workflow is now synchronized between `config.json` and `book.json` (Amazon language).
- Language input accepts ISO regional formats like `pt-BR`, `es-MX`, `en-US`.
- Language panel UX now includes dirty-state save enablement and save feedback states.
- Language panel now warns when selected language appears inconsistent with Amazon marketplace locale.
- Config loading now inherits language from `book.json` (`amazon.language`) when `config.json` has no explicit `language`.
- Snapshot files now store lightweight chapter payloads (HTML + `contentJson: null`) to reduce version storage footprint.
- AI mutation flows (quick actions + chat auto-apply chapter/book) now run the continuity guard before persisting chapter files when enabled.
- Startup optimization: `AIPanel` moved to lazy chunk and deferred until a book is open.
- Startup optimization: export module (`lib/export`) is now dynamically imported per export action instead of loading at boot.
- Startup optimization (I/O): opening a book no longer rewrites every chapter/chat file by default; it only persists when normalization/migration is needed.
- Startup optimization (I/O): chat histories are now loaded/saved per scope (`book` or chapter) on demand instead of hydrating all chats at open.
- Language UX: added pricing-review warning + direct shortcut to Amazon panel when pricing marketplaces conflict with the active language.
- Numeric form parsing now tolerates locale input (`,` and `.`) and clamps invalid values to safe ranges in Settings/Amazon.
- Search/replace over full book now yields periodically to the browser loop to reduce UI freeze risk on large manuscripts.

### Fixed
- Prevented crashes in language panel when legacy/malformed config arrives with missing language values.
- Eliminated split language-update flow to avoid state desynchronization between base language and Amazon metadata.
- Cover/Back-cover/Logo image render paths now include visual fallback when an asset URL fails to load.
- Cover/Preview components now consume pre-resolved image URLs from `App.tsx` (no double `convertFileSrc` conversion).
- Search/replace now treats replacement text literally, preventing `$` token expansion side effects.
- Autosave now uses timeout-guarded writes so a stalled I/O operation does not lock saves indefinitely.
- Editor sync avoids `setContent` while focused to reduce cursor jumps during active typing.
- Settings panel props and numeric input typing were aligned with `App.tsx` (backup handlers + strict TS compatibility).

## [0.3.0] - 2026-02-27

### Added
- Lectura en voz alta del capitulo activo con la voz del idioma configurado.
- Exportacion de audio WAV por capitulo y audiolibro WAV completo usando voces del sistema en Windows.
- Ajustes de voz preferida, velocidad y volumen para lectura y exportacion.

### Changed
- El editor expone controles directos para leer, pausar, reanudar, detener y exportar audio.
- La barra lateral incorpora exportacion de audiolibro junto al resto de salidas editoriales.

### Fixed
- El modal de renombrado ya no se cierra al arrastrar para seleccionar texto.
- Los paneles laterales pueden contraerse de forma independiente para concentrarse en el texto.
- El panel IA evita superposiciones visuales entre chat y biblioteca de prompts.

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
