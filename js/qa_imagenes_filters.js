const QUICK_FILTERS = [
  {
    group: "Imagenes",
    key: "imageFlags",
    mode: "multi",
    items: [
      { id: "noImage", label: "Sin imagen", fn: (r) => r.image_status === "NO_IMAGE" },
      { id: "placeholderOnly", label: "Solo sin_imagen", fn: (r) => r.image_status === "ONLY_PLACEHOLDER" },
      { id: "realImage", label: "Imagen real", fn: (r) => r.image_status === "REAL_IMAGE" },
      { id: "brokenImage", label: "Imagen rota", fn: (r) => r.hasBrokenImage },
      { id: "placeholder", label: "Placeholder", fn: (r) => r.hasPlaceholder },
      { id: "multiImage", label: "Multiples imagenes", fn: (r) => r.total_img_urls > 1 },
      { id: "localNotExported", label: "Imagen local no exportada", fn: (r) => r.localImageFound && !r.wordpress_match }
    ]
  },
  {
    group: "Esquemas",
    key: "schemaFlags",
    mode: "multi",
    items: [
      { id: "noSchema", label: "Sin esquema", fn: (r) => r.schema_status === "NO_SCHEMA" },
      { id: "schemaOk", label: "Esquema OK", fn: (r) => r.schema_status === "HAS_SCHEMA" },
      { id: "schemaNoPath", label: "Esquema sin ruta", fn: (r) => r.schema_status === "HAS_SCHEMA" && !r.ruta_esquemas_pos },
      { id: "pathNoFile", label: "Ruta sin fichero", fn: (r) => r.schema_status === "HAS_SCHEMA" && !r.localSchemaFound },
      { id: "schemaOrphan", label: "Schema huerfano", fn: (r) => r.isOrphanSchema }
    ]
  },
  {
    group: "Exportacion",
    key: "exportFlags",
    mode: "single",
    items: [
      { id: "new", label: "New", fn: (r) => r.export_type === "new" },
      { id: "superseded", label: "Superseded", fn: (r) => r.export_type === "superseded" }
    ]
  },
  {
    group: "Estado",
    key: "stateFlags",
    mode: "single",
    items: [
      { id: "ok", label: "OK", fn: (r) => r.state_status === "OK" },
      { id: "warning", label: "Warning", fn: (r) => r.state_status === "WARNING" },
      { id: "error", label: "Error", fn: (r) => r.state_status === "ERROR" }
    ]
  }
];

function lc(v) {
  return String(v || "").toLowerCase();
}

function includesText(source, search) {
  return lc(source).includes(lc(search));
}

export function getQuickFilters() {
  return QUICK_FILTERS;
}

export function defaultFilterState() {
  return {
    query: "",
    engine_model: "",
    libro: "",
    source_page: "",
    part_number: "",
    imageFlags: new Set(),
    schemaFlags: new Set(),
    exportFlags: new Set(),
    stateFlags: new Set()
  };
}

export function serializeFilterState(filters) {
  return {
    query: filters.query,
    engine_model: filters.engine_model,
    libro: filters.libro,
    source_page: filters.source_page,
    part_number: filters.part_number,
    imageFlags: Array.from(filters.imageFlags),
    schemaFlags: Array.from(filters.schemaFlags),
    exportFlags: Array.from(filters.exportFlags),
    stateFlags: Array.from(filters.stateFlags)
  };
}

export function deserializeFilterState(raw) {
  const base = defaultFilterState();
  if (!raw || typeof raw !== "object") return base;
  base.query = String(raw.query || "");
  base.engine_model = String(raw.engine_model || "");
  base.libro = String(raw.libro || "");
  base.source_page = String(raw.source_page || "");
  base.part_number = String(raw.part_number || "");
  base.imageFlags = new Set(raw.imageFlags || []);
  base.schemaFlags = new Set(raw.schemaFlags || []);
  base.exportFlags = new Set(raw.exportFlags || []);
  base.stateFlags = new Set(raw.stateFlags || []);
  return base;
}

function matchQuickFilterGroup(record, groupConfig, activeSet) {
  if (!activeSet || !activeSet.size) return true;
  const activeItems = groupConfig.items.filter((it) => activeSet.has(it.id));
  if (!activeItems.length) return true;
  return activeItems.some((it) => {
    try {
      return !!it.fn(record);
    } catch {
      return false;
    }
  });
}

export function applyFilters(records, filters) {
  if (!Array.isArray(records) || !records.length) return [];

  const groupsByKey = new Map(QUICK_FILTERS.map((g) => [g.key, g]));
  const query = lc(filters.query);

  return records.filter((r) => {
    if (filters.engine_model && String(r.engine_model || "") !== filters.engine_model) return false;
    if (filters.libro && String(r.libro || "") !== filters.libro) return false;
    if (filters.source_page && String(r.source_page || "") !== filters.source_page) return false;
    if (filters.part_number && !includesText(r.part_number, filters.part_number)) return false;

    if (query) {
      const haystack = [
        r.part_number,
        r.engine_model,
        r.libro,
        r.source_page,
        r.ruta_foto,
        r.ruta_esquemas_pos,
        r.image_status,
        r.schema_status,
        (r.issues || []).join(" ")
      ].join(" | ");
      if (!includesText(haystack, query)) return false;
    }

    for (const group of QUICK_FILTERS) {
      const active = filters[group.key];
      if (!matchQuickFilterGroup(r, group, active)) return false;
    }

    const extraState = groupsByKey.get("stateFlags");
    if (extraState && filters.stateFlags && filters.stateFlags.size) {
      if (!matchQuickFilterGroup(r, extraState, filters.stateFlags)) return false;
    }

    return true;
  });
}

export function toggleQuickFilter(filters, groupKey, filterId, groupMode = "multi") {
  const next = { ...filters };
  const currentSet = new Set(filters[groupKey] || []);

  if (groupMode === "single") {
    if (currentSet.has(filterId)) {
      currentSet.clear();
    } else {
      currentSet.clear();
      currentSet.add(filterId);
    }
  } else {
    if (currentSet.has(filterId)) currentSet.delete(filterId);
    else currentSet.add(filterId);
  }

  next[groupKey] = currentSet;
  return next;
}

export function extractFilterOptions(records) {
  const vals = {
    engine_model: new Set(),
    libro: new Set(),
    source_page: new Set()
  };

  for (const r of records || []) {
    if (r.engine_model) vals.engine_model.add(String(r.engine_model));
    if (r.libro) vals.libro.add(String(r.libro));
    if (r.source_page) vals.source_page.add(String(r.source_page));
  }

  return {
    engine_model: Array.from(vals.engine_model).sort(),
    libro: Array.from(vals.libro).sort(),
    source_page: Array.from(vals.source_page).sort((a, b) => Number(a) - Number(b))
  };
}
