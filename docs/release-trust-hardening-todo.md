# Release Trust Hardening TODO

> **DEPRECADO.** El backlog canonico unico esta en [`v4-backlog.md`](v4-backlog.md).

Estado actualizado: 2026-03-08

- [x] 1) Refactor `App.tsx` (extraer flujo de auto-aplicado de libro a modulo reutilizable y testeable).
- [x] 2) Reducir falsos positivos NER en `storyBibleSync` para espanol.
- [x] 3) Endurecer `continuityGuard` contra patrones con backtracking costoso.
- [x] 4) Sanitizar export HTML para evitar markup malicioso/corrupto en salida.

## Trust Upgrade (Solicitado 2026-03-06)

- [x] 1) Trust Mode por defecto (`autoApplyChatChanges=false`, `aiSafeMode=true`) y bloqueo de auto-aplicado en scope libro salvo habilitacion explicita.
- [x] 2) Rollback atomico de ultima sesion IA con un clic.
- [x] 3) Tarjeta de cambios en chat para auto-aplicados (antes/despues, alcance, impacto).
- [x] 4) Umbral de riesgo: si expansion/continuidad detectan riesgo alto, forzar aprobacion manual.
- [x] 5) Auditoria persistente + transacciones IA + metricas de confianza (`ai-audit/`, `ai-transactions/`, `trust-metrics.json`).

## Verificacion Blindado (actualizado 2026-03-08)

- [ ] Build verify (`writewme-verify-build`) en sandbox: bloqueado por entorno (`spawn EPERM` al iniciar subprocesos/esbuild).
- [x] Build en host real: PASS reportado en entorno local de usuario (2026-03-08).
- [x] Ollama: PASS por skill (`verify_ollama.py`) con modelo `llama3.2:3b`.
- [x] Integridad de ejemplos: PASS con `node scripts/verify_examples.mjs` en `examples/demo-book` y `examples/novela-el-faro-y-la-niebla`.
- [x] `scripts/verify_ollama.py` y `scripts/verify_book.py` alineados con skills/documentacion del repo.
- [x] Unit tests (`npm run test`): PASS (89 tests).
- [x] Export QA E2E (`npm run verify:exports:e2e`): PASS (5 packs reales generados y validados).
- [x] Stress UI (`npm run verify:stress-ui`): PASS (reporte JSON en `reports/stress-ui/...`).
- [x] A11y contraste (`npm run verify:a11y-contrast`): PASS (WCAG, 6/6).

## Auditoria v0.3.0 - Fixes Inmediatos (2026-03-06)

- [x] 1) `PlotBoardView`: agregar categoria `timeskip` al filtro de categorias.
- [x] 2) `OutlineView`: reemplazar `defaultValue` por inputs controlados para `POV` y `Posicion`.
- [x] 3) `characterTracking`: incluir `SagaWorldBible` (nombres + aliases + aliasTimeline) en el rastreo.
- [x] 4) Restaurar sesion al abrir libro (`activeChapterId` + `mainView`) usando `localStorage`.

## Canon + Apocrifo (Solicitado 2026-03-06)

- [x] 1) Agregar `canonStatus` en tipos de StoryBible/Saga y normalizacion backward-compatible en `storage.ts`.
- [x] 2) Exponer control de estado (`Canonico` / `Apocrifo`) + accion `Canonizar` en StoryBible y SagaPanel.
- [x] 3) Construir indice unificado StoryBible+Saga canonica para continuidad/editor y contexto IA.
- [x] 4) Validar flujo completo con pruebas automaticas y checklist tecnico.

### Verificacion Canon/Apocrifo (2026-03-06)

- [x] `npx tsc -b`: PASS.
- [x] `npm run lint`: PASS.
- [x] `npm run test`: PASS (89 tests).
- [ ] `npm run build`: bloqueado por entorno (`spawn EPERM` al iniciar worker de esbuild).
