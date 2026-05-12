# Directorio de snapshots DT-3

Los snapshots de engine_*.json se guardan aquí bajo subdirectorios con formato `YYYY-MM-DD_HHMMSS/`.

## Comandos

```bash
# Crear snapshot del estado actual
npm run data:snapshot

# Con etiqueta descriptiva
npm run data:snapshot -- --label="pre-depuracion-2026-05"

# Listar snapshots disponibles
npm run data:snapshot:compare -- --list

# Comparar último snapshot con estado actual
npm run data:snapshot:compare

# Comparar snapshot concreto
npm run data:snapshot:compare -- 2026-05-13_120000
```

## Qué contiene cada snapshot

```
data/snapshots/<YYYY-MM-DD_HHMMSS>/
  engine_12V4000M40A.json
  engine_12V4000M53.json
  engine_12V4000M70.json
  engine_16V4000M61.json
  engine_16V4000M73.json
  engine_16V4000M73L.json
  engine_16V4000M90.json
  engine_20V4000M93.json
  engine_20V4000M93L.json
  manifest.json              ← metadatos: fecha, hash SHA-256, nº registros, schema_version
```

## .gitignore

Los subdirectorios de snapshots (`data/snapshots/*/`) están excluidos del repo por `.gitignore`.
Los snapshots son datos locales regenerables, no se versionan en git.

Para compartir un snapshot, comprimir manualmente:
```bash
tar -czf snapshot-2026-05-13.tar.gz data/snapshots/2026-05-13_120000/
```
