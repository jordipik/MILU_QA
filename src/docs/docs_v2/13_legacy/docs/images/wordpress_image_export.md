# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# WordPress Image Export: SincronizaciÃ³n de ImÃ¡genes

DocumentaciÃ³n del sistema de exportaciÃ³n de imÃ¡genes a WordPress y cÃ³mo se sincroniza exp_imagenes.

## ðŸŽ¯ PropÃ³sito del Campo exp_imagenes

El campo `exp_imagenes` es el **campo final de exportaciÃ³n** que contiene:
- URLs de imÃ¡genes "listas para usar" en WordPress
- CSV separado por ", " (coma espacio)
- Fallback a placeholder si no hay imÃ¡genes

**Es el campo que **DEBE USARSE** para cualquier exportaciÃ³n a WordPress o sistemas externos.**

---

## ðŸ“‹ Estructura de exp_imagenes

### Formato

```
exp_imagenes = "URL1, URL2, URL3, ..."

Separador: ", " (coma seguida de espacio)
MÃ¡ximo items: Sin lÃ­mite especificado (tÃ­picamente 1-3)
```

### Ejemplos

**Caso 1: Con foto y esquema**
```
exp_imagenes = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/0049976736.jpeg, https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/02/12V4000M40A-0001-01-50.webp"
```

**Caso 2: Solo foto**
```
exp_imagenes = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/0049976736.jpeg"
```

**Caso 3: Solo esquema**
```
exp_imagenes = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/02/12V4000M40A-0001-01-50.webp"
```

**Caso 4: Sin imÃ¡genes (placeholder)**
```
exp_imagenes = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg"
```

---

## ðŸ”„ CÃ¡lculo de exp_imagenes

### Algoritmo en depuracion_json.py

**UbicaciÃ³n**: [depuracion_json.py](../../depuracion_json.py)

```python
def calculate_exp_imagenes(record):
    """
    Calcula el campo exp_imagenes con PRIORIDAD.
    ENTRADA: record con ruta_foto, ruta_esquemas_pos
    SALIDA: exp_imagenes (CSV de URLs o placeholder)
    """
    
    imagenes = []
    
    # 1. FOTO (Prioridad 1) â€” Siempre primero
    if record.get('ruta_foto'):
        ruta_foto = str(record['ruta_foto']).strip()
        
        # Valida no sea placeholder
        if ruta_foto and not is_placeholder(ruta_foto):
            imagenes.append(ruta_foto)
            logging.debug(f"[exp_imagenes] Agregando foto: {ruta_foto}")
    
    # 2. ESQUEMA CON CÃRCULOS (Prioridad 2) â€” Segundo
    if record.get('ruta_esquemas_pos'):
        ruta_esquemas_pos = str(record['ruta_esquemas_pos']).strip()
        
        # Valida no sea placeholder
        if ruta_esquemas_pos and not is_placeholder(ruta_esquemas_pos):
            imagenes.append(ruta_esquemas_pos)
            logging.debug(f"[exp_imagenes] Agregando esquema: {ruta_esquemas_pos}")
    
    # 3. FALLBACK A PLACEHOLDER
    if imagenes:
        # Tenemos al menos 1 imagen real
        exp_imagenes = ", ".join(imagenes)
        logging.info(f"[exp_imagenes] {len(imagenes)} imagen(es) para PN: {record.get('PART NO.')}")
    else:
        # No tenemos imÃ¡genes, usar placeholder
        exp_imagenes = DEFAULT_EXP_IMAGENES
        logging.warning(f"[exp_imagenes] SIN IMÃGENES para PN {record.get('PART NO.')}, usando placeholder")
    
    return exp_imagenes

def is_placeholder(value):
    """Verifica si valor es un placeholder"""
    PLACEHOLDER_TOKENS = [
        'sin_imagen', 'sin-imagen', 'placeholder', 'imagen-no-disponible',
        'image-not-available', 'no-image', 'missing-image'
    ]
    return str(value).lower() in PLACEHOLDER_TOKENS

# Konstante global
DEFAULT_EXP_IMAGENES = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg"
```

### Diagrama de DecisiÃ³n

```
Â¿Tiene ruta_foto?
    SÃ â†’ No es placeholder?
         SÃ â†’ Agregar a imagenes[]
         NO â†’ Ignorar
    NO â†’ Siguiente

Â¿Tiene ruta_esquemas_pos?
    SÃ â†’ No es placeholder?
         SÃ â†’ Agregar a imagenes[]
         NO â†’ Ignorar
    NO â†’ Siguiente

Â¿imagenes[] tiene elementos?
    SÃ â†’ exp_imagenes = ", ".join(imagenes)
    NO â†’ exp_imagenes = DEFAULT_EXP_IMAGENES
```

---

## ðŸ”— RelaciÃ³n con Otros Campos

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚              Engine JSON Record                 â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                 â”‚
â”‚  ruta_foto (URL)                               â”‚
â”‚  â””â”€â†’ depuracion_json.py calcula                â”‚
â”‚      â†“                                          â”‚
â”‚  exp_imagenes (URL + esquema)  â† CAMPO FINAL   â”‚
â”‚  â””â”€â†’ Se usa en exportaciÃ³n WordPress            â”‚
â”‚                                                 â”‚
â”‚  ruta_esquemas_pos (URL)                       â”‚
â”‚  â””â”€â†’ depuracion_json.py considera              â”‚
â”‚      â†“                                          â”‚
â”‚      â†’ exp_imagenes                            â”‚
â”‚                                                 â”‚
â”‚  esquemas_circulos (nombre local)              â”‚
â”‚  â””â”€â†’ Se usa para buscar ruta_esquemas_pos      â”‚
â”‚      â””â”€â†’ Luego entra en exp_imagenes           â”‚
â”‚                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

FLUJO: esquemas_circulos â†’ ruta_esquemas_pos â†’ exp_imagenes
```

---

## ðŸ“¤ Proceso de ExportaciÃ³n a WordPress

### Paso 1: NormalizaciÃ³n (depuracion_json.py)

```bash
python depuracion_json.py
```

**Resultado**:
- Todos los engine_*.json tienen exp_imagenes calculado
- Campo es "listo para usar" en exportaciones

### Paso 2: SÃ­ntesis (generate_synthetic_exports.js)

```bash
npm run generate:synthetic
```

**Proceso**:
```javascript
// Para cada grupo de PN (mÃºltiples modelos):
// 1. Selecciona 1 registro representante
// 2. Extrae su exp_imagenes
// 3. Guardar en qa_synthetic_new.json

synthetic_record.exp_imagenes = representative_record.exp_imagenes
```

**Problemaâš ï¸**: Si hay 5 modelos con el mismo PN pero diferentes esquemas:
- Solo se guarda exp_imagenes del representante
- Se pierden imÃ¡genes de otros modelos

**SoluciÃ³n propuesta**:
```javascript
// Extrae TODAS las imÃ¡genes Ãºnicas de TODOS los registros del grupo
const allImages = new Set();

group.forEach(record => {
    const images = (record.exp_imagenes || '')
        .split(',')
        .map(s => s.trim())
        .filter(s => s && !isPlaceholder(s));
    
    images.forEach(img => allImages.add(img));
});

// Combina con prioridad a imagenes del representante primero
const repImages = (representative.exp_imagenes || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s);

const allUnique = [...new Set([...repImages, ...allImages])];
synthetic.exp_imagenes = allUnique.join(', ');
```

### Paso 3: ExportaciÃ³n a WordPress (export_wordpress.html)

**UbicaciÃ³n**: [export_wordpress.html](../../export_wordpress.html)

**Flujo**:
```javascript
1. Carga qa_synthetic_new.json
2. Para cada registro:
   - Extrae exp_imagenes
   - Parsea URLs
   - Para cada imagen:
     - Verifica que sea accesible
     - Genera referencia en WordPress
     - Si error â†’ usa fallback (placeholder)
3. Genera manifest de exportaciÃ³n
4. EnvÃ­a a WordPress API (si estÃ¡ configurado)
```

### Paso 4: SincronizaciÃ³n en WordPress

```php
// En WordPress:
1. Recibe manifest con exp_imagenes URLs
2. Para cada URL:
   - Descarga imagen
   - Crea media attachment
   - Asigna a post/product
3. Si URL no accesible:
   - Usa placeholder.jpeg
4. Genera galerÃ­a HTML
```

---

## ðŸŒ URLs de WordPress

### Estructura Base

```
https://milu-naval.mystagingwebsite.com/wp-content/uploads/YYYY/MM/{filename}
                                                          â†“       â†“
                                                        2026   01 (artÃ­culos)
                                                        2026   02 (esquemas)
```

### Ejemplos de URLs

**ArtÃ­culos** (fotos_articulos/):
```
https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/0049976736.jpeg
https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/X00007116.jpeg
```

**Esquemas** (esquemas_pos_circulos/):
```
https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/02/12V4000M40A-0001-01-50.webp
https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/02/16V4000M61-0500-15-80.webp
```

**Placeholder**:
```
https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg
```

### Problemas con URLs

1. **Hardcoded en depuracion_json.py**: Si dominio cambia, regenerar todos JSONs
2. **Sin validaciÃ³n**: No se verifica si URLs son accesibles
3. **Cambios requieren regeneraciÃ³n**: No hay dinamismo

---

## ðŸ“Š EstadÃ­sticas de ExportaciÃ³n

| MÃ©trica | Valor | Notas |
|---------|-------|-------|
| Registros con exp_imagenes | ~67K | Todos los engine_*.json |
| Registros con foto | ~45K | ~67% |
| Registros con esquema_pos | ~52K | ~77% |
| Registros con placeholder | ~15K | ~23% (sin imÃ¡genes) |
| URLs Ãºnicas en engine JSONs | ~12.5K | Muchas compartidas |
| URLs Ãºnicas sÃ­ntesis | ~10K | Menos (deduplicadas) |
| TamaÃ±o promedio URL | 120 bytes | Longitud tÃ­pica |
| TamaÃ±o CSV exp_imagenes | 200-400 bytes | 1-2 URLs separadas |

---

## ðŸ” ValidaciÃ³n de exp_imagenes

### Chequeo Manual

```bash
# 1. Cargar un JSON
python -c "import json; d = json.load(open('engine_12V4000M40A.json')); print(d[0].get('exp_imagenes'))"

# DeberÃ­a imprimir algo como:
# https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/0049976736.jpeg, https://...2026/02/12V4000M40A-0001-01-50.webp

# 2. Verificar que todos los registros tengan exp_imagenes
python -c "
import json
data = json.load(open('engine_12V4000M40A.json'))
missing = [r for r in data if 'exp_imagenes' not in r or not r['exp_imagenes']]
print(f'Registros sin exp_imagenes: {len(missing)} de {len(data)}')
"

# DeberÃ­a imprimir: Registros sin exp_imagenes: 0 de XXXX

# 3. Validar URLs son vÃ¡lidas
python -c "
import json, re
data = json.load(open('engine_12V4000M40A.json'))
invalid = []
url_pattern = r'https?://[^\s]+'
for r in data:
    exp = r.get('exp_imagenes', '')
    if exp:
        urls = [u.strip() for u in exp.split(',')]
        for url in urls:
            if not re.match(url_pattern, url):
                invalid.append((r.get('PART NO.'), url))
print(f'URLs invÃ¡lidas: {len(invalid)}')
for pn, url in invalid[:5]:
    print(f'  {pn}: {url}')
"
```

### Script de ValidaciÃ³n AutomÃ¡tica

```python
# scripts/validate_exp_imagenes.py

import json
import os
from urllib.parse import urlparse

def validate_exp_imagenes():
    errors = []
    warnings = []
    
    for filename in os.listdir('.'):
        if not filename.startswith('engine_') or not filename.endswith('.json'):
            continue
        
        print(f'Validando {filename}...')
        
        with open(filename) as f:
            data = json.load(f)
        
        for i, record in enumerate(data):
            exp = record.get('exp_imagenes', '')
            
            # Check 1: exp_imagenes exists and not empty
            if not exp:
                errors.append(f'{filename}[{i}] PN={record.get(\"PART NO.\")}: exp_imagenes vacÃ­o')
                continue
            
            # Check 2: Split by comma-space
            urls = [u.strip() for u in exp.split(',')]
            
            # Check 3: Validate each URL
            for url in urls:
                if not url.startswith('https://'):
                    errors.append(f'{filename}[{i}] URL invÃ¡lida: {url}')
                
                # Check 4: Validate domain
                if 'milu-naval.mystagingwebsite.com' not in url:
                    warnings.append(f'{filename}[{i}] URL no estÃ¡ en dominio esperado: {url}')
    
    print(f'\n=== RESULTADOS ===')
    print(f'Errores: {len(errors)}')
    print(f'Warnings: {len(warnings)}')
    
    if errors:
        print('\nErrores:')
        for e in errors[:10]:
            print(f'  {e}')
    
    if warnings:
        print('\nWarnings:')
        for w in warnings[:10]:
            print(f'  {w}')
```

---

## ðŸ”´ Problemas Identificados

### 1. **Placeholder Hardcoded**

**Problema**: URL del placeholder estÃ¡ hardcoded en cÃ³digo Python
```python
DEFAULT_EXP_IMAGENES = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg"
```

**Impacto**:
- Si dominio cambia â†’ todos los placeholders son URLs rotas
- Requiere regenerar todos los JSONs

**SoluciÃ³n**:
```python
# En archivo de configuraciÃ³n config.json
{
  "wordpress": {
    "base_url": "https://milu-naval.mystagingwebsite.com/wp-content/uploads",
    "placeholder_url": "/2026/01/sin_imagen.jpeg"
  }
}

# En depuracion_json.py
DEFAULT_EXP_IMAGENES = f"{CONFIG['wordpress']['base_url']}{CONFIG['wordpress']['placeholder_url']}"
```

### 2. **DeduplicaciÃ³n Incompleta en SÃ­ntesis**

**Problema**: generate_synthetic_exports.js pierde imÃ¡genes cuando PN aparece en mÃºltiples modelos

**Ejemplo**:
```
PN 123456 aparece en:
  - 12V4000M40A: exp_imagenes = "URL_FOTO, URL_ESQUEMA_40A"
  - 16V4000M61: exp_imagenes = "URL_FOTO, URL_ESQUEMA_61"

SÃ­ntesis genera:
  "exp_imagenes": "URL_FOTO, URL_ESQUEMA_40A"  â† PIERDE esquema del modelo 61
```

**SoluciÃ³n**: Agregar todas las imÃ¡genes Ãºnicas

### 3. **Sin ValidaciÃ³n de URLs en Backend**

**Problema**: depuracion_json.py genera exp_imagenes sin verificar si URLs son accesibles

**Impacto**:
- ImÃ¡genes pueden estar rotas
- Descubrimiento solo cuando WordPress intenta descargar
- Debugging difÃ­cil

**SoluciÃ³n**:
```python
import requests

def validate_url_accessible(url, timeout=5):
    try:
        response = requests.head(url, timeout=timeout, allow_redirects=True)
        return response.status_code < 400
    except:
        return False

# En calculate_exp_imagenes():
if validate_url_accessible(ruta_foto):
    imagenes.append(ruta_foto)
else:
    logging.warning(f"URL inaccesible: {ruta_foto}")
```

### 4. **CSV sin NormalizaciÃ³n**

**Problema**: Separador ", " podrÃ­a ser inconsistente en algunos registros

**SoluciÃ³n**: Normalizar al exportar
```python
def normalize_exp_imagenes(value):
    # Reemplaza separadores comunes
    value = str(value).replace(';', ',').replace('\n', ',')
    # Normaliza espacios
    parts = [p.strip() for p in value.split(',') if p.strip()]
    return ', '.join(parts)
```

---

## âœ… Checklist de ExportaciÃ³n

Antes de exportar a WordPress:

- [ ] Ejecutar `python depuracion_json.py`
- [ ] Validar que TODOS los registros tengan exp_imagenes
- [ ] Ejecutar `npm run generate:synthetic`
- [ ] Validar URLs en qa_synthetic_new.json
- [ ] Verificar no hay placeholders innecesarios
- [ ] Testear en milu_qa: Cargar imÃ¡genes correctamente
- [ ] Ejecutar script de validaciÃ³n: `python scripts/validate_exp_imagenes.py`
- [ ] Si hay warnings: investigar URLs inaccesibles
- [ ] Backup antes de exportar
- [ ] Exportar a WordPress (staging primero)
- [ ] Validar imÃ¡genes en WordPress
- [ ] Promocionar a producciÃ³n

---

**Ãšltima actualizaciÃ³n**: May 11, 2026  
**Basado en commit**: ad1737f0

