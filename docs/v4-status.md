# Estado hacia v4

Fecha de referencia: 2026-03-08.

Base publicada actual: `0.3.0`.

Este documento separa lo que ya entro en el producto desde la `0.3.0` del trabajo que aun falta para llegar a una futura `v4` enfocada en confianza editorial, narrativa de saga y operacion local solida.

## Ya incorporado desde 0.3.0

### 1. Mundo, saga y continuidad

- `SagaPanel` con `saga.json`, biblioteca de sagas y libros vinculados por volumen.
- Biblia global del mundo con personajes, lugares, facciones, sistemas, artefactos, flora, fauna y rutas.
- Timeline canonica compartida con referencias narrativas (`occurs`, `mentioned`, `revealed`), impactos de personaje, ubicaciones y secretos.
- Vista `Timeline` con lectura tipo Gantt, dependencias de eventos y duraciones visuales por carril.
- Vista `Timeline` con flechas de dependencia visual por carril y conteo de cruces entre carriles.
- Vista `Plot` para leer el canon como arco narrativo + filtro por subtrama/carril.
- Vista `Relaciones` para grafo de entidades con modos `Panorama` y `Vecindad`, pensados para sagas densas.
- Vista `Atlas` visual con mapa base, capas, pines vinculados a lugares, importacion asistida y rutas medibles.
- Carriles temporales persistentes, genealogia por contexto temporal y relaciones con vigencia.
- Constructor base de conlangs y modulo de sistemas de magia/poder.
- Estado `Canonico` / `Apocrifo` en biblia y saga.
- Modo estricto orientado a alertar y proteger calidad editorial, sin bloquear guardado.

### 2. Escritura y flujo diario

- Banco de ideas / `Recortes` separado del manuscrito y del canon.
- Modo foco para escribir con paneles laterales colapsados.
- Comparador de versiones con etiquetas semanticas de hitos.
- Referencias semanticas en editor + autocompletado contextual (`@Personaje`, `#Lugar`) con alias/preview.
- Notas al margen privadas por capitulo.
- Analisis de estilo por libro/capitulo.
- Seguimiento de personaje y resumen de historia por rango de capitulos.
- Lectura en voz alta y exportacion WAV por capitulo o libro.

### 3. IA local y capa de confianza

- Salud de Ollama visible desde la app.
- Contexto visible en `Panel IA`: manuscrito en foco, biblia activa, saga activa y mensajes recientes.
- Modo `Consultor` separado de `Reescritura`.
- `aiSafeMode` y revision manual para cambios de riesgo alto.
- Modal de revision de cambios antes de aplicar mutaciones sensibles.
- Rollback de la ultima sesion IA.
- Auditoria local, transacciones IA recuperables y metricas de confianza en disco.
- Guard de continuidad opcional antes de persistir texto generado por IA.
- Guard de continuidad reforzado con menciones semanticas, conocimiento adelantado y filtro de narrador no fiable.
- Saltos contextuales en chat consultor hacia capitulo/timeline/reglas.
- Verificadores reales `scripts/verify_book.py` y `scripts/verify_ollama.py` alineados con skills locales.

### 4. Editorial, exportacion y operacion local

- DOCX, EPUB, Markdown, interior HTML para KDP y pack Amazon.
- Paquetes modulares por rol: cartografo, editor y cronologia.
- Nuevos paquetes modulares: maquetacion y consultoria.
- Validacion Amazon/KDP con readiness score, catalogo local y reporte exportable.
- Maquetacion interior con control de viudas/huerfanas, capitular opcional y ornamento configurable.
- Sincronizacion de idioma entre `config.json` y `book.json`.
- Backups con manifest y soporte para incluir saga vinculada.
- Apertura perezosa de panel IA/exportes y carga de chats bajo demanda.
- Guia operativa local y verificadores automatizados del repo.

### 5. Identidad visual

- Nueva identidad `wwme-logo-2.0`.
- Wordmark transparente integrado en la UI.
- Favicon e iconos Tauri regenerados desde el nuevo isotipo.
- Paleta principal alineada al azul profundo, cian suave y marfil del logo.

## Cierre tecnico aplicado (2026-03-08)

1. Continuidad semantica reforzada en multi-escena: deteccion de conocimiento implicito y regresiones de conocimiento con filtro para narrador no fiable.
2. Timeline con cruces entre carriles y pistas de viaje desde Atlas (ruta/distancia/tiempo) cuando hay conexion.
3. IA consultor con evidencia trazable (`CITE`) y snippet contextual en UI.
4. Export QA E2E con generacion real y validacion automatica de packs: cartografo, cronologia, editorial, maquetacion y consultoria.
5. Stress UI de render en vistas pesadas con reporte de tiempos.
6. Pasada visual/a11y tecnica: ajustes de overflow/wrap/focus y auditoria WCAG de contraste en verde.

## Falta para llegar a una v4 de confianza alta

1. Validacion manual UX final en runtime real (desktop angosto/mobile) cuando el entorno permita ejecutar Vite sin `spawn EPERM`.
2. Evolucion de Timeline a Gantt pleno (duraciones editables, dependencias mas ricas, snapping visual).
3. Genealogia multi-generacional dedicada (arbol de linaje completo).
4. Export modular por rol expuesto de forma directa en la UI para equipos editoriales.
5. Consolidacion documental: mantener un backlog v4 unico para evitar drift.

## Prioridades inmediatas recomendadas

1. Cerrar continuidad semantica profunda.
2. Completar dependencias visuales cruzadas en timeline/atlas.
3. Endurecer evidencia trazable del modo consultor.
4. Completar QA real de exportes y stress UI.
