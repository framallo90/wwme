# WriteWMe

Procesador de libro offline para crear, escribir, reescribir, revisar y modificar texto + portada con IA local (Ollama).

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
npm run lint
npm run build
npm run dev
```

## Estructura de libro en disco

```text
/mi-libro/
  book.json
  config.json
  chapters/
    01.json
    02.json
  assets/
    cover.png
  versions/
    01_v1.json
  exports/
    01-capitulo-1.md
```

`book.json`:
- titulo, autor
- orden de capitulos (`chapterOrder`)
- portada (`coverImage`)
- base fija del libro (`foundation`)
- historial de chat por libro y por capitulo

`config.json` (persistente por libro):
- `model` (default `llama3.2:3b`)
- `temperature`
- `systemPrompt`
- `autoVersioning`
- `autoApplyChatChanges`
- `chatApplyIterations`
- `continuousAgentEnabled`
- `continuousAgentMaxRounds`
- `autosaveIntervalMs`
- `ollamaOptions`

Cada capitulo (`chapters/NN.json`) guarda:
- `id`, `title`
- `content` (HTML TipTap)
- `contentJson` (opcional)
- `createdAt`, `updatedAt`

## Funciones implementadas

- Nuevo libro / abrir libro existente
- CRUD de capitulos (crear, renombrar, duplicar, borrar, mover)
- Vista general de libro
- Vista y edicion de base fija del libro
- Portada (ver/cambiar/quitar)
- Editor TipTap + auto-guardado
- Panel IA:
  - acciones rapidas (escribir desde idea, pulir, reescribir, expandir, acortar, consistencia, transiciones, profundidad, alineacion con base)
  - devolucion de capitulo/libro
  - chat por capitulo o por libro
  - modo auto-aplicar sin preguntar (iterativo)
  - agente continuo por rondas en chat de capitulo
- Presets de trabajo en Settings (borrador, precision, revision final)
- Snapshot antes de cambios IA + undo basico
- Export Markdown:
  - capitulo individual
  - libro en archivo unico
  - libro en archivos por capitulo

## Chat auto-aplicar (sin confirmaciones)

Cuando `autoApplyChatChanges` esta activo:
- Scope `Por capitulo`: reescribe el capitulo activo automaticamente.
- Scope `Por libro`: aplica la instruccion a todos los capitulos.
- `chatApplyIterations` define cuantas pasadas hace sin preguntar.

## Defaults recomendados

- Modelo: `llama3.2:3b`
- Formato de capitulo: HTML TipTap + `contentJson` opcional
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
