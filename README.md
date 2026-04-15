# MILU

Proyecto web local para revision y mantenimiento de datos tecnicos de motores.

## Resumen rapido

- Backend local con Express en [server.js](server.js).
- Frontend principal en [qa_milu.html](qa_milu.html).
- Persistencia en archivos JSON del repo (no hay base de datos relacional).
- Datos runtime cargados desde 8 archivos `engine_*.json` (ver [js/data-loader.js](js/data-loader.js)).

## Puesta en marcha

1. Instalar dependencias:
   - `npm install`
2. Arrancar servidor:
   - `node server.js`
   - o usar [Ejecutar localhost.bat](Ejecutar%20localhost.bat)
3. Abrir la app:
   - `http://localhost:3000/qa_milu.html`

## Endpoints clave

- `GET /health`
- `GET/POST /qa_revision_sync.php`
- `POST /save-json` (edicion puntual de un campo en `engine_*.json`)
- `POST /apply-revision-to-engines` (aplicacion masiva de revisiones)

Archivo de persistencia de revisiones:
- [qa_revision_server_data.json](qa_revision_server_data.json)

## Proceso oficial: pasar de JSON originales a JSON definitivos

Este proceso recalcula campos finales y normaliza formato sobre los 8 archivos `engine_*.json` del root.

### Script

- [add_final_fields.py](add_final_fields.py)

### Ejecucion

```bash
python add_final_fields.py
```

En este repo, si usas el venv local en Windows:

```powershell
c:/Users/jordi/source/repos/milu/.venv/Scripts/python.exe add_final_fields.py
```

### Reglas aplicadas

1. `designation_final`
   - Si existe `designation_gesa`, se usa ese valor.
   - Si no, se usa `DESIGNATION`.

2. `measurement_final`
   - Si existe `dimensions_gesa`, se usa `dimensions_gesa`.
   - Si no, se usa `MEASUREMENT / STANDARD`.

3. Normalizacion de medidas
   - En `dimensions_gesa` y en el fallback `MEASUREMENT / STANDARD` se colapsan espacios multiples a uno.
   - Ejemplo: `A  55   X  5` -> `A 55 X 5`.

4. `weight_final`
   - Corrige typo legado `wheight_final` -> `weight_final`.
   - Si no hay `weight_final`, intenta reutilizar el legado, luego `WEIGHT`, y por ultimo `weight_gesa + units`.

## Notas de mantenimiento

- Evitar editar carpetas de salida salvo que la tarea lo requiera: `dist/`, `esquemas/`, `esquemas_pos_circulos/`, `json_originales/`, `zz_old/`, `fotos_articulos/`, `fotos_motores/`.
- No hay suite formal de tests en `package.json`; la validacion habitual es funcional contra la UI y endpoints.
- Para incidencias de persistencia, diagnosticar por capas: backend (`/health`), endpoint, payload frontend y escritura real en disco.
