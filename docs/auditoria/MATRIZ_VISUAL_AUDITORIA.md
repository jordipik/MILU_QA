> **HISTÓRICO — AUDITORÍA**
>
> Matriz visual de riesgos por commit (2026-05-11). Referencia histórica.
>
> Movido a `docs/auditoria/` el 2026-05-12. Se conserva como evidencia histórica de hallazgos en una fecha concreta.

---

# MATRIZ VISUAL - AUDITORÍA DE COMMITS MILU
**Generado:** 2026-05-11 | **Período:** May 3 - May 11 (40 commits, 20 relevantes)

---

## COMMITS ORDENADOS POR RIESGO Y IMPACTO

### 🔴 CRÍTICOS - REQUIEREN ACCIÓN HOY

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ COMMIT: 73ff1c46 - "Actualizar calculo synthetic y sincronizar cambios"    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Fecha:      2026-05-09T11:09:22                                            │
│ Cambios:    +47,459 / -35,480 (MASIVO - 47K líneas de código)              │
│ Archivos:   18 (CSVs + engine JSONs + logs)                                │
│                                                                              │
│ ⚠️  PROBLEMAS:                                                              │
│     • CSVs wordpress COMPLETAMENTE recalculados sin validación             │
│     • engine_16V4000M73.json.backup regenerado (+65K líneas)               │
│     • qa_audit_log.json modificado (+1066 líneas)                          │
│     • Sin traza de qué cambió                                               │
│     • Sin validación schema o integridad                                    │
│                                                                              │
│ ✅ ACCIÓN INMEDIATA:                                                        │
│    1. Validar CSV files con schema                                          │
│    2. Comparar con git history si es posible                               │
│    3. Revisar generate_synthetic_exports.js cambios                        │
│    4. Backup de CSVs antes de hacer cambios                                │
│                                                                              │
│ 🎯 ESTIMADO: 2-3 horas                                                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ CRÍTICO IDENTIFICADO: engine JSONs falta measurement_final                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ Archivos:   9 (todos los engine_*.json)                                    │
│ Items:      67,883 total                                                    │
│ Items sin   1,576 (2.3% - principalmente engine_12V4000M70: 6.7%)         │
│ pn_final:                                                                    │
│                                                                              │
│ ✅ ACCIÓN INMEDIATA:                                                        │
│    1. Backup: cp engine_*.json backup_antes_depuracion                    │
│    2. Ejecutar: python depuracion_json.py                                  │
│    3. Validar: python validate_engine_jsons.py                             │
│    4. Commit: git add engine_*.json && git commit                          │
│                                                                              │
│ 🎯 ESTIMADO: 30 minutos                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 🟠 ALTOS - ACCIONES ESTA SEMANA

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ COMMIT: 7f3b62a0 - "feat: integrate imagenes/export views"                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Fecha:      2026-05-11T16:03:13                                            │
│ Cambios:    +2,093 / -34                                                    │
│ Archivos:   12 NUEVOS ARCHIVOS                                             │
│ Tipo:       FEATURE masivo                                                  │
│                                                                              │
│ ✨ NUEVO CÓDIGO:                                                            │
│    • qa_imagenes.html (92 líneas)                                          │
│    • js/qa_imagenes.js (576 líneas - MONOLÍTICO)                          │
│    • js/qa_imagenes_filters.js (196 líneas)                                │
│    • js/qa_imagenes_preview.js (102 líneas)                                │
│    • js/qa_imagenes_stats.js (80 líneas)                                   │
│    • js/qa_imagenes_table.js (209 líneas)                                  │
│    • css/qa_imagenes.css (605 líneas)                                      │
│                                                                              │
│ ⚠️  PROBLEMAS:                                                              │
│     • Cero tests unitarios                                                  │
│     • qa_imagenes.js muy grande (576 líneas = monolítico)                  │
│     • CSS +605 líneas sin separación por componente                        │
│     • Performance desconocido (múltiples tablas + filtros)                 │
│     • Integración en shell sin validación                                   │
│                                                                              │
│ ✅ ACCIÓN ESTA SEMANA:                                                      │
│    1. Performance test (PageSpeed, memoria, CPU)                            │
│    2. Test suite básico (50+ tests)                                         │
│    3. Refactorizar qa_imagenes.js (576 → 4 módulos de 140 líneas)         │
│    4. Optimizar CSS con separación por componente                          │
│                                                                              │
│ 🎯 ESTIMADO: 8-10 horas                                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ COMMIT: 549c682a - "chore: auditoria completa de imagenes y esquemas"     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Fecha:      2026-05-10T12:33:30                                            │
│ Cambios:    +56,589 / -1                                                    │
│ Archivos:   13 (9 PDFs binarios + CSV + script)                            │
│                                                                              │
│ ⚠️  PROBLEMAS:                                                              │
│     • 9 PDFs BINARIOS agregados (12-63 MB cada uno)                        │
│     • Repo size aumentó ~320 MB                                             │
│     • PDFs no deberían estar en git                                         │
│     • Ralentiza clones y pushes                                             │
│     • image_inventory.csv 55K líneas (sin indexación)                      │
│     • audit_image_schema_system.js (892 líneas) sin tests                  │
│                                                                              │
│ ✅ ACCIÓN INMEDIATA:                                                        │
│    1. Mover PDFs a .gitignore                                              │
│    2. Usar Git LFS para binarios (si necesarios)                           │
│    3. Crear carpeta /external para documentos                              │
│    4. Archivo README: "PDFs moved to external storage"                     │
│                                                                              │
│ 🎯 ESTIMADO: 1 hora                                                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ COMMIT: ad1737f0 - "QA: add ESQ_POS column with local file index"         │
├─────────────────────────────────────────────────────────────────────────────┤
│ Fecha:      2026-05-11T23:30:51 (MÁS RECIENTE)                             │
│ Cambios:    +174 / -4                                                       │
│ Archivos:   8                                                               │
│ Tipo:       FEATURE + BUGFIX                                                │
│                                                                              │
│ 🆕 NUEVO:                                                                   │
│    • server.js: +30 líneas (endpoint /esq-pos-index)                       │
│    • js/qa-table.js: +73 líneas (columna ESQ_POS)                          │
│    • js/state.js, schemas.js: cambios menores                              │
│                                                                              │
│ ⚠️  PROBLEMAS:                                                              │
│     • Nuevo endpoint SIN tests                                              │
│     • Cambio de MISS detection logic (impacta QA audit)                    │
│     • Sin validación de consistencia local/remoto                          │
│     • Sin documentación de cambio                                           │
│                                                                              │
│ ✅ ACCIÓN ESTA SEMANA:                                                      │
│    1. Tests para /esq-pos-index (5+ casos)                                 │
│    2. Tests para MISS detection (validar todos los casos)                  │
│    3. Validación de sincronización local/remoto                            │
│    4. Documentar cambio en Copilot Instructions                            │
│                                                                              │
│ 🎯 ESTIMADO: 4-5 horas                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 🟡 MEDIOS - MONITOREAR

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ COMMIT: 40fcafed - Breaking Change (elimina pn_review.html)               │
├─────────────────────────────────────────────────────────────────────────────┤
│ Fecha:      2026-05-08T18:00:11                                            │
│ Cambios:    +6,637 / -6,020                                                 │
│ Archivos:   11                                                              │
│ Tipo:       BREAKING CHANGE                                                 │
│                                                                              │
│ ❌ ELIMINADO:                                                               │
│    • pn_review.html (201 líneas)                                           │
│    • js/analista-02.js (121 líneas)                                        │
│                                                                              │
│ ✨ REFACTORIZADO:                                                           │
│    • export_wordpress.html (+153 líneas)                                   │
│    • js/export-wordpress.js (~889 cambios)                                 │
│                                                                              │
│ ✅ VALIDACIÓN:                                                              │
│    ✓ NO referencias huérfanas a pn_review en HTML                          │
│    ✓ NO referencias en JavaScript                                          │
│    ✓ Break fue limpio                                                       │
│                                                                              │
│ ⚠️  PENDIENTE:                                                              │
│    • engine_12V4000M53.json.backup ¿necesario?                             │
│    • Verificar backups no crearon inconsistencia                           │
│                                                                              │
│ 🎯 ESTADO: MITIGADO - Monitorear si hay problemas en UI                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ COMMIT: 18e4daf6 - "Fix synthetic ex_imagenes aggregation by PartNumber"  │
├─────────────────────────────────────────────────────────────────────────────┤
│ Fecha:      2026-05-11T16:09:22                                            │
│ Cambios:    +19 / -11 (30 líneas)                                          │
│ Archivos:   1 (js/export-wordpress.js)                                     │
│ Tipo:       BUGFIX                                                          │
│                                                                              │
│ 🐛 ARREGLADO:                                                               │
│    • Agregación de imágenes por PartNumber estaba rota                     │
│    • Synthetic data ahora correcto                                         │
│                                                                              │
│ 🎯 ESTADO: ✅ BUENO - Monitorear exports próximos                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ COMMIT: 9d40262c - "qa_imagenes: full-width layout"                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ Fecha:      2026-05-11T22:50:04                                            │
│ Cambios:    +1 / -2 (CSS)                                                   │
│ Archivos:   1 (css/qa_imagenes.css)                                        │
│ Tipo:       BUGFIX (UI)                                                     │
│                                                                              │
│ 🎯 ESTADO: ✅ SEGURO - Cambio cosmético                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## TIMELINE DE RIESGOS

```
ANTES              DURANTE              DESPUÉS
May 3              May 8-11             Impacto futuro
═════════════════════════════════════════════════════════════════

                    40fcafed
                    Breaking change
                    (pn_review)
                         ↓
                    ✓ Clean break
                    ✓ No refs
                         ↓
                    73ff1c46
                    Synthetic recompute
                    +47K/-35K
                         ↓
                    ✗ No validation
                    ✗ CSVs unknown
                    ✗ Audit trail unclear
                              ↓
                              7f3b62a0
                              Imagenes UI
                              +2K lines
                                   ↓
                                   ✗ No tests
                                   ✗ Monolithic
                                   ✗ Performance?
                                        ↓
                                        ad1737f0
                                        ESQ_POS column
                                        (Más reciente)
                                             ↓
                                             ✗ New endpoint
                                             ✗ MISS detection changed
                                             ⚠️ Unknown impact
```

---

## DISTRIBUCION DE DEUDA TÉCNICA

```
┌────────────────────────────────────────────────────────┐
│                   DEUDA TÉCNICA TOTAL                  │
│                      (acumulada)                       │
├────────────────────────────────────────────────────────┤
│                                                        │
│  TESTS:                    ███░░░░░░░░  0 tests        │
│  CODE QUALITY:             ███░░░░░░░░  Declining      │
│  DATA INTEGRITY:           ██░░░░░░░░░  LOW            │
│  DOCUMENTATION:            █████░░░░░░  MEDIUM         │
│  MODULE SIZE:              ██████░░░░░  HIGH           │
│  GIT HISTORY:              ███░░░░░░░░  Bloated (PDFs) │
│  SERVER.JS SIZE:           ████░░░░░░░  Growing        │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## DASHBOARD DE ACCIONES

### 🔴 TODAY (Bloquea otros trabajos)
```
[ ] Validar CSVs (73ff1c46)           - 2h
[ ] Ejecutar depuracion_json.py       - 0.5h
[ ] Mover PDFs a .gitignore           - 1h
[ ] Verificar engine_*.json.backup    - 0.5h
────────────────────────────────────────────
    TOTAL: 4 horas
    IMPACTO: Data integrity + repo health
```

### 🟠 THIS WEEK (Sprint actual)
```
[ ] Tests para ad1737f0 (ESQ_POS)     - 4h
[ ] Refactorizar qa_imagenes.js       - 6h
[ ] Performance testing              - 2h
[ ] Documentar workflow standard      - 2h
────────────────────────────────────────────
    TOTAL: 14 horas
    IMPACTO: Code quality + reliability
```

### 🟡 NEXT WEEK (Próximo sprint)
```
[ ] Modularizar server.js             - 8h
[ ] Refactor export-wordpress.js      - 6h
[ ] CI/CD pipeline básico             - 4h
[ ] Test suite completo               - 8h
────────────────────────────────────────────
    TOTAL: 26 horas
    IMPACTO: Maintainability + stability
```

---

## CONCLUSIÓN EN 60 SEGUNDOS

| Aspecto | Status | Acción |
|---------|--------|--------|
| **Bugs críticos** | 🔴 4 identificados | Validar hoy |
| **Code review** | ❌ Ninguno evidente | Implement |
| **Tests** | ❌ Cero en últimos 30 commits | Write now |
| **Documentation** | ⚠️ Algunas docs nuevas | Complete |
| **Data integrity** | 🔴 measurement_final falta | Run depuracion_json.py |
| **Performance** | ❓ Desconocido | Test required |
| **Breaking changes** | ✅ Mitigados | Monitor |

**Veredicto:** 
> El proyecto crece rápido pero **sin controles de calidad**. 
> **Action needed TODAY** para evitar problemas mayores la próxima semana.

---

**Actualizado:** 2026-05-11 23:45 | **Próxima revisión:** 2026-05-18
