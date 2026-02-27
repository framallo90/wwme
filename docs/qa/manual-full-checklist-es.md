# Checklist Manual Completo (WriteWMe)

Objetivo: validar todas las funciones visibles del producto con un escenario real de escritor.

## 1) Preparacion

- Ejecutar:
  - `npm run tauri dev`
- Tener Ollama activo con modelo disponible:
  - `ollama serve`
  - `ollama pull llama3.2:3b`

## 2) Escenario base de prueba

- Idea vaga:
  - "Una mujer vuelve al pueblo costero para vender la casa de su madre y descubre cuadernos que conectan a su familia con desapariciones."
- Meta:
  - Libro largo (12 capitulos), coherencia de personajes/lugares, salida comercial para KDP.

## 3) Biblioteca y libros

- Crear libro nuevo.
- Renombrar titulo y autor.
- Cerrar y reabrir libro desde biblioteca.
- Probar acciones de biblioteca:
  - Abrir.
  - Abrir en Chat.
  - Abrir en Amazon.
  - Marcar publicado / despublicar.
  - Eliminar de biblioteca (sin borrar archivos y con borrado total).

Resultado esperado:
- Estado y metadatos se actualizan sin errores en barra de estado.

## 4) Capitulos (CRUD + orden)

- Crear 3 capitulos.
- Renombrar capitulo.
- Duplicar capitulo.
- Mover arriba/abajo y mover a posicion exacta.
- Borrar un capitulo.
- Verificar `chapterOrder` consistente.

Resultado esperado:
- Orden visual y persistencia correctos tras reabrir libro.

## 5) Editor y guardado

- Escribir contenido largo en capitulo activo.
- Probar undo/redo del editor.
- Cambiar preset de longitud de capitulo.
- Salir y volver al capitulo.

Resultado esperado:
- Autosave correcto, contenido intacto, metricas visibles.

## 6) IA (acciones y chat)

- Accion `Escribir desde idea`.
- Accion `Pulir estilo`.
- Accion `Mejorar transiciones`.
- Chat por capitulo y por libro.
- Probar `autoApplyChatChanges` + `chatApplyIterations`.
- Probar agente continuo con varias rondas.
- Guardar hito (`milestone`) y luego undo/redo de snapshot.

Resultado esperado:
- Texto cambia coherentemente, sin romper tono ni continuidad.

## 7) Coherencia narrativa

- Completar Base del libro (foundation).
- Completar Story Bible (personajes/lugares/reglas).
- Ejecutar sincronizacion desde capitulo activo.
- Probar `Seguimiento de personaje` con aliases.
- Probar `Resumen historia` con rango de capitulos.

Resultado esperado:
- Nuevas entidades detectadas, tracking consistente, resumen util para continuidad.

## 8) Preview, estilo y diff

- Abrir vista `Preview`.
- Verificar paginacion estimada por capitulo.
- Probar boton `Imprimir / PDF`.
- Abrir `StylePanel` y revisar semaforo.
- Abrir `VersionDiffView` y comparar snapshots.

Resultado esperado:
- Vista previa limpia, sin HTML peligroso ejecutable; analisis y diff coherentes.

## 9) Portada y assets

- Cargar portada y contraportada.
- Probar limpiar portada/contraportada.
- Editar y guardar texto de lomo.
- Reintentar carga si hay error.

Resultado esperado:
- Assets persisten en `assets/` y se reflejan en preview/export.

## 10) Amazon/KDP y mercado

- Aplicar preset Amazon.
- Autogenerar copy.
- Completar pricing por marketplace.
- Revisar readiness score, errores y warnings.
- Copiar pack, keywords y categorias.
- Exportar bundle Amazon.

Resultado esperado:
- Metadata valida para publicacion y reporte de mercado consistente.

## 11) Buscar/Reemplazar

- Buscar termino por libro completo.
- Previsualizar reemplazo global.
- Reemplazar en capitulo activo.
- Reemplazar en todo el libro.

Resultado esperado:
- Conteos correctos y cambios aplicados donde corresponde.

## 12) Idioma, settings y backups

- Cambiar idioma (ISO valido y custom).
- Verificar avisos de mismatch idioma/marketplace.
- Guardar configuracion.
- Elegir carpeta de backup.
- Ejecutar backup manual.

Resultado esperado:
- Config persistente y backup generado sin errores.

## 13) Exportaciones

- Exportar:
  - Capitulo markdown.
  - Libro markdown unico.
  - Libro markdown por capitulos.
  - DOCX.
  - EPUB.
  - Reporte de estilo.
  - Bundle Amazon.
- Validar archivos en `exports/`.

Resultado esperado:
- Archivos generados, nombres correctos, contenido no vacio.

## 14) Colaboracion offline

- Exportar patch colaborativo JSON.
- Importar patch y revisar preview diff.
- Aplicar patch.

Resultado esperado:
- Preview correcto (`nuevo`/`update`/`unchanged`) y aplicacion sin perdida de datos.

## 15) Cierre de QA

- Ejecutar:
  - `npm run verify:local`
  - `npm run test`
- Guardar evidencia:
  - `reports/verify/verify-*.json`
  - `reports/build/build-size-latest.json`

Estado sugerido:
- PASS total solo si no hay errores bloqueantes de datos/flujo/publicacion.
