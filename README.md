# MILU

Aplicación web local para QA y exportación de catálogos de motores (datos source-of-truth en archivos JSON, sin base de datos relacional).

- Backend: Express ([server.js](server.js)) escuchando en `http://localhost:3000`.
- Frontend: módulos ES en `js/`, entrada principal [qa_milu.html](qa_milu.html).
- Datos runtime: 9 archivos `engine_*.json` cargados por [js/data-loader.js](js/data-loader.js).

## Arranque rápido

```powershell
npm install
node server.js
```

Después abre `http://localhost:3000/qa_milu.html` (o ejecuta [Ejecutar localhost.bat](Ejecutar%20localhost.bat)).

Comprobación de salud: `GET /health`.

## Estructura del repositorio

```
server.js                Backend Express
qa_milu.html             Entrada principal del frontend
js/                      Módulos ES del frontend
engine_*.json            9 archivos JSON con los datos de motores (source of truth)
qa_revision_server_data.json   Persistencia de revisiones QA
data/                    Datos auxiliares
fotos_articulos/, fotos_motores/, esquemas/   Multimedia (no editar)
docs/                    Documentación (ver más abajo)
scripts Python (root)    Utilidades offline (depuración, importación, estadísticas)
dist/, json_originales/, zz_old/   Generados / históricos (no editar)
```

## Documentación

Toda la documentación vive en [docs/](docs/README.md). Documentos canónicos (fuente única de verdad por tema):

- Arquitectura: [docs/ARQUITECTURA_MILU.md](docs/ARQUITECTURA_MILU.md)
- Flujo de datos: [docs/FLUJO_DATOS_MILU.md](docs/FLUJO_DATOS_MILU.md)
- QA / reglas y comprobaciones: [docs/QA_MILU.md](docs/QA_MILU.md)
- Export WordPress (QA-only): [docs/WORDPRESS_EXPORT_MILU.md](docs/WORDPRESS_EXPORT_MILU.md)
- Imágenes y esquemas: [docs/IMAGENES_ESQUEMAS_MILU.md](docs/IMAGENES_ESQUEMAS_MILU.md)
- Plan de trabajo: [docs/PLAN_TRABAJO_MILU.md](docs/PLAN_TRABAJO_MILU.md)

Subcarpetas en `docs/`:

- `archived/` — superseded / históricos (con banner ARCHIVADO).
- `auditoria/` — auditorías históricas.
- `proposals/` — propuestas no implementadas (PENDIENTE DE VALIDAR).
- `modules/` — referencia técnica módulo a módulo.
- `images/`, `legacy/`, `canonical/` — auxiliares.

Estado actual de la consolidación documental: [docs/ESTADO_FINAL_DOCUMENTACION.md](docs/ESTADO_FINAL_DOCUMENTACION.md).
Proceso y auditoría de la limpieza: [docs/MILU_LIMPIEZA_DOCUMENTACION.md](docs/MILU_LIMPIEZA_DOCUMENTACION.md).

## Diagnóstico (orden recomendado)

Ante un fallo, validar en este orden antes de tocar UI:

1. `GET /health`
2. `GET/POST /qa_revision_sync.php` (debe responder JSON, no servir el archivo PHP)
3. `/save-json` o `/apply-revision-to-engines` según el flujo afectado
4. Frontend

Para persistencia: servidor levantado → respuesta HTTP → payload del frontend → escritura en `qa_revision_server_data.json` o `engine_*.json`.

## Convenciones

- Backend: CommonJS. Frontend: módulos ES.
- No editar carpetas generadas/datos: `dist/`, `esquemas/`, `esquemas_pos_circulos/`, `json_originales/`, `zz_old/`, `fotos_articulos/`, `fotos_motores/`.
- Paso a JSON definitivos: ejecutar [depuracion_json.py](depuracion_json.py) sobre los 9 `engine_*.json`.
- `measurement_final`: prioriza `dimensions_gesa`; fallback `MEASUREMENT / STANDARD`. Espacios múltiples se colapsan.
