# PLAN DE ACCION - QUICK START

## Situacion actual (auditoria completada)
✅ Documentacion exhaustiva completada (10 documentos + plan detallado)  
✅ Sin cambios de codigo ni datos aplicados aun  
✅ Linea base de conocimiento establecida  

## Objetivo general
Reducir riesgo tecnico y deuda estructural en MILU sin romper operacion QA diaria.

---

## HOY: Semanas 1-2 (FASE P0)

### Que hacer esta semana
1. **Crear rama de desarrollo**: `git checkout -b refactor/milu-stability-p0`
2. **Hacer backup de datos vivos**:
   ```powershell
   mkdir backup
   Copy-Item engine_*.json backup/
   Copy-Item qa_revision_server_data.json backup/
   Copy-Item qa_audit_log.json backup/
   ```
3. **Etiquetar repositorio**: Agregar tag `audit-baseline-v1` a commit actual.

### Tareas concretas (pick one por dia)

#### Lunes: Checklist operativa diaria
📋 **docs/CHECKLIST_OPERATIVA_DIARIA.md**
- [ ] Crear doc con pasos minimos de QA y export.
- [ ] Ejecutar 3 veces y cronometrar.
- [ ] Documentar tiempos esperados.
- **Entrega**: Checklist lista, tiempos registrados, validada manualmente.

#### Martes: Matriz de endpoints criticos
🔗 **docs/MATRIZ_ENDPOINTS_CRITICOS.md**
- [ ] Listar 6 endpoints principales.
- [ ] Copiar ejemplos de payloads reales de qa_milu.html y scripts.
- [ ] Hacer curl manual de cada uno.
- [ ] Documentar schema entrada/salida.
- **Entrega**: Matriz completa con ejemplos ejecutables.

#### Miercoles: Tabla de scripts oficiales
📊 **docs/TABLA_SCRIPTS_OFICIALES.md**
- [ ] Crear tabla: archivo | oficial/revisar/obsoleto | entrada | salida.
- [ ] Copiar de MILU_INVENTARIO_SCRIPTS.md.
- [ ] Marcar claramente legacy vs activos.
- [ ] Agregar advertencia en cada script legacy.
- **Entrega**: Tabla clara, scripts legacy etiquetados.

#### Jueves: Contrato formal de revision y campos core
📄 **docs/CONTRATO_REVISION_FORMAL.md + CONTRATO_CAMPOS_CORE.md**
- [ ] Enum canonico: estado {pendiente, ok}, accion {importar, copia, revisar, eliminar}.
- [ ] Campos core que no cambian: ID, engine_model, PART NO., pn_final, etc.
- [ ] Copiar de js/revision.js y validar en datos actuales.
- **Entrega**: Contratos formalizados, listo para codigo.

#### Viernes: Baseline de metricas
📈 **docs/METRICAS_BASELINE.md**
- [ ] Tiempo carga qa_milu (vacio + 67k filas).
- [ ] Tiempo filtro masivo (estado=ok).
- [ ] Tiempo guardado /save-json.
- [ ] Tiempo export/run-wordpress.
- [ ] Tasa exito /qa_revision_sync.php.
- [ ] Ejecutar cada operacion 5 veces, registrar.
- **Entrega**: 5+ metricas en baseline, hardware/condiciones documentadas.

### Criterio de exito P0
✅ Todos 5 documentos listos y validados  
✅ Checklist ejecutada 3+ veces sin errores  
✅ Metricas baseline registradas  
✅ Cero cambios de codigo funcional  

---

## PROXIMO MES: Semanas 3-6 (FASE P1)

**Cuando iniciar**: Despues de P0 completado y validado  
**Criterio entrada**: Checklist operativa ejecutable en 10 minutos, metricas baseline <1% variacion

### Que construir en P1

#### P1.1: Capa de IO JSON (server/services/json-store.js)
```
Costo: 4-6 horas
Risk: Bajo (capa nueva, sin cambios existentes)
Entrada: Logica actual de guardado en server.js
Salida: Modulo reutilizable, /save-json refactorizado
Criterio exito: Guardado sigue funcionando, tests manuales pasan
```

#### P1.2: Reglas de revision centralizadas (revision-rules.js)
```
Costo: 6-8 horas
Risk: Bajo (modulo nuevo)
Entrada: Logica de js/revision.js + scripts/export_wordpress_milu.js
Salida: Modulo compartido backend+frontend, usado en 3+ lugares
Criterio exito: Enum siempre consistente, sin divergencia UI/export
```

#### P1.3: Reglas de PN centralizadas (pn-rules.js)
```
Costo: 4-6 horas
Risk: Bajo (modulo nuevo)
Entrada: Logica de normalizacion de depuracion_json.py y UI
Salida: Modulo comparacion PN unico
Criterio exito: Duplicados de PN detectados, export consolida por SKU correcto
```

#### P1.4: Separar routers por dominio (server/routers/)
```
Costo: 8-10 horas
Risk: Medio (refactor de server.js, pero rutas iguales)
Entrada: server.js actual (~2000 lineas)
Salida: server/routers/*.js (6 routers pequenos)
Criterio exito: Mismo comportamiento HTTP, cero regresion
```

#### P1.5: Validaciones de schema (middleware/validate-payload.js)
```
Costo: 4-6 horas
Risk: Bajo (middleware nuevo)
Entrada: Payloads actuales de UI
Salida: Validaciones rechazando malformados
Criterio exito: Payloads validos pasan, invalidos rechazados con 400
```

### Hito P1
**Semana 6**: P1.1 a P1.5 completados, tests smoke manuales de cada router OK, sin regresion.

---

## 2 MESES: Semanas 7-10 (FASE P2)

**Cuando iniciar**: Despues de P1 estable (semana 6)  
**Criterio entrada**: Operacion diaria sin regresion visible

### Que construir en P2

#### P2.1: Schema JSON formal versionado (schema/runtime-v1.json)
```
Costo: 6-8 horas
Entrada: 67k filas de 9 engines actuales
Salida: JSON schema v1 documentando modelo actual + v1-strict
Criterio exito: 100% de datos actuales valida contra schema
```

#### P2.2: Tests smoke automatizados (tests/smoke/)
```
Costo: 8-10 horas
Entrada: Endpoints criticos, checklist operativa
Salida: Suite ejecutable "npm run test:smoke"
Criterio exito: 6+ test cases, todos pasan, CI ready
```

#### P2.3: Optimizacion rendimiento (virtualizacion tabla)
```
Costo: 10-12 horas
Entrada: Baseline P0.5 (tiempo carga + filtrado)
Salida: Virtualizacion incrementalista, target >= 20% mejora
Criterio exito: Carga < 2seg, filtrado < 500ms
```

#### P2.4: Observabilidad ligera (server/services/metrics.js)
```
Costo: 4-6 horas
Entrada: Operacion diaria, logs actuales
Salida: GET /metrics endpoint + console logs estructurados
Criterio exito: Detecta anomalias operativas sin overhead
```

### Hito P2
**Semana 10**: Tests automatizados verdes, schema documentado, rendimiento >= 20% mejora, observabilidad live.

---

## 3-4 MESES: Semanas 11+ (FASE P3)

**Cuando iniciar**: Despues de P2 estable (semana 10)  
**Criterio entrada**: Tests pass, zero regression, operacion smooth

### Que hacer en P3 (evolutiva, paralela a operacion)

#### P3.1: Congelar legacy (legacy/ reorganizado)
```
Costo: 2-3 horas
Qué: Mover scripts obsoletos, crear README legacy
Riesgo: Muy bajo (sin cambios logica)
```

#### P3.2: Reorganizar carpetas (apps/, tools/, data/)
```
Costo: 8-12 horas (con testing)
Qué: Estructura profesional con wrappers compatibles
Riesgo: Bajo si P0/P1/P2 solidificados
```

#### P3.3: Consolidar UIs redundantes
```
Costo: 4-6 horas (documentacion + deprecation)
Qué: Eliminar duplicados, mantener wrappers redireccionadores
Riesgo: Bajo si flujos mapeados correctamente
```

---

## MAPA DE DECISIONES POR SEMANA

```
Semana 1   -> P0.1 (Checklist)
Semana 2   -> P0.2-P0.5 (Docs + Metricas)
Semana 3   -> P1.1-P1.2 (IO + Revision)
Semana 4   -> P1.3-P1.4 (PN + Routers)
Semana 5   -> P1.5 (Validaciones)
Semana 6   -> Tests P1, validacion
Semana 7   -> P2.1-P2.2 (Schema + Tests)
Semana 8   -> P2.3-P2.4 (Perf + Metrics)
Semana 9   -> Tests P2, validacion
Semana 10  -> Buffer + decision P3
Semana 11+ -> P3 (si recursos disponibles)
```

---

## COMANDO RAPIDO PARA HOY

**Si es lunes de semana 1**:
```powershell
cd c:\Users\jordi\source\repos\milu
git checkout -b refactor/milu-stability-p0
mkdir backup
Copy-Item engine_*.json backup/
Copy-Item qa_revision_server_data.json backup/
Copy-Item qa_audit_log.json backup/
git add backup/
git commit -m "backup: baseline data before P0 refactor"

# Abrir docs/CHECKLIST_OPERATIVA_DIARIA.md y empezar a escribir
code docs/CHECKLIST_OPERATIVA_DIARIA.md
```

**Si es viernes de semana 2**:
```powershell
# Ejecutar metricas baseline (5 veces cada operacion)
# 1. Time carga qa_milu (F12 Network tab, reload)
# 2. Time filtro (estado=ok) en tabla
# 3. Time /save-json (cualquier cambio pequeño)
# 4. Time /export/run-wordpress desde UI
# 5. Verificar /qa_revision_sync.php responde

# Registrar en docs/METRICAS_BASELINE.md
code docs/METRICAS_BASELINE.md
```

---

## RIESGOS CRITICOS: QUE NO HACER

🚫 **No tocar** en P0/P1:
- Nombres de campos en engine files.
- Rutas HTTP existentes.
- Scripts operativos en paralelo (hasta P3).

🚫 **No hacer cambios masivos** sin:
- Backup de datos.
- Tests validando cambio.
- Ventana sin usuarios.

---

## RECURSOS Y REFERENCIAS

- Plan detallado: [PLAN_ACCION_EJECUCION_DETALLADA.md](PLAN_ACCION_EJECUCION_DETALLADA.md)
- Auditoria completa: [09_auditoria_2026.md](09_auditoria_2026.md) (consolidada) · históricas en [archived/](archived/)
- Estructura recomendada: [01_structure.md](01_structure.md) · histórica en [archived/MILU_ESTRUCTURA_CARPETAS.md](archived/MILU_ESTRUCTURA_CARPETAS.md)
- Pipeline actual: [02_data_flow.md](02_data_flow.md) · histórica en [archived/MILU_PIPELINE_COMPLETO.md](archived/MILU_PIPELINE_COMPLETO.md)
- Inventario scripts: [MILU_INVENTARIO_SCRIPTS.md](MILU_INVENTARIO_SCRIPTS.md)

---

## PREGUNTAS FRECUENTES

**P: Cuanto tiempo toma todo?**  
R: P0 (2 semanas) + P1 (4 semanas) + P2 (4 semanas) = ~10 semanas. P3 es evolutiva, paralela.

**P: Puedo empezar por P1 sin P0?**  
R: No recomendado. P0 establece linea base de operacion sin riesgos, facilita rollback si P1 falla.

**P: Cuanto riesgo hay?**  
R: P0=ninguno (docs). P1=bajo (modulos nuevos, rutas iguales). P2=bajo (tests + schema, sin logica change). P3=bajo si P0/P1/P2 OK.

**P: Puedo hacer cambios en paralelo?**  
R: Si, pero documentar bien. Recomendado: lineal P0->P1->P2->P3 para evitar conflictos.

**P: Que pasa si algo rompe?**  
R: Revert a branch anterior, rollback datos de backup/, aprender de tests.

---

## PROXIMO PASO

**[👉 Comenzar P0.1: CHECKLIST_OPERATIVA_DIARIA.md](../docs/CHECKLIST_OPERATIVA_DIARIA.md)**
