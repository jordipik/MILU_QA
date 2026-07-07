# MILU INVENTARIO SCRIPTS

## 1. Criterios de estado
- Critico: necesario para runtime web o pipeline oficial actual.
- Util: soporte operativo o analisis complementario.
- Revisar: funcional pero con solapamiento, alcance ambiguo o deuda.
- Obsoleto: legado/historico no recomendado para flujo oficial.

## 2. Tabla exhaustiva (fuente auditada)

| Archivo | Lenguaje | Funcion principal | Entrada | Salida | Dependencias | Estado |
|---|---|---|---|---|---|---|
| server.js | Node/Express | Backend API QA, persistencia JSON, export, PN review | HTTP + engine_*.json | JSON HTTP + escritura en disco | express/body-parser/cors | Critico |
| engine_files.js | JS | Lista oficial de 9 engines | interno | array de archivos | Node | Critico |
| js/qa-milu.js | JS ESM | Orquestador UI QA principal | state + DOM + fetch API | render, guardado, eventos | data-loader/revision/qa-table | Critico |
| js/qa-table.js | JS ESM | Tabla, filtros, stats, paginacion | state.allData | HTML tabla | helpers/revision | Critico |
| js/revision.js | JS ESM | Reglas estado/accion, persistencia revision | filas + selects | cambios en row + /save-json | data-loader | Critico |
| js/data-loader.js | JS ESM | Carga engines y guardado remoto | engine_*.json + backend | arrays runtime + POST save | fetch/pako | Critico |
| js/state.js | JS ESM | Estado global compartido | n/a | objeto mutable global | qa-checks | Critico |
| qa_milu.html | HTML | UI principal QA | navegador | app QA operativa | js/qa-milu.js | Critico |
| analista_02.html | HTML | UI analista por registro/PDF | navegador | app analista | js/analista-02.js | Critico |
| js/analista-02.js | JS ESM | Flujo analista, acciones por registro, recompute | allData + backend | guardados y navegacion | data-loader/revision/pdf-viewer | Critico |
| scripts/export_wordpress_milu.js | Node | Export WordPress QA-only por PN | 9 engine_*.json | JSON/CSV/MD en data/05-wordpress | fs/path | Critico |
| exportacion.html | HTML | Pantalla export QA-only | backend export endpoints | vista y control ejecucion | js/exportacion.js | Critico |
| js/exportacion.js | JS | Dashboard export, preview archivos y decisiones | /export/* | UI de ejecucion y preview | fetch API | Critico |
| export_wordpress.html | HTML | Vista comparativa/export WordPress | backend + JSON | revision visual por pestaÃ±as | js/export-wordpress.js | Revisar |
| js/export-wordpress.js | JS | Cliente export con synthetic local y tabs | /export/status + JSON | UI comparativa | fetch | Revisar |
| recompute_engine_errors.js | Node | Recalculo flags *_error y revision opcional | engine file + id opcional | JSON actualizado | engine_files.js | Critico |
| scripts/qa_pdf_compare.js | Node | Comparacion PDF->campos *_pdf + reporte | PDF + engine file | campos *_pdf + reportes JSON | pdfjs-dist + fs | Critico |
| apply_revision_to_engines.js | Node | Aplicacion masiva de revisiones v2/legacy | payload revisiones | engine_*.json actualizados | engine_files.js | Critico |
| apply-bulk-revision-to-engine.js | Node | Fuerza estado copia por PN en un engine | engine file + opcional PN | engine file modificado | fs/path | Revisar |
| qa_revision_sync.php | PHP | Compat sync revisiones en host PHP | GET/POST revisions | qa_revision_server_data.json | PHP stdlib | Util |
| save-json.php | PHP | Compat save-json en host PHP | file/id/col/value | engine file actualizado | PHP stdlib | Util |
| qa_analista_registro.html | HTML | Pantalla analista registro legacy/soporte | navegador | QA por registro | js/qa-analista-registro.js | Util |
| js/qa-analista-registro.js | JS ESM | Logica de qa_analista_registro | data + pdf | UI + guardado | revision/data-loader | Util |
| qa_auditoria.html | HTML | Visor auditoria | navegador | historial cambios | js/qa-auditoria.js | Util |
| js/qa-auditoria.js | JS ESM | Cliente de /audit-log | backend audit endpoints | tabla/log auditoria | fetch | Util |
| qa_lista_agrupada.html | HTML+JS inline | Vista agrupada por PN | engine data | tabla agregada | pako + script inline | Revisar |
| milu_shell.html | HTML+JS inline | Contenedor tipo workspace entre vistas | iframes + mensajes | navegacion integrada | paginas internas | Util |
| index.html | HTML+JS inline | Landing de accesos MILU | navegador | menu navegacion | enlaces internos | Util |
| js/helpers.js | JS ESM | utilidades de campo/errores/normalizacion | rows | valores derivados | n/a | Critico |
| js/qa-checks.js | JS ESM | definicion checks QA cliente | rows | codigos/etiquetas error | n/a | Critico |
| js/pdf-viewer.js | JS ESM | visor PDF y resaltado | pdf.js + row | render canvas + highlights | pdf.js | Critico |
| js/schemas.js | JS ESM | panel de esquemas/circulos | row + rutas esquemas | galeria de imagenes | n/a | Critico |
| js/column-view.js | JS ESM | configuracion de vistas de columnas | state + localStorage | ocultar/mostrar columnas | n/a | Critico |
| js/cell-editor.js | JS ESM | edicion inline de celdas | eventos tabla | guardado puntual | data-loader | Util |
| js/change-control.js | JS ESM | undo/redo + auditoria cliente | acciones UI | historial y revert | n/a | Util |
| js/revision-sync.js | JS ESM | sincronia revision entre pestaÃ±as | localStorage/events | refresh cruzado | n/a | Util |
| js/topbar.js | JS ESM | topbar comun y estado backend | backend status | barra superior | data-loader | Util |
| js/pos-preload.js | JS ESM | precarga de imagenes pos visibles | rows visibles | mejora UX | n/a | Util |
| js/pn-review.js | JS ESM | flujo PN review dedicado | /pn-review/* | UI de decisiones PN | fetch | Revisar |
| js/pn-review-embedded.js | JS ESM | PN review embebido en analista | row activa + backend | panel PN embebido | fetch | Util |
| js/pn_review.js | JS | variante antigua PN review | datos legacy | UI antigua | n/a | Obsoleto |
| js/bulk-revision-helper.js | JS | helper bulk por PN (window API) | row seleccionada | cambios revision masivos | revision.js | Revisar |
| add_final_fields.py | Python | version historica de depuracion final fields | engine_*.json | engine_*.json | json/re | Revisar |
| depuracion_json.py | Python | proceso oficial de consistencia final + errores | 9 engine_*.json + qa_* opcional | 9 engine_*.json actualizados | json/re/unicode | Critico |
| importar_json.py | Python | reimport desde qa_*.json + depuracion + compare PDF | json_originales + flags CLI | engine_*.json regenerados | python + node scripts | Critico |
| compare_measurements.py | Python | comparativa medidas entre datasets | JSONs | reporte comparativo | pandas/json | Util |
| convert_excel_to_json.py | Python | xlsx -> json puntual | xlsx | json | pandas | Util |
| convert_engine_to_excel.py | Python | json engine -> excel | engine json | xlsx | pandas | Util |
| convert_engines.py | Python | conversion batch engines | engine json | archivos convertidos | pandas/json | Util |
| estadisticas_articulos.py | Python | estadisticas por articulo | engine json | resumen terminal | json | Util |
| informe_estadisticas.py | Python | informe estadistico consolidado | engine json | informe_estadisticas.txt | json | Util |
| marcar_articulos_en_web.py | Python | marcaje EN_WEB por lista | JSONs de entrada | engine actualizado | json | Util |
| pretty_print_all_json.py | Python | formateo pretty JSON | json files | mismos archivos formateados | json/pathlib | Util |
| scripts/dev/audit_json_fields.py | Python | auditoria de campos JSON | engine_*.json | reportes en docs | pandas/json | Util |
| generate_synthetic_exports.js | Node | generador synthetic legacy (root) | engine_*.json | qa_synthetic_*.json | fs/path | Obsoleto |
| scripts/refactor_engine_schema_v2.js | Node | util refactor schema v2 | engine data | artefactos v2 | Node | Revisar |
| scripts/prepare-pages-dist.js | Node | build dist/milu_publish | repo fuente | dist preparado | fs/path | Util |
| scripts/publish-pages.ps1 | PowerShell | commit/push de dist para pages | git repo | commit/push | git/npm | Util |
| scripts/publish-safe.ps1 | PowerShell | wrapper seguro de publicacion | git repo | publicacion controlada | git/npm | Util |
| scripts/git-backup.ps1 | PowerShell | backup completo git + zip | repo local/remotos | commit/push/zip | git + filesystem | Util |
| Backup Git y Copia.bat | BAT | launcher backup historico | repo | backup | powershell/git | Util |
| Ejecutar localhost.bat | BAT | arranque local rapido | node env | servidor + apertura URL | node | Critico |
| app.js | JS | util/legacy de analisis puntual | archivos json | consola/reportes | fs | Obsoleto |
| analysis.js | JS | analisis puntual de QA antiguos | json root | salida consola | fs | Obsoleto |
| debug.js | JS | pruebas diagnostico rapidas | json root | consola | Node | Obsoleto |
| sanity.js | JS | chequeo de sanidad rapido | json root | consola | Node | Util |
| extraccion_de_pdf_a_excel/milu_export_datos_v6_2.py | Python | extraccion tablas PDF -> Excel/CSV | carpeta PDFs | excels/csv por PDF + consolidado | pdfplumber/pandas/tqdm | Critico (upstream) |
| extraccion_de_pdf_a_excel/milu_export_esquemas_v6_2.py | Python | recorte esquemas/imagenes por pagina | PDFs | PNGs + CSV metadatos | PyMuPDF | Critico (upstream) |
| extraccion_de_pdf_a_excel/milu_export_paginas_v1.py | Python | extraccion por pagina (soporte) | PDFs | artefactos por pagina | python libs PDF | Util |
| extraccion_de_pdf_a_excel/install_and_run_*.bat | BAT | instalacion/ejecucion wrappers extraccion | entorno local | ejecucion scripts v6_2 | python/pip | Util |
| legacy/export_complex_ai/scripts/* | Node | pipeline IA complejo historico | synthetic/export_review | reportes legacy | Node | Obsoleto |

## 3. Scripts criticos del pipeline actual
1. importar_json.py
2. depuracion_json.py
3. scripts/qa_pdf_compare.js
4. recompute_engine_errors.js
5. server.js
6. js/qa-milu.js
7. js/analista-02.js
8. scripts/export_wordpress_milu.js

## 4. Duplicados/solapamientos relevantes
- depuracion_json.py vs add_final_fields.py
- js/pn-review.js vs js/pn_review.js
- generate_synthetic_exports.js (root) vs scripts/export_wordpress_milu.js (oficial)
- export_wordpress.html + js/export-wordpress.js vs panel export embebido en qa_milu

## 5. Orden recomendado de ejecucion operacional
1. Reimport/depuracion: importar_json.py y/o depuracion_json.py.
2. Compare PDF si aplica: scripts/qa_pdf_compare.js.
3. QA operativo web: qa_milu.html y analista_02.html.
4. Export final: scripts/export_wordpress_milu.js o /export/run-wordpress.

