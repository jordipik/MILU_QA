#!/usr/bin/env python3
"""
Validación rápida de estado de engine JSONs después de commits masivos.
"""

import json
import os

def validate_engine_files():
            
    """Validar integridad de engine_*.json"""
    files = [f for f in os.listdir('.') if f.startswith('engine_') and f.endswith('.json')]
    
    print("="*80)
    print("VALIDACIÓN DE ENGINE JSONs")
    print("="*80)
    
    for fname in sorted(files):
        try:
            with open(fname) as f:
                data = json.load(f)
            
            if not isinstance(data, list):
                print(f"\n⚠️ {fname}: Estructura no es array!")
                continue
            
            if len(data) == 0:
                print(f"\n⚠️ {fname}: Array vacío!")
                continue
            
            # Verificar campos en primer item
            first_item = data[0]
            has_pn_final = 'pn_final' in first_item
            has_measurement_final = 'measurement_final' in first_item
            has_designation_final = 'designation_final' in first_item
            has_total_error = 'total_error' in first_item
            has_error_flags = any(k in first_item for k in ['pos_error', 'pn_error', 'designation_error'])
            
            # Contar items sin pn_final
            items_without_pn_final = sum(1 for item in data if not item.get('pn_final'))
            
            print(f"\n{fname}:")
            print(f"  ✓ Bien formado ({len(data)} items)")
            print(f"  pn_final: {'✓' if has_pn_final else '✗'}")
            print(f"  measurement_final: {'✓' if has_measurement_final else '✗'}")
            print(f"  designation_final: {'✓' if has_designation_final else '✗'}")
            print(f"  Campos error: {'✓' if has_error_flags else '✗'}")
            if items_without_pn_final > 0:
                print(f"  ⚠️ Items sin pn_final: {items_without_pn_final}/{len(data)}")
        except json.JSONDecodeError as e:
            print(f"\n❌ {fname}: JSON INVALIDO - {e}")
        except Exception as e:
            print(f"\n❌ {fname}: ERROR - {e}")

if __name__ == '__main__':
    validate_engine_files()
