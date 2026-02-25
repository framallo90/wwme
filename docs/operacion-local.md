# Operacion Local y Verificacion

Guia operativa de WriteWMe para ejecutar, verificar y diagnosticar el proyecto en entorno local (Windows).

## 1) Que significa "PASS total"

Cuando ejecutas:

```bash
npm run verify:local
```

el resultado final debe mostrar:

- `FAIL=0` (obligatorio)
- `WARN=0` (recomendado)

Ejemplo esperado:

```text
Summary: PASS=14 WARN=0 FAIL=0
```

## 2) Donde se guardan los resultados

Cada ejecucion de `verify:local` genera un JSON automatico en:

```text
reports/verify/verify-YYYYMMDD-HHMMSS.json
```

Comando para ver el ultimo reporte:

```powershell
Get-ChildItem .\reports\verify |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 |
  ForEach-Object { Get-Content $_.FullName }
```

Notas de almacenamiento del libro:
- `book.json` guarda metadatos del proyecto (sin historial de chat pesado).
- `config.json` guarda configuracion persistente por libro. Si no trae `language`, se toma `amazon.language` desde `book.json`.
- `chats/book.json` y `chats/NN.json` guardan historial de chat por libro/capitulo.

## 3) Comandos clave y para que sirve cada uno

| Comando | Uso |
|---|---|
| `npm install` | Instala dependencias del proyecto. |
| `npm run tauri dev` | Levanta frontend + app de escritorio Tauri en modo desarrollo. |
| `npm run dev` | Levanta solo frontend (Vite). |
| `npm run test` | Ejecuta tests unitarios de logica (`tests/unit/suite.ts`). |
| `npm run lint` | Ejecuta analisis estatico (ESLint). |
| `npx tsc -b` | Typecheck estricto del proyecto TypeScript. |
| `npm run build` | Build de frontend para produccion. |
| `npm run verify:local` | Verificacion integral (entorno, lint, typecheck, tests, build, tauri metadata, book structure). |
| `npm run migrate:contentjson -- --book <ruta-libro>` | Dry-run de migracion para limpiar `contentJson` historico en `chapters/` y `versions/`. |
| `npm run migrate:contentjson -- --book <ruta-libro> --apply --backup` | Aplica migracion y guarda backup de JSON previos. |
| `powershell -ExecutionPolicy Bypass -File .\scripts\verify_local.ps1 -Only app.lint,app.typecheck` | Corre solo checks puntuales. |
| `powershell -ExecutionPolicy Bypass -File .\scripts\verify_local.ps1 -Skip app.build,tauri.metadata` | Salta checks pesados para iterar mas rapido. |
| `powershell -ExecutionPolicy Bypass -File .\scripts\verify_local.ps1 -BookPath .\examples\demo-book` | Verifica estructura de un libro especifico. |

## 4) Flujo recomendado antes de commit

1. `npm run test`
2. `npm run lint`
3. `npx tsc -b`
4. `npm run verify:local`
5. Si todo da bien, recien ahi commit/push/tag.

## 4.1) Checklist funcional rapido (manual)

1. Abrir libro existente y validar carga de capitulo + editor.
2. Ir a `Idioma`:
   - cambiar idioma por selector (ej. `es` -> `en`)
   - verificar que el estado Amazon cambie junto al idioma base
   - guardar y confirmar feedback (`Guardando...` / `Guardado OK`)
3. Ir a `Amazon`:
   - revisar readiness score y lista de advertencias/errores
   - exportar pack y validar salida de archivos (`.txt`, `.html`, `.md`, `.csv`, validacion `.txt`)

## 5) Troubleshooting rapido

### Error: `Missing script: "tauri"` o `Missing script: "verify:local"`

Causa tipica: estas fuera de la carpeta del proyecto.

Solucion:

```powershell
cd C:\Users\Sergio\Desktop\WriteWMe
npm run
```

Verifica que aparezcan scripts como `tauri`, `verify:local`, `test`.

### Error: `Cannot find module 'esbuild'`

Causa tipica: el comando se corrio en `C:\WINDOWS\system32` y no en el repo.

Solucion:

```powershell
cd C:\Users\Sergio\Desktop\WriteWMe
npm install
```

### Error en checks de Rust/Cargo

Validar:

```powershell
cargo --version
rustc --version
```

Si no responden, falta PATH de Rust.

### Error de Ollama no disponible

Validar:

```powershell
ollama --version
```

Y que la API responda en `http://localhost:11434`.

## 6) Reglas de calidad vigentes

- Toda funcion nueva o cambio de comportamiento debe agregar/actualizar tests en `tests/unit/suite.ts`.
- Cada cambio significativo debe quedar documentado en `CHANGELOG.md`.
- Cuando corresponda una nueva version, se hace `commit + tag` (segun politica acordada de versionado).
