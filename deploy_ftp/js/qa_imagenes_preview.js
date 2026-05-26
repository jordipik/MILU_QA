function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asBadge(status) {
  if (status === "OK" || status === "ok") return "ok";
  if (status === "unknown") return "warn";
  if (status === "URL_ERROR" || status === "error" || status === "SIN_IMAGEN") return "err";
  return "neu";
}

function section(title, body) {
  return `<section class="preview-section"><h4>${title}</h4>${body}</section>`;
}

function maybeImage(src, alt) {
  if (!src) return "<div class='preview-empty'>No disponible</div>";
  return `<img class="preview-image" loading="lazy" src="${esc(src)}" alt="${esc(alt)}" onerror="this.style.display='none'"/>`;
}

function maybeLink(url, label = "Abrir") {
  if (!url) return "<span class='preview-empty'>-</span>";
  const isHttp = /^https?:\/\//i.test(url);
  if (!isHttp) return `<span class="v">${esc(url)}</span>`;
  return `<a class="inline-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
}

export function renderPreview(el, record, inventoryInfo) {
  if (!record) {
    el.innerHTML = "<p class='preview-empty'>Selecciona un registro para ver detalles.</p>";
    return;
  }

  const inv = inventoryInfo || null;
  const issueList = (record.issues || []).length
    ? `<ul class="preview-list">${record.issues.map((it) => `<li>${esc(it)}</li>`).join("")}</ul>`
    : "<div class='preview-empty'>Sin issues detectados</div>";

  const badgeRow = `
    <div class="preview-row"><span class="k">Badges</span><span class="v">
      <span class="badge ${record.hasPhotoReal ? "ok" : "err"}">${record.hasPhotoReal ? "FOTO OK" : "SIN FOTO"}</span>
      ${record.onlyPlaceholder ? '<span class="badge warn">PLACEHOLDER</span>' : ""}
      <span class="badge ${record.hasSchemaPos && record.pos_load_status !== "error" ? "ok" : "err"}">${record.hasSchemaPos && record.pos_load_status !== "error" ? "POS OK" : "POS MISS"}</span>
      ${record.hasSchemas ? '<span class="badge info">ESQUEMA OK</span>' : ""}
      ${record.hasBrokenRoute ? '<span class="badge err">URL ERROR</span>' : ""}
    </span></div>
  `;

  const productBody = `
    ${maybeImage(record.final_photo_url, record.part_number)}
    <div class="preview-list">
      <div class="preview-row"><span class="k">PN</span><span class="v">${esc(record.part_number)}</span></div>
      <div class="preview-row"><span class="k">Tipo</span><span class="v">${esc(record.final_photo_type || "-")}</span></div>
      <div class="preview-row"><span class="k">Origen campo</span><span class="v">${esc(record.final_photo_source || "-")}</span></div>
      <div class="preview-row"><span class="k">URL final usada</span><span class="v">${esc(record.final_photo_url || "-")}</span></div>
      <div class="preview-row"><span class="k">Carga</span><span class="badge ${asBadge(record.photo_load_status)}">${esc(record.photo_load_status || "none")}</span></div>
    </div>
  `;

  const schemaBody = `
    ${maybeImage(record.final_schema_pos_url, `${record.part_number} esquema_pos`)}
    <div class="preview-list">
      <div class="preview-row"><span class="k">Tipo</span><span class="v">${esc(record.final_pos_type || "-")}</span></div>
      <div class="preview-row"><span class="k">Origen campo</span><span class="v">${esc(record.final_pos_source || "-")}</span></div>
      <div class="preview-row"><span class="k">URL final usada</span><span class="v">${esc(record.final_schema_pos_url || "-")}</span></div>
      <div class="preview-row"><span class="k">Carga</span><span class="badge ${asBadge(record.pos_load_status)}">${esc(record.pos_load_status || "none")}</span></div>
      <div class="preview-row"><span class="k">Estado schema_pos</span><span class="badge ${asBadge(record.schema_status)}">${esc(record.schema_status || "-")}</span></div>
    </div>
  `;

  const schemaGeneralBody = `
    ${maybeImage(record.final_schema_url, `${record.part_number} esquema`)}
    <div class="preview-list">
      <div class="preview-row"><span class="k">Tipo</span><span class="v">${esc(record.final_schema_type || "-")}</span></div>
      <div class="preview-row"><span class="k">Origen campo</span><span class="v">${esc(record.final_schema_source || "-")}</span></div>
      <div class="preview-row"><span class="k">URL final usada</span><span class="v">${esc(record.final_schema_url || "-")}</span></div>
      <div class="preview-row"><span class="k">Carga</span><span class="badge ${asBadge(record.schema_load_status)}">${esc(record.schema_load_status || "none")}</span></div>
    </div>
  `;

  const wpBody = `
    <div class="preview-list">
      <div class="preview-row"><span class="k">URL WordPress detectada</span><span class="badge ${record.hasWordpressUrl ? "ok" : "warn"}">${record.hasWordpressUrl ? "SI" : "NO"}</span></div>
      <div class="preview-row"><span class="k">Rutas locales detectadas</span><span class="badge ${record.hasLocalUrl ? "ok" : "warn"}">${record.hasLocalUrl ? "SI" : "NO"}</span></div>
      <div class="preview-row"><span class="k">Abrir foto</span><span class="v">${maybeLink(record.final_photo_url)}</span></div>
      <div class="preview-row"><span class="k">Abrir esquema_pos</span><span class="v">${maybeLink(record.final_schema_pos_url)}</span></div>
    </div>
  `;

  const localBody = `
    <div class="preview-list">
      <div class="preview-row"><span class="k">Local image encontrada</span><span class="badge ${record.localImageFound ? "ok" : "warn"}">${record.localImageFound ? "SI" : "NO"}</span></div>
      <div class="preview-row"><span class="k">Local schema encontrada</span><span class="badge ${record.localSchemaFound ? "ok" : "warn"}">${record.localSchemaFound ? "SI" : "NO"}</span></div>
      <div class="preview-row"><span class="k">Path foto</span><span class="v">${esc(record.localImagePath || "-")}</span></div>
      <div class="preview-row"><span class="k">Path esquema</span><span class="v">${esc(record.localSchemaPath || "-")}</span></div>
      <div class="preview-row"><span class="k">exp_imagenes</span><span class="v">${esc(record.exp_imagenes || "-")}</span></div>
      ${badgeRow}
    </div>
  `;

  const invBody = inv
    ? `<div class="preview-list">
      <div class="preview-row"><span class="k">filename</span><span class="v">${esc(inv.filename)}</span></div>
      <div class="preview-row"><span class="k">size</span><span class="v">${esc(inv.size_kb)} KB</span></div>
      <div class="preview-row"><span class="k">ext</span><span class="v">${esc(inv.extension)}</span></div>
      <div class="preview-row"><span class="k">modified</span><span class="v">${esc(inv.modified_at || "-")}</span></div>
    </div>`
    : "<div class='preview-empty'>No hay coincidencia en inventory</div>";

  const diagBody = `
    <div class="preview-list">
      <div class="preview-row"><span class="k">Estado global</span><span class="badge ${record.state_status === "OK" ? "ok" : record.state_status === "WARNING" ? "warn" : "err"}">${esc(record.state_status)}</span></div>
      <div class="preview-row"><span class="k">Validacion final</span><span class="badge ${asBadge(record.validation_status)}">${esc(record.validation_status || "-")}</span></div>
      <div class="preview-row"><span class="k">Recomendacion</span><span class="v">${esc(record.recommendation || "Revisar manualmente")}</span></div>
    </div>
    ${issueList}
  `;

  el.innerHTML = [
    section("Producto", productBody),
    section("Esquema POS", schemaBody),
    section("Esquema", schemaGeneralBody),
    section("WordPress", wpBody),
    section("Local", localBody),
    section("Inventario", invBody),
    section("Diagnostico", diagBody)
  ].join("\n");
}
