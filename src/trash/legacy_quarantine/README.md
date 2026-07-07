# legacy_quarantine

Zona de aislamiento de componentes legacy en FASE 5 de MILU V1.03.

Reglas:

- Aqui se mueven componentes retirados del runtime oficial.
- Se mueve, no se borra.
- No se ejecuta codigo desde esta carpeta en flujos oficiales.
- Cualquier restauracion debe ser explicita y trazada en docs/v1.03.

Estructura:

- js: scripts Node legacy movidos desde raiz.
- python: reservado para scripts Python legacy.
- legacy: reservado para subtree legacy no oficial.
- wrappers: wrappers CLI redundantes movidos desde raiz.
- docs: soporte de informes y notas de cuarentena.
