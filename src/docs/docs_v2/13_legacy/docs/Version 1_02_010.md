# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

Version 1.02.010

Jordi-------------------------------------
Version con informacion _pdf correcta en engine_xxxx.json. (Se detecta error que en fn_pdf no aparecen campos EM)
Se ha extraido la info del pdf mediante pagina Import PDF (Me gustaria cambiarle el nombre a Extract)
Se han creado los archivo BookPreview_xxxxx.json
Estos se copian a json originales y se ejecutan los scripts para copiar la info a engine_xxxx.json en los campos _pdf
Los scripts se llaman: apply_book_preview_to_engine.py

Cosas que faltan por hacer.

DATOS
- Revision de error FN (EM) no lo carga en extraccion
- Faltan registros iniciales de placas de M40A
- Revisar lista de registros sin match en volcado a engine_xxx.json
- Creacion de gesa.json
- Creacion de subst.json
- Importacion de informacion de info_gesa e info_subst a engine_xxx.json
- Confirmar los scripts que pasan de _pdf a _final

-Actualizacion de estados Importar / Eliminar   OK/Pendientes
-FootNote EK?? tiene que ser para eliminar

IMAGENES
- Deteccion de registros sin imagenes
- Creacion de imagenes automaticamente desde web
- Comprobacion de rutas y carpetas (/01/   /02/)
- Propuesta de nueva estructura de carpetas (por motor)

EXPORTACION
- creacion de estructura de CSV de datos a importar
- creacion de registros NEW
- creacion de registros SUST
- AÃ±adir a SUST los articulos que solo aparecen en SUST y no tienen articulo en los PDF
- Que hacemos con los articulos de SUST en que su NEW no existe...(Le ponemos solo PN y copiamos la descripcion)
