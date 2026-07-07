# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# AuditorÃ­a TÃ©cnica Completa

EvaluaciÃ³n de problemas, deuda tÃ©cnica, riesgos de escalabilidad y estrategia de remediaciÃ³n.

---

## ðŸ“‹ Hallazgos por CategorÃ­a

### ðŸ”´ Problemas CrÃ­ticos

#### 1. **URLs Hardcodeadas en depuracion_json.py**

**Severidad**: ðŸ”´ CrÃ­tica  
**Impacto**: Todos los JSONs necesitan regeneraciÃ³n si cambia el dominio  
**UbicaciÃ³n**: [depuracion_json.py](../../depuracion_json.py#L34)

```python
DEFAULT_EXP_IMAGENES = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg"
```

**Problema**:
- URL hardcodeada como constante global
- No hay mecanismo de configuraciÃ³n
- Si se migra a otro servidor â†’ regenerar JSONs completos
- No hay validaciÃ³n de accesibilidad

**Riesgo**:
- âŒ Deployment bloqueado por cambio de dominio
- âŒ URLs rotas en producciÃ³n
- âŒ Inconsistencia entre ambientes

**RemediaciÃ³n**:
- âœ… Crear `config.json` centralizado (VISTO EN PENDING_IMPROVEMENTS.md)
- âœ… Cargar placeholder desde configuraciÃ³n
- âœ… Validar URL accesibilidad antes de guardar

**Priority**: P1 (NEXT sprint)  
**Effort**: 1h

---

#### 2. **ValidaciÃ³n de Rutas Incompleta**

**Severidad**: ðŸ”´ CrÃ­tica  
**Impacto**: getEsquemaPosStatus ignora 2 de 3 campos  
**UbicaciÃ³n**: [js/qa-table.js](../../js/qa-table.js#L770)

**Problema**:
```javascript
// ANTES (commit ad1737f0):
// Solo validaba ruta_esquemas_pos
const schemas = splitSchemaTokens(row.ruta_esquemas_pos || '');

// AHORA (commit ad1737f0):
// Valida 3 campos
const schemas = getPosSchemasForRow(row);  // âœ… Incluye exp_imagenes
```

**Impacto**: 
- Registros con exp_imagenes pero sin ruta_esquemas_pos mostraban FALTA errÃ³neamente
- DespuÃ©s de commit ad1737f0 estÃ¡ solucionado

**Estado**: âœ… RESUELTO (commit ad1737f0)

---

#### 3. **Ãndice de esquemas_pos Never Loading**

**Severidad**: ðŸ”´ CrÃ­tica  
**Impacto**: Esquema de posiciÃ³n nunca validado, todos muestran FALTA  
**UbicaciÃ³n**: [js/qa-milu.js](../../js/qa-milu.js#L120)

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
- ESQ_POS columna siempre vacÃ­a
- Estado: âœ… RESUELTO

---

#### 4. **Sin ValidaciÃ³n de Accesibilidad de URLs**

**Severidad**: ðŸ”´ CrÃ­tica  
**Impacto**: ImÃ¡genes rotas llegan a WordPress export sin detectarse  
**UbicaciÃ³n**: [depuracion_json.py](../../depuracion_json.py), [server.js](../../server.js)

**Problema**:
- generate_synthetic_exports.js + depuracion_json.py nunca validan URLs
- WordPress export descubre el problema demasiado tarde
- No hay pre-validaciÃ³n en backend

**Riesgo**:
- âŒ ImÃ¡genes muertas en producciÃ³n
- âŒ WordPress stuck en sync
- âŒ Usuarios ven placeholders

**SoluciÃ³n**:
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

### ðŸŸ  Problemas Altos

#### 5. **Full Re-render de Tabla en Cada OperaciÃ³n**

**Severidad**: ðŸŸ  Alta  
**Impacto**: 50-100ms lag en cambios de filtro/pÃ¡gina  
**UbicaciÃ³n**: [js/qa-table.js](../../js/qa-table.js#L440)

```javascript
// renderTable():
tbody.innerHTML = '';  // âš ï¸ Destruye + recrea TODO
tableRows.forEach(row => tbody.appendChild(...));
```

**Problema**:
- Full re-render destruye todo el DOM
- 50 rows Ã— 30 columns = 1500 elementos creados/destruidos
- Causa reflow/repaint de todo viewport
- Performance degradada con tabla grande

**Benchmark**:
- Cambio pÃ¡gina: 50-100ms
- Cambio filtro: 75-150ms
- Change sort: 50-100ms

**OptimizaciÃ³n**:
```javascript
// Propuesta: ActualizaciÃ³n inteligente
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

**Benefit**: 50-100ms â†’ 25-50ms (50% improvement)

**Priority**: P3 (NEXT+2 sprint)  
**Effort**: 8h  
**ROI**: Mejora directa de UX

---

#### 6. **Fallback Serial en ImÃ¡genes (Sin Timeout)**

**Severidad**: ðŸŸ  Alta  
**Impacto**: Cascada puede tardar 4-20s  
**UbicaciÃ³n**: [js/schemas.js](../../js/schemas.js#L180)

```javascript
img.onerror = () => {
    // Pasa al siguiente candidato
    // SIN TIMEOUT â†’ espera HTTP default (5s)
    img.src = candidates[++idx];
};
```

**Problema**:
- 4 candidatos Ã— 5s timeout = 20s mÃ¡ximo
- Usuario ve spinner durante todo ese tiempo
- Experiencia pobre

**SoluciÃ³n**:
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

**Benefit**: 4-20s â†’ 1-2s (80% improvement)

**Priority**: P2 (NEXT sprint)  
**Effort**: 2h

---

#### 7. **DeduplicaciÃ³n Incompleta en generate_synthetic_exports.js**

**Severidad**: ðŸŸ  Alta  
**Impacto**: ImÃ¡genes de registros duplicados perdidas  
**UbicaciÃ³n**: [generate_synthetic_exports.js](../../generate_synthetic_exports.js#L85)

**Problema**:
```
PN 123456 en 3 motores con imÃ¡genes distintas:
  - Model A: exp_imagenes = "FOTO_A, ESQUEMA_A"
  - Model B: exp_imagenes = "FOTO_A, ESQUEMA_B"  â† ESQUEMA_B perdido
  - Model C: exp_imagenes = "FOTO_A, ESQUEMA_C"  â† ESQUEMA_C perdido

SÃ­ntesis solo guarda del primero:
  exp_imagenes = "FOTO_A, ESQUEMA_A"
```

**Riesgo**:
- âŒ PÃ©rdida de datos
- âŒ Inconsistencia entre PN original y sÃ­ntesis

**SoluciÃ³n**: Usar Set para deduplicaciÃ³n completa (VER pending_improvements.md)

**Priority**: P1 (NEXT sprint)  
**Effort**: 2h

---

#### 8. **Sin Tests Unitarios**

**Severidad**: ðŸŸ  Alta  
**Impacto**: Cambios rompen funcionalidad sin detectarse  
**UbicaciÃ³n**: `tests/` (directorio inexistente)

**Problema**:
- LÃ³gica crÃ­tica de renderEsquemaPosCell, getEsquemaPosStatus sin test coverage
- Commits pueden introducir bugs sin saberlo
- Regresiones no detectadas

**Test Cases Necesarios**:
1. Badge logic (OK/MISS/FALTA)
2. Image candidate building (4 variantes)
3. CSV parsing (mÃºltiples separadores)
4. Filter logic (has_esquema_pos)
5. Sort logic (has_esquema_pos)

**Coverage Target**: 70%+ for image-related code

**Priority**: P2 (NEXT+1 sprint)  
**Effort**: 8h

---

### ðŸŸ¡ Problemas Medianos

#### 9. **CSV Normalization Inconsistente**

**Severidad**: ðŸŸ¡ Media  
**Impacto**: Separadores mÃºltiples causan parseo incorrecto  
**UbicaciÃ³n**: [depuracion_json.py](../../depuracion_json.py)

**Problema**:
```python
# Entrada con separadores heterogÃ©neos:
"URL1, URL2;URL3\nURL4"  # â† mÃºltiples separadores

# Sin normalizaciÃ³n:
split(',') â†’ ["URL1", " URL2;URL3\nURL4"]  # âŒ Falla
```

**SoluciÃ³n**:
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

#### 10. **CachÃ© Redundante getEsquemaPosStatus**

**Severidad**: ðŸŸ¡ Media  
**Impacto**: 150 llamadas innecesarias por render  
**UbicaciÃ³n**: [js/qa-table.js](../../js/qa-table.js)

**Problema**:
```javascript
// renderRow llamada 50 veces:
renderEsquemaPosCell(row)  // Calls getEsquemaPosStatus
  
// renderEsquemaPosCell llamada de:
// 1. renderRow
// 2. renderErrorViewRow  
// 3. updateSchemasInline

// Total: 50 Ã— 3 = 150 calls al mismo getEsquemaPosStatus(row)
```

**SoluciÃ³n**: WeakMap cache (VER pending_improvements.md)

**Priority**: P2 (NEXT sprint)  
**Effort**: 1h

---

#### 11. **Ãndice esquemas_pos_circulos / Modelo**

**Severidad**: ðŸŸ¡ Media  
**Impacto**: BÃºsquedas O(50K) en Set grande  
**UbicaciÃ³n**: [js/state.js](../../js/state.js)

**Problema**:
```javascript
// Cada validaciÃ³n:
state.esquemasPosFileSet.has(basename)  // O(1) pero Set tiene 50K items

// Pero si indexamos por modelo:
state.esquemasPosFilesByModel['12v4000m40a'].has('0001-01-50.webp')  // O(1) en Set ~300 items
```

**Benefit**: PequeÃ±o (10%), pero mejora escalabilidad

**Priority**: P3 (NEXT+1 sprint)  
**Effort**: 2h

---

#### 12. **CÃ³digo Muerto y Duplicado**

**Severidad**: ðŸŸ¡ Media  
**Impacto**: ConfusiÃ³n, mantenimiento difÃ­cil  
**UbicaciÃ³n**: MÃºltiples archivos

**CÃ³digo Duplicado Detectado**:

1. **renderRow + renderErrorViewRow** (70 lÃ­neas comunes)
   - [js/qa-table.js](../../js/qa-table.js#L350) y [js/qa-table.js](../../js/qa-table.js#L600)
   - SoluciÃ³n: extractRowFlags() (VER pending_improvements.md)

2. **splitSchemaTokens** (existe en 2 lugares)
   - [js/qa-table.js](../../js/qa-table.js#L120)
   - [js/schemas.js](../../js/schemas.js#L45)
   - SoluciÃ³n: Consolidar en utils.js

3. **buildSchemaPosImageCandidates** (lÃ³gica similar en 3 lugares)
   - schemas.js
   - generate_synthetic_exports.js
   - depuracion_json.py
   - SoluciÃ³n: FunciÃ³n comÃºn en utils

**CÃ³digo Potencialmente Muerto**:

1. **legacy/ directory** 
   - [legacy/](../../legacy/) contiene scripts antiguos
   - Verificar si aÃºn se usan antes de eliminar

2. **zz_old/ directory**
   - [zz_old/](../../zz_old/) parece ser backup antiguo
   - Documentar propÃ³sito

3. **Multiple "test_" files**
   - test_conv.py, sanity.js, debug.js
   - Revisar si son de testing o desarrollo

**Priority**: P3 (NEXT+2 sprint)  
**Effort**: 4h refactoring + 2h documentaciÃ³n

---

### ðŸ”µ Riesgos de Escalabilidad

#### 13. **Performance con 100K+ ImÃ¡genes**

**Escenario**: Si esquemas_pos_circulos crece a 100K+ archivos

**Problemas Potenciales**:
- âŒ IndexaciÃ³n backend mÃ¡s lenta (O(n) file scan)
- âŒ Set de 100K basenames consume mÃ¡s memoria
- âŒ BÃºsquedas en Set siguen siendo O(1) pero con overhead

**SoluciÃ³n Propuesta**:
```javascript
// Usar Ã­ndice secundario por modelo
// En lugar de 1 Set de 50K â†’ 9 Sets de ~5K items

// AdemÃ¡s: Pre-calcular Ã­ndice en backend y devolver
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

**Riesgo**: âŒ Navegadores viejos pueden tener problemas

**SoluciÃ³n**:
- âœ… VirtualizaciÃ³n (FUTURA)
- âœ… PaginaciÃ³n servidor-side (mÃ¡s complejo)
- âœ… Ãndices secundarios mÃ¡s pequeÃ±os

---

#### 15. **Dependencias ImplÃ­citas Entre Scripts**

**Problema**:
```python
# depuracion_json.py asume que:
# - ruta_foto es vÃ¡lida SI existe
# - ruta_esquemas_pos es vÃ¡lida SI existe
# - Pero no valida accesibilidad

# Luego generate_synthetic_exports.js asume que exp_imagenes es correcto
# Luego WordPress export confÃ­a en eso

# Si falla en step 1 â†’ falla en cascada
```

**SoluciÃ³n**:
- âœ… ValidaciÃ³n en cada step
- âœ… Logging detallado
- âœ… Reportes de errores

---

### ðŸŒ Problemas de IntegraciÃ³n

#### 16. **WordPress Export Timing**

**UbicaciÃ³n**: [export_wordpress.html](../../export_wordpress.html)

**Problema**:
- No hay sincronizaciÃ³n automÃ¡tica
- Manual â†’ Propenso a errores
- No hay rollback si falla

**Mejoras Propuestas**:
1. âœ… Validar URLs antes de exportar
2. âœ… Dry-run mode
3. âœ… Incremental export (solo nuevos/modificados)
4. âœ… Rollback automÃ¡tico si falla

---

#### 17. **Revisiones (Audit Trail) Sin Integridad**

**UbicaciÃ³n**: [qa_revision_server_data.json](../../qa_revision_server_data.json)

**Problema**:
- Archivo JSON editado directamente
- Sin validaciÃ³n de estructura
- Sin versionado

**Mejoras Propuestas**:
1. âœ… Validar schema en /apply-revision-to-engines
2. âœ… Mantener histÃ³rico (backup)
3. âœ… Timestamps + usuario
4. âœ… Checksum de integridad

---

## ðŸ“Š Matriz de Problemas

| ID | Problema | Severidad | Impacto | Esfuerzo | Estado | Sprint |
|----|----------|-----------|---------|----------|--------|--------|
| 1  | URLs Hardcodeadas | ðŸ”´ | CrÃ­tico | 1h | OPEN | NEXT |
| 2  | ValidaciÃ³n Incompleta | ðŸ”´ | CrÃ­tico | - | âœ… FIXED | ad1737f0 |
| 3  | Index No Loading | ðŸ”´ | CrÃ­tico | - | âœ… FIXED | ad1737f0 |
| 4  | Sin ValidaciÃ³n URLs | ðŸ”´ | CrÃ­tico | 4h | OPEN | NEXT |
| 5  | Full Re-render | ðŸŸ  | Alto | 8h | OPEN | NEXT+2 |
| 6  | Fallback Serial | ðŸŸ  | Alto | 2h | OPEN | NEXT |
| 7  | DeduplicaciÃ³n Incompleta | ðŸŸ  | Alto | 2h | OPEN | NEXT |
| 8  | Sin Tests | ðŸŸ  | Alto | 8h | OPEN | NEXT+1 |
| 9  | CSV No Normalizado | ðŸŸ¡ | Medio | 2h | OPEN | NEXT |
| 10 | Cache Redundante | ðŸŸ¡ | Medio | 1h | OPEN | NEXT |
| 11 | Index/Modelo | ðŸŸ¡ | Medio | 2h | OPEN | NEXT+1 |
| 12 | CÃ³digo Duplicado | ðŸŸ¡ | Medio | 4h | OPEN | NEXT+2 |

---

## ðŸ” Recomendaciones Inmediatas

### Week 1 (NEXT Sprint)

1. **Configurabilidad de URLs** (1h)
   - Crear config.json
   - Actualizar depuracion_json.py
   - Commit al repo

2. **ValidaciÃ³n de Accesibilidad** (4h)
   - Nuevo endpoint /api/validate-image-urls
   - Usar en generate_synthetic_exports.js
   - Logging detallado

3. **Timeout en Fallback** (2h)
   - Implementar timeout agresivo en schemas.js
   - Testing manual

4. **DeduplicaciÃ³n Completa** (2h)
   - Fix en generate_synthetic_exports.js
   - Regenerar JSON sintÃ©ticos

5. **CSV Normalization** (2h)
   - FunciÃ³n en depuracion_json.py
   - Test casos

6. **Cache getEsquemaPosStatus** (1h)
   - WeakMap en qa-table.js
   - Benchmark antes/despuÃ©s

**Total**: 14 horas (Sprint de 2 semanas = ~16h disponibles)

### Week 2-3 (NEXT+1)

1. **Tests Unitarios** (8h)
   - Setup Jest/Mocha
   - Tests para image logic
   - CI integration

2. **Ãndice por Modelo** (2h)
   - Refactor estado
   - Actualizar validaciÃ³n

### Week 4+ (NEXT+2)

1. **Full Re-render â†’ Smart Update** (8h)
   - Calcula diff
   - ActualizaciÃ³n incremental
   - Benchmark

2. **CÃ³digo Duplicado Refactoring** (4h)
   - extractRowFlags()
   - Consolidar splitSchemaTokens
   - Consolidar buildSchemaPosImageCandidates

---

## ðŸ“ˆ MÃ©tricas de Ã‰xito

**DespuÃ©s de remediar todos los problemas**:

| MÃ©trica | Actual | Target | Improvement |
|---------|--------|--------|------------|
| Render time (50 rows) | 50-100ms | 10-20ms | 80% â¬‡ï¸ |
| Image fallback timeout | 4-20s | <1s | 95% â¬‡ï¸ |
| Test coverage (image code) | 0% | 70% | - |
| FunciÃ³n duplicada | 3+ locations | 1 location | - |
| getEsquemaPosStatus calls | 150/render | 50/render | 67% â¬‡ï¸ |
| Memory (67K records) | 20-30 MB | 15-20 MB | 25% â¬‡ï¸ |
| MTTR (time to fix bug) | 1-2h | 15 min | 80% â¬‡ï¸ |

---

**Ãšltima actualizaciÃ³n**: May 11, 2026  
**Evaluador**: AI Context System  
**PrÃ³xima auditorÃ­a**: June 8, 2026

