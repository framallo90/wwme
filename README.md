# WriteWMe

App de escritorio local para escribir y editar un libro con IA local via Ollama.

Stack:
- Tauri + React + TypeScript + Vite
- TipTap (editor WYSIWYG)
- Persistencia en archivos locales (sin DB)
- IA local: `http://localhost:11434/api/generate`

## Requisitos

- Node.js 20+
- npm 10+
- Rust + Cargo (para ejecutar Tauri)
- Ollama instalado y corriendo en local

Comandos utiles:

```bash
ollama serve
ollama pull llama3.2:3b
```

## Ejecutar

```bash
npm install
npm run tauri dev
```

Si solo queres validar frontend:

```bash
npm run build
npm run dev
```

## Estructura de libro en disco

Cada libro es una carpeta:

```text
/mi-libro/
  book.json
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

`book.json` contiene metadatos globales:
- titulo, autor
- orden de capitulos (`chapterOrder`)
- portada (`coverImage`)
- chats por libro y por capitulo

Cada capitulo (`chapters/NN.json`) guarda:
- `id`
- `title`
- `content` (HTML de TipTap)
- `createdAt`, `updatedAt`

## Funciones implementadas

- Nuevo libro y abrir libro existente
- CRUD de capitulos (crear, renombrar, duplicar, borrar, mover)
- Vista general del libro
- Vista y cambio de portada
- Editor TipTap WYSIWYG
- Auto-guardado por intervalo y al perder foco
- Panel IA con:
  - chat por capitulo o por libro
  - acciones rapidas (pulir, reescribir, expandir, acortar, consistencia)
  - devolucion capitulo/libro
- Integracion con Ollama local (sin streaming)
- Settings persistentes (modelo, temperatura, system prompt, auto-versionado)
- Snapshot previo a cambios IA + Undo basico
- Exportacion Markdown:
  - capitulo individual
  - libro por capitulos
  - libro en archivo unico

## Configuracion persistente

Se guarda en el config local de Tauri (`AppConfig`) como `config.json`.

Campos:
- `model`
- `temperature`
- `systemPrompt`
- `autoVersioning`
- `autosaveIntervalMs`
- `ollamaOptions`

Se carga automaticamente al iniciar.

## Modificar modelo y prompt

1. Abrir `Settings` en la app.
2. Cambiar modelo (ej: `llama3.2:3b`).
3. Editar `System prompt fijo`.
4. Guardar con `Guardar settings`.

La configuracion queda persistida para sesiones futuras.

## Demo book incluido

Hay un libro de ejemplo listo para abrir en:

```text
examples/demo-book/
```

Incluye:
- 2 capitulos de ejemplo
- portada placeholder en `assets/cover.png`
- snapshot de ejemplo en `versions/01_v1.json`

## Notas

- La app esta pensada para uso 100% local y offline.
- Si Ollama no esta levantado, la UI muestra error con instruccion para iniciarlo.
- Export a PDF/DOCX queda preparado como extension futura.
