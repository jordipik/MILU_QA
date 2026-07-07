# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Image Validation: Validaciones y Reglas

DocumentaciÃ³n de todas las validaciones, reglas y lÃ³gica de control de imÃ¡genes en MILU.

## ðŸŽ¯ Objetivos de ValidaciÃ³n

- **Integridad**: Verificar que referencias coincidan con archivos reales
- **Consistencia**: Garantizar que campos relacionados sean coherentes
- **Completitud**: Asegurar que registros crÃ­ticos tengan imÃ¡genes
- **Performance**: Detectar problemas antes de que afecten frontend

---

## ðŸ” Sistema de Placeholders

### Tokens Reconocidos como Placeholders

UbicaciÃ³n: [scripts/audit_image_schema_system.js](../../scripts/audit_image_schema_system.js) lÃ­nea 29

```javascript
PLACEHOLDER_TOKENS = [
    'sin_imagen',           // EspaÃ±ol oficial
    'sin-imagen',           // Variante con guiÃ³n
    'placeholder',          // InglÃ©s
    'imagen-no-disponible', // Descriptivo
    'image-not-available',  // InglÃ©s completo
    'no-image',             // InglÃ©s corto
    'missing-image'         // InglÃ©s alternativo
];
```

### Placeholder Por Defecto

UbicaciÃ³n: [depuracion_json.py](../../depuracion_json.py) lÃ­nea ~34

```python
DEFAULT_EXP_IMAGENES = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg"
```

**Comportamiento**:
- Si un registro NO tiene `ruta_foto` NI `ruta_esquemas_pos`
- Entonces `exp_imagenes` se asigna al DEFAULT
- Se usa para WordPress cuando no hay imÃ¡genes reales

**âš ï¸ Problema**: URL hardcoded. Si dominio cambia, se rompe.

---

## ðŸ“‹ CÃ¡lculo de exp_imagenes

**UbicaciÃ³n**: [depuracion_json.py](../../depuracion_json.py) funciÃ³n `calculate_final_fields()`

### Algoritmo

```python
def calculate_exp_imagenes(record):
    """
    Calcula el campo exp_imagenes con PRIORIDAD.
    Este es el campo FINAL para exportaciÃ³n a WordPress.
    """
    imagenes = []
    
    # 1. FOTO (prioridad 1)
    if record.get('ruta_foto'):
        ruta_foto = str(record['ruta_foto']).strip()
        if ruta_foto and ruta_foto not in PLACEHOLDER_TOKENS:
            imagenes.append(ruta_foto)
    
    # 2. ESQUEMA CON CÃRCULOS (prioridad 2)
    if record.get('ruta_esquemas_pos'):
        ruta_esquemas_pos = str(record['ruta_esquemas_pos']).strip()
        if ruta_esquemas_pos and ruta_esquemas_pos not in PLACEHOLDER_TOKENS:
            imagenes.append(ruta_esquemas_pos)
    
    # 3. FALLBACK A PLACEHOLDER
    if imagenes:
        # Tenemos al menos 1 imagen
        exp_imagenes = ", ".join(imagenes)  # Separator: ", " (comma space)
    else:
        # No tenemos nada, usar placeholder
        exp_imagenes = DEFAULT_EXP_IMAGENES
    
    return exp_imagenes
```

### Ejemplos

**Caso 1: Con foto y esquema**
```
ruta_foto = "https://...fotos_articulos.../0049976736.jpeg"
ruta_esquemas_pos = "https://...esquemas.../12V4000M40A-0001-01-50.webp"

â†’ exp_imagenes = "https://...fotos.../0049976736.jpeg, https://...esquemas.../12V4000M40A-0001-01-50.webp"
```

**Caso 2: Solo foto**
```
ruta_foto = "https://...fotos.../0049976736.jpeg"
ruta_esquemas_pos = null

â†’ exp_imagenes = "https://...fotos.../0049976736.jpeg"
```

**Caso 3: Solo esquema**
```
ruta_foto = null
ruta_esquemas_pos = "https://...esquemas.../12V4000M40A-0001-01-50.webp"

â†’ exp_imagenes = "https://...esquemas.../12V4000M40A-0001-01-50.webp"
```

**Caso 4: Sin imÃ¡genes (placeholder)**
```
ruta_foto = null
ruta_esquemas_pos = null

â†’ exp_imagenes = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg"
```

---

## ðŸ”— Matching URL â†” Filesystem

### Proceso de ValidaciÃ³n en Runtime

**UbicaciÃ³n**: [js/qa-table.js](../../js/qa-table.js) funciÃ³n `getEsquemaPosStatus()`

### Paso a Paso

```javascript
function getEsquemaPosStatus(row) {
    // 1. Construye candidatos de imÃ¡genes
    const posItems = getPosSchemasForRow(row);  // Llama a schemas.js
    if (!Array.isArray(posItems) || posItems.length === 0) 
        return 'empty';  // Sin referencias
    
    // 2. Para CADA item, verifica si ALGÃšN candidato existe
    const exists = posItems.some(item => {
        // item = { label: "12v4000m40a-0001-01", candidates: [...] }
        
        if (!Array.isArray(item?.candidates)) return false;
        
        return item.candidates.some(candidate => {
            // candidate = "esquemas_pos_circulos/12V4000M40A-POS/12v4000m40a-0001-01-50.webp"
            
            const basename = basename(candidate);  // "12v4000m40a-0001-01-50.webp"
            
            // BÃºsqueda en Set global (O(1))
            return state.esquemasPosFileSet.has(basename);
        });
    });
    
    return exists ? 'ok' : 'missing';
}
```

### FunciÃ³n basename()

**UbicaciÃ³n**: [js/qa-table.js](../../js/qa-table.js) lÃ­nea ~769

```javascript
function basename(pathOrUrl) {
    if (!pathOrUrl) return '';
    
    // 1. Extrae Ãºltimo segmento despuÃ©s de /
    const parts = String(pathOrUrl).split('/');
    let filename = parts[parts.length - 1];
    
    // 2. Decodifica URL-encoded characters
    filename = decodeURIComponent(filename);
    
    // 3. Convierte a minÃºsculas (normalizaciÃ³n)
    filename = filename.toLowerCase();
    
    return filename;
}
```

### Ejemplo de Matching

```
Row tiene:
  ruta_esquemas_pos = "https://milu-naval.mystagingwebsite.com/.../12V4000M40A-0001-01-50.webp"

1. getPosSchemasForRow() construye:
   candidates = [
     "esquemas_pos_circulos/12V4000M40A-POS/12V4000M40A-0001-01-50.webp",
     "esquemas_pos_circulos/12V4000M40A-POS/12V4000M40A-0001-01-50.png",
     "esquemas_pos_circulos/12V4000M40A-POS/12v4000m40a-0001-01-50.webp",
     "esquemas_pos_circulos/12V4000M40A-POS/12v4000m40a-0001-01-50.png"
   ]

2. getEsquemaPosStatus() extrae basenames:
   basenames = [
     "12v4000m40a-0001-01-50.webp",
     "12v4000m40a-0001-01-50.png",
     "12v4000m40a-0001-01-50.webp",  (duplicado)
     "12v4000m40a-0001-01-50.png"     (duplicado)
   ]

3. Busca en state.esquemasPosFileSet (Set):
   Si ANY estÃ¡ en el Set â†’ status = 'ok'
   Si NONE estÃ¡ â†’ status = 'missing'
```

---

## ðŸ“Š Estados ESQ_POS en milu_qa

**UbicaciÃ³n**: [js/qa-table.js](../../js/qa-table.js) + [qa_milu.html](../../qa_milu.html)

### Tres Estados Posibles

| Estado | Badge | Color | Significado | CondiciÃ³n |
|--------|-------|-------|-----------|-----------|
| **OK** | OK | Verde | Archivo existe localmente | â‰¥1 candidato en `esquemasPosFileSet` |
| **MISS** | MISS | Rojo oscuro | Referencias pero archivo NO existe | Referencias en ruta_esquemas_pos pero ningÃºn candidato existe |
| **FALTA** | FALTA | Rojo claro | Sin referencias | Ninguno de: ruta_esquemas_pos, exp_imagenes, esquemas_circulos |

### Renderizado de Badges

**UbicaciÃ³n**: [js/qa-table.js](../../js/qa-table.js) funciÃ³n `renderEsquemaPosCell()`

```javascript
function renderEsquemaPosCell(row) {
    const status = getEsquemaPosStatus(row);
    
    const badges = {
        'ok': '<span class="badge-pos-ok" title="Archivo encontrado">OK</span>',
        'missing': '<span class="badge-pos-missing" title="Archivo no encontrado">MISS</span>',
        'empty': '<span class="badge-pos-empty" title="Sin esquema_pos">FALTA</span>'
    };
    
    return badges[status] || badges.empty;
}
```

### CSS de Badges

**UbicaciÃ³n**: [styles/qa_milu.css](../../styles/qa_milu.css) lÃ­nea ~2045

```css
.badge-pos-ok {
    display: inline-block;
    min-width: 28px;
    padding: 2px 4px;
    text-align: center;
    background-color: #4CAF50;  /* Verde */
    color: white;
    font-size: 11px;
    font-weight: bold;
    border-radius: 3px;
}

.badge-pos-missing {
    display: inline-block;
    min-width: 32px;
    padding: 2px 4px;
    text-align: center;
    background-color: #F44336;  /* Rojo oscuro */
    color: white;
    font-size: 11px;
    font-weight: bold;
    border-radius: 3px;
}

.badge-pos-empty {
    display: inline-block;
    min-width: 42px;
    padding: 2px 4px;
    text-align: center;
    background-color: #FF6B6B;  /* Rojo claro */
    color: white;
    font-size: 11px;
    font-weight: bold;
    border-radius: 3px;
}
```

---

## âœ… Validaciones Implementadas

### En depuracion_json.py (Backend)

**NormalizaciÃ³n**:
- âœ… Colapso de espacios mÃºltiples en medidas
- âœ… ConversiÃ³n a string y trim()
- âœ… Manejo de null/undefined

**CÃ¡lculo de Campos**:
- âœ… measurement_final (con prioridad)
- âœ… exp_imagenes (con fallback a placeholder)
- âœ… ValidaciÃ³n de errores (7 tipos)

**NO implementado** âŒ:
- URL validation (no verifica si son accesibles)
- Integridad referencial (filename_foto vs ruta_foto)
- DeduplicaciÃ³n de URLs

### En milu_qa (Frontend)

**ValidaciÃ³n de Existencia**:
- âœ… Matching URL â†” Filesystem
- âœ… BÃºsqueda en esquemasPosFileSet (Set)
- âœ… ConstrucciÃ³n de candidatos (4 variantes)
- âœ… Error handling en img.addEventListener('error')

**Filtrado**:
- âœ… Filtro has_esquema_pos (OK/MISS/FALTA)
- âœ… Filtro has_img (tiene ruta_foto)
- âœ… Filtro has_bom

**Error Handling**:
- âœ… Fallback en cascada (candidato 0 â†’ 1 â†’ 2 â†’ ...)
- âœ… Cache de URLs que fallaron
- âœ… Remueve elementos si no hay candidatos

---

## ðŸ”´ Problemas en Validaciones

### 1. **Sin ValidaciÃ³n de URLs en Backend**

**Problema**: depuracion_json.py genera URLs sin verificar si son accesibles

**Impacto**: 
- ImÃ¡genes pueden ser URLs rotas
- Descubrimiento de fallos solo en frontend (lazy)
- Debugging difÃ­cil

**SoluciÃ³n Propuesta**:
```python
import requests

def validate_url_accessible(url, timeout=5):
    """Verifica si URL es accesible con HEAD request"""
    try:
        response = requests.head(url, timeout=timeout, allow_redirects=True)
        return response.status_code < 400
    except:
        return False

# En calculate_exp_imagenes():
if validate_url_accessible(ruta_foto):
    imagenes.append(ruta_foto)
# else: log warning
```

### 2. **Integridad Referencial Inconsistente**

**Problema**: filename_foto puede no coincidir con basename de ruta_foto

**Impacto**:
- ConfusiÃ³n sobre quÃ© archivo se estÃ¡ usando
- Cambios manuales en uno sin actualizar otro

**ValidaciÃ³n Propuesta**:
```python
def validate_filename_foto(record):
    """Verifica que filename_foto coincida con ruta_foto"""
    ruta = record.get('ruta_foto')
    filename = record.get('filename_foto')
    
    if not ruta or not filename:
        return True  # OK si uno o ambos vacÃ­os
    
    expected_filename = ruta.split('/')[-1]
    return expected_filename.lower() == filename.lower()
```

### 3. **DeduplicaciÃ³n Incompleta en SÃ­ntesis**

**Problema**: generate_synthetic_exports.js pierde imÃ¡genes cuando PN aparece en mÃºltiples modelos

**Impacto**: 
- En qa_synthetic_new.json faltan imÃ¡genes de variantes
- WordPress exportaciÃ³n pierde informaciÃ³n

**SoluciÃ³n**:
```javascript
// En vez de usar solo exp_imagenes del representante:
const allImages = new Set();

group.forEach(record => {
    const imgs = (record.exp_imagenes || '')
        .split(',')
        .map(s => s.trim())
        .filter(s => s);
    
    imgs.forEach(img => allImages.add(img));
});

synthetic.exp_imagenes = Array.from(allImages).join(', ');
```

### 4. **CSV con Separadores Inconsistentes**

**Problema**: Campo `esquemas` puede tener ", " o "," o "; " o "\n"

**Impacto**:
- Parsing inconsistente
- Algunos esquemas se pierden

**ValidaciÃ³n Propuesta**:
```python
def normalize_csv_field(value):
    """Normaliza CSV a formato estÃ¡ndar: ', ' (comma-space)"""
    if not value:
        return None
    
    # Reemplaza separadores comunes con coma-espacio
    value = str(value).replace(';', ',').replace('\n', ',').replace('\r', ',')
    
    # Normaliza espacios alrededor de comas
    parts = [p.strip() for p in value.split(',') if p.strip()]
    
    return ', '.join(parts) if parts else None
```

---

## ðŸŽ¯ Matriz de Validaciones

| ValidaciÃ³n | UbicaciÃ³n | Tipo | Estado | Prioridad |
|-----------|----------|------|--------|-----------|
| Colapso espacios | depuracion_json.py | Backend | âœ… | IMPLEMENTADO |
| URL accessibility | - | Backend | âŒ | ðŸ”´ CRÃTICA |
| CSV normalization | - | Backend | âŒ | ðŸ”´ CRÃTICA |
| Filename consistency | - | Backend | âŒ | ðŸŸ¡ IMPORTANTE |
| Trailing extension strip | qa-table.js | Frontend | âœ… | IMPLEMENTADO |
| URL decoding | qa-table.js | Frontend | âœ… | IMPLEMENTADO |
| Lowercase normalization | server.js | Backend | âœ… | IMPLEMENTADO |
| Candidato building | schemas.js | Frontend | âœ… | IMPLEMENTADO |
| Error handling | schemas.js | Frontend | âœ… | IMPLEMENTADO |
| DeduplicaciÃ³n | schemas.js | Frontend | âš ï¸ | PARCIAL |

---

## ðŸ“ˆ Impacto de Validaciones Faltantes

Si no se implementan validaciones:

- ðŸ”´ **Data Corruption**: URLs invÃ¡lidas en exp_imagenes
- ðŸ”´ **UX Degradada**: MISS badges por URLs rotas
- ðŸ”´ **WordPress Sync Fail**: ImÃ¡genes no cargan en WP
- ðŸŸ¡ **Debug Difficulty**: Errores aparecen solo en frontend
- ðŸŸ¡ **Performance Hit**: Cascadas de fallback innecesarias

---

**Ãšltima actualizaciÃ³n**: May 11, 2026  
**Basado en commit**: ad1737f0

