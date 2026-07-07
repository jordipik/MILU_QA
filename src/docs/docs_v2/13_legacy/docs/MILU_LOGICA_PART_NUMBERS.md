# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# MILU LOGICA PART NUMBERS

## 1. Campos PN implicados
- PART NO. (captura raw principal)
- pn_raw (normalizacion base)
- pn_final (valor final para QA/export)
- criterio_pn (metadato de origen/regla)
- sust_new_part_number
- sust_superseded_list

## 2. Regla de prioridad operativa (actual)
Para mostrar/operar PN en UI se usa normalmente:
1. pn_final
2. PART NO.
3. pn (fallback historico en algunas rutas)

## 3. Reglas de depuracion relevantes
En depuracion_json.py e importar_json.py:
- Se corrige pn_final truncado si es sufijo de un PN mas completo en campos fuente.
- Ejemplo tipico: 912760297149 -> 000912760297149 cuando el candidato fuente termina con ese sufijo.
- Si pn_final coincide con sust_new_part_number, se intenta preservar PN base en pn_final y dejar nuevo en sust_*.

## 4. PN y comparacion PDF
- scripts/qa_pdf_compare.js rellena pn_pdf.
- Error model marca pn_error cuando pn_final no coincide con referencia PDF/base segun normalizacion.
- En analista_02 existe accion de doble click para copiar PART NO. desde PDF_AUTO a pn_final y recomputar.

## 5. PN y agrupaciones
La app usa agrupaciones por PN para:
- Vista agrupada de registros.
- Propagacion de revision a hermanos.
- Export WordPress por decision consolidada de SKU.

Limitacion actual:
- No existe persistencia directa de campos apariciones/hermanos en engine_*.json (se calcula al vuelo).

## 6. PN y sustituciones
Campos de sustitucion (sust_*) coexisten con PN base:
- sust_hierarchie
- sust_new_part_number
- sust_superseded_list

Uso principal:
- Informar jerarquia NEW/SUP en export WordPress.
- Evitar sobreescribir PN base con PN nuevo cuando hay ambiguedad.

## 7. Riesgos detectados
- Formatos heterogeneos (ceros a la izquierda, espacios, separadores).
- Duplicados semanticos de un mismo PN con distintas variantes de texto.
- Casos OCR con ruido que terminan en PART NO. invalido.
- Dependencia de comparaciones string sin esquema fuerte de normalizacion central.

## 8. Reglas recomendadas de normalizacion PN
1. trim y collapse de espacios.
2. uppercase consistente.
3. remover separadores no significativos solo para comparacion (no para display).
4. conservar ceros a la izquierda en valor canonico.
5. funcion unica comparePn(a,b) compartida por frontend/backend/scripts.
6. score de confianza cuando PN proviene de OCR dudoso.

## 9. Contrato recomendado para export
Por cada SKU consolidado:
- sku_canonico = pn_final normalizado.
- sku_raw_referencia = PART NO. original.
- fuentes = [engines/ids] que soportan decision.
- decision = import/pending_review/discard.
- trazabilidad = reglas aplicadas y conflictos detectados.

## 10. No tocar todavia
- No reemplazar masivamente pn_final sin validacion por engine.
- No eliminar PART NO. del modelo actual (sigue siendo evidencia base).
- No romper compatibilidad de filtros actuales que dependen de pn_final y PART NO. en paralelo.

