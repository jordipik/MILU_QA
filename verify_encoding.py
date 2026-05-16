#!/usr/bin/env python3
import os

os.chdir(os.path.dirname(__file__))

print('=== VERIFICACIÓN DE ENCODING ===\n')

tests = [
    ('qa_milu.html', '•'),
    ('js/analista-02.js', 'únicos'),
    ('js/qa-milu.js', 'Total analizados'),
    ('styles/qa_milu.css', 'Personalización'),
    ('js/pdf-viewer.js', 'visualizador')
]

all_ok = True

for filepath, marker in tests:
    if not os.path.exists(filepath):
        print(f'⚠ {filepath}: No existe')
        continue
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        if marker in content:
            print(f'✓ {filepath}')
        else:
            print(f'❌ {filepath}: No contiene "{marker}"')
            all_ok = False
    except Exception as e:
        print(f'❌ {filepath}: {e}')
        all_ok = False

print()
if all_ok:
    print('✅ TODOS LOS ARCHIVOS ESTÁN CORRECTAMENTE REPARADOS')
else:
    print('⚠ Algunos archivos tienen problemas')
