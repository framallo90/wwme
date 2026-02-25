# Roadmap B/F Priorizado

Objetivo: aterrizar dos ideas de producto con orden de ejecucion claro:
- B) Timeline visual (cronologia editable).
- F) Analisis de estilo (metricas y alertas de escritura).

Fecha de referencia: 2026-02-25.

## Criterio de priorizacion

1. Maximizar valor temprano para el escritor.
2. Minimizar riesgo tecnico en la primera iteracion.
3. Reutilizar arquitectura actual (`book.json`, `chapters/`, `versions/`, vistas React).

## Resumen ejecutivo

1. Primero: F-MVP (analisis de estilo base).
   Impacto alto, costo bajo/medio, casi sin riesgo estructural.
2. Segundo: B-MVP (timeline por capitulo drag-and-drop).
   Impacto alto para novelas con saltos temporales, costo medio.
3. Tercero: F-v2 (alertas inteligentes y consistencia de voz).
   Impacto medio/alto, costo medio.
4. Cuarto: B-v2 (timeline por escenas y vista dual lectura/cronologia).
   Impacto alto, costo alto.

## Backlog priorizado (MVP -> v2)

| Orden | Feature | Alcance | Impacto | Costo | Riesgo | Estimacion |
|---|---|---|---|---|---|---|
| 1 | F-MVP | Panel de metricas: palabras, longitud media de oracion, repeticion de terminos, tiempo de lectura | Alto | Bajo/Medio | Bajo | 4-6 dias |
| 2 | B-MVP | Timeline por capitulo: fecha/orden cronologico + drag-and-drop + guardado en metadata | Alto | Medio | Medio | 7-10 dias |
| 3 | F-v2 | Alertas de estilo: muletillas por umbral, ritmo irregular, densidad descriptiva | Medio/Alto | Medio | Medio | 5-7 dias |
| 4 | B-v2 | Timeline por escenas + mapa lectura vs cronologia + filtros | Alto | Alto | Alto | 10-15 dias |

## F-MVP (primera entrega recomendada)

### Entregables

1. Nueva vista `style` en toolbar.
2. Metricas por capitulo y libro:
   - total de palabras.
   - promedio de palabras por oracion.
   - top repeticiones (excluyendo stopwords).
   - tiempo estimado de lectura.
3. Semaforo simple:
   - verde: dentro de umbral.
   - amarillo: borde.
   - rojo: desvio fuerte.
4. Export de reporte `.txt` en `exports/`.

### Cambios tecnicos

1. `src/lib/styleMetrics.ts` (calculo puro y testeable).
2. `src/components/StylePanel.tsx`.
3. `MainView` -> agregar `style`.
4. Tests unitarios para parser de oraciones/repeticiones.

### Criterio de salida

1. Abrir libro y ver metricas en <500 ms para 50 capitulos.
2. Reporte exportado sin romper flujo actual.
3. Cobertura de tests para calculos clave.

## B-MVP (segunda entrega)

### Entregables

1. Campo cronologico por capitulo (ej. `timeline.order`, `timeline.label`).
2. Vista timeline simple:
   - lista vertical con drag-and-drop.
   - etiqueta temporal editable.
3. Opcion para alternar:
   - orden de lectura (existente).
   - orden cronologico (nuevo, sin reemplazar lectura).

### Cambios tecnicos

1. Extender `ChapterDocument` con `timeline` opcional.
2. Persistencia en `chapters/NN.json` (sin tocar semantica de `chapterOrder`).
3. `TimelineView.tsx` con DnD.
4. Guardado incremental y sincronizacion de biblioteca.

### Criterio de salida

1. Reordenar cronologia sin alterar `chapterOrder`.
2. Guardado estable y reversible.
3. No degradar rendimiento del editor.

## Dependencias y riesgos

1. Riesgo de UX: mezclar cronologia con orden de lectura puede confundir.
   Mitigacion: siempre mostrar ambos labels y separar vistas.
2. Riesgo de datos: cambios en schema de capitulo.
   Mitigacion: campos opcionales + migracion backward-compatible.
3. Riesgo de ruido en analisis F:
   Mitigacion: stopwords por idioma + umbrales configurables.

## Orden recomendado de implementacion

1. F-MVP (quick win de alto valor y bajo riesgo).
2. B-MVP (estructura cronologica util para narrativa compleja).
3. F-v2 (alertas contextuales).
4. B-v2 (escenas y visualizacion avanzada).

## Definicion de listo (DoD) por etapa

1. Lint + typecheck + tests en verde.
2. Documento actualizado en `README.md` y `CHANGELOG.md`.
3. Flujo manual validado en `examples/demo-book` y `examples/novela-el-faro-y-la-niebla`.
