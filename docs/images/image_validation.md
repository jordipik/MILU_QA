# Image Validation: Validaciones y Reglas

Documentación de todas las validaciones, reglas y lógica de control de imágenes en MILU.

## 🎯 Objetivos de Validación

- **Integridad**: Verificar que referencias coincidan con archivos reales
- **Consistencia**: Garantizar que campos relacionados sean coherentes
- **Completitud**: Asegurar que registros críticos tengan imágenes
- **Performance**: Detectar problemas antes de que afecten frontend

---

## 🔍 Sistema de Placeholders

### Tokens Reconocidos como Placeholders

Ubicación: [scripts/audit_image_schema_system.js](../../scripts/audit_image_schema_system.js) línea 29

```javascript
PLACEHOLDER_TOKENS = [
    'sin_imagen',           // Español oficial
    'sin-imagen',           // Variante con guión
    'placeholder',          // Inglés
    'imagen-no-disponible', // Descriptivo
    'image-not-available',  // Inglés completo
    'no-image',             // Inglés corto
    'missing-image'         // Inglés alternativo
];
```

### Placeholder Por Defecto

Ubicación: [depuracion_json.py](../../depuracion_json.py) línea ~34

```python
DEFAULT_EXP_IMAGENES = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg"
```

**Comportamiento**:
- Si un registro NO tiene `ruta_foto` NI `ruta_esquemas_pos`
- Entonces `exp_imagenes` se asigna al DEFAULT
- Se usa para WordPress cuando no hay imágenes reales

**⚠️ Problema**: URL hardcoded. Si dominio cambia, se rompe.

---

## 📋 Cálculo de exp_imagenes

**Ubicación**: [depuracion_json.py](../../depuracion_json.py) función `calculate_final_fields()`

### Algoritmo

```python
def calculate_exp_imagenes(record):
    """
    Calcula el campo exp_imagenes con PRIORIDAD.
    Este es el campo FINAL para exportación a WordPress.
    """
    imagenes = []
    
    # 1. FOTO (prioridad 1)
    if record.get('ruta_foto'):
        ruta_foto = str(record['ruta_foto']).strip()
        if ruta_foto and ruta_foto not in PLACEHOLDER_TOKENS:
            imagenes.append(ruta_foto)
    
    # 2. ESQUEMA CON CÍRCULOS (prioridad 2)
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

→ exp_imagenes = "https://...fotos.../0049976736.jpeg, https://...esquemas.../12V4000M40A-0001-01-50.webp"
```

**Caso 2: Solo foto**
```
ruta_foto = "https://...fotos.../0049976736.jpeg"
ruta_esquemas_pos = null

→ exp_imagenes = "https://...fotos.../0049976736.jpeg"
```

**Caso 3: Solo esquema**
```
ruta_foto = null
ruta_esquemas_pos = "https://...esquemas.../12V4000M40A-0001-01-50.webp"

→ exp_imagenes = "https://...esquemas.../12V4000M40A-0001-01-50.webp"
```

**Caso 4: Sin imágenes (placeholder)**
```
ruta_foto = null
ruta_esquemas_pos = null

→ exp_imagenes = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg"
```

---

## 🔗 Matching URL ↔ Filesystem

### Proceso de Validación en Runtime

**Ubicación**: [js/qa-table.js](../../js/qa-table.js) función `getEsquemaPosStatus()`

### Paso a Paso

```javascript
function getEsquemaPosStatus(row) {
    // 1. Construye candidatos de imágenes
    const posItems = getPosSchemasForRow(row);  // Llama a schemas.js
    if (!Array.isArray(posItems) || posItems.length === 0) 
        return 'empty';  // Sin referencias
    
    // 2. Para CADA item, verifica si ALGÚN candidato existe
    const exists = posItems.some(item => {
        // item = { label: "12v4000m40a-0001-01", candidates: [...] }
        
        if (!Array.isArray(item?.candidates)) return false;
        
        return item.candidates.some(candidate => {
            // candidate = "esquemas_pos_circulos/12V4000M40A-POS/12v4000m40a-0001-01-50.webp"
            
            const basename = basename(candidate);  // "12v4000m40a-0001-01-50.webp"
            
            // Búsqueda en Set global (O(1))
            return state.esquemasPosFileSet.has(basename);
        });
    });
    
    return exists ? 'ok' : 'missing';
}
```

### Función basename()

**Ubicación**: [js/qa-table.js](../../js/qa-table.js) línea ~769

```javascript
function basename(pathOrUrl) {
    if (!pathOrUrl) return '';
    
    // 1. Extrae último segmento después de /
    const parts = String(pathOrUrl).split('/');
    let filename = parts[parts.length - 1];
    
    // 2. Decodifica URL-encoded characters
    filename = decodeURIComponent(filename);
    
    // 3. Convierte a minúsculas (normalización)
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
   Si ANY está en el Set → status = 'ok'
   Si NONE está → status = 'missing'
```

---

## 📊 Estados ESQ_POS en milu_qa

**Ubicación**: [js/qa-table.js](../../js/qa-table.js) + [qa_milu.html](../../qa_milu.html)

### Tres Estados Posibles

| Estado | Badge | Color | Significado | Condición |
|--------|-------|-------|-----------|-----------|
| **OK** | OK | Verde | Archivo existe localmente | ≥1 candidato en `esquemasPosFileSet` |
| **MISS** | MISS | Rojo oscuro | Referencias pero archivo NO existe | Referencias en ruta_esquemas_pos pero ningún candidato existe |
| **FALTA** | FALTA | Rojo claro | Sin referencias | Ninguno de: ruta_esquemas_pos, exp_imagenes, esquemas_circulos |

### Renderizado de Badges

**Ubicación**: [js/qa-table.js](../../js/qa-table.js) función `renderEsquemaPosCell()`

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

**Ubicación**: [styles/qa_milu.css](../../styles/qa_milu.css) línea ~2045

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

## ✅ Validaciones Implementadas

### En depuracion_json.py (Backend)

**Normalización**:
- ✅ Colapso de espacios múltiples en medidas
- ✅ Conversión a string y trim()
- ✅ Manejo de null/undefined

**Cálculo de Campos**:
- ✅ measurement_final (con prioridad)
- ✅ exp_imagenes (con fallback a placeholder)
- ✅ Validación de errores (7 tipos)

**NO implementado** ❌:
- URL validation (no verifica si son accesibles)
- Integridad referencial (filename_foto vs ruta_foto)
- Deduplicación de URLs

### En milu_qa (Frontend)

**Validación de Existencia**:
- ✅ Matching URL ↔ Filesystem
- ✅ Búsqueda en esquemasPosFileSet (Set)
- ✅ Construcción de candidatos (4 variantes)
- ✅ Error handling en img.addEventListener('error')

**Filtrado**:
- ✅ Filtro has_esquema_pos (OK/MISS/FALTA)
- ✅ Filtro has_img (tiene ruta_foto)
- ✅ Filtro has_bom

**Error Handling**:
- ✅ Fallback en cascada (candidato 0 → 1 → 2 → ...)
- ✅ Cache de URLs que fallaron
- ✅ Remueve elementos si no hay candidatos

---

## 🔴 Problemas en Validaciones

### 1. **Sin Validación de URLs en Backend**

**Problema**: depuracion_json.py genera URLs sin verificar si son accesibles

**Impacto**: 
- Imágenes pueden ser URLs rotas
- Descubrimiento de fallos solo en frontend (lazy)
- Debugging difícil

**Solución Propuesta**:
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
- Confusión sobre qué archivo se está usando
- Cambios manuales en uno sin actualizar otro

**Validación Propuesta**:
```python
def validate_filename_foto(record):
    """Verifica que filename_foto coincida con ruta_foto"""
    ruta = record.get('ruta_foto')
    filename = record.get('filename_foto')
    
    if not ruta or not filename:
        return True  # OK si uno o ambos vacíos
    
    expected_filename = ruta.split('/')[-1]
    return expected_filename.lower() == filename.lower()
```

### 3. **Deduplicación Incompleta en Síntesis**

**Problema**: generate_synthetic_exports.js pierde imágenes cuando PN aparece en múltiples modelos

**Impacto**: 
- En qa_synthetic_new.json faltan imágenes de variantes
- WordPress exportación pierde información

**Solución**:
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

**Validación Propuesta**:
```python
def normalize_csv_field(value):
    """Normaliza CSV a formato estándar: ', ' (comma-space)"""
    if not value:
        return None
    
    # Reemplaza separadores comunes con coma-espacio
    value = str(value).replace(';', ',').replace('\n', ',').replace('\r', ',')
    
    # Normaliza espacios alrededor de comas
    parts = [p.strip() for p in value.split(',') if p.strip()]
    
    return ', '.join(parts) if parts else None
```

---

## 🎯 Matriz de Validaciones

| Validación | Ubicación | Tipo | Estado | Prioridad |
|-----------|----------|------|--------|-----------|
| Colapso espacios | depuracion_json.py | Backend | ✅ | IMPLEMENTADO |
| URL accessibility | - | Backend | ❌ | 🔴 CRÍTICA |
| CSV normalization | - | Backend | ❌ | 🔴 CRÍTICA |
| Filename consistency | - | Backend | ❌ | 🟡 IMPORTANTE |
| Trailing extension strip | qa-table.js | Frontend | ✅ | IMPLEMENTADO |
| URL decoding | qa-table.js | Frontend | ✅ | IMPLEMENTADO |
| Lowercase normalization | server.js | Backend | ✅ | IMPLEMENTADO |
| Candidato building | schemas.js | Frontend | ✅ | IMPLEMENTADO |
| Error handling | schemas.js | Frontend | ✅ | IMPLEMENTADO |
| Deduplicación | schemas.js | Frontend | ⚠️ | PARCIAL |

---

## 📈 Impacto de Validaciones Faltantes

Si no se implementan validaciones:

- 🔴 **Data Corruption**: URLs inválidas en exp_imagenes
- 🔴 **UX Degradada**: MISS badges por URLs rotas
- 🔴 **WordPress Sync Fail**: Imágenes no cargan en WP
- 🟡 **Debug Difficulty**: Errores aparecen solo en frontend
- 🟡 **Performance Hit**: Cascadas de fallback innecesarias

---

**Última actualización**: May 11, 2026  
**Basado en commit**: ad1737f0
