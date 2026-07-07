# CLAUDE.md

## PRINCIPIO GENERAL

Trabaja como un ingeniero senior manteniendo un sistema productivo existente.

Objetivos por orden de prioridad:

1. No romper nada.
2. Entender antes de modificar.
3. Minimizar cambios.
4. Ahorrar tokens.
5. Mantener trazabilidad.
6. Documentar decisiones importantes.

---

# MODO DE TRABAJO

## Antes de programar

Nunca empieces modificando código directamente.

Primero:

* Localiza los archivos implicados.
* Identifica la fuente de verdad.
* Explica brevemente el flujo actual.
* Detecta posibles efectos colaterales.
* Propón un plan corto.

Formato:

ANÁLISIS

* archivo 1
* archivo 2
* flujo actual

RIESGOS

* riesgo 1
* riesgo 2

PLAN

1. ...
2. ...
3. ...

No programes hasta terminar este análisis.

---

# AHORRO DE TOKENS

## Respuestas

Sé extremadamente conciso.

Evita:

* explicaciones largas
* repeticiones
* resúmenes innecesarios
* copiar bloques grandes de código

Usa:

* listas cortas
* conclusiones directas
* referencias a líneas y archivos

Ejemplo:

Correcto:

server.js:3244
generate_esquema_pos.py:874

La llamada ya existe.
Solo falta persistir el campo.

Incorrecto:

Explicar durante 20 párrafos algo que puede decirse en 3 líneas.

---

# MODIFICACIONES DE CÓDIGO

## Regla principal

Realizar siempre el cambio mínimo posible.

Antes de crear código nuevo comprobar:

* si ya existe una función equivalente
* si existe una ruta legacy reutilizable
* si existe lógica duplicada

Priorizar:

1. reutilizar
2. extender
3. crear

---

# ARCHIVOS GRANDES

Nunca leer archivos completos si superan:

* 500 líneas
* 1 MB

Leer únicamente:

* funciones relevantes
* bloques afectados
* llamadas relacionadas

Usar búsqueda antes que lectura completa.

---

# DOCUMENTACIÓN

Cuando una decisión sea estructural:

Actualizar documentación.

Si existe documento relacionado:

Actualizarlo.

No crear documentos duplicados.

---

# PROYECTO MILU

## Filosofía

La fuente de verdad es siempre:

1. Código en producción.
2. Flujo oficial actual.
3. Documentación actualizada.

Nunca asumir que documentos antiguos siguen siendo válidos.

---

## Flujo oficial actual

Recompute:

1. rebuild-json
2. update-sust
3. assets
4. copy-pdf-to-final-all-books
5. errores
6. estados
7. limpieza

Evitar proponer rutas legacy.

---

## Assets

Prioridad:

BOM
→ esquemas
→ esquemas_pos
→ imágenes

Si BOM no existe:

* dejar vacío
* no conservar datos antiguos

---

## Esquemas

Reglas:

* No inventar esquemas.
* No reutilizar esquemas antiguos.
* Si BOM no se encuentra → vacío.
* Si no existe esquema → vacío.
* El estado debe reflejar el problema real.

---

## Export WordPress

Objetivos:

* minimizar columnas
* minimizar duplicados
* generar rutas de forma dinámica cuando sea posible
* evitar almacenar información derivable

Preferir:

filename + generación de ruta

Antes que:

ruta completa persistida.

---

# AUDITORÍAS

Cuando se solicite una revisión:

No modificar nada.

Entregar:

RESULTADO

* correcto
* incorrecto

EVIDENCIA

* archivo
* línea
* función

PROPUESTA

* cambio mínimo

---

# COMMITS

Generar un único commit por tarea lógica.

Formato:

feat(scope): descripción

fix(scope): descripción

chore(scope): descripción

Evitar commits múltiples para la misma tarea.

---

# CUANDO EXISTA DUDA

Preguntar antes de implementar.

Nunca asumir requisitos funcionales.

Especialmente en:

* reglas BOM
* hermanos
* export WordPress
* FG/FGS
* esquemas
* estados

---

# FORMATO DE RESPUESTA PREFERIDO

ANÁLISIS
...

PLAN
...

CAMBIOS
...

VALIDACIÓN
...

RIESGOS
...

Máximo 15 líneas salvo que se solicite más detalle.


# CLAUDE_MILU.md

# MILU V1 - REGLAS OBLIGATORIAS

Estas instrucciones tienen prioridad sobre cualquier comportamiento por defecto.

---

# OBJETIVO

Mantener y evolucionar MILU V1 con cambios mínimos, seguros y trazables.

Prioridades:

1. No romper funcionalidad existente.
2. No duplicar lógica.
3. No crear rutas paralelas.
4. Reutilizar componentes oficiales.
5. Ahorrar tokens y tiempo.
6. Mantener coherencia documental.

---

# REGLA DE ORO

ANTES DE PROGRAMAR:

1. Localizar archivos afectados.
2. Identificar la fuente de verdad.
3. Explicar flujo actual.
4. Detectar riesgos.
5. Proponer cambio mínimo.

NO escribir código antes de completar este análisis.

---

# MODO TOKEN-SAVING

Respuestas extremadamente concisas.

Prohibido:

* reexplicar contexto ya conocido
* resumir documentos completos
* repetir análisis anteriores
* copiar código innecesariamente
* leer archivos completos sin necesidad

Utilizar:

ANÁLISIS
PLAN
CAMBIOS
VALIDACIÓN

Nada más.

---

# LECTURA DE ARCHIVOS

PROHIBIDO:

* leer JSON completos de motores
* leer archivos enteros >500 líneas
* abrir documentación masiva sin necesidad

OBLIGATORIO:

* buscar primero
* leer únicamente funciones implicadas
* leer únicamente llamadas relacionadas
* leer únicamente bloques necesarios

Usar:

grep
search
referencias cruzadas

antes de cualquier lectura extensa.

---

# JSON DE MOTORES

Archivos tipo:

engine_*.json
engine_rebuild_*.json

Reglas:

* Nunca leer completos.
* Leer únicamente registros afectados.
* Leer únicamente ventanas pequeñas.
* Evitar operaciones masivas salvo petición explícita.

---

# CAMBIOS DE CÓDIGO

Siempre aplicar:

CAMBIO MÍNIMO VIABLE

Antes de crear:

* función nueva
* endpoint nuevo
* script nuevo

comprobar si ya existe lógica equivalente.

Prioridad:

1. reutilizar
2. extender
3. crear

---

# RUTAS OFICIALES

Preferir siempre:

recompute_simple

frente a:

legacy
experimental
deprecated

No proponer rutas antiguas si existe flujo oficial.

---

# FUENTES DE VERDAD

Orden obligatorio:

1. Código actual
2. Flujo oficial activo
3. Documentación actualizada

Nunca asumir que documentación antigua es correcta.

Si existe contradicción:

CÓDIGO > DOCUMENTACIÓN

---

# RECOMPUTE OFICIAL

La secuencia oficial es:

1 rebuild-json
2 update-sust
3 assets
4 copy-pdf-to-final-all-books
5 errores
6 estados
7 limpieza

No proponer secuencias alternativas sin justificación técnica.

---

# ESQUEMAS

Reglas oficiales:

* BOM manda.
* No inventar esquemas.
* No reutilizar esquemas antiguos.
* Si BOM no existe → vacío.
* Si BOM no se encuentra → vacío.
* Si no hay esquema → vacío.

Nunca conservar datos heredados incorrectos.

---

# ESQUEMAS_POS

Reglas:

* Derivan de esquemas.
* No son fuente de verdad.
* Se regeneran.
* No se editan manualmente salvo petición explícita.

---

# ASSETS

Prioridad:

BOM
→ esquemas
→ esquemas_pos
→ imágenes

No invertir este orden.

---

# EXPORT WORDPRESS

Objetivos:

* mínima redundancia
* mínima persistencia innecesaria
* generación dinámica cuando sea posible

Preferir:

filename

antes que:

URL completa persistida

si la URL puede reconstruirse.

---

# FG / FGS

Usar únicamente:

fg_fgs_final

No utilizar:

FG/FGS
fg_fgs_raw

salvo petición explícita.

---

# HERMANOS

Antes de modificar:

* revisar protecciones
* revisar orígenes
* revisar targets

Evitar propagaciones en cascada.

---

# AUDITORÍAS

Cuando se solicite revisión:

NO MODIFICAR CÓDIGO.

Entregar únicamente:

RESULTADO
EVIDENCIA
RIESGOS
PROPUESTA

---

# DOCUMENTACIÓN

No crear documentos nuevos si existe uno equivalente.

Preferir:

actualizar

antes que:

duplicar

---

# COMMITS

Un único commit por tarea lógica.

Formato:

feat(scope): descripción

fix(scope): descripción

chore(scope): descripción

No generar múltiples commits para la misma tarea.

---

# CUANDO PROPONGAS CAMBIOS

Indicar siempre:

ARCHIVOS
FUNCIONES
ENDPOINTS
RIESGOS

antes de implementar.

---

# FORMATO OBLIGATORIO

ANÁLISIS

* ...

PLAN

1. ...
2. ...

CAMBIOS

* ...

VALIDACIÓN

* ...

RIESGOS

* ...

Máximo 15 líneas salvo que se solicite más detalle.

---

# SI EXISTE DUDA

Preguntar.

Nunca asumir reglas funcionales de:

* BOM
* Esquemas
* Esquemas_POS
* Hermanos
* FG/FGS
* Estados
* Export WordPress

Las reglas de negocio tienen prioridad sobre la elegancia técnica.

# FUENTES DE VERDAD MILU

server.js

recompute_simple.html

rebuild_schemes_by_bom.py

rebuild_schemes_circles_from_esquemas.py

rebuild_assets_for_record.py

export_wordpress_milu.js
