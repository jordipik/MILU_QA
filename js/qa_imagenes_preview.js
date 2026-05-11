function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asBadge(status) {
  if (status === "REAL_IMAGE" || status === "HAS_SCHEMA") return "ok";
  if (status === "ONLY_PLACEHOLDER") return "warn";
  if (status === "NO_IMAGE" || status === "NO_SCHEMA") return "err";
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

  const productBody = `
    ${maybeImage(record.ruta_foto, record.part_number)}
    <div class="preview-list">
      <div class="preview-row"><span class="k">PN</span><span class="v">${esc(record.part_number)}</span></div>
      <div class="preview-row"><span class="k">Image status</span><span class="badge ${asBadge(record.image_status)}">${esc(record.image_status)}</span></div>
    </div>
  `;

  const schemaBody = `
    ${maybeImage(record.ruta_esquemas_pos, `${record.part_number} esquema`)}
    <div class="preview-list">
      <div class="preview-row"><span class="k">Schema status</span><span class="badge ${asBadge(record.schema_status)}">${esc(record.schema_status)}</span></div>
      <div class="preview-row"><span class="k">Ruta esquema POS</span><span class="v">${esc(record.ruta_esquemas_pos || "-")}</span></div>
    </div>
  `;

  const wpBody = `
    <div class="preview-list">
      <div class="preview-row"><span class="k">Ruta foto WP</span><span class="v">${esc(record.ruta_foto || "-")}</span></div>
      <div class="preview-row"><span class="k">Valida URL</span><span class="badge ${record.wordpress_match ? "ok" : "warn"}">${record.wordpress_match ? "OK" : "No valida"}</span></div>
      <div class="preview-row"><span class="k">Abrir</span><span class="v">${maybeLink(record.ruta_foto)}</span></div>
    </div>
  `;

  const localBody = `
    <div class="preview-list">
      <div class="preview-row"><span class="k">Local image encontrada</span><span class="badge ${record.localImageFound ? "ok" : "warn"}">${record.localImageFound ? "SI" : "NO"}</span></div>
      <div class="preview-row"><span class="k">Local schema encontrada</span><span class="badge ${record.localSchemaFound ? "ok" : "warn"}">${record.localSchemaFound ? "SI" : "NO"}</span></div>
      <div class="preview-row"><span class="k">Path foto</span><span class="v">${esc(record.localImagePath || "-")}</span></div>
      <div class="preview-row"><span class="k">Path esquema</span><span class="v">${esc(record.localSchemaPath || "-")}</span></div>
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
      <div class="preview-row"><span class="k">Recomendacion</span><span class="v">${esc(record.recommendation || "Revisar manualmente")}</span></div>
    </div>
    ${issueList}
  `;

  el.innerHTML = [
    section("Producto", productBody),
    section("Esquema", schemaBody),
    section("WordPress", wpBody),
    section("Local", localBody),
    section("Inventario", invBody),
    section("Diagnostico", diagBody)
  ].join("\n");
}
