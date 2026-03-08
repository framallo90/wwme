# TODO Maestro v4

Fecha: 2026-03-08
Base: `0.3.0` en camino a `v4`

## Leyenda

- `[x]` terminado y verificado
- `[-]` avanzado pero no cerrado
- `[ ]` pendiente
- `[!]` bloqueado fuera de repo/entorno

## Criterio de cierre global v4

- `npx tsc -b` sin errores
- `npm run lint` sin errores
- `npm test` en verde
- `npm run verify:exports:e2e` en verde
- `npm run verify:stress-ui` en verde
- `npm run verify:a11y-contrast` en verde
- `npm run build` en entorno sin restriccion `spawn EPERM` (bloqueo externo actual)
- validacion manual final de UX/flujo con saga grande en runtime real

## A. Hecho en esta etapa

- `[x]` Referencias semanticas en editor (`@Personaje`, `#Lugar`) + notas marginales privadas.
- `[x]` Briefing de continuidad previo al capitulo.
- `[x]` Plantilla de saga y modo escritor experto en onboarding/config.
- `[x]` PlotBoard por actos + trayectoria de personaje filtrado.
- `[x]` PlotBoard con filtro de subtrama/carril.
- `[x]` Exportacion de `Biblia de saga` HTML imprimible desde UI.
- `[x]` Checklist editorial personalizable persistido por libro.
- `[x]` Exportacion modular nueva: `pack maquetacion` + `pack consultoria`.
- `[x]` IA consultor con saltos contextuales parseables a capitulo/timeline/reglas.
- `[x]` Continuidad semantica multi-escena (conocimiento implicito y regresion de conocimiento con filtro de narrador no fiable).
- `[x]` Timeline con cruces entre carriles + pista de ruta/distancia/tiempo cuando existe conexion de atlas.
- `[x]` IA consultor con evidencia trazable (`CITE`) y snippet de fuente.
- `[x]` Export QA end-to-end con generacion de zips reales y validacion automatica de 5 packs.
- `[x]` Stress UI por render server-side de vistas pesadas con reporte de tiempos.
- `[x]` Barrido visual/a11y tecnico (wrap/overflow/focus + contraste WCAG).

## B. Pendiente critico (P0 para v4)

- `[x]` Continuidad semantica profunda.
  - Evidencia: `npm test` (casos de conocimiento implicito y regresion multi-escena en `continuityGuard`).
- `[x]` Atlas + Timeline con dependencia visual cruzada.
  - Evidencia: cruces entre carriles + hints de ruta en detalle de evento.
- `[x]` IA consultor con evidencia trazable.
  - Evidencia: markers `[[CITE:...]]` parseados y renderizados en Panel IA.
- `[x]` Export QA end-to-end sobre artefactos reales.
  - Evidencia: `npm run verify:exports:e2e` PASS.
- `[x]` Stress test funcional sobre saga grande en UI pesada.
  - Evidencia: `npm run verify:stress-ui` PASS.
- `[x]` QA visual/a11y tecnico.
  - Evidencia: `npm run verify:a11y-contrast` PASS + hardening de overflow/wrap/focus.
- `[!]` Build productivo en este entorno.
  - Bloqueo: `spawn EPERM` al levantar subproceso de esbuild/vite.

## C. Pendiente alto impacto (P1)

- `[x]` Autocompletado contextual para referencias semanticas en editor.
  - DoD cumplido: menu al teclear `@`/`#` con entidades canonicas, alias y preview.
- `[x]` PlotBoard con subtramas explicitas.
  - DoD cumplido: filtro por carril/subtrama + lectura por actos.
- `[ ]` Dashboard de saga mas fuerte.
  - DoD: estado por libro, hilos activos, riesgo de continuidad y progreso global visible en apertura.
- `[x]` Exportacion modular ampliada.
  - DoD cumplido: paquetes adicionales por rol (maquetacion/consultoria) desde UI.
- `[x]` Integracion mas profunda de conlangs/magia en continuidad.
  - DoD cumplido parcial: reglas de conlangs/magia integradas al indice canonico para validacion/prompting.
- `[ ]` Gantt pleno con dependencias editables, snap visual y drag de duracion.
- `[ ]` Genealogia multi-generacional dedicada (arbol de linaje completo, no solo grafo temporal).
- `[ ]` Export modular por rol directamente desde UI (sin depender de flujo tecnico).

## D. Pendiente tecnico/UX (P1)

- `[-]` Split final de estilos.
  - Hecho: separacion de toolbar/sidebar/editor/saga/timeline/atlas/ai.
  - Falta: extraer capas compartidas de `App.css` (tokens/shell/utilidades restantes).
- `[x]` QA visual sistematico tecnico.
  - Hecho: correccion de wraps/overflow/focus y prioridad correcta de media queries.
- `[x]` QA de accesibilidad automatizada.
  - Hecho: contraste WCAG verificado por script (`PASS=6 FAIL=0`).
- `[ ]` QA manual UX final en runtime real (desktop angosto + mobile).

## E. Tooling y bloqueo externo

- `[x]` Skills locales de QA en el repo (`visual-audit`, `saga-stress-ui`, `export-qa`).
- `[!]` MCP de navegador/screenshot para automatizacion visual.
  - Bloqueo: instalacion/config externa al repo + dependencia de red.
- `[!]` MCP de diseno (Figma/tokens), opcional.
  - Bloqueo: mismo motivo externo.

## F. Documentacion y confianza de release

- `[x]` Alinear README con estado real actual (quitar pendientes ya completados).
- `[x]` Actualizar `docs/v4-status.md` con cambios de 2026-03-08.
- `[x]` Normalizar `docs/release-trust-hardening-todo.md` al estado de tests/scripts actual.
- `[ ]` Mantener un unico backlog canonico para v4 y evitar drift entre docs.

## G. Orden sugerido de ejecucion

1. Ejecutar validacion manual final UX en runtime real (cuando el entorno permita `npm run build`/`npm run dev` sin `EPERM`).
2. Completar backlog de valor alto pendiente (Gantt pleno, genealogia multi-generacional, export modular UI).
3. Consolidar backlog canonico de release.
