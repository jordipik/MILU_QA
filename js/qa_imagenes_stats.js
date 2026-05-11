function pct(value, total) {
  if (!total) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

export const KPI_CONFIG = [
  { id: "total", label: "Total registros", icon: "#", tone: "var(--info)", fn: (ctx) => ctx.total, filter: null },
  { id: "withPhoto", label: "Con foto real", icon: "IMG", tone: "var(--ok)", fn: (ctx) => ctx.withPhoto, filter: { group: "auditQuick", id: "withPhoto" } },
  { id: "withoutPhoto", label: "Sin foto", icon: "NO", tone: "var(--err)", fn: (ctx) => ctx.withoutPhoto, filter: { group: "auditQuick", id: "withoutPhoto" } },
  { id: "onlyPlaceholder", label: "Con placeholder", icon: "PH", tone: "var(--warn)", fn: (ctx) => ctx.onlyPlaceholder, filter: { group: "auditQuick", id: "placeholderOnly" } },
  { id: "schemaPosOk", label: "Con esquema_pos OK", icon: "POS", tone: "var(--ok)", fn: (ctx) => ctx.schemaPosOk, filter: { group: "auditQuick", id: "withSchemaPos" } },
  { id: "schemaPosMissing", label: "Esquema_pos missing", icon: "MISS", tone: "var(--err)", fn: (ctx) => ctx.schemaPosMissing, filter: { group: "auditQuick", id: "schemaPosMissing" } },
  { id: "withSchemas", label: "Con esquemas", icon: "SC", tone: "var(--ok)", fn: (ctx) => ctx.withSchemas, filter: { group: "auditQuick", id: "withSchemas" } },
  { id: "withoutUseful", label: "Sin imagen util", icon: "VOID", tone: "var(--err)", fn: (ctx) => ctx.withoutUsefulImage, filter: null },
  { id: "broken", label: "URLs rotas", icon: "ERR", tone: "var(--err)", fn: (ctx) => ctx.brokenRoutes, filter: { group: "auditQuick", id: "broken" } },
  { id: "duplicated", label: "Imagenes duplicadas", icon: "DUP", tone: "var(--warn)", fn: (ctx) => ctx.duplicatedPn, filter: { group: "auditQuick", id: "duplicatePn" } }
];

export function computeStats(records, auditData, inventory = []) {
  const total = (records || []).length;
  let withPhoto = 0;
  let onlyPlaceholder = 0;
  let schemaPosOk = 0;
  let schemaPosMissing = 0;
  let withSchemas = 0;
  let withoutUsefulImage = 0;
  let brokenRoutes = 0;
  let duplicatedPn = 0;

  for (const r of records || []) {
    if (r.hasPhotoReal) withPhoto += 1;
    if (r.onlyPlaceholder) onlyPlaceholder += 1;
    if (r.hasSchemaPos && r.pos_load_status !== "error") schemaPosOk += 1;
    if (r.schema_status === "SCHEMA_FILENAME_BUT_NO_ROUTE" || r.pos_load_status === "error") schemaPosMissing += 1;
    if (r.hasSchemas) withSchemas += 1;
    if (!r.hasAnyUsefulImage) withoutUsefulImage += 1;
    if (r.hasBrokenRoute) brokenRoutes += 1;
    if (r.isPnDuplicated) duplicatedPn += 1;
  }

  return {
    total,
    withPhoto,
    withoutPhoto: Math.max(0, total - withPhoto),
    onlyPlaceholder,
    schemaPosOk,
    schemaPosMissing,
    withSchemas,
    withoutUsefulImage,
    brokenRoutes,
    duplicatedPn,
    // Auxiliares para trazabilidad en debug.
    brokenReferences: Array.isArray(auditData?.broken_references) ? auditData.broken_references.length : 0,
    orphanImages: (inventory || []).filter((it) => !it.is_used).length,
    unusedImages: Array.isArray(auditData?.unused_images) ? auditData.unused_images.length : 0
  };
}

export function renderKpis(container, stats, activeKpiId, onKpiClick) {
  const total = stats.total || 0;
  container.innerHTML = "";

  for (const kpi of KPI_CONFIG) {
    const value = Number(kpi.fn(stats) || 0);
    const card = document.createElement("button");
    card.type = "button";
    card.className = `kpi-card ${activeKpiId === kpi.id ? "active" : ""}`;
    card.style.setProperty("--tone", kpi.tone);
    card.innerHTML = `
      <div class="kpi-top">
        <span>${kpi.label}</span>
        <span>${kpi.icon}</span>
      </div>
      <div class="kpi-value">${value.toLocaleString("es-ES")}</div>
      <div class="kpi-share">${pct(value, total)}</div>
    `;
    card.addEventListener("click", () => onKpiClick(kpi));
    container.appendChild(card);
  }
}
