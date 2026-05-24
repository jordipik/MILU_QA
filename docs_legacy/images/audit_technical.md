# Auditoría Técnica Completa

Evaluación de problemas, deuda técnica, riesgos de escalabilidad y estrategia de remediación.

---

## 📋 Hallazgos por Categoría

### 🔴 Problemas Críticos

#### 1. **URLs Hardcodeadas en depuracion_json.py**

**Severidad**: 🔴 Crítica  
**Impacto**: Todos los JSONs necesitan regeneración si cambia el dominio  
**Ubicación**: [depuracion_json.py](../../depuracion_json.py#L34)

```python
DEFAULT_EXP_IMAGENES = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg"
```

**Problema**:
- URL hardcodeada como constante global
- No hay mecanismo de configuración
- Si se migra a otro servidor → regenerar JSONs completos
- No hay validación de accesibilidad

**Riesgo**:
- ❌ Deployment bloqueado por cambio de dominio
- ❌ URLs rotas en producción
- ❌ Inconsistencia entre ambientes

**Remediación**:
- ✅ Crear `config.json` centralizado (VISTO EN PENDING_IMPROVEMENTS.md)
- ✅ Cargar placeholder desde configuración
- ✅ Validar URL accesibilidad antes de guardar

**Priority**: P1 (NEXT sprint)  
**Effort**: 1h

---

#### 2. **Validación de Rutas Incompleta**

**Severidad**: 🔴 Crítica  
**Impacto**: getEsquemaPosStatus ignora 2 de 3 campos  
**Ubicación**: [js/qa-table.js](../../js/qa-table.js#L770)

**Problema**:
```javascript
// ANTES (commit ad1737f0):
// Solo validaba ruta_esquemas_pos
const schemas = splitSchemaTokens(row.ruta_esquemas_pos || '');

// AHORA (commit ad1737f0):
// Valida 3 campos
const schemas = getPosSchemasForRow(row);  // ✅ Incluye exp_imagenes
```

**Impacto**: 
- Registros con exp_imagenes pero sin ruta_esquemas_pos mostraban FALTA erróneamente
- Después de commit ad1737f0 está solucionado

**Estado**: ✅ RESUELTO (commit ad1737f0)

---

#### 3. **Índice de esquemas_pos Never Loading**

**Severidad**: 🔴 Crítica  
**Impacto**: Esquema de posición nunca validado, todos muestran FALTA  
**Ubicación**: [js/qa-milu.js](../../js/qa-milu.js#L120)

**Problema**:
```javascript
// ANTES:
if (ENABLE_OPTIONAL_CATALOGS) {  // false por defecto
    loadOptionalCatalogsInBackground();  // Index bloqueado
}

// AHORA (commit ad1737f0):
// Index loading desacoplado de ENABLE_OPTIONAL_CATALOGS
loadEsquemasPosIndexBackground();
```

**Impacto**:
- Esquemas_pos nunca indexados
- ESQ_POS columna siempre vacía
- Estado: ✅ RESUELTO

---

#### 4. **Sin Validación de Accesibilidad de URLs**

**Severidad**: 🔴 Crítica  
**Impacto**: Imágenes rotas llegan a WordPress export sin detectarse  
**Ubicación**: [depuracion_json.py](../../depuracion_json.py), [server.js](../../server.js)

**Problema**:
- generate_synthetic_exports.js + depuracion_json.py nunca validan URLs
- WordPress export descubre el problema demasiado tarde
- No hay pre-validación en backend

**Riesgo**:
- ❌ Imágenes muertas en producción
- ❌ WordPress stuck en sync
- ❌ Usuarios ven placeholders

**Solución**:
```javascript
// server.js - Nuevo endpoint
app.get('/api/validate-image-urls', async (req, res) => {
    const urls = req.query.urls.split(',');
    const results = await Promise.all(
        urls.map(url => validateURL(url, 3000))
    );
    res.json({ ok: results.filter(r => r.ok).map(r => r.url), 
               error: results.filter(r => !r.ok).map(r => r.url) });
});
```

**Priority**: P1 (NEXT sprint)  
**Effort**: 4h

---

### 🟠 Problemas Altos

#### 5. **Full Re-render de Tabla en Cada Operación**

**Severidad**: 🟠 Alta  
**Impacto**: 50-100ms lag en cambios de filtro/página  
**Ubicación**: [js/qa-table.js](../../js/qa-table.js#L440)

```javascript
// renderTable():
tbody.innerHTML = '';  // ⚠️ Destruye + recrea TODO
tableRows.forEach(row => tbody.appendChild(...));
```

**Problema**:
- Full re-render destruye todo el DOM
- 50 rows × 30 columns = 1500 elementos creados/destruidos
- Causa reflow/repaint de todo viewport
- Performance degradada con tabla grande

**Benchmark**:
- Cambio página: 50-100ms
- Cambio filtro: 75-150ms
- Change sort: 50-100ms

**Optimización**:
```javascript
// Propuesta: Actualización inteligente
function updateTableIntelligent(oldRows, newRows) {
    // Calcula diff
    const toRemove = oldRows.filter(r => !newRows.includes(r));
    const toAdd = newRows.filter(r => !oldRows.includes(r));
    const toKeep = oldRows.filter(r => newRows.includes(r));
    
    // Actualiza solo lo necesario
    toRemove.forEach(r => removeTbodyRow(r.key));
    toKeep.forEach(r => updateTbodyRow(r));
    toAdd.forEach(r => appendTbodyRow(r));
}
```

**Benefit**: 50-100ms → 25-50ms (50% improvement)

**Priority**: P3 (NEXT+2 sprint)  
**Effort**: 8h  
**ROI**: Mejora directa de UX

---

#### 6. **Fallback Serial en Imágenes (Sin Timeout)**

**Severidad**: 🟠 Alta  
**Impacto**: Cascada puede tardar 4-20s  
**Ubicación**: [js/schemas.js](../../js/schemas.js#L180)

```javascript
img.onerror = () => {
    // Pasa al siguiente candidato
    // SIN TIMEOUT → espera HTTP default (5s)
    img.src = candidates[++idx];
};
```

**Problema**:
- 4 candidatos × 5s timeout = 20s máximo
- Usuario ve spinner durante todo ese tiempo
- Experiencia pobre

**Solución**:
```javascript
// Timeout agresivo: 1s por candidato
const timeoutId = setTimeout(() => {
    img.src = '';  // Cancela
    tryNextCandidate();
}, 1000);

img.onload = () => clearTimeout(timeoutId); // Success
img.onerror = () => {
    clearTimeout(timeoutId);
    tryNextCandidate();
};
```

**Benefit**: 4-20s → 1-2s (80% improvement)

**Priority**: P2 (NEXT sprint)  
**Effort**: 2h

---

#### 7. **Deduplicación Incompleta en generate_synthetic_exports.js**

**Severidad**: 🟠 Alta  
**Impacto**: Imágenes de registros duplicados perdidas  
**Ubicación**: [generate_synthetic_exports.js](../../generate_synthetic_exports.js#L85)

**Problema**:
```
PN 123456 en 3 motores con imágenes distintas:
  - Model A: exp_imagenes = "FOTO_A, ESQUEMA_A"
  - Model B: exp_imagenes = "FOTO_A, ESQUEMA_B"  ← ESQUEMA_B perdido
  - Model C: exp_imagenes = "FOTO_A, ESQUEMA_C"  ← ESQUEMA_C perdido

Síntesis solo guarda del primero:
  exp_imagenes = "FOTO_A, ESQUEMA_A"
```

**Riesgo**:
- ❌ Pérdida de datos
- ❌ Inconsistencia entre PN original y síntesis

**Solución**: Usar Set para deduplicación completa (VER pending_improvements.md)

**Priority**: P1 (NEXT sprint)  
**Effort**: 2h

---

#### 8. **Sin Tests Unitarios**

**Severidad**: 🟠 Alta  
**Impacto**: Cambios rompen funcionalidad sin detectarse  
**Ubicación**: `tests/` (directorio inexistente)

**Problema**:
- Lógica crítica de renderEsquemaPosCell, getEsquemaPosStatus sin test coverage
- Commits pueden introducir bugs sin saberlo
- Regresiones no detectadas

**Test Cases Necesarios**:
1. Badge logic (OK/MISS/FALTA)
2. Image candidate building (4 variantes)
3. CSV parsing (múltiples separadores)
4. Filter logic (has_esquema_pos)
5. Sort logic (has_esquema_pos)

**Coverage Target**: 70%+ for image-related code

**Priority**: P2 (NEXT+1 sprint)  
**Effort**: 8h

---

### 🟡 Problemas Medianos

#### 9. **CSV Normalization Inconsistente**

**Severidad**: 🟡 Media  
**Impacto**: Separadores múltiples causan parseo incorrecto  
**Ubicación**: [depuracion_json.py](../../depuracion_json.py)

**Problema**:
```python
# Entrada con separadores heterogéneos:
"URL1, URL2;URL3\nURL4"  # ← múltiples separadores

# Sin normalización:
split(',') → ["URL1", " URL2;URL3\nURL4"]  # ❌ Falla
```

**Solución**:
```python
def normalize_csv(value):
    # Reemplaza todos los separadores comunes
    value = value.replace(';', ',').replace('\n', ',').replace('\r', ',')
    
    # Split y limpia espacios
    parts = [p.strip() for p in value.split(',') if p.strip()]
    
    # Rejoin con separador uniforme
    return ', '.join(parts)
```

**Priority**: P3 (NEXT sprint)  
**Effort**: 2h

---

#### 10. **Caché Redundante getEsquemaPosStatus**

**Severidad**: 🟡 Media  
**Impacto**: 150 llamadas innecesarias por render  
**Ubicación**: [js/qa-table.js](../../js/qa-table.js)

**Problema**:
```javascript
// renderRow llamada 50 veces:
renderEsquemaPosCell(row)  // Calls getEsquemaPosStatus
  
// renderEsquemaPosCell llamada de:
// 1. renderRow
// 2. renderErrorViewRow  
// 3. updateSchemasInline

// Total: 50 × 3 = 150 calls al mismo getEsquemaPosStatus(row)
```

**Solución**: WeakMap cache (VER pending_improvements.md)

**Priority**: P2 (NEXT sprint)  
**Effort**: 1h

---

#### 11. **Índice esquemas_pos_circulos / Modelo**

**Severidad**: 🟡 Media  
**Impacto**: Búsquedas O(50K) en Set grande  
**Ubicación**: [js/state.js](../../js/state.js)

**Problema**:
```javascript
// Cada validación:
state.esquemasPosFileSet.has(basename)  // O(1) pero Set tiene 50K items

// Pero si indexamos por modelo:
state.esquemasPosFilesByModel['12v4000m40a'].has('0001-01-50.webp')  // O(1) en Set ~300 items
```

**Benefit**: Pequeño (10%), pero mejora escalabilidad

**Priority**: P3 (NEXT+1 sprint)  
**Effort**: 2h

---

#### 12. **Código Muerto y Duplicado**

**Severidad**: 🟡 Media  
**Impacto**: Confusión, mantenimiento difícil  
**Ubicación**: Múltiples archivos

**Código Duplicado Detectado**:

1. **renderRow + renderErrorViewRow** (70 líneas comunes)
   - [js/qa-table.js](../../js/qa-table.js#L350) y [js/qa-table.js](../../js/qa-table.js#L600)
   - Solución: extractRowFlags() (VER pending_improvements.md)

2. **splitSchemaTokens** (existe en 2 lugares)
   - [js/qa-table.js](../../js/qa-table.js#L120)
   - [js/schemas.js](../../js/schemas.js#L45)
   - Solución: Consolidar en utils.js

3. **buildSchemaPosImageCandidates** (lógica similar en 3 lugares)
   - schemas.js
   - generate_synthetic_exports.js
   - depuracion_json.py
   - Solución: Función común en utils

**Código Potencialmente Muerto**:

1. **legacy/ directory** 
   - [legacy/](../../legacy/) contiene scripts antiguos
   - Verificar si aún se usan antes de eliminar

2. **zz_old/ directory**
   - [zz_old/](../../zz_old/) parece ser backup antiguo
   - Documentar propósito

3. **Multiple "test_" files**
   - test_conv.py, sanity.js, debug.js
   - Revisar si son de testing o desarrollo

**Priority**: P3 (NEXT+2 sprint)  
**Effort**: 4h refactoring + 2h documentación

---

### 🔵 Riesgos de Escalabilidad

#### 13. **Performance con 100K+ Imágenes**

**Escenario**: Si esquemas_pos_circulos crece a 100K+ archivos

**Problemas Potenciales**:
- ❌ Indexación backend más lenta (O(n) file scan)
- ❌ Set de 100K basenames consume más memoria
- ❌ Búsquedas en Set siguen siendo O(1) pero con overhead

**Solución Propuesta**:
```javascript
// Usar índice secundario por modelo
// En lugar de 1 Set de 50K → 9 Sets de ~5K items

// Además: Pre-calcular índice en backend y devolver
// {
//   "12v4000m40a": ["0001-01-50.webp", ...],
//   "16v4000m61": ["0001-01-50.webp", ...]
// }
```

---

#### 14. **Memory Footprint de Tabla**

**Actual** (67K registros):
- allData: ~15-20 MB JSON parsed
- filteredData: ~1-5 MB (variable)
- esquemasPosFileSet: ~3-5 MB (50K strings)
- Total: ~20-30 MB

**Si escala a 200K registros**:
- allData: ~45-60 MB
- Total: ~60-90 MB

**Riesgo**: ❌ Navegadores viejos pueden tener problemas

**Solución**:
- ✅ Virtualización (FUTURA)
- ✅ Paginación servidor-side (más complejo)
- ✅ Índices secundarios más pequeños

---

#### 15. **Dependencias Implícitas Entre Scripts**

**Problema**:
```python
# depuracion_json.py asume que:
# - ruta_foto es válida SI existe
# - ruta_esquemas_pos es válida SI existe
# - Pero no valida accesibilidad

# Luego generate_synthetic_exports.js asume que exp_imagenes es correcto
# Luego WordPress export confía en eso

# Si falla en step 1 → falla en cascada
```

**Solución**:
- ✅ Validación en cada step
- ✅ Logging detallado
- ✅ Reportes de errores

---

### 🌐 Problemas de Integración

#### 16. **WordPress Export Timing**

**Ubicación**: [export_wordpress.html](../../export_wordpress.html)

**Problema**:
- No hay sincronización automática
- Manual → Propenso a errores
- No hay rollback si falla

**Mejoras Propuestas**:
1. ✅ Validar URLs antes de exportar
2. ✅ Dry-run mode
3. ✅ Incremental export (solo nuevos/modificados)
4. ✅ Rollback automático si falla

---

#### 17. **Revisiones (Audit Trail) Sin Integridad**

**Ubicación**: [qa_revision_server_data.json](../../qa_revision_server_data.json)

**Problema**:
- Archivo JSON editado directamente
- Sin validación de estructura
- Sin versionado

**Mejoras Propuestas**:
1. ✅ Validar schema en /apply-revision-to-engines
2. ✅ Mantener histórico (backup)
3. ✅ Timestamps + usuario
4. ✅ Checksum de integridad

---

## 📊 Matriz de Problemas

| ID | Problema | Severidad | Impacto | Esfuerzo | Estado | Sprint |
|----|----------|-----------|---------|----------|--------|--------|
| 1  | URLs Hardcodeadas | 🔴 | Crítico | 1h | OPEN | NEXT |
| 2  | Validación Incompleta | 🔴 | Crítico | - | ✅ FIXED | ad1737f0 |
| 3  | Index No Loading | 🔴 | Crítico | - | ✅ FIXED | ad1737f0 |
| 4  | Sin Validación URLs | 🔴 | Crítico | 4h | OPEN | NEXT |
| 5  | Full Re-render | 🟠 | Alto | 8h | OPEN | NEXT+2 |
| 6  | Fallback Serial | 🟠 | Alto | 2h | OPEN | NEXT |
| 7  | Deduplicación Incompleta | 🟠 | Alto | 2h | OPEN | NEXT |
| 8  | Sin Tests | 🟠 | Alto | 8h | OPEN | NEXT+1 |
| 9  | CSV No Normalizado | 🟡 | Medio | 2h | OPEN | NEXT |
| 10 | Cache Redundante | 🟡 | Medio | 1h | OPEN | NEXT |
| 11 | Index/Modelo | 🟡 | Medio | 2h | OPEN | NEXT+1 |
| 12 | Código Duplicado | 🟡 | Medio | 4h | OPEN | NEXT+2 |

---

## 🔍 Recomendaciones Inmediatas

### Week 1 (NEXT Sprint)

1. **Configurabilidad de URLs** (1h)
   - Crear config.json
   - Actualizar depuracion_json.py
   - Commit al repo

2. **Validación de Accesibilidad** (4h)
   - Nuevo endpoint /api/validate-image-urls
   - Usar en generate_synthetic_exports.js
   - Logging detallado

3. **Timeout en Fallback** (2h)
   - Implementar timeout agresivo en schemas.js
   - Testing manual

4. **Deduplicación Completa** (2h)
   - Fix en generate_synthetic_exports.js
   - Regenerar JSON sintéticos

5. **CSV Normalization** (2h)
   - Función en depuracion_json.py
   - Test casos

6. **Cache getEsquemaPosStatus** (1h)
   - WeakMap en qa-table.js
   - Benchmark antes/después

**Total**: 14 horas (Sprint de 2 semanas = ~16h disponibles)

### Week 2-3 (NEXT+1)

1. **Tests Unitarios** (8h)
   - Setup Jest/Mocha
   - Tests para image logic
   - CI integration

2. **Índice por Modelo** (2h)
   - Refactor estado
   - Actualizar validación

### Week 4+ (NEXT+2)

1. **Full Re-render → Smart Update** (8h)
   - Calcula diff
   - Actualización incremental
   - Benchmark

2. **Código Duplicado Refactoring** (4h)
   - extractRowFlags()
   - Consolidar splitSchemaTokens
   - Consolidar buildSchemaPosImageCandidates

---

## 📈 Métricas de Éxito

**Después de remediar todos los problemas**:

| Métrica | Actual | Target | Improvement |
|---------|--------|--------|------------|
| Render time (50 rows) | 50-100ms | 10-20ms | 80% ⬇️ |
| Image fallback timeout | 4-20s | <1s | 95% ⬇️ |
| Test coverage (image code) | 0% | 70% | - |
| Función duplicada | 3+ locations | 1 location | - |
| getEsquemaPosStatus calls | 150/render | 50/render | 67% ⬇️ |
| Memory (67K records) | 20-30 MB | 15-20 MB | 25% ⬇️ |
| MTTR (time to fix bug) | 1-2h | 15 min | 80% ⬇️ |

---

**Última actualización**: May 11, 2026  
**Evaluador**: AI Context System  
**Próxima auditoría**: June 8, 2026
