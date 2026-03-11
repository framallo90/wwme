# Backlog canonico v4

Documento unico de referencia. Reemplaza `v4-status.md`, `todo-v4-visual-qa.md` y `release-trust-hardening-todo.md`.

Fecha: 2026-03-09.
Base publicada: `0.4.0`.

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
- `npm run build` validado en host real
- Validacion manual final de UX/flujo con saga grande en runtime real

---

## A. Completado

### Mundo, saga y continuidad
- [x] SagaPanel con saga.json, biblioteca de sagas y libros por volumen.
- [x] Biblia global (personajes, lugares, facciones, sistemas, artefactos, flora, fauna, rutas).
- [x] Timeline canonica con Gantt, dependencias, cruces entre carriles, flechas visuales.
- [x] Gantt con drag directo de barras (mover + resize) y snap por dependencias.
- [x] Genealogia multigeneracional con layout de arbol vertical, conectores, raiz navegable y profundidad 2-8.
- [x] Dashboard de saga con estado por libro, hilos activos, riesgo de continuidad y accesos rapidos.
- [x] Plot para arcos narrativos + filtro por subtrama/carril.
- [x] Relaciones con modos Panorama y Vecindad.
- [x] Atlas visual con mapa, capas, pines, importacion asistida con diagnostico y rutas medibles.
- [x] Carriles temporales, relaciones con vigencia, conlangs y sistemas de magia.
- [x] Estado Canonico/Apocrifo en biblia y saga.
- [x] Modo estricto editorial sin bloquear guardado.

### Escritura y flujo diario
- [x] Banco de ideas / Recortes.
- [x] Modo foco.
- [x] Comparador de versiones con etiquetas de hitos + restauracion directa desde diff.
- [x] Referencias semanticas en editor + autocompletado contextual (@Personaje, #Lugar).
- [x] Notas al margen privadas por capitulo.
- [x] Analisis de estilo.
- [x] Seguimiento de personaje y resumen por rango de capitulos.
- [x] Lectura en voz alta y exportacion WAV.

### IA local y confianza
- [x] Salud de Ollama visible.
- [x] Contexto visible en Panel IA.
- [x] Modo Consultor separado de Reescritura.
- [x] aiSafeMode y revision manual de riesgo alto.
- [x] Modal de revision de cambios.
- [x] Rollback de ultima sesion IA.
- [x] Auditoria local, transacciones IA y metricas de confianza.
- [x] Guard de continuidad con menciones semanticas, conocimiento adelantado, narrador no fiable, inconsistencia material.
- [x] Saltos contextuales en chat consultor.
- [x] Verificadores verify_book.py y verify_ollama.py.
- [x] IA consultor con evidencia trazable (CITE) y snippet de fuente.

### Editorial, exportacion y operacion
- [x] DOCX (con bold/italic/headings/blockquotes), EPUB, Markdown, HTML KDP, pack Amazon.
- [x] Paquetes por rol: cartografo, editor, cronologia, maquetacion, consultoria.
- [x] Exportacion por rol en lote desde UI.
- [x] Validacion Amazon/KDP con readiness score.
- [x] Maquetacion interior con viudas/huerfanas, capitular, ornamento.
- [x] Sincronizacion de idioma.
- [x] Backups con manifest + saga vinculada. Backup obligatorio en onboarding.
- [x] Lazy-load de modales pesados.
- [x] Guia operativa y verificadores automatizados.

### Calidad y tooling
- [x] Export QA E2E (5 packs reales).
- [x] Stress UI en vistas pesadas.
- [x] A11y contraste WCAG (6/6).
- [x] Barrido visual/a11y tecnico (wrap/overflow/focus).
- [x] Visual QA E2E automatizado (`verify:visual-qa`: stress + contraste + auditoria CSS + export tokens).
- [x] Auditoria de colores hardcodeados (`audit:css-tokens`) con reporte JSON versionable.
- [x] Export de design tokens JSON (`design:tokens`) listo para integracion externa.
- [x] Trust hardening: autoApply bloqueado, rollback atomico, umbral de riesgo, auditoria.
- [x] Canon/Apocrifo con indice unificado.
- [x] Build en host real: PASS.
- [x] Unit tests: PASS (89+).

### Confiabilidad operativa (cerrado en reevaluacion)
- [x] Cierre seguro de ventana: `beforeunload` + `onCloseRequested` + `persistBookBeforeClose`.
- [x] Cierre de libro con confirmacion si falla la persistencia final.
- [x] Confirmacion de borrado en Story Bible para personaje/lugar/secreto.

### Arquitectura CSS
- [x] Separacion de toolbar/sidebar/editor/saga/timeline/atlas/ai en archivos propios.
- [x] Extraccion de tokens, reset y shell layout a tokens.css y shell.css.
- [x] Tokenizacion adicional de colores en paneles criticos (toolbar/sidebar/ai/editor/timeline/atlas/saga).

### Identidad visual
- [x] Logo wwme-logo-2.0, wordmark, favicon, paleta alineada.

---

## B. Pendiente

### P0 - Critico (release blockers)
- [x] Implementar ErrorBoundary global en root + fallback recuperable ("Volver al editor", "Copiar error", "Reintentar vista").
  Cierre: un crash de render en una vista no tumba toda la app ni deja pantalla blanca global.
- [ ] QA manual UX final en runtime real (desktop angosto + mobile) con saga grande.
  Cierre: checklist manual completo sin bloqueantes.

### P1 - Alto (flujo diario)
- [x] Reemplazo global atomico o rollback asistido + mensaje de reemplazo parcial con capitulos afectados.
  Cierre: si falla en el capitulo N, el usuario puede recuperar rapido y ve exactamente que quedo modificado.
- [x] Persistencia de scroll del editor al cambiar entre editor/outline/preview/otras vistas.
  Cierre: al volver al editor se restaura la posicion de lectura/escritura.
- [x] Acceso contextual al lore desde el editor (ej. Ctrl+Click o accion rapida sobre entidad).
  Cierre: abrir contexto de Story Bible/Timeline/Atlas sin abandonar el flujo de escritura.

### P2 - Medio (integracion entre herramientas)
- [-] Puente PlotBoard -> Outline -> creacion/apertura de capitulo.
  Cierre: convertir una tarjeta a escena/capitulo con una accion.
- [x] Alta rapida de Loose Threads desde seleccion en editor (menu contextual).
  Cierre: seleccionar texto y crear hilo suelto sin cambiar de panel.
- [x] Ajustar timing del status de autoguardado para que no comunique exito antes del sync de biblioteca.
  Cierre: estado distingue claramente "capitulo guardado" vs "biblioteca sincronizada".

### P3 - Bajo (robustez/performance incremental)
- [x] Optimizar comparacion de snapshots evitando JSON.stringify completo cuando no sea necesario.
  Cierre: comparacion por campos/hash liviano en ruta de versionado.
- [x] Bloquear doble click en export con flag exportBusy/isExporting.
  Cierre: una sola exportacion activa por accion.
- [ ] Refactor progresivo de monolitos (App.tsx, SagaPanel.tsx) por modulos/contextos.
  Cierre: menor complejidad por archivo sin regresiones funcionales.

### Epicas/Futuro (post-v4)
- [ ] Modulo de linguistica/conlangs dedicado.
- [ ] Mapamundi interactivo con capas, marcadores e historico temporal.
- [ ] Verificador de consistencia del manuscrito completo (no solo salida IA).

### Bloqueo externo / entorno
- [!] Build verify en sandbox: bloqueado por entorno (spawn EPERM con child_process/esbuild).
- [!] Integracion MCP de navegador/screenshot 100% embebida en producto (hoy cubierta por scripts locales de QA visual).
- [!] Integracion MCP de diseno/Figma online (opcional; hoy cubierta por export local de design tokens JSON).

## C. Orden sugerido

1. Implementar ErrorBoundary global y cubrirlo con prueba minima de fallback.
2. Resolver handleReplaceInBook parcial (atomicidad o rollback asistido con reporte).
3. Resolver persistencia de scroll en editor y validar UX en capitulos largos.
4. Implementar integracion contextual de lore desde editor (MVP).
5. Conectar flujo PlotBoard -> Outline -> capitulo + accion rapida de Loose Threads.
6. Cerrar items P3 y ejecutar QA manual final en host real; registrar hallazgos aqui.
