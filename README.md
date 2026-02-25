# WriteWMe

Procesador de libro offline para crear, escribir, reescribir, revisar y modificar texto + portada/contraportada con IA local (Ollama).

Version actual: `0.2.0`

Stack:
- Tauri + React + TypeScript + Vite
- TipTap (editor WYSIWYG)
- Persistencia local en archivos (sin DB)
- Ollama local: `http://localhost:11434/api/generate`

## Requisitos

- Node.js 20+
- npm 10+
- Rust + Cargo (para Tauri)
- Ollama instalado localmente

Comandos recomendados:

```bash
ollama serve
ollama pull llama3.2:3b
```

## Ejecutar

```bash
npm install
npm run tauri dev
```

Si queres validar solo frontend:

```bash
npm run test
npm run lint
npm run build
npm run build:report
npm run dev
```

`npm run build` ahora tambien genera reporte de pesos en:

```text
reports/build/build-size-YYYYMMDDTHHMMSSZ.json
reports/build/build-size-latest.json
```

## Verificacion local automatica

Script extensible de verificacion completa:

```bash
npm run verify:local
```

Auditoria especifica de contraste (WCAG):

```bash
npm run verify:a11y-contrast
```

Migracion de historial para limpiar `contentJson` en `chapters/` y `versions/`:

```bash
npm run migrate:contentjson -- --book ./examples/demo-book
npm run migrate:contentjson -- --book ./examples/demo-book --apply --backup
```

Opciones utiles (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify_local.ps1 -Only app.lint,app.typecheck
powershell -ExecutionPolicy Bypass -File .\scripts\verify_local.ps1 -Skip app.build,tauri.metadata
powershell -ExecutionPolicy Bypass -File .\scripts\verify_local.ps1 -BookPath .\examples\demo-book
```

El script guarda reporte JSON en:

```text
reports/verify/verify-YYYYMMDD-HHMMSS.json
```

Para agregar futuras pruebas, sumas un nuevo entry en el array `$checks` de `scripts/verify_local.ps1`.

Regla de calidad del proyecto:
- Cada funcion nueva o cambio de comportamiento debe venir con un test nuevo o actualizado en `tests/unit/suite.ts`.

## Estructura de libro en disco

```text
/mi-libro/
  book.json
  config.json
  chapters/
    01.json
    02.json
  chats/
    book.json
    01.json
  assets/
    cover.png
    back-cover.png
  versions/
    01_v1.json
  exports/
    01-capitulo-1.md
    libro-demo-amazon-pack.txt
    libro-demo-interior-kdp.html
```

`book.json`:
- titulo, autor
- orden de capitulos (`chapterOrder`)
- portada (`coverImage`)
- contraportada (`backCoverImage`)
- texto de lomo (`spineText`)
- base fija del libro (`foundation`)
- biblia de historia (`storyBible`: personajes/lugares con alias y reglas de continuidad)
- seccion Amazon/KDP (`amazon`)
- formato interior para maquetado (`interiorFormat`)
- estado de publicacion (`isPublished`, `publishedAt`)

`chats/`:
- `book.json`: historial del chat de libro
- `NN.json`: historial del chat por capitulo
- se carga bajo demanda y no infla `book.json`

Biblioteca global:
- Se guarda en `%APPDATA%/library.json` (vía `appDataDir()` de Tauri).
- Mantiene lista de libros, ultimo acceso y estado: `recien_creado`, `avanzado`, `publicado`.

`config.json` (persistente por libro):
- `model` (default `llama3.2:3b`)
- `language` (idioma de trabajo para prompts y salida IA). Si falta, se hereda de `book.json` (`amazon.language`).
- `temperature`
- `systemPrompt`
- `autoVersioning`
- `autoApplyChatChanges`
- `chatApplyIterations`
- `continuousAgentEnabled`
- `continuousAgentMaxRounds`
- `continuityGuardEnabled` (si esta activo, valida/corrige continuidad antes de guardar cambios IA)
- `autosaveIntervalMs`
- `ollamaOptions`

Cada capitulo (`chapters/NN.json`) guarda:
- `id`, `title`
- `content` (HTML TipTap)
- `contentJson` (opcional, actualmente persistido en `null` para minimizar peso)
- `createdAt`, `updatedAt`

## Funciones implementadas

- Nuevo libro / abrir libro existente
- Biblioteca de libros expandible con estados y accesos rapidos (Abrir, Chat, Amazon, Publicar)
- CRUD de capitulos (crear, renombrar, duplicar, borrar, mover)
- Vista general de libro
- Control de cambios visual entre snapshots (comparacion por capitulo)
- Panel de analisis de estilo (ritmo, repeticion, lectura estimada y semaforo por capitulo/libro)
- Vista y edicion de base fija del libro
- Solapa de biblia de historia (personajes, lugares y reglas de continuidad)
  - aliases por entidad para detectar variantes de nombre en prompts (RAG-light)
- Carga diferida del panel IA (`AIPanel`): no se descarga/renderiza hasta abrir un libro, para acelerar arranque inicial.
- Carga bajo demanda del pipeline de exportacion (`lib/export`): se importa solo cuando ejecutas una exportacion.
- Apertura de libro optimizada: no reescribe masivamente `chapters/` ni `chats/` en cada carga; solo guarda cuando hay normalizacion/migracion real.
- Carga de chats por demanda (scope activo): al abrir libro no se leen todos los historiales, solo `book` o el capitulo activo cuando hace falta.
- Portada y contraportada (ver/cambiar/quitar) + texto de lomo
- Seccion Amazon/KDP con presets listos para copiar y pegar
- Formato interior editable (trim size, margenes, sangria, interlineado)
- Editor TipTap + auto-guardado
- Panel IA:
  - acciones rapidas (escribir desde idea, pulir, reescribir, expandir, acortar, consistencia, transiciones, profundidad, alineacion con base)
  - devolucion de capitulo/libro
  - chat por capitulo o por libro
  - modo auto-aplicar sin preguntar (iterativo)
  - agente continuo por rondas en chat de capitulo
  - bloqueo opcional de continuidad antes de persistir texto generado por IA
  - inyeccion automatica de `foundation` + `storyBible` en prompts (sin repetir contexto manual)
  - filtrado contextual tipo RAG-light de personajes/lugares segun instruccion y capitulo activo
  - priorizacion por recencia de menciones (chat/contexto reciente) para mejorar seleccion de entidades
- Presets de trabajo en Settings (borrador, precision, revision final)
- Solapa de idioma dedicada:
  - seleccion o codigo manual (`es`, `en`, `pt-BR`, `es-MX`, etc.)
  - sincronizacion de idioma base + Amazon/KDP
  - validacion de formato ISO y aviso de desalineacion
  - aviso para revisar marketplace/moneda si el idioma no coincide con el mercado Amazon principal
  - boton con estado (`Guardando...`, `Guardado OK`) y guardado solo con cambios
- Presets Amazon (no ficcion reflexiva, ensayo practico, narrativa intima)
- Validacion KDP en panel Amazon:
  - readiness score
  - lista de errores/advertencias por campo
  - validacion de categorias contra catalogo local
  - estimacion de regalias (eBook/print)
- Snapshot antes de cambios IA + undo basico
- Export Markdown:
  - capitulo individual
  - libro en archivo unico
  - libro en archivos por capitulo
- Export editorial:
  - manuscrito `.docx` (editorial)
  - eBook `.epub`
- Export de estilo:
  - reporte `.txt` con resumen del libro y detalle por capitulo
- Export Amazon:
  - pack copy/paste (`.txt`)
  - interior maquetado para KDP (`.html`)
  - markdown completo del libro (`.md`)
  - metadata para carga rapida (`.csv`)
  - reporte de validacion (`.txt`)

## Chat auto-aplicar (sin confirmaciones)

Cuando `autoApplyChatChanges` esta activo:
- Scope `Por capitulo`: reescribe el capitulo activo automaticamente.
- Scope `Por libro`: aplica la instruccion a todos los capitulos.
- `chatApplyIterations` define cuantas pasadas hace sin preguntar.
- Si `continuityGuardEnabled` esta activo, cada resultado IA pasa por un chequeo/correccion de continuidad antes de persistirse en disco.

## Defaults recomendados

- Modelo: `llama3.2:3b`
- Formato de capitulo: HTML TipTap como fuente principal (`contentJson` opcional para futuras extensiones)
- Configuracion: `mi-libro/config.json`
- Export: HTML -> Markdown (conversion simple)

## Demo book incluido

Libro de ejemplo en:

```text
examples/demo-book/
```

Incluye:
- 2 capitulos
- portada placeholder
- `config.json` de ejemplo
- snapshot inicial en `versions/01_v1.json`

## Notas

- 100% local/offline (sin servicios pagos ni cloud).
- Si Ollama no esta corriendo, la app muestra error claro para iniciarlo.
- Export Markdown usa conversion simple; se puede mejorar despues.

## Documentacion y versionado

- Historial de versiones: `CHANGELOG.md`
- Guia de releases y criterio de reversionado: `docs/versioning.md`
- Operacion local, comandos y reportes de verificacion: `docs/operacion-local.md`
- Roadmap de producto B/F (Timeline + Analisis de estilo): `docs/roadmap-bf.md`
- Regla operativa: todo cambio significativo se documenta y sube version.
