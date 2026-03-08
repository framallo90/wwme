# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

Linea de trabajo actual: camino a `v4` (sin bump de version todavia).

### Added
- Rebrand visual con `wwme-logo-2.0`: wordmark transparente en UI, favicon nuevo e iconos Tauri regenerados.
- Amazon/KDP validation module with readiness score, field-level errors/warnings and local category catalog checks.
- Amazon metadata CSV export and validation report export in the bundle flow.
- Local operations guide with command reference and verification report locations (`docs/operacion-local.md`).
- Saga planner with shared `saga.json`, library indexing for sagas, linked books and global world bible editing.
- Dedicated `Timeline` view for saga chronology with filters by book and character plus per-event detail.
- Practical guide for daily saga/timeline usage (`docs/saga-timeline-guia.md`).
- Plot board for saga arc reading with narrative stage labels, category summaries and character-focused filtering.
- Relationship graph view for world entities plus logical atlas view for locations, routes and connections.
- Scratchpad / banco de ideas view for fragments that should not enter manuscript or canon.
- Focus mode for writing with both side panels collapsed.
- Semantic milestone labels in version diff/history instead of raw version-only navigation.
- AI context visibility card with scoped counts and preview of pinned saga rules.
- Pinned AI rules in saga world bible so critical constraints are always injected into prompts.
- Canon / apocryphal state controls in story bible and saga data.
- AI trust hardening: safe mode by default, change review modal, rollback of last AI session, audit trail and transaction recovery.
- Chat persistence split into `/chats/` files (`book.json` + per-chapter JSON) with backward-compatible migration from legacy `book.json`.
- Optional IA continuity guard (`continuityGuardEnabled`) with Settings toggle and prompt/parser support for PASS/FAIL continuity checks before save.
- Ollama health check integrated in-app (`Settings` + `Panel IA`) with model presence detection.
- Timeline visual scale with clickable markers and largest-gap surfacing for saga chronology review.
- Atlas visual con mapa base cargable, capas, pines vinculados a lugares y rutas medibles.
- Timeline multirriel con carriles persistentes para linea principal, historia antigua, flashbacks y futuros posibles.
- Constructor base de conlangs y modulo de sistemas de magia/poder dentro de saga.
- Verificadores reales `scripts/verify_book.py` y `scripts/verify_ollama.py`, mas un stress script de saga sintetica.
- Importacion asistida de pines para atlas, snapping de rutas sobre el mapa y paquetes modulares por rol (`cartografo`, `editor`, `cronologia`).
- Timeline con lectura tipo Gantt, dependencias explicitas entre eventos y genealogia multigeneracional por contexto temporal.
- Grafo de relaciones reforzado con recorte de panorama, foco por vecindad y builder reutilizable para sagas densas.

### Changed
- Saga characters now support temporal aliases and lifecycle anchors (birth, first appearance, last known event, death).
- Saga AI context now includes global saga lore and canonical timeline data when the active book is linked.
- Strict saga mode now behaves as editorial guidance: it warns strongly and protects final exports, but no longer blocks saving the saga draft.
- Timeline y relaciones de saga ahora soportan vigencia temporal para genealogias, alianzas y lecturas dinasticas por momento cronologico.
- Panel IA ahora separa `Modo reescritura` de `Modo consultor`, con prompts analiticos trazables para mundo, tono, economia, politica y reglas.
- Continuity guard ahora devuelve evidencia trazable y suma reglas semanticas basadas en conocimiento adelantado, no solo alias literales.
- Exportacion interior gana control de viudas/huerfanas, capitular opcional y ornamento configurable para saltos de escena.
- Project documentation was updated to reflect sagas, canonical timeline usage and storage layout.
- Product docs now track the route from `0.3.0` to the future `v4`, separating implemented scope from pending scope.
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
- Settings now exposes autosave as continuous behavior and explains `Ctrl+S` as immediate flush, not mandatory save.
- Help and saga documentation now surface existing saga visualizations (`Timeline`, `Relaciones`, `Atlas`, `Plot`) instead of describing them as future work.
- Backups now create timestamped snapshots with manifest metadata and include linked saga content when available.

### Fixed
- Prevented crashes in language panel when legacy/malformed config arrives with missing language values.
- Eliminated split language-update flow to avoid state desynchronization between base language and Amazon metadata.
- Cover/Back-cover/Logo image render paths now include visual fallback when an asset URL fails to load.
- Cover/Preview components now consume pre-resolved image URLs from `App.tsx` (no double `convertFileSrc` conversion).
- Search/replace now treats replacement text literally, preventing `$` token expansion side effects.
- Autosave now uses timeout-guarded writes so a stalled I/O operation does not lock saves indefinitely.
- Editor sync avoids `setContent` while focused to reduce cursor jumps during active typing.
- Settings panel props and numeric input typing were aligned with `App.tsx` (backup handlers + strict TS compatibility).
- Backup flow now avoids reusing a single folder target and blocks recursive backup destinations inside the book/saga source path.

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
