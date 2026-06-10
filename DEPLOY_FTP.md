# DEPLOY FTP

## Generar la carpeta

```bash
node scripts/build_ftp_deploy.js
```

O con npm:

```bash
npm run build:ftp
```

## Qué hace el script

1. Limpia y recrea `deploy_ftp/` desde cero.
2. Parte de todos los `.html` de la raíz como semillas.
3. Rastrea dependencias (JS, CSS, imágenes, JSON) de forma recursiva.
4. Excluye: `node_modules`, `.git`, backups, `.py`, `.xlsx`, `.log`, `engine_*.json`, archivos >50 MB.
5. Genera dos copias del reporte:
   - `deploy_ftp_report.md` (raíz del proyecto)
   - `deploy_ftp/deploy_report.md` (dentro del deploy)

## Qué contiene `deploy_ftp/`

| Carpeta/Archivo | Contenido |
|---|---|
| `milu_shell.html` | Shell principal de la app |
| `analista_02.html` | Vista analista |
| `import_pdf.html` | Importación PDF |
| `recompute_simple.html` | Recompute manual |
| `css/`, `styles/` | Hojas de estilo |
| `js/` | Scripts frontend |
| `assets/` | Imágenes y recursos públicos |
| `version.json` | Versión de la app |
| `deploy_report.md` | Reporte del build |

## Qué subir por FTP

Todo el contenido de `deploy_ftp/` manteniendo la estructura de carpetas.

**No subir:**
- La carpeta raíz del proyecto
- `node_modules/`
- Archivos `.py`, `.bat`, `.ps1`
- `engine_*.json`
- Backups (`*.bak`, `*.backup*`)

## Comprobar después de subir

1. Abrir `milu_shell.html` desde el navegador.
2. Verificar que carga CSS y JS (sin errores 404 en consola).
3. Verificar que `version.json` responde.
4. Revisar `deploy_report.md` para endpoints backend que requieran servidor (`/api/`, `/recompute`, etc.): **no funcionan en hosting FTP estático puro**.

## Páginas críticas esperadas

- `milu_shell.html`
- `analista_02.html`
- `import_pdf.html`
- `recompute_simple.html`

Si alguna falta, el script emite un `WARN` en consola y la marca como `FALTA` en el reporte.

## Archivos grandes (>50 MB)

El script omite automáticamente archivos >50 MB y los lista en el reporte.
Para incluir un archivo grande específico, añadir su nombre a `SIZE_WHITELIST` en `scripts/build_ftp_deploy.js`.
