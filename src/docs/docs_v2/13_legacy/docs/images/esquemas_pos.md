# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Esquemas de PosiciÃ³n: Detalles TÃ©cnicos

DocumentaciÃ³n especÃ­fica de los esquemas de posiciÃ³n con cÃ­rculos (esquemas_pos_circulos) y su validaciÃ³n.

## ðŸ“‚ Estructura de esquemas_pos_circulos/

### JerarquÃ­a de Directorios

```
esquemas_pos_circulos/                              (raÃ­z, ~50K archivos, 15-20 GB)
â”œâ”€ 12V4000M40A-POS/                                (~5,500 archivos)
â”‚  â”œâ”€ 12V4000M40A-0001-01-50.webp
â”‚  â”œâ”€ 12V4000M40A-0001-01-80.webp
â”‚  â”œâ”€ 12V4000M40A-0001-02-50.webp
â”‚  â”œâ”€ 12V4000M40A-0001-02-80.webp
â”‚  â”œâ”€ 12V4000M40A-0001-03-50.webp
â”‚  â”œâ”€ 12V4000M40A-0001-03-80.webp
â”‚  â”œâ”€ 12V4000M40A-0001-04-50.webp
â”‚  â”œâ”€ 12V4000M40A-0001-04-80.webp
â”‚  â”œâ”€ 12V4000M40A-0002-01-50.webp
â”‚  â”œâ”€ 12V4000M40A-0002-01-80.webp
â”‚  â”œâ”€ ... (mÃ¡s pÃ¡ginas)
â”‚  â””â”€ 12V4000M40A-9999-99-80.webp
â”‚
â”œâ”€ 12V4000M53-POS/                                 (~5,500 archivos)
â”‚  â”œâ”€ 12V4000M53-0001-01-50.webp
â”‚  â”œâ”€ 12V4000M53-0001-01-80.webp
â”‚  â””â”€ ...
â”‚
â”œâ”€ 12V4000M70-POS/
â”œâ”€ 16V4000M61-POS/
â”œâ”€ 16V4000M73-POS/
â”œâ”€ 16V4000M73L-POS/
â”œâ”€ 16V4000M90-POS/
â”œâ”€ 20V4000M93-POS/
â”œâ”€ 20V4000M93L-POS/
â””â”€ (Total: 9 modelos Ã— ~5.5K = ~49,972 archivos)
```

### PatrÃ³n de Nombres de Archivo

```
{MODELO}-{LIBRO_PAGINA}-{INDICE}-{TAMAÃ‘O}.webp

Ejemplo: 12V4000M40A-0001-01-50.webp
         â””â”€ MODELO: 12V4000M40A
         â””â”€ LIBRO_PAGINA: 0001 (4 dÃ­gitos, nÃºmero de pÃ¡gina o "libro.pÃ¡gina")
         â””â”€ INDICE: 01 (2 dÃ­gitos, nÃºmero de esquema en esa pÃ¡gina)
         â””â”€ TAMAÃ‘O: 50 (2-3 dÃ­gitos, probablemente radio/diÃ¡metro en pixels)
```

**InterpretaciÃ³n**:
- `0001` = PÃ¡gina 1 del libro / Libro 0, PÃ¡gina 1
- `01` = Primer esquema en esa pÃ¡gina
- `50` = Primer tamaÃ±o (aprox. 50px)
- `80` = Segundo tamaÃ±o (aprox. 80px)

**Valores conocidos**:
- TAMAÃ‘O: 50, 80 (dos variantes por esquema)
- MODELO: 12V4000M40A, 12V4000M53, 12V4000M70, 16V4000M61, 16V4000M73, 16V4000M73L, 16V4000M90, 20V4000M93, 20V4000M93L
- LIBRO_PAGINA: 0001 a 9999 (teÃ³ricamente)
- INDICE: 01 a 99

---

## ðŸ”§ Ãndice en Servidor

### Endpoint /api/esquemas-pos-index

**UbicaciÃ³n**: [server.js](../../server.js#L1912)

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
    ... (49,970 mÃ¡s)
  ]
}
```

**Notas**:
- âœ… Basenames en minÃºsculas (normalizaciÃ³n)
- âœ… Un array plano (no hierÃ¡rquico)
- âœ… ~49,972 elementos
- âœ… Se cachea en memoria despuÃ©s de primer call
- âœ… Una sola vez por sesiÃ³n del servidor

### ImplementaciÃ³n

```javascript
// server.js - lÃ­nea 1912

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
        res.status(500).json({ error: 'Error generando Ã­ndice' });
    }
});
```

**CaracterÃ­sticas**:
- O(n) construcciÃ³n (n = nÃºmero de archivos)
- O(1) bÃºsquedas posteriores
- Tarda ~300-500ms para 50K archivos
- Se ejecuta en background (`loadOptionalCatalogsInBackground`)

---

## ðŸ” Estado ESQ_POS: OK / MISS / FALTA

### Definiciones

| Estado | Significado | CondiciÃ³n |
|--------|------------|-----------|
| **OK** | Archivo existe localmente | Hay â‰¥1 candidato en `state.esquemasPosFileSet` |
| **MISS** | Referencias pero archivo NO existe | Tiene referencias (ruta_esquemas_pos, exp_imagenes, esquemas_circulos) pero ningÃºn candidato existe |
| **FALTA** | Sin referencias en absoluto | Ninguno de: ruta_esquemas_pos, exp_imagenes, esquemas_circulos |

### CÃ¡lculo de Estado

**UbicaciÃ³n**: [js/qa-table.js](../../js/qa-table.js#L771)

```javascript
function getEsquemaPosStatus(row) {
    // 1. Construye candidatos de imÃ¡genes
    const posItems = getPosSchemasForRow(row);
    
    if (!Array.isArray(posItems) || posItems.length === 0) {
        return 'empty';  // Sin referencias en absoluto
    }
    
    // 2. Verifica si ALGÃšN candidato existe en esquemasPosFileSet
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

- **Tiempo por registro**: O(k Ã— m) donde:
  - k = nÃºmero de posItems (tÃ­picamente 3-5)
  - m = nÃºmero de candidates por item (tÃ­picamente 4)
  - Cada bÃºsqueda en Set es O(1)
  - Total: O(15-20) = ~O(1) en prÃ¡ctica

- **Llamadas por render**: 50 rows Ã— 3 (renderRow, sortData, applyFilters) = 150 calls
  - Sin cachÃ©: 150 Ã— O(15) = O(2250) 
  - Despreciable pero optimizable con cachÃ©

### Ejemplo de CÃ¡lculo

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
            "esquemas_pos_circulos/12V4000M40A-POS/12v4000m40a-0001-01-50.webp",  â† ESTE EXISTS
            "esquemas_pos_circulos/12V4000M40A-POS/12v4000m40a-0001-01-50.png"
        ]
    }
]

// getEsquemaPosStatus() checkea:
state.esquemasPosFileSet.has("12v4000m40a-0001-01-50.webp")  // TRUE!
state.esquemasPosFileSet.has("12v4000m40a-0001-01-50.png")   // FALSE
state.esquemasPosFileSet.has("12v4000m40a-0001-01-50.webp")  // TRUE!
state.esquemasPosFileSet.has("12v4000m40a-0001-01-50.png")   // FALSE

â†’ Al menos uno existe â†’ status = 'ok'
```

---

## ðŸ—ï¸ ConstrucciÃ³n de Candidatos

### Algoritmo buildSchemaPosImageCandidates()

**UbicaciÃ³n**: [js/schemas.js](../../js/schemas.js#L41)

```javascript
export function buildSchemaPosImageCandidates(book, rawToken) {
    if (!rawToken) return [];
    
    const book_lower = (book || '').toLowerCase();
    
    // 1. EXTRAE NOMBRE Y EXTENSIÃ“N
    const tokenFromPath = extractFileNameFromPath(rawToken) || rawToken;
    // rawToken: "https://...12V4000M40A-0001-01-50.webp" â†’ "12V4000M40A-0001-01-50.webp"
    
    const tokenNoExt = stripFileExtension(tokenFromPath);
    // "12V4000M40A-0001-01-50.webp" â†’ "12V4000M40A-0001-01-50"
    
    const tokenExt = tokenFromPath.match(/\.(png|webp|jpg|jpeg)$/i)?.[1].toLowerCase();
    // "webp"
    
    // 2. DEFINE NOMBRES A INTENTAR
    const names = [tokenNoExt];  // ["12V4000M40A-0001-01-50"]
    
    if (!tokenNoExt.startsWith(book_lower)) {
        names.push(`${book_lower}-${tokenNoExt}`);  // ["...", "12v4000m40a-12V4000M40A-0001-01-50"]
    }
    
    // 3. DEFINE EXTENSIONES
    const extensions = tokenExt ? [tokenExt] : ['webp', 'png', 'jpg', 'jpeg'];
    // Si tiene extensiÃ³n â†’ solo esa; si no â†’ tenta todas
    
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

1. extractFileNameFromPath() â†’ "12V4000M40A-0001-01-50.webp"
2. stripFileExtension() â†’ "12V4000M40A-0001-01-50"
3. tokenExt â†’ "webp"
4. names = ["12V4000M40A-0001-01-50"]
5. extensions = ["webp"]

â†’ candidates = [
    "esquemas_pos_circulos/12V4000M40A-POS/12V4000M40A-0001-01-50.webp"
]
```

### Ejemplo 2: Nombre sin extensiÃ³n

```
book = "12V4000M40A"
rawToken = "pos-0001"  (sin extensiÃ³n)

1. extractFileNameFromPath() â†’ "pos-0001"
2. stripFileExtension() â†’ "pos-0001"
3. tokenExt â†’ null
4. names = ["pos-0001", "12v4000m40a-pos-0001"]
5. extensions = ["webp", "png", "jpg", "jpeg"]

â†’ candidates = [
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

## ðŸ“Š EstadÃ­sticas

| MÃ©trica | Valor | Notas |
|---------|-------|-------|
| Total archivos | 49,972 | 9 modelos Ã— ~5.5K |
| Archivos por modelo | ~5,500 | Rango 4.5K-6K |
| Archivo menor | ~5 KB | WebP muy comprimido |
| Archivo promedio | 300-400 KB | WebP, tÃ­pico |
| Archivo mayor | ~5 MB | ImÃ¡genes complejas |
| Total disk size | ~15-20 GB | 50K Ã— 300KB promedio |
| Index size (memoria) | ~2-3 MB | 50K strings + Set overhead |
| Time para generar Ã­ndice | ~300-500ms | First call |
| Cache hit rate | ~99%+ | DespuÃ©s de primer call |

---

## ðŸ”´ Problemas y Limitaciones

### 1. **Directorio Plano SerÃ­a MÃ¡s Eficiente**

**Actual**: esquemas_pos_circulos/12V4000M40A-POS/12V4000M40A-0001-01-50.webp  
**Propuesto**: esquemas_pos_circulos/12v4000m40a-0001-01-50.webp

**Beneficio**: No necesitarÃ­a construir tantos candidatos

### 2. **Dos TamaÃ±os (50, 80) sin DocumentaciÃ³n**

**Problema**: No estÃ¡ claro quÃ© significan 50 y 80
- Â¿Pixels?
- Â¿Zoom levels?
- Â¿Resoluciones?

**RecomendaciÃ³n**: Documentar o eliminar si uno es suficiente

### 3. **NormalizaciÃ³n Inconsistente**

**Problema**: Los archivos tienen mayÃºsculas/minÃºsculas inconsistentes
- Algunos: 12V4000M40A-0001-01-50.webp
- Otros: 12v4000m40a-0001-01-50.webp

**SoluciÃ³n**: Estandarizar a minÃºsculas en filesystem

### 4. **Sin ValidaciÃ³n de Nuevos Archivos**

**Problema**: Si alguien agrega archivos al directorio, no se valida que sigan patrÃ³n

**RecomendaciÃ³n**: Script de validaciÃ³n pre-push

---

## âœ… Validaciones Actuales

- âœ… Existencia local (Set based)
- âœ… NormalizaciÃ³n de basenames (lowercase)
- âœ… ConstrucciÃ³n de candidatos (4 variantes)
- âœ… URL decoding
- âŒ ValidaciÃ³n de patrÃ³n de nombre
- âŒ ValidaciÃ³n al agregar nuevos archivos
- âŒ DocumentaciÃ³n de TAMAÃ‘O (50, 80)

---

## ðŸ“‹ Checklist de Mantenimiento

Cuando se actualizan esquemas_pos_circulos/:

- [ ] Archivos siguen patrÃ³n `{MODELO}-{PAGE}-{IDX}-{SIZE}.webp`
- [ ] Todas las carpetas son `{MODELO}-POS`
- [ ] Basenames son lowercase
- [ ] No hay caracteres especiales sin URL encode
- [ ] Validar con script: `node scripts/audit_image_schema_system.js`
- [ ] Re-generar Ã­ndice: GET /api/esquemas-pos-index (automÃ¡tico)
- [ ] Testear en milu_qa: Verificar OK badges
- [ ] Validar no hay MISS badges esperados
- [ ] Comprobar en browser console: Sin errores 404

---

**Ãšltima actualizaciÃ³n**: May 11, 2026  
**Basado en commit**: ad1737f0

