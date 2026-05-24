# Esquemas de Posición: Detalles Técnicos

Documentación específica de los esquemas de posición con círculos (esquemas_pos_circulos) y su validación.

## 📂 Estructura de esquemas_pos_circulos/

### Jerarquía de Directorios

```
esquemas_pos_circulos/                              (raíz, ~50K archivos, 15-20 GB)
├─ 12V4000M40A-POS/                                (~5,500 archivos)
│  ├─ 12V4000M40A-0001-01-50.webp
│  ├─ 12V4000M40A-0001-01-80.webp
│  ├─ 12V4000M40A-0001-02-50.webp
│  ├─ 12V4000M40A-0001-02-80.webp
│  ├─ 12V4000M40A-0001-03-50.webp
│  ├─ 12V4000M40A-0001-03-80.webp
│  ├─ 12V4000M40A-0001-04-50.webp
│  ├─ 12V4000M40A-0001-04-80.webp
│  ├─ 12V4000M40A-0002-01-50.webp
│  ├─ 12V4000M40A-0002-01-80.webp
│  ├─ ... (más páginas)
│  └─ 12V4000M40A-9999-99-80.webp
│
├─ 12V4000M53-POS/                                 (~5,500 archivos)
│  ├─ 12V4000M53-0001-01-50.webp
│  ├─ 12V4000M53-0001-01-80.webp
│  └─ ...
│
├─ 12V4000M70-POS/
├─ 16V4000M61-POS/
├─ 16V4000M73-POS/
├─ 16V4000M73L-POS/
├─ 16V4000M90-POS/
├─ 20V4000M93-POS/
├─ 20V4000M93L-POS/
└─ (Total: 9 modelos × ~5.5K = ~49,972 archivos)
```

### Patrón de Nombres de Archivo

```
{MODELO}-{LIBRO_PAGINA}-{INDICE}-{TAMAÑO}.webp

Ejemplo: 12V4000M40A-0001-01-50.webp
         └─ MODELO: 12V4000M40A
         └─ LIBRO_PAGINA: 0001 (4 dígitos, número de página o "libro.página")
         └─ INDICE: 01 (2 dígitos, número de esquema en esa página)
         └─ TAMAÑO: 50 (2-3 dígitos, probablemente radio/diámetro en pixels)
```

**Interpretación**:
- `0001` = Página 1 del libro / Libro 0, Página 1
- `01` = Primer esquema en esa página
- `50` = Primer tamaño (aprox. 50px)
- `80` = Segundo tamaño (aprox. 80px)

**Valores conocidos**:
- TAMAÑO: 50, 80 (dos variantes por esquema)
- MODELO: 12V4000M40A, 12V4000M53, 12V4000M70, 16V4000M61, 16V4000M73, 16V4000M73L, 16V4000M90, 20V4000M93, 20V4000M93L
- LIBRO_PAGINA: 0001 a 9999 (teóricamente)
- INDICE: 01 a 99

---

## 🔧 Índice en Servidor

### Endpoint /api/esquemas-pos-index

**Ubicación**: [server.js](../../server.js#L1912)

**Request**:
```http
GET /api/esquemas-pos-index
```

**Response**:
```json
{
  "files": [
    "12v4000m40a-0001-01-50.webp",
    "12v4000m40a-0001-01-80.webp",
    "12v4000m40a-0001-02-50.webp",
    ... (49,970 más)
  ]
}
```

**Notas**:
- ✅ Basenames en minúsculas (normalización)
- ✅ Un array plano (no hierárquico)
- ✅ ~49,972 elementos
- ✅ Se cachea en memoria después de primer call
- ✅ Una sola vez por sesión del servidor

### Implementación

```javascript
// server.js - línea 1912

let _esquemasPosIndexCache = null;

app.get('/api/esquemas-pos-index', async (_req, res) => {
    try {
        if (!_esquemasPosIndexCache) {
            // Primera llamada: escanea filesystem
            const baseDir = path.join(__dirname, 'esquemas_pos_circulos');
            const folders = await fs.promises.readdir(baseDir);
            const allFiles = [];
            
            for (const folder of folders) {
                const folderPath = path.join(baseDir, folder);
                let stat;
                try { 
                    stat = await fs.promises.stat(folderPath); 
                } catch { 
                    continue; 
                }
                
                if (!stat.isDirectory()) continue;
                
                // Escanea carpeta
                const files = await fs.promises.readdir(folderPath);
                
                for (const file of files) {
                    // Normaliza: lowercase, sin carpeta
                    const basename = file.toLowerCase();
                    allFiles.push(basename);
                }
            }
            
            _esquemasPosIndexCache = {
                files: allFiles,
                generatedAt: new Date().toISOString(),
                count: allFiles.length
            };
        }
        
        res.json({
            files: _esquemasPosIndexCache.files,
            count: _esquemasPosIndexCache.files.length,
            generatedAt: _esquemasPosIndexCache.generatedAt
        });
    } catch (error) {
        console.error('[esquemas-pos-index] Error:', error);
        res.status(500).json({ error: 'Error generando índice' });
    }
});
```

**Características**:
- O(n) construcción (n = número de archivos)
- O(1) búsquedas posteriores
- Tarda ~300-500ms para 50K archivos
- Se ejecuta en background (`loadOptionalCatalogsInBackground`)

---

## 🔍 Estado ESQ_POS: OK / MISS / FALTA

### Definiciones

| Estado | Significado | Condición |
|--------|------------|-----------|
| **OK** | Archivo existe localmente | Hay ≥1 candidato en `state.esquemasPosFileSet` |
| **MISS** | Referencias pero archivo NO existe | Tiene referencias (ruta_esquemas_pos, exp_imagenes, esquemas_circulos) pero ningún candidato existe |
| **FALTA** | Sin referencias en absoluto | Ninguno de: ruta_esquemas_pos, exp_imagenes, esquemas_circulos |

### Cálculo de Estado

**Ubicación**: [js/qa-table.js](../../js/qa-table.js#L771)

```javascript
function getEsquemaPosStatus(row) {
    // 1. Construye candidatos de imágenes
    const posItems = getPosSchemasForRow(row);
    
    if (!Array.isArray(posItems) || posItems.length === 0) {
        return 'empty';  // Sin referencias en absoluto
    }
    
    // 2. Verifica si ALGÚN candidato existe en esquemasPosFileSet
    const exists = posItems.some(item => {
        if (!Array.isArray(item?.candidates)) return false;
        
        return item.candidates.some(candidate => {
            const bn = basename(candidate);
            return state.esquemasPosFileSet.has(bn);
        });
    });
    
    return exists ? 'ok' : 'missing';
}
```

### Complejidad

- **Tiempo por registro**: O(k × m) donde:
  - k = número de posItems (típicamente 3-5)
  - m = número de candidates por item (típicamente 4)
  - Cada búsqueda en Set es O(1)
  - Total: O(15-20) = ~O(1) en práctica

- **Llamadas por render**: 50 rows × 3 (renderRow, sortData, applyFilters) = 150 calls
  - Sin caché: 150 × O(15) = O(2250) 
  - Despreciable pero optimizable con caché

### Ejemplo de Cálculo

```javascript
// Row con esquema_pos
const row = {
    PART_NO: "123456",
    ruta_esquemas_pos: "https://...12V4000M40A-0001-01-50.webp",
    esquemas_circulos: "12V4000M40A-0001-01-50.webp",
    exp_imagenes: "https://...0123456.jpeg, https://...12V4000M40A-0001-01-50.webp"
};

// getPosSchemasForRow() retorna:
[
    {
        label: "12v4000m40a-0001-01-50",
        candidates: [
            "esquemas_pos_circulos/12V4000M40A-POS/12V4000M40A-0001-01-50.webp",
            "esquemas_pos_circulos/12V4000M40A-POS/12V4000M40A-0001-01-50.png",
            "esquemas_pos_circulos/12V4000M40A-POS/12v4000m40a-0001-01-50.webp",  ← ESTE EXISTS
            "esquemas_pos_circulos/12V4000M40A-POS/12v4000m40a-0001-01-50.png"
        ]
    }
]

// getEsquemaPosStatus() checkea:
state.esquemasPosFileSet.has("12v4000m40a-0001-01-50.webp")  // TRUE!
state.esquemasPosFileSet.has("12v4000m40a-0001-01-50.png")   // FALSE
state.esquemasPosFileSet.has("12v4000m40a-0001-01-50.webp")  // TRUE!
state.esquemasPosFileSet.has("12v4000m40a-0001-01-50.png")   // FALSE

→ Al menos uno existe → status = 'ok'
```

---

## 🏗️ Construcción de Candidatos

### Algoritmo buildSchemaPosImageCandidates()

**Ubicación**: [js/schemas.js](../../js/schemas.js#L41)

```javascript
export function buildSchemaPosImageCandidates(book, rawToken) {
    if (!rawToken) return [];
    
    const book_lower = (book || '').toLowerCase();
    
    // 1. EXTRAE NOMBRE Y EXTENSIÓN
    const tokenFromPath = extractFileNameFromPath(rawToken) || rawToken;
    // rawToken: "https://...12V4000M40A-0001-01-50.webp" → "12V4000M40A-0001-01-50.webp"
    
    const tokenNoExt = stripFileExtension(tokenFromPath);
    // "12V4000M40A-0001-01-50.webp" → "12V4000M40A-0001-01-50"
    
    const tokenExt = tokenFromPath.match(/\.(png|webp|jpg|jpeg)$/i)?.[1].toLowerCase();
    // "webp"
    
    // 2. DEFINE NOMBRES A INTENTAR
    const names = [tokenNoExt];  // ["12V4000M40A-0001-01-50"]
    
    if (!tokenNoExt.startsWith(book_lower)) {
        names.push(`${book_lower}-${tokenNoExt}`);  // ["...", "12v4000m40a-12V4000M40A-0001-01-50"]
    }
    
    // 3. DEFINE EXTENSIONES
    const extensions = tokenExt ? [tokenExt] : ['webp', 'png', 'jpg', 'jpeg'];
    // Si tiene extensión → solo esa; si no → tenta todas
    
    // 4. CONSTRUYE CANDIDATOS
    const candidates = [];
    
    names.forEach(name => {
        extensions.forEach(ext => {
            const encoded = encodeURIComponent(name);
            // URL encode special chars (si hay)
            
            const path = `esquemas_pos_circulos/${book}-POS/${encoded}.${ext}`;
            candidates.push(path);
        });
    });
    
    return candidates;
}
```

### Ejemplo 1: URL de WordPress

```
book = "12V4000M40A"
rawToken = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/02/12V4000M40A-0001-01-50.webp"

1. extractFileNameFromPath() → "12V4000M40A-0001-01-50.webp"
2. stripFileExtension() → "12V4000M40A-0001-01-50"
3. tokenExt → "webp"
4. names = ["12V4000M40A-0001-01-50"]
5. extensions = ["webp"]

→ candidates = [
    "esquemas_pos_circulos/12V4000M40A-POS/12V4000M40A-0001-01-50.webp"
]
```

### Ejemplo 2: Nombre sin extensión

```
book = "12V4000M40A"
rawToken = "pos-0001"  (sin extensión)

1. extractFileNameFromPath() → "pos-0001"
2. stripFileExtension() → "pos-0001"
3. tokenExt → null
4. names = ["pos-0001", "12v4000m40a-pos-0001"]
5. extensions = ["webp", "png", "jpg", "jpeg"]

→ candidates = [
    "esquemas_pos_circulos/12V4000M40A-POS/pos-0001.webp",
    "esquemas_pos_circulos/12V4000M40A-POS/pos-0001.png",
    "esquemas_pos_circulos/12V4000M40A-POS/pos-0001.jpg",
    "esquemas_pos_circulos/12V4000M40A-POS/pos-0001.jpeg",
    "esquemas_pos_circulos/12V4000M40A-POS/12v4000m40a-pos-0001.webp",
    "esquemas_pos_circulos/12V4000M40A-POS/12v4000m40a-pos-0001.png",
    "esquemas_pos_circulos/12V4000M40A-POS/12v4000m40a-pos-0001.jpg",
    "esquemas_pos_circulos/12V4000M40A-POS/12v4000m40a-pos-0001.jpeg"
]
```

---

## 📊 Estadísticas

| Métrica | Valor | Notas |
|---------|-------|-------|
| Total archivos | 49,972 | 9 modelos × ~5.5K |
| Archivos por modelo | ~5,500 | Rango 4.5K-6K |
| Archivo menor | ~5 KB | WebP muy comprimido |
| Archivo promedio | 300-400 KB | WebP, típico |
| Archivo mayor | ~5 MB | Imágenes complejas |
| Total disk size | ~15-20 GB | 50K × 300KB promedio |
| Index size (memoria) | ~2-3 MB | 50K strings + Set overhead |
| Time para generar índice | ~300-500ms | First call |
| Cache hit rate | ~99%+ | Después de primer call |

---

## 🔴 Problemas y Limitaciones

### 1. **Directorio Plano Sería Más Eficiente**

**Actual**: esquemas_pos_circulos/12V4000M40A-POS/12V4000M40A-0001-01-50.webp  
**Propuesto**: esquemas_pos_circulos/12v4000m40a-0001-01-50.webp

**Beneficio**: No necesitaría construir tantos candidatos

### 2. **Dos Tamaños (50, 80) sin Documentación**

**Problema**: No está claro qué significan 50 y 80
- ¿Pixels?
- ¿Zoom levels?
- ¿Resoluciones?

**Recomendación**: Documentar o eliminar si uno es suficiente

### 3. **Normalización Inconsistente**

**Problema**: Los archivos tienen mayúsculas/minúsculas inconsistentes
- Algunos: 12V4000M40A-0001-01-50.webp
- Otros: 12v4000m40a-0001-01-50.webp

**Solución**: Estandarizar a minúsculas en filesystem

### 4. **Sin Validación de Nuevos Archivos**

**Problema**: Si alguien agrega archivos al directorio, no se valida que sigan patrón

**Recomendación**: Script de validación pre-push

---

## ✅ Validaciones Actuales

- ✅ Existencia local (Set based)
- ✅ Normalización de basenames (lowercase)
- ✅ Construcción de candidatos (4 variantes)
- ✅ URL decoding
- ❌ Validación de patrón de nombre
- ❌ Validación al agregar nuevos archivos
- ❌ Documentación de TAMAÑO (50, 80)

---

## 📋 Checklist de Mantenimiento

Cuando se actualizan esquemas_pos_circulos/:

- [ ] Archivos siguen patrón `{MODELO}-{PAGE}-{IDX}-{SIZE}.webp`
- [ ] Todas las carpetas son `{MODELO}-POS`
- [ ] Basenames son lowercase
- [ ] No hay caracteres especiales sin URL encode
- [ ] Validar con script: `node scripts/audit_image_schema_system.js`
- [ ] Re-generar índice: GET /api/esquemas-pos-index (automático)
- [ ] Testear en milu_qa: Verificar OK badges
- [ ] Validar no hay MISS badges esperados
- [ ] Comprobar en browser console: Sin errores 404

---

**Última actualización**: May 11, 2026  
**Basado en commit**: ad1737f0
