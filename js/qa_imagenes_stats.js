function pct(value, total) {
  if (!total) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

export const KPI_CONFIG = [
  { id: "total", label: "Total exportables", icon: "#", tone: "var(--info)", fn: (ctx) => ctx.total, filter: null },
  { id: "realImage", label: "Con imagen real", icon: "IMG", tone: "var(--ok)", fn: (ctx) => ctx.byImage.REAL_IMAGE || 0, filter: { group: "imageFlags", id: "realImage" } },
  { id: "onlyPlaceholder", label: "Solo placeholder", icon: "PH", tone: "var(--warn)", fn: (ctx) => ctx.byImage.ONLY_PLACEHOLDER || 0, filter: { group: "imageFlags", id: "placeholderOnly" } },
  { id: "noImage", label: "Sin imagen", icon: "NO", tone: "var(--err)", fn: (ctx) => ctx.byImage.NO_IMAGE || 0, filter: { group: "imageFlags", id: "noImage" } },
  { id: "withSchema", label: "Con esquema", icon: "SC", tone: "var(--ok)", fn: (ctx) => ctx.bySchema.HAS_SCHEMA || 0, filter: { group: "schemaFlags", id: "schemaOk" } },
  { id: "withoutSchema", label: "Sin esquema", icon: "NS", tone: "var(--err)", fn: (ctx) => ctx.bySchema.NO_SCHEMA || 0, filter: { group: "schemaFlags", id: "noSchema" } },
  { id: "broken", label: "Rutas rotas", icon: "BR", tone: "var(--err)", fn: (ctx) => ctx.brokenReferences, filter: { group: "imageFlags", id: "brokenImage" } },
  { id: "orphans", label: "Imagenes huerfanas", icon: "OR", tone: "var(--warn)", fn: (ctx) => ctx.orphanImages, filter: null },
  { id: "unused", label: "Imagenes no usadas", icon: "UN", tone: "var(--neu)", fn: (ctx) => ctx.unusedImages, filter: null },
  { id: "errorRows", label: "Exportables con error", icon: "ER", tone: "var(--err)", fn: (ctx) => ctx.byState.ERROR || 0, filter: { group: "stateFlags", id: "error" } },
  { id: "photoSchema", label: "Con foto + esquema", icon: "2X", tone: "var(--ok)", fn: (ctx) => ctx.photoAndSchema, filter: null },
  { id: "onlySchema", label: "Solo esquema", icon: "SO", tone: "var(--warn)", fn: (ctx) => ctx.onlySchema, filter: null },
  { id: "onlyPhoto", label: "Solo foto", icon: "SP", tone: "var(--warn)", fn: (ctx) => ctx.onlyPhoto, filter: null }
];

export function computeStats(records, auditData, inventory = []) {
  const byImage = {};
  const bySchema = {};
  const byState = {};

  let photoAndSchema = 0;
  let onlyPhoto = 0;
  let onlySchema = 0;

  for (const r of records || []) {
    byImage[r.image_status] = (byImage[r.image_status] || 0) + 1;
    bySchema[r.schema_status] = (bySchema[r.schema_status] || 0) + 1;
    byState[r.state_status] = (byState[r.state_status] || 0) + 1;

    const hasPhoto = r.image_status === "REAL_IMAGE" || r.image_status === "ONLY_PLACEHOLDER";
    const hasSchema = r.schema_status === "HAS_SCHEMA";

    if (hasPhoto && hasSchema) photoAndSchema += 1;
    else if (hasPhoto) onlyPhoto += 1;
    else if (hasSchema) onlySchema += 1;
  }

  const total = (records || []).length;
  return {
    total,
    byImage,
    bySchema,
    byState,
    brokenReferences: Array.isArray(auditData?.broken_references) ? auditData.broken_references.length : 0,
    orphanImages: (inventory || []).filter((it) => !it.is_used).length,
    unusedImages: Array.isArray(auditData?.unused_images) ? auditData.unused_images.length : 0,
    photoAndSchema,
    onlyPhoto,
    onlySchema
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
