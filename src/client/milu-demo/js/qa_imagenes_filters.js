const QUICK_FILTERS = [
  {
    group: "Auditoria rapida",
    key: "auditQuick",
    mode: "single",
    items: [
      { id: "all", label: "Todos", fn: () => true },
      { id: "withPhoto", label: "Con foto real", fn: (r) => r.hasPhotoReal },
      { id: "withoutPhoto", label: "Sin foto", fn: (r) => !r.hasPhotoReal },
      { id: "placeholderOnly", label: "Solo sin_imagen", fn: (r) => r.onlyPlaceholder },
      { id: "withSchemaPos", label: "Con esquema_pos", fn: (r) => r.hasSchemaPos },
      { id: "withoutSchemaPos", label: "Sin esquema_pos", fn: (r) => !r.hasSchemaPos },
      { id: "schemaPosMissing", label: "Esquema_pos missing", fn: (r) => r.schema_status === "SCHEMA_FILENAME_BUT_NO_ROUTE" || r.pos_load_status === "error" },
      { id: "withSchemas", label: "Con esquemas", fn: (r) => r.hasSchemas },
      { id: "withoutSchemas", label: "Sin esquemas", fn: (r) => !r.hasSchemas },
      { id: "broken", label: "Rutas rotas", fn: (r) => r.hasBrokenRoute },
      { id: "wordpress", label: "URLs WordPress", fn: (r) => r.hasWordpressUrl },
      { id: "local", label: "Rutas locales", fn: (r) => r.hasLocalUrl },
      { id: "duplicatePn", label: "Duplicados por PN", fn: (r) => r.isPnDuplicated },
      { id: "exportableWp", label: "Registros exportables WordPress", fn: (r) => r.isExportableWordpress },
      { id: "new", label: "New", fn: (r) => r.export_type === "new" },
      { id: "superseded", label: "Superseded", fn: (r) => r.export_type === "superseded" }
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
    auditQuick: new Set()
  };
}

export function serializeFilterState(filters) {
  return {
    query: filters.query,
    engine_model: filters.engine_model,
    libro: filters.libro,
    source_page: filters.source_page,
    part_number: filters.part_number,
    auditQuick: Array.from(filters.auditQuick)
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
  base.auditQuick = new Set(raw.auditQuick || []);
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
