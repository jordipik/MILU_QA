# MILU

Proyecto web local para revision y mantenimiento de datos tecnicos de motores.

## Resumen rapido

- Backend local con Express en [server.js](server.js).
- Frontend principal en [qa_milu.html](qa_milu.html).
- Persistencia en archivos JSON del repo (no hay base de datos relacional).
- Datos runtime cargados desde 9 archivos `engine_*.json` (ver [js/data-loader.js](js/data-loader.js)).

## Puesta en marcha

1. Instalar dependencias:
   - `npm install`
2. Arrancar servidor:
   - `node server.js`
   - o usar [Ejecutar localhost.bat](Ejecutar%20localhost.bat)
3. Abrir la app:
   - `http://localhost:3000/qa_milu.html`

## Publicacion automatica (GitHub Pages)

El repo ya incluye workflow de despliegue automatico en:
- `.github/workflows/deploy-pages.yml`

Comportamiento:
- Publica el contenido de `dist/milu_publish/` en GitHub Pages.
- Se ejecuta en `push` a las ramas `main` y `pasar-a-javascript` cuando hay cambios en `dist/milu_publish/**`.
- Tambien permite ejecucion manual desde la pestaña Actions (`workflow_dispatch`).

Configuracion unica en GitHub (solo la primera vez):
1. Ir a `Settings > Pages` del repositorio.
2. En `Source`, seleccionar `GitHub Actions`.

Dominio personalizado:
- El archivo `CNAME` se publica desde `dist/milu_publish/CNAME` (actualmente `milu.alentio.es`).
- Si cambias de dominio, actualiza ese archivo y haz push.

Preparar `dist/milu_publish` en local (recomendado antes de push):
1. Revisar sin copiar (dry-run):
   - `npm run pages:prepare:incremental:dry`
2. Generar carpeta publicable (incremental, recomendado):
   - `npm run pages:prepare:incremental`
3. Generar carpeta publicable completa (full reset + copia total):
   - `npm run pages:prepare`
4. Commit + push de los cambios en `dist/milu_publish/**`.

El script copia a `dist/milu_publish/`:
- HTML y estilos de entrada
- carpetas `js/`, `styles/`, `esquemas/`, `esquemas_pos_circulos/`
- `CNAME`
- todos los `engine_*.json`

Publicar con un comando (prepare + stage + commit + push):
- `npm run pages:publish`

Por defecto `pages:publish` usa prepare incremental para reducir tiempo.

Variantes utiles:
- Solo hasta commit (sin push): `npm run pages:publish:nopush`
- Solo preparar y dejar stage listo (sin commit ni push): `npm run pages:publish:stage-only`
- Publicacion con prepare completo: `npm run pages:publish:full`
- Publicacion con prepare completo sin push: `npm run pages:publish:full:nopush`

Notas del script de publicacion:
- Hace `npm run pages:prepare` automaticamente.
- Hace `git add dist/milu_publish CNAME`.
- Si no hay cambios, termina sin error.
- Hace commit con mensaje por defecto: `chore: publish pages`.
- Hace push a la rama actual (`origin/<rama_actual>`), salvo que uses `nopush`.

## Endpoints clave

- `GET /health`
- `GET /qa_revision_sync.php`
- `POST /qa_revision_sync.php`
- `POST /save-json` (edicion puntual de un campo en `engine_*.json`)
- `POST /apply-revision-to-engines`

## Export WordPress (flujo oficial QA-only)

Script oficial:
- `npm run export:wordpress`

Regla de decision:
- Se agrupa globalmente por PN en los 9 `engine_*.json`.
- La decision final depende solo de `qa_revision_estado` + `qa_revision_accion`.

Outputs oficiales:
- `data/output/wordpress/milu_wp_import.csv`
- `data/output/wordpress/milu_wp_discarded.csv`
- `data/output/wordpress/milu_wp_pending_review.csv`
- `data/output/wordpress/milu_wp_import.json`
- `data/output/wordpress/milu_wp_export_summary.md`
- Opcional: `data/output/wordpress/milu_wp_trace.json`

Legacy archivado:
- `npm run legacy:ai:conflicts`
- `npm run legacy:export:review`
- `npm run legacy:generate:synthetic`
- `legacy/export_complex_ai/`

Guia detallada:
- [docs/14_wordpress_export_simplified.md](docs/14_wordpress_export_simplified.md)

## Proceso oficial: pasar de JSON originales a JSON definitivos

Este proceso recalcula campos finales y normaliza formato sobre los 9 archivos `engine_*.json` del root.

### Script

- [depuracion_json.py](depuracion_json.py)

### Ejecucion

```bash
python depuracion_json.py
```

En este repo, si usas el venv local en Windows:

```powershell
c:/Users/jordi/source/repos/milu/.venv/Scripts/python.exe depuracion_json.py
```

### Reglas aplicadas

1. `designation_final`
   - Si existe `designation_gesa`, se usa ese valor.
   - Si no, se usa `DESIGNATION`.

2. `measure_final`
   - Si existe `dimensions_gesa`, se usa `dimensions_gesa`.
   - Si no, se usa `MEASUREMENT / STANDARD`.

3. Normalizacion de medidas
   - En `dimensions_gesa` y en el fallback `MEASUREMENT / STANDARD` se colapsan espacios multiples a uno.
   - Ejemplo: `A  55   X  5` -> `A 55 X 5`.

4. `weight_final`
   - Corrige typo legado `wheight_final` -> `weight_final`.
   - Si no hay `weight_final`, intenta reutilizar el legado, luego `WEIGHT`, y por ultimo `weight_gesa + units`.

5. Errores QA persistidos por registro
   - Se generan flags numericos por campo: `pos_error`, `pn_error`, `designation_error`, `weight_error`, `measurement_error`, `norma_error`, `bom_error`.
   - Se calcula `total_error` como suma de esos flags.
   - Se actualiza `has_error` como booleano derivado (`total_error > 0`).

## Notas de mantenimiento

- Evitar editar carpetas de salida salvo que la tarea lo requiera: `dist/`, `esquemas/`, `esquemas_pos_circulos/`, `json_originales/`, `zz_old/`, `fotos_articulos/`, `fotos_motores/`.
- No hay suite formal de tests en `package.json`; la validacion habitual es funcional contra la UI y endpoints.
- Para incidencias de persistencia, diagnosticar por capas: backend (`/health`), endpoint, payload frontend y escritura real en disco.
