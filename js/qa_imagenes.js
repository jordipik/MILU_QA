import {
  getQuickFilters,
  defaultFilterState,
  toggleQuickFilter,
  applyFilters,
  extractFilterOptions,
  serializeFilterState,
  deserializeFilterState
} from "./qa_imagenes_filters.js";
import { KPI_CONFIG, computeStats, renderKpis } from "./qa_imagenes_stats.js";
import { createVirtualTable } from "./qa_imagenes_table.js";
import { renderPreview } from "./qa_imagenes_preview.js";
import { getEngineJsonFiles } from "./data-loader.js";
import { resolveRecordMedia } from "./qa_imagenes_resolver.js";

const STORAGE_KEY = "qa_imagenes_filters_v1";
const TABS = [
  { id: "articulos", label: "Articulos" },
  { id: "inventory", label: "Inventario imagenes" },
  { id: "rotas", label: "Rutas rotas" },
  { id: "placeholders", label: "Placeholders" },
  { id: "sin_esquema", label: "Sin esquema" },
  { id: "huerfanas", label: "Imagenes huerfanas" },
  { id: "estadisticas", label: "Estadisticas" }
];

const UTIL_BUTTONS = [
  "Recalcular rutas",
  "Regenerar img_urls",
  "Regenerar schema_urls",
  "Validar URLs WordPress",
  "Buscar imagenes equivalentes",
  "Detectar duplicados",
  "Exportar errores",
  "Abrir JSON raw",
  "Abrir qa_web",
  "Abrir milu_qa",
  "Abrir PDF"
];

const dom = {
  metaRecords: document.getElementById("metaRecords"),
  metaGenerated: document.getElementById("metaGenerated"),
  metaVersion: document.getElementById("metaVersion"),
  btnRefresh: document.getElementById("btnRefresh"),
  btnExportView: document.getElementById("btnExportView"),
  btnSaveFilters: document.getElementById("btnSaveFilters"),
  btnClearFilters: document.getElementById("btnClearFilters"),
  filtersGrid: document.getElementById("filtersGrid"),
  kpiGrid: document.getElementById("kpiGrid"),
  tabBar: document.getElementById("tabBar"),
  tableInfo: document.getElementById("tableInfo"),
  selectionInfo: document.getElementById("selectionInfo"),
  btnSelectAllView: document.getElementById("btnSelectAllView"),
  btnClearSelection: document.getElementById("btnClearSelection"),
  loadStatus: document.getElementById("loadStatus"),
  utilsGrid: document.getElementById("utilsGrid"),
  previewBody: document.getElementById("previewBody"),
  head: document.getElementById("tableHead"),
  viewport: document.getElementById("tableViewport"),
  inner: document.getElementById("tableInner")
};

const state = {
  auditData: null,
  recordsRaw: [],
  recordsView: [],
  inventory: [],
  inventoryByFile: new Map(),
  rawByCompositeKey: new Map(),
  missingImages: [],
  brokenReferences: [],
  unusedImages: [],
  exportsLoaded: {},
  filters: defaultFilterState(),
  activeKpiId: "",
  activeTab: "articulos",
  table: null,
  selectedRecord: null,
  selectedSet: new Set()
};

function setStatus(text) {
  dom.loadStatus.textContent = text;
}

async function fetchJsonSafe(path) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return { ok: false, path, reason: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, path, data };
  } catch (err) {
    return { ok: false, path, reason: String(err) };
  }
}

async function loadCoreData() {
  const baseTargets = [
    "data/output/image_schema_audit.json",
    "data/output/image_inventory.json",
    "data/output/qa_index.json",
    "qa_index.json",
    "version.json"
  ];

  const wpTargets = [
    "data/output/wordpress/milu_wp_import.json",
    "data/output/wordpress/milu_wp_pending.json",
    "data/output/wordpress/milu_wp_superseded.json",
    "data/output/wordpress/milu_wp_discarded.json",
    "data/output/wordpress/milu_wp_trace.json",
    "data/output/wordpress/milu_wp_export_report.json",
    "MILU_New_v506.json",
    "MILU_Superseded_v506.json",
    "product-export-2026-03-29-11-07.json"
  ];

  const engineTargets = getEngineJsonFiles();

  const results = await Promise.allSettled([...baseTargets, ...wpTargets, ...engineTargets].map((p) => fetchJsonSafe(p)));
  const loaded = [];
  const failed = [];

  for (const r of results) {
    if (r.status === "fulfilled") {
      if (r.value.ok) loaded.push(r.value);
      else failed.push(r.value);
    } else {
      failed.push({ ok: false, path: "unknown", reason: r.reason });
    }
  }

  return { loaded, failed };
}

function getFilenameFromPath(pathOrUrl) {
  const txt = String(pathOrUrl || "").trim();
  if (!txt) return "";
  const clean = txt.split("?")[0].split("#")[0];
  const chunks = clean.replaceAll("\\", "/").split("/");
  return chunks[chunks.length - 1] || "";
}

function parseRecordKey(recordKey) {
  const chunks = String(recordKey || "").split("|");
  return {
    id: String(chunks[0] || "").trim(),
    partNumber: String(chunks[1] || "").trim(),
    engineModel: String(chunks[2] || "").trim(),
    sourcePage: String(chunks[3] || "").trim(),
    engineFile: String(chunks[4] || "").trim()
  };
}

function buildCompositeKeyFromAudit(rec) {
  const key = parseRecordKey(rec?.record_key);
  if (!key.id || !key.engineFile) return "";
  return `${key.id}|${key.engineFile}`;
}

function buildCompositeKeyFromEngineRow(row, engineFile) {
  const id = String(row?.ID || "").trim();
  const file = String(engineFile || "").trim();
  if (!id || !file) return "";
  return `${id}|${file}`;
}

function deriveLoadStatus(selectedItem, issues, kind) {
  if (!selectedItem?.url) return "none";

  const issueRegex = kind === "photo"
    ? /broken_image_reference|missing_image/i
    : /broken_schema_reference|missing_schema/i;

  if ((issues || []).some((i) => issueRegex.test(String(i || "")))) return "error";
  if (selectedItem.localFound) return "ok";
  if (selectedItem.isHttp) return "unknown";
  return "error";
}

function normalizeAuditImageStatus(rawStatus, media) {
  const status = String(rawStatus || "").toUpperCase();
  if (["PHOTO_AND_SCHEMA", "PHOTO_ONLY", "SCHEMA_ONLY", "ONLY_PLACEHOLDER", "NO_IMAGE"].includes(status)) {
    return status;
  }

  if (media.hasPhotoReal && media.hasSchemaPos) return "PHOTO_AND_SCHEMA";
  if (media.hasPhotoReal) return "PHOTO_ONLY";
  if (media.onlyPlaceholder) return "ONLY_PLACEHOLDER";
  if (media.hasSchemaPos || media.hasSchemas) return "SCHEMA_ONLY";
  return "NO_IMAGE";
}

function normalizeAuditSchemaStatus(rawStatus, media, selectedPos, issues) {
  const status = String(rawStatus || "").toUpperCase();
  if (["OK_SCHEMA", "SCHEMA_FILENAME_BUT_NO_ROUTE", "NO_SCHEMA"].includes(status)) {
    return status;
  }

  const hasMissing = (issues || []).some((i) => /broken_schema_reference|missing_schema/i.test(String(i || "")));
  if (selectedPos?.url && !hasMissing) return "OK_SCHEMA";
  if (media.hasSchemaPos || media.hasSchemas) return "SCHEMA_FILENAME_BUT_NO_ROUTE";
  return "NO_SCHEMA";
}

function normalizeRecord(rec, rawRow, inventoryByFile, duplicatePnMap) {
  const media = resolveRecordMedia(rec, rawRow, inventoryByFile);
  const issues = Array.isArray(rec.issues) ? rec.issues : [];
  const imageStatus = normalizeAuditImageStatus(rec.image_status, media);
  const photoLoadStatus = deriveLoadStatus(media.selectedPhoto, issues, "photo");
  const schemaPosLoadStatus = deriveLoadStatus(media.selectedPos, issues, "schema");
  const schemaLoadStatus = deriveLoadStatus(media.selectedSchema, issues, "schema");
  const schemaStatus = normalizeAuditSchemaStatus(rec.schema_status, media, media.selectedPos, issues);

  const finalPhotoUrl = media.selectedPhoto?.url || "";
  const finalSchemaPosUrl = media.selectedPos?.url || "";
  const finalSchemaUrl = media.selectedSchema?.url || "";

  const localImagePath = media.selectedPhoto?.localFound
    ? inventoryByFile.get(getFilenameFromPath(media.selectedPhoto.url))?.relative_path || ""
    : "";
  const localSchemaPath = media.selectedPos?.localFound
    ? inventoryByFile.get(getFilenameFromPath(media.selectedPos.url))?.relative_path || ""
    : "";

  const localImageFound = Boolean(media.selectedPhoto?.localFound);
  const localSchemaFound = Boolean(media.selectedPos?.localFound);

  const hasBrokenImage =
    issues.some((i) => /broken_image_reference|missing_image/i.test(String(i || ""))) ||
    (Boolean(media.selectedPhoto?.url) && photoLoadStatus === "error");
  const hasBrokenSchema =
    issues.some((i) => /broken_schema_reference|missing_schema/i.test(String(i || ""))) ||
    ((Boolean(media.selectedPos?.url) && schemaPosLoadStatus === "error") ||
      (Boolean(media.selectedSchema?.url) && schemaLoadStatus === "error"));
  const hasBrokenRoute = hasBrokenImage || hasBrokenSchema;

  const pn = String(rec.part_number || rawRow?.["PART NO."] || rawRow?.pn_final || rawRow?.pn_raw || "").trim();
  const pnDuplicateCount = duplicatePnMap.get(pn) || 0;

  const severity = issues.some((i) => /missing|broken|no_|empty/i.test(i))
    ? "ERROR"
    : issues.length
      ? "WARNING"
      : "OK";

  let recommendation = "Sin acciones pendientes";
  if (!media.hasPhotoReal && !media.hasSchemaPos && !media.hasSchemas) recommendation = "Sin imagen util: revisar campos de origen y exportacion";
  else if (schemaStatus === "SCHEMA_FILENAME_BUT_NO_ROUTE") recommendation = "Completar ruta_esquemas_pos final o corregir schema_pos";
  else if (hasBrokenRoute) recommendation = "Revisar rutas WordPress/local y ficheros faltantes";

  const hasAnyUsefulImage = media.hasPhotoReal || media.hasSchemaPos || media.hasSchemas;

  const validationStatus = hasBrokenRoute
    ? "URL_ERROR"
    : hasAnyUsefulImage
      ? "OK"
      : "SIN_IMAGEN";

  return {
    ...rec,
    raw_record: rawRow || null,
    image_status: imageStatus || "UNKNOWN",
    schema_status: schemaStatus || "UNKNOWN",
    issues,
    state_status: severity,
    hasPlaceholder: media.hasPlaceholder,
    onlyPlaceholder: media.onlyPlaceholder,
    hasBrokenImage,
    hasBrokenSchema,
    hasBrokenRoute,
    localImageFound,
    localSchemaFound,
    localImagePath,
    localSchemaPath,
    wordpress_match: media.hasWordpressUrl,
    hasWordpressUrl: media.hasWordpressUrl,
    hasLocalUrl: media.hasLocalUrl,
    inventory_match: localImageFound || localSchemaFound,
    total_img_urls: Number(rec.reference_counts?.matched || 0),
    total_schema_urls: Number(rec.reference_counts?.total || 0),
    isOrphanSchema: schemaStatus === "SCHEMA_FILENAME_BUT_NO_ROUTE" && !finalSchemaPosUrl,
    recommendation,
    part_number: pn || rec.part_number || "",
    pnDuplicateCount,
    isPnDuplicated: pnDuplicateCount > 1,
    exp_imagenes: String(rawRow?.exp_imagenes || "").trim(),
    final_photo_url: finalPhotoUrl,
    final_pos_url: finalSchemaPosUrl,
    final_schema_pos_url: finalSchemaPosUrl,
    final_schema_url: finalSchemaUrl,
    final_photo_source: media.selectedPhoto?.sourceField || "-",
    final_pos_source: media.selectedPos?.sourceField || "-",
    final_schema_source: media.selectedSchema?.sourceField || "-",
    final_photo_type: media.selectedPhoto?.isPlaceholder ? "placeholder" : media.selectedPhoto?.type || "-",
    final_pos_type: media.selectedPos?.type || "-",
    final_schema_type: media.selectedSchema?.type || "-",
    photo_load_status: photoLoadStatus,
    pos_load_status: schemaPosLoadStatus,
    schema_load_status: schemaLoadStatus,
    validation_status: validationStatus,
    hasPhotoReal: media.hasPhotoReal,
    hasSchemaPos: media.hasSchemaPos,
    hasSchemas: media.hasSchemas,
    hasAnyUsefulImage,
    isExportableWordpress: (rec.export_type === "new" || rec.export_type === "superseded") && hasAnyUsefulImage,
    media_candidates: media.allCandidates
  };
}

function hydrateStateFromLoaded(loaded) {
  const byPath = new Map(loaded.map((it) => [it.path, it.data]));

  const auditData = byPath.get("data/output/image_schema_audit.json") || {};
  const inventory = Array.isArray(byPath.get("data/output/image_inventory.json"))
    ? byPath.get("data/output/image_inventory.json")
    : [];

  const inventoryByFile = new Map();
  for (const item of inventory) {
    if (!item?.filename) continue;
    inventoryByFile.set(item.filename, item);
  }

  state.auditData = auditData;
  state.inventory = inventory;
  state.inventoryByFile = inventoryByFile;
  state.missingImages = Array.isArray(auditData.missing_images) ? auditData.missing_images : [];
  state.brokenReferences = Array.isArray(auditData.broken_references) ? auditData.broken_references : [];
  state.unusedImages = Array.isArray(auditData.unused_images) ? auditData.unused_images : [];

  const rawByCompositeKey = new Map();
  for (const loadedItem of loaded) {
    if (!/^engine_.*\.json$/i.test(loadedItem.path)) continue;
    const rows = Array.isArray(loadedItem.data) ? loadedItem.data : [];
    for (const row of rows) {
      const key = buildCompositeKeyFromEngineRow(row, loadedItem.path);
      if (!key) continue;
      rawByCompositeKey.set(key, row);
    }
  }
  state.rawByCompositeKey = rawByCompositeKey;

  const baseRecords = Array.isArray(auditData.records) ? auditData.records : [];

  const pnMap = new Map();
  for (const rec of baseRecords) {
    const composite = buildCompositeKeyFromAudit(rec);
    const raw = rawByCompositeKey.get(composite);
    const pn = String(rec?.part_number || raw?.["PART NO."] || raw?.pn_final || raw?.pn_raw || "").trim();
    if (!pn) continue;
    pnMap.set(pn, (pnMap.get(pn) || 0) + 1);
  }

  state.recordsRaw = baseRecords.map((rec) => {
    const composite = buildCompositeKeyFromAudit(rec);
    const raw = rawByCompositeKey.get(composite) || null;
    return normalizeRecord(rec, raw, inventoryByFile, pnMap);
  });

  state.exportsLoaded = Object.fromEntries(
    loaded
      .filter((it) => /wordpress|MILU_|product-export/i.test(it.path))
      .map((it) => [it.path, Array.isArray(it.data) ? it.data.length : Object.keys(it.data || {}).length])
  );

  const versionData = byPath.get("version.json");
  dom.metaVersion.textContent = versionData?.version || "n/a";
  dom.metaGenerated.textContent = auditData?.generated_at ? new Date(auditData.generated_at).toLocaleString("es-ES") : "n/a";
}

function renderTabs() {
  dom.tabBar.innerHTML = "";
  for (const tab of TABS) {
    const b = document.createElement("button");
    b.className = `tab-btn ${state.activeTab === tab.id ? "active" : ""}`;
    b.type = "button";
    b.textContent = tab.label;
    b.addEventListener("click", () => {
      state.activeTab = tab.id;
      state.selectedRecord = null;
      renderEverything();
    });
    dom.tabBar.appendChild(b);
  }
}

function renderUtils() {
  dom.utilsGrid.innerHTML = "";
  for (const label of UTIL_BUTTONS) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = `${label} (preview)`;
    b.disabled = true;
    dom.utilsGrid.appendChild(b);
  }
}

function renderFilterPanel() {
  const options = extractFilterOptions(state.recordsRaw);
  const quick = getQuickFilters();

  const blocks = [];

  blocks.push(`
    <div class="filter-group">
      <h3 class="filter-title">Buscador global</h3>
      <input class="filter-control" id="filterQuery" type="text" placeholder="PN, rutas, issues..." value="${state.filters.query}" />
    </div>
  `);

  blocks.push(`
    <div class="filter-group">
      <h3 class="filter-title">Tecnicos</h3>
      <div class="token-wrap" style="display:grid; gap:8px;">
        <select id="filterEngineModel" class="filter-control">
          <option value="">engine_model (todos)</option>
          ${options.engine_model.map((v) => `<option value="${v}" ${state.filters.engine_model === v ? "selected" : ""}>${v}</option>`).join("")}
        </select>
        <select id="filterLibro" class="filter-control">
          <option value="">libro (todos)</option>
          ${options.libro.map((v) => `<option value="${v}" ${state.filters.libro === v ? "selected" : ""}>${v}</option>`).join("")}
        </select>
        <select id="filterSourcePage" class="filter-control">
          <option value="">source_page (todas)</option>
          ${options.source_page.map((v) => `<option value="${v}" ${state.filters.source_page === v ? "selected" : ""}>${v}</option>`).join("")}
        </select>
        <input id="filterPartNumber" class="filter-control" placeholder="part_number" value="${state.filters.part_number}" />
      </div>
    </div>
  `);

  for (const group of quick) {
    const tokens = group.items
      .map((it) => `<button type="button" class="token ${state.filters[group.key]?.has(it.id) ? "active" : ""}" data-group="${group.key}" data-mode="${group.mode}" data-id="${it.id}">${it.label}</button>`)
      .join("");

    blocks.push(`
      <div class="filter-group">
        <h3 class="filter-title">${group.group}</h3>
        <div class="token-wrap">${tokens}</div>
      </div>
    `);
  }

  dom.filtersGrid.innerHTML = blocks.join("\n");

  dom.filtersGrid.querySelectorAll(".token").forEach((el) => {
    el.addEventListener("click", () => {
      state.filters = toggleQuickFilter(state.filters, el.dataset.group, el.dataset.id, el.dataset.mode);
      renderEverything();
    });
  });

  dom.filtersGrid.querySelector("#filterQuery")?.addEventListener("input", (evt) => {
    state.filters.query = String(evt.target.value || "");
    applyAndRenderTable();
  });

  const bindSelect = (id, key) => {
    dom.filtersGrid.querySelector(id)?.addEventListener("change", (evt) => {
      state.filters[key] = String(evt.target.value || "");
      applyAndRenderTable();
    });
  };

  bindSelect("#filterEngineModel", "engine_model");
  bindSelect("#filterLibro", "libro");
  bindSelect("#filterSourcePage", "source_page");

  dom.filtersGrid.querySelector("#filterPartNumber")?.addEventListener("input", (evt) => {
    state.filters.part_number = String(evt.target.value || "");
    applyAndRenderTable();
  });
}

function getRecordsForTab(base) {
  const list = base || [];
  switch (state.activeTab) {
    case "inventory":
      return state.inventory.map((it) => ({
        record_key: `inv:${it.relative_path}`,
        part_number: it.filename,
        engine_model: it.engine_model,
        libro: it.libro,
        source_page: it.pagina,
        export_type: "inventory",
        image_status: it.is_used ? "PHOTO_ONLY" : "NO_IMAGE",
        schema_status: it.possible_type?.includes("schema") ? "OK_SCHEMA" : "NO_SCHEMA",
        ruta_foto: it.relative_path,
        ruta_esquemas_pos: "",
        final_photo_url: it.relative_path,
        final_pos_url: "",
        final_schema_pos_url: "",
        final_photo_source: "inventory",
        final_pos_source: "-",
        final_photo_type: "foto",
        final_pos_type: "-",
        final_schema_url: "",
        final_schema_source: "-",
        final_schema_type: "-",
        photo_load_status: "ok",
        pos_load_status: "none",
        schema_load_status: "none",
        validation_status: it.is_used ? "OK" : "SIN_IMAGEN",
        issues: it.is_used ? [] : ["orphan_image"],
        state_status: it.is_used ? "OK" : "WARNING",
        total_img_urls: 1,
        total_schema_urls: 0,
        wordpress_match: false,
        hasWordpressUrl: false,
        hasLocalUrl: true,
        hasPlaceholder: false,
        onlyPlaceholder: false,
        hasBrokenImage: false,
        hasBrokenSchema: false,
        hasBrokenRoute: !it.is_used,
        localImageFound: true,
        localSchemaFound: false,
        localImagePath: it.relative_path,
        localSchemaPath: "",
        hasPhotoReal: true,
        hasSchemaPos: it.possible_type?.includes("schema") || false,
        hasSchemas: it.possible_type?.includes("schema") || false,
        hasAnyUsefulImage: true,
        isExportableWordpress: Boolean(it.is_used),
        exp_imagenes: "",
        isPnDuplicated: false,
        recommendation: it.is_used ? "Sin acciones" : "Vincular a un registro o limpiar inventario"
      }));
    case "rotas":
      return list.filter((r) => r.hasBrokenImage || (r.issues || []).some((i) => /broken/i.test(i)));
    case "placeholders":
      return list.filter((r) => r.hasPlaceholder);
    case "sin_esquema":
      return list.filter((r) => r.schema_status === "NO_SCHEMA");
    case "huerfanas":
      return state.unusedImages.map((it) => ({
        record_key: `orph:${it.relative_path || it.filename}`,
        part_number: it.filename || "-",
        engine_model: it.engine_model || "-",
        libro: it.libro || "-",
        source_page: it.pagina || "-",
        export_type: "orphan",
        image_status: it.image_status || "NO_IMAGE",
        schema_status: "NO_SCHEMA",
        ruta_foto: it.relative_path || "",
        ruta_esquemas_pos: "",
        final_photo_url: it.relative_path || "",
        final_pos_url: "",
        final_schema_pos_url: "",
        final_photo_source: "inventory",
        final_pos_source: "-",
        final_photo_type: "foto",
        final_pos_type: "-",
        final_schema_url: "",
        final_schema_source: "-",
        final_schema_type: "-",
        photo_load_status: "ok",
        pos_load_status: "none",
        schema_load_status: "none",
        validation_status: "SIN_IMAGEN",
        issues: ["orphan_image"],
        state_status: "WARNING",
        total_img_urls: 0,
        total_schema_urls: 0,
        wordpress_match: false,
        hasWordpressUrl: false,
        hasLocalUrl: true,
        hasPlaceholder: false,
        onlyPlaceholder: false,
        hasBrokenImage: false,
        hasBrokenSchema: false,
        hasBrokenRoute: false,
        localImageFound: true,
        localSchemaFound: false,
        localImagePath: it.relative_path || "",
        localSchemaPath: "",
        hasPhotoReal: false,
        hasSchemaPos: false,
        hasSchemas: false,
        hasAnyUsefulImage: false,
        isExportableWordpress: false,
        exp_imagenes: "",
        isPnDuplicated: false,
        recommendation: "Vincular o depurar inventario"
      }));
    case "estadisticas":
      return list;
    case "articulos":
    default:
      return list;
  }
}

function applyAndRenderTable() {
  const filtered = applyFilters(state.recordsRaw, state.filters);
  const tabRows = getRecordsForTab(filtered);
  state.recordsView = tabRows;

  state.table.setRows(tabRows);
  dom.tableInfo.textContent = `${tabRows.length.toLocaleString("es-ES")} filas`;
  dom.metaRecords.textContent = state.recordsRaw.length.toLocaleString("es-ES");

  if (state.selectedRecord) {
    const keep = tabRows.find((r) => r.record_key === state.selectedRecord.record_key);
    if (!keep) {
      state.selectedRecord = null;
      renderPreview(dom.previewBody, null, null);
    }
  }

  const stats = computeStats(state.recordsRaw, state.auditData, state.inventory);
  renderKpis(dom.kpiGrid, stats, state.activeKpiId, (kpi) => {
    if (!kpi.filter) {
      state.activeKpiId = state.activeKpiId === kpi.id ? "" : kpi.id;
      if (!state.activeKpiId) {
        state.filters = defaultFilterState();
      }
      renderEverything();
      return;
    }

    const currentlyActive = state.activeKpiId === kpi.id;
    state.activeKpiId = currentlyActive ? "" : kpi.id;
    if (currentlyActive) {
      state.filters[kpi.filter.group].delete(kpi.filter.id);
    } else {
      const mode = getQuickFilters().find((g) => g.key === kpi.filter.group)?.mode || "multi";
      state.filters = toggleQuickFilter(state.filters, kpi.filter.group, kpi.filter.id, mode);
    }

    renderEverything();
  });

  setStatus(`Datos cargados. Core: ${state.recordsRaw.length.toLocaleString("es-ES")} registros | View: ${tabRows.length.toLocaleString("es-ES")}`);
}

function findInventoryRecord(record) {
  if (!record) return null;
  const f1 = getFilename(record.final_photo_url || record.ruta_foto);
  const f2 = getFilename(record.final_schema_pos_url || record.ruta_esquemas_pos);
  return state.inventoryByFile.get(f1) || state.inventoryByFile.get(f2) || null;
}

function getFilename(v) {
  const chunks = String(v || "").replaceAll("\\", "/").split("/");
  return chunks[chunks.length - 1] || "";
}

function csvEscape(value) {
  const txt = String(value ?? "");
  if (/[,"\n]/.test(txt)) return `"${txt.replaceAll('"', '""')}"`;
  return txt;
}

function exportCurrentViewCsv() {
  const rows = state.table.getRows();
  const cols = [
    "part_number",
    "engine_model",
    "export_type",
    "image_status",
    "schema_status",
    "final_photo_source",
    "final_photo_url",
    "final_pos_source",
    "final_pos_url",
    "exp_imagenes",
    "hasWordpressUrl",
    "hasLocalUrl",
    "hasPhotoReal",
    "hasSchemaPos",
    "hasSchemas",
    "isPnDuplicated",
    "total_img_urls",
    "total_schema_urls",
    "issues",
    "state_status",
    "validation_status"
  ];

  const lines = [cols.join(",")];
  for (const r of rows) {
    const row = cols.map((c) => {
      const v = c === "issues" ? (r.issues || []).join("|") : r[c];
      return csvEscape(v);
    });
    lines.push(row.join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `qa_imagenes_view_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function wireEvents() {
  dom.btnRefresh.addEventListener("click", () => init(true));
  dom.btnExportView.addEventListener("click", exportCurrentViewCsv);

  dom.btnSaveFilters.addEventListener("click", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeFilterState(state.filters)));
    setStatus("Filtros guardados en navegador");
  });

  dom.btnClearFilters.addEventListener("click", () => {
    state.filters = defaultFilterState();
    state.activeKpiId = "";
    renderEverything();
  });

  dom.btnSelectAllView.addEventListener("click", () => state.table.selectCurrentView());
  dom.btnClearSelection.addEventListener("click", () => state.table.clearSelection());
}

function renderEverything() {
  renderTabs();
  renderFilterPanel();
  applyAndRenderTable();
}

async function init(hardRefresh = false) {
  try {
    setStatus("Cargando JSON de auditoria...");

    if (hardRefresh) {
      state.filters = defaultFilterState();
      state.activeKpiId = "";
    } else {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (saved) state.filters = deserializeFilterState(saved);
      } catch {
        state.filters = defaultFilterState();
      }
    }

    const { loaded, failed } = await loadCoreData();
    hydrateStateFromLoaded(loaded);

    if (!state.recordsRaw.length) {
      setStatus("No hay registros en image_schema_audit.json");
    } else {
      setStatus(`Carga completa con ${failed.length} ficheros no disponibles (tolerado).`);
    }

    if (!state.table) {
      state.table = createVirtualTable({
        headEl: dom.head,
        viewportEl: dom.viewport,
        innerEl: dom.inner,
        onSelectRow: (row) => {
          state.selectedRecord = row;
          const inv = findInventoryRecord(row);
          renderPreview(dom.previewBody, row, inv);
          state.table.setSelectedRow(row.record_key);
        },
        onSortChange: () => {
          renderPreview(dom.previewBody, state.selectedRecord, findInventoryRecord(state.selectedRecord));
        },
        onToggleSelect: (set) => {
          state.selectedSet = new Set(set);
          dom.selectionInfo.textContent = `${state.selectedSet.size.toLocaleString("es-ES")} seleccionadas`;
        }
      });
      wireEvents();
      renderUtils();
    }

    renderEverything();
  } catch (err) {
    setStatus(`Error inicializando QA imagenes: ${String(err)}`);
    console.error(err);
  }
}

init(false);
