# Guia de Saga y Timeline

Guia practica para usar la capa de sagas, la cronologia canonica y el seguimiento de personajes en WriteWMe.

## 1. Que resuelve esta parte de la app

La capa de saga separa dos niveles:

- `Libro`: contenido de un volumen.
- `Saga`: canon compartido del mundo.

Esto permite:

- Vincular varios libros a una misma saga.
- Mantener una biblia global del mundo.
- Llevar una timeline canonica independiente del orden de publicacion.
- Seguir la evolucion de personajes con alias y etapas.

## 2. Pantallas principales

### Solapa `Saga`

Sirve para editar datos canonicos:

- titulos y descripcion de saga
- libros vinculados
- personajes, lugares, facciones, sistemas y artefactos
- timeline canonica
- reglas globales, glosario y reglas fijadas para IA
- estado canonico / apocrifo de fichas, secretos y eventos

### Solapa `Timeline`

Sirve para revisar continuidad:

- eventos ordenados por cronologia real
- vista por carriles tipo Gantt con duraciones y dependencias
- escala visual horizontal con hitos y huecos grandes
- filtros por personaje y libro
- detalle de referencias `occurs` / `mentioned` / `revealed`

### Solapa `Relaciones`

Sirve para ver el grafo de conocimiento del mundo:

- personajes, facciones, lugares y artefactos conectados
- filtros por tipo de entidad y busqueda rapida
- deteccion visual de nodos aislados o demasiado centrales

### Solapa `Atlas`

Sirve para revisar logistica del mundo:

- mapa base, capas y pines vinculados a lugares
- importacion asistida de pines y snapping de rutas sobre el mapa
- lugares y conexiones entre ubicaciones
- rutas registradas a nivel saga
- pack de exportacion para cartografo
- soporte para revisar viajes imposibles junto con `Timeline`

## 3. Uso de la pantalla `Saga`

### 3.1 Encabezado

- `Titulo de la saga`
- `ID interno` (solo lectura)
- `Descripcion general`

### 3.2 Libros vinculados

Acciones:

- `Abrir libro`
- `Aplicar volumen`
- `Subir` / `Bajar`

### 3.3 Panorama maestro

Campo libre para contexto global del mundo.

### 3.4 Personajes de saga

Cada personaje tiene:

- nombre
- estado actual (`alive`, `dead`, `missing`, `unknown`)
- resumen y notas

### 3.5 Hitos del personaje

Selectores de eventos:

- nacimiento
- primera aparicion
- ultimo evento conocido
- muerte

### 3.6 Apodos y titulos

Cada alias define:

- valor
- tipo
- `desde orden`
- `hasta orden`
- notas

### 3.7 Entidades globales

Secciones:

- lugares
- rutas
- flora/fauna
- facciones
- sistemas
- artefactos

### 3.8 Linea temporal canonica

Soporte drag-and-drop: tanto en la solapa Saga como en la vista Timeline se pueden arrastrar y soltar eventos para reordenar la cronologia. El reordenamiento se deshabilita automaticamente cuando hay filtros activos.

Campos por evento:

- titulo y etiqueta visible
- categoria y tipo (`point` / `span`)
- inicio/fin
- resumen y notas
- entidades relacionadas por selector visual

Automatizacion operativa:

- `Autocompletar evento`: completa metadatos del evento (referencias, impactos, ubicaciones y transferencias) con base en evento origen + continuidad.

### 3.9 Referencias narrativas

Editor por filas:

- `Evento origen` para copiar
- `Autocompletar`
- libro (selector)
- capitulo (selector/autocompletado)
- modo (`occurs` / `mentioned` / `revealed`)
- ubicacion opcional

### 3.10 Impactos de personajes

Editor por filas:

- `Evento origen` para copiar
- `Autocompletar`
- `Generar desde entidades`
- personaje (selector)
- tipo de impacto
- alias usado
- cambio de estado

### 3.11 Reglas globales y glosario

- reglas no negociables del mundo
- terminos y convenciones
- reglas fijadas para IA que deben entrar siempre aunque la saga sea grande

### 3.12 Secretos canonicos

Cada secreto incluye:

- titulo
- resumen
- verdad objetiva
- entidades relacionadas (selector visual)
- notas

## 4. Validacion inteligente

El reporte global funciona como compilador de coherencia:

- filtros por severidad/codigo/texto
- navegacion directa al evento/personaje
- `Autofix sugerido` por issue con evento

Chequeos principales:

- personaje antes de nacer
- personaje despues de morir (mencion vs accion)
- alias fuera de rango
- referencias rotas (evento/libro/personaje/entidad/secreto)
- viaje imposible por continuidad de ubicacion
- conflicto de propietario de artefacto

## 5. Modo estricto

Si esta activo:

- mantiene alertas fuertes sobre incoherencias graves
- permite guardar la saga igual
- conviene revisar el reporte antes de exportar salidas finales vinculadas a saga

Si estas explorando ideas, puedes dejarlo activado: funciona mejor como consejero editorial que como cerrojo.

## 6. Flujo recomendado

1. Crear/abrir saga.
2. Vincular y ordenar libros.
3. Definir personajes y alias.
4. Cargar eventos canonicos.
5. Usar autocompletado de metadatos.
6. Revisar reporte de validacion.
7. Ajustar reglas, secretos y glosario.

## 7. Limitaciones actuales

- Faltan autofixes especificos por codigo de issue (hoy el autofix es por evento).
- Algunas herramientas tecnicas (refactor global de IDs) siguen orientadas a usuarios avanzados.
- El `Atlas` ya es visual, pero todavia no es un GIS ni un editor completo de segmentos de ruta.
- La vista Gantt ya existe, pero todavia le faltan flechas de dependencia y mas capas de duracion/logistica.

## 8. Siguiente nivel recomendado

1. Autofix especifico por regla de coherencia.
2. Mapa de dependencias entre hilos narrativos y secretos.
3. Validaciones mas contextuales sobre viajes y duraciones.
4. Ramas canonicas / what-if con soporte explicito de canon alternativo.
